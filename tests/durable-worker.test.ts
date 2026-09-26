import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';
import {RunQueue} from '../lib/runs/queue';
import {modelBindingDigest} from '../lib/runs/model-binding';
import type {RunAuthority,EnqueueRequest} from '../lib/runs/types';

async function setup(t:{after(fn:()=>void|Promise<void>):void},invalidFirst=false){
 let calls=0,release=()=>{};let lastBody:any;let accepted=()=>{};const received=new Promise<void>(r=>accepted=r);
 const server=createServer(async(req,res)=>{
  if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'fixture/coder'}]}));return;}
  assert.equal(req.headers.authorization,'Bearer worker-fixture-key');let raw='';for await(const c of req)raw+=c;
  calls++;accepted();const body=JSON.parse(raw);lastBody=body;res.writeHead(200,{'Content-Type':'text/event-stream'});
  if(raw.includes('MODEL_HOLD'))await new Promise<void>(r=>release=r);
  const content=invalidFirst&&calls===1?'not a complete proposal':'<file path="src/App.jsx">export default function App(){return <h1>Durable result</h1>}</file>Test proposal.';
  const chunk={id:'worker-fixture',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{content},finish_reason:null}]};
  if(!res.destroyed){res.write('data: '+JSON.stringify(chunk)+'\n\n');res.end('data: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:22,total_tokens:33}})+'\n\ndata: [DONE]\n\n');}
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const root=mkdtempSync(join(tmpdir(),'durable-worker-'));
 const settings={OPEN_LOVABLE_DATA_DIR:root,OPEN_LOVABLE_MASTER_KEY:randomBytes(32).toString('base64'),OPEN_LOVABLE_AUTH_MODE:'individual',OPEN_LOVABLE_USERNAME:'alice',OPEN_LOVABLE_APP_ORIGIN:'http://127.0.0.1:3100',OPEN_LOVABLE_GATEWAY_URL:'http://127.0.0.1:'+(server.address() as {port:number}).port+'/v1',OPEN_LOVABLE_GATEWAY_API_KEY:'worker-fixture-key',OPEN_LOVABLE_GATEWAY_MODELS:'["fixture/coder"]',OPEN_LOVABLE_MAX_MODEL_CALLS:invalidFirst?'2':'1',OPEN_LOVABLE_MAX_REPAIRS:invalidFirst?'1':'0'};
 const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 const store=projectStore(),repository=new SqliteProjectRepository(store),ctx=repository.individualContext('alice'),project=await repository.create(ctx,'Worker test','gateway/fixture/coder');
 t.after(async()=>{release();store.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));rmSync(root,{recursive:true,force:true});for(const key of Object.keys(settings)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
 const authority:RunAuthority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'alice',allowLoopback:true,modelBinding:modelBindingDigest('gateway/fixture/coder'),policyVersion:1};
 const request:EnqueueRequest={projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'Build the page',model:'gateway/fixture/coder',mode:'build',imageIDs:[],confirmCost:true};
 const implementationModule=await import('../lib/runs/worker').catch(()=>({})) as Record<string,any>;assert.equal(typeof implementationModule.runWorkerOnce,'function','Worker must execute outside the observing request');
 return {store,queue:new RunQueue(store),authority,request,calls:()=>calls,lastBody:()=>lastBody,received,release:()=>release(),work:implementationModule.runWorkerOnce};
}
test('worker executes one real HTTP model exchange, validates a candidate and preserves the accepted revision',async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,f.request),lease=f.queue.acquireWorker('fixture-worker')!;
 const result=await f.work(f.queue,lease);assert.equal(result.worked,true);assert.equal(f.calls(),1);
 assert.match(JSON.stringify(f.lastBody()),/authorizedTools/);assert.match(JSON.stringify(f.lastBody()),/revisionDigest/);
 assert.equal(f.queue.get(f.authority,run.id).state,'AWAITING_APPROVAL');assert.equal(f.store.getProject('alice',f.request.projectId).version,1);
 assert.match(f.store.getRun('alice',f.request.projectId,run.id).candidate!.files['src/App.jsx'],/Durable result/);
 assert.equal((await f.work(f.queue,lease)).worked,false);assert.equal(f.calls(),1);
 const events=f.queue.events(f.authority,run.id,0).events;assert.ok(events.some(e=>e.type==='model.requested'));assert.ok(events.some(e=>e.type==='proposal.compiled'));
});
test('worker performs one authorized bounded repair after deterministic validation failure',async t=>{
 const f=await setup(t,true),run=f.queue.enqueue(f.authority,f.request),lease=f.queue.acquireWorker('repair-worker')!;
 const result=await f.work(f.queue,lease);assert.equal(result.worked,true);assert.equal(f.calls(),2);
 assert.equal(f.queue.get(f.authority,run.id).state,'AWAITING_APPROVAL');
 assert.match(f.store.getRun('alice',f.request.projectId,run.id).candidate!.files['src/App.jsx'],/Durable result/);
 assert.ok(f.queue.events(f.authority,run.id,0).events.some(e=>e.type==='repair.requested'));
});
test('explicit cancellation during streaming prevents a late candidate even if the provider finishes',async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,{...f.request,prompt:'MODEL_HOLD'}),lease=f.queue.acquireWorker('fixture-worker')!;
 const working=f.work(f.queue,lease);await f.received;f.queue.cancel(f.authority,run.id);f.release();await working;
 assert.equal(f.queue.get(f.authority,run.id).state,'CANCELLED');assert.equal(f.store.getRun('alice',f.request.projectId,run.id).candidate,null);assert.equal(f.calls(),1);
});
test('a changed connection cannot consume a previously approved queued request',async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,f.request),lease=f.queue.acquireWorker('fixture-worker')!;
 process.env.OPEN_LOVABLE_GATEWAY_API_KEY='changed-fixture-key';await f.work(f.queue,lease);
 assert.equal(f.calls(),0);assert.equal(f.queue.get(f.authority,run.id).state,'FAILED');
});

