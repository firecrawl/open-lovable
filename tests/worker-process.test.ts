import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {projectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';
import {RunQueue} from '../lib/runs/queue';
import {modelBindingDigest} from '../lib/runs/model-binding';
import type {RunAuthority,EnqueueRequest} from '../lib/runs/types';

async function setup(t:{after(fn:()=>Promise<void>):void}){
 let calls=0,unhold=()=>{};const held=new Promise<void>(resolve=>unhold=resolve);
 const server=createServer((req,res)=>{void(async()=>{
  if(req.url!=='/v1/chat/completions'||req.headers.authorization!=='Bearer process-test-key'){res.writeHead(403);res.end();return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw new Error('Test body too large');}
  calls++;const input=JSON.parse(raw);res.writeHead(200,{'Content-Type':'text/event-stream'});
  if(raw.includes('HOLD_PROCESS'))await held;
  const chunk={id:'process-fixture',created:1,model:input.model,object:'chat.completion.chunk',choices:[{index:0,delta:{content:'<file path="src/App.jsx">export default function App(){return <h1>Recovered execution</h1>}</file>Verified fixture.'},finish_reason:null}]};
  if(!res.destroyed){res.write('data: '+JSON.stringify(chunk)+'\n\n');res.end('data: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}
 })().catch(()=>{res.destroy();});});server.listen(0,'127.0.0.1');await once(server,'listening');
 const root=mkdtempSync(join(tmpdir(),'ol-worker-process-'));
 const values={NODE_ENV:'production',OPEN_LOVABLE_DATA_DIR:root,OPEN_LOVABLE_MASTER_KEY:randomBytes(32).toString('base64'),OPEN_LOVABLE_AUTH_MODE:'individual',OPEN_LOVABLE_USERNAME:'process-test',OPEN_LOVABLE_APP_ORIGIN:'http://127.0.0.1:3200',OPEN_LOVABLE_DISABLE_SAVED_SETTINGS:'1',OPEN_LOVABLE_GATEWAY_URL:'http://127.0.0.1:'+(server.address() as {port:number}).port+'/v1',OPEN_LOVABLE_GATEWAY_API_KEY:'process-test-key',OPEN_LOVABLE_GATEWAY_MODELS:'["fixture/process"]'};
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
 const store=projectStore(),repo=new SqliteProjectRepository(store),ctx=repo.individualContext('process-test'),project=await repo.create(ctx,'Worker process','gateway/fixture/process'),queue=new RunQueue(store);
 const authority:RunAuthority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:values.OPEN_LOVABLE_APP_ORIGIN,settingsOwner:'process-test',allowLoopback:true,modelBinding:modelBindingDigest('gateway/fixture/process'),policyVersion:1};
 const request:EnqueueRequest={projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'Build a page',model:'gateway/fixture/process',mode:'build',imageIDs:[],confirmCost:true};
 const owned:ChildProcess[]=[];
 function launch(checkpoint=false){
  const child=spawn(process.execPath,checkpoint?['--import','tsx','tests/helpers/record-model-checkpoint.ts']:['.open-lovable-build/agent-worker.cjs','--once'],{env:{...process.env,...values},stdio:['ignore','pipe','pipe','ipc']});owned.push(child);
  let logs='';for(const stream of [child.stdout,child.stderr])stream?.on('data',chunk=>{logs=(logs+String(chunk)).slice(-8000);});
  const exit=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
  const checkpointReady=new Promise<void>((resolve,reject)=>{child.on('message',message=>{if((message as {type?:string}).type==='checkpoint.recorded')resolve();});child.once('exit',()=>reject(new Error('Fixture ended before checkpoint')));});void checkpointReady.catch(()=>{});
  return {child,exit,checkpointReady,logs:()=>logs};
 }
 async function until(check:()=>boolean,timeout=30000){const end=Date.now()+timeout;while(!check()){if(Date.now()>=end)throw new Error('Owned worker verification timed out');await delay(25);}}
 async function expireNaturally(){const row=store.db.prepare("SELECT expires_at FROM worker_leases WHERE name='agent'").get();await delay(Math.max(0,Number(row?.expires_at||0)-Date.now())+150);}
 t.after(async()=>{unhold();for(const child of owned)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();rmSync(root,{recursive:true,force:true});for(const key of Object.keys(values)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
 return {store,queue,authority,request,launch,until,expireNaturally,unhold,calls:()=>calls};
}
test('compiled worker uses a distinct OS process and explicit cancellation fences its late response',{timeout:45000},async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,{...f.request,prompt:'HOLD_PROCESS'}),worker=f.launch();
 assert.notEqual(worker.child.pid,process.pid);await f.until(()=>f.calls()===1);f.queue.cancel(f.authority,run.id);f.unhold();
 assert.equal(await worker.exit,0,worker.logs());assert.equal(f.queue.get(f.authority,run.id).state,'CANCELLED');assert.equal(f.store.getRun('process-test',run.projectId,run.id).candidate,null);assert.equal(f.calls(),1);
});
test('forced worker death after model dispatch never silently repeats uncertain inference',{timeout:60000},async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,{...f.request,prompt:'HOLD_PROCESS'}),worker=f.launch();
 await f.until(()=>f.calls()===1);worker.child.kill('SIGKILL');await worker.exit;f.unhold();await f.expireNaturally();
 const resumed=f.launch();assert.equal(await resumed.exit,0,resumed.logs());assert.equal(f.calls(),1);assert.equal(f.queue.get(f.authority,run.id).outcome,'MODEL_OUTCOME_UNCERTAIN');assert.equal(f.queue.get(f.authority,run.id).state,'INTERRUPTED');
 assert.equal(f.store.getProject('process-test',run.projectId).version,1);
});
test('after process loss a persisted model response resumes compilation without a second HTTP model request',{timeout:60000},async t=>{
 const f=await setup(t),run=f.queue.enqueue(f.authority,f.request),writer=f.launch(true);await writer.checkpointReady;
 writer.child.kill('SIGKILL');await writer.exit;assert.equal(f.calls(),1);await f.expireNaturally();
 const resumed=f.launch();assert.equal(await resumed.exit,0,resumed.logs());assert.equal(f.calls(),1);assert.equal(f.queue.get(f.authority,run.id).state,'AWAITING_APPROVAL');
 assert.equal(f.queue.events(f.authority,run.id).events.filter(e=>e.type==='model.requested').length,1);
 assert.equal(f.store.getProject('process-test',run.projectId).version,1);
});

test('starting immediately after an abandoned lease waits without stealing live work',{timeout:35000},async t=>{
 const f=await setup(t);assert.ok(f.queue.acquireWorker('abandoned-predecessor'));
 const start=Date.now(),replacement=f.launch();assert.equal(await replacement.exit,0,replacement.logs());
 assert.ok(Date.now()-start>=18000,'Replacement must wait for the predecessor lease');assert.equal(f.calls(),0);
});