test('revoking the loopback provider policy invalidates a queued account request before inference',async t=>{
 const f=await setup(t);
 const {startIdentityFixture}=await import('./helpers/identity-fixture');const auth=await startIdentityFixture();
 const extras={OPEN_LOVABLE_AUTH_MODE:'supabase',OPEN_LOVABLE_SUPABASE_URL:auth.url,OPEN_LOVABLE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_contract',OPEN_LOVABLE_AUTH_ALLOW_LOOPBACK:'1',OPEN_LOVABLE_ACCOUNT_ALLOW_LOOPBACK_PROVIDERS:'1'};
 const previous=Object.fromEntries(Object.keys(extras).map(key=>[key,process.env[key]]));Object.assign(process.env,extras);
 t.after(async()=>{await auth.close();for(const key of Object.keys(extras)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
 const {accountService}=await import('../lib/identity/factory');const {CredentialStore,masterKey}=await import('../lib/settings/store');
 const service=accountService('http://127.0.0.1:3100'),signed=await service.login('alice@example.test','identity-contract-password');
 const session=await service.authenticate(signed.token);
 const ctx=service.identity.context(session.actor_id,session.selected_workspace_id!);
 const project=await new SqliteProjectRepository(f.store).create(ctx,'Account policy','gateway/fixture/coder');
 const scope={owner:'workspace:'+ctx.principal.workspaceId,allowLoopback:true};
 new CredentialStore(f.store,masterKey()).save(scope.owner,'gateway',0,{enabled:true,baseURL:process.env.OPEN_LOVABLE_GATEWAY_URL,apiKey:'worker-fixture-key',models:['fixture/coder']});
 const authority:RunAuthority={...f.authority,workspaceId:ctx.principal.workspaceId,actorId:session.actor_id,sessionId:session.id,mode:'supabase',settingsOwner:scope.owner,modelBinding:modelBindingDigest(f.request.model,scope)};
 const run=f.queue.enqueue(authority,{...f.request,projectId:project.id}),lease=f.queue.acquireWorker('policy-worker')!;
 process.env.OPEN_LOVABLE_ACCOUNT_ALLOW_LOOPBACK_PROVIDERS='0';
 await f.work(f.queue,lease);assert.equal(f.calls(),0);assert.equal(f.queue.get(authority,run.id).state,'FAILED');
});
test('membership revocation during a model request prevents candidate consolidation',async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,{...f.request,prompt:'MODEL_HOLD'}),lease=f.queue.acquireWorker('revocation-worker')!;
 const working=f.work(f.queue,lease);await f.received;
 f.store.db.prepare('UPDATE workspace_members SET active=0,version=version+1 WHERE workspace_id=? AND actor_id=?').run(f.authority.workspaceId,f.authority.actorId);
 f.release();await working;
 assert.equal(f.calls(),1);assert.equal(f.store.getRun('alice',f.request.projectId,run.id).candidate,null);
 assert.equal(f.store.getProject('alice',f.request.projectId).version,1);
 assert.throws(()=>f.queue.get(f.authority,run.id),/not found/i);
});
