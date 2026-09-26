import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';

async function fixture(t:{after(fn:()=>void):void}){
 const root=mkdtempSync(join(tmpdir(),'run-queue-contract-')),path=join(root,'state.sqlite3'),store=new ProjectStore(path);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const repository=new SqliteProjectRepository(store),workspace=repository.individualContext('alice');
 const project=await repository.create(workspace,'Durable contract','gateway/fixture');
 const implementationModule=await import('../lib/runs/queue').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof implementationModule.RunQueue,'function','A durable queue must exist');
 let now=Date.now();const queue=new implementationModule.RunQueue(store,()=>now);
 const authority={workspaceId:workspace.principal.workspaceId,actorId:workspace.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'alice',allowLoopback:true,modelBinding:'a'.repeat(64),policyVersion:1};
 const request={projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'Build a counter',model:'gateway/fixture',mode:'build',imageIDs:[],confirmCost:true};
 return {root,path,store,queue,authority,request,project,advance:(ms:number)=>now+=ms};
}
test('P08 enqueue freezes context and idempotency; observing or reopening does not execute the model',async t=>{
 const f=await fixture(t);f.store.addDocument('alice',f.project.id,'rules.md','Original business rule');
 const run=f.queue.enqueue(f.authority,f.request);assert.equal(run.state,'QUEUED');
 f.store.addDocument('alice',f.project.id,'later.md','Later rule');
 assert.equal(f.queue.enqueue(f.authority,f.request).id,run.id);
 assert.throws(()=>f.queue.enqueue(f.authority,{...f.request,prompt:'Other request'}),/conflict/i);
 const another=new ProjectStore(f.path);try{
  const Q=f.queue.constructor,reopened=new Q(another);const status=reopened.get(f.authority,run.id);
  assert.equal(status.state,'QUEUED');assert.equal(status.id,run.id);assert.equal(another.db.prepare('SELECT count(*) AS n FROM execution_claims').get()?.n,0);
 }finally{another.close();}
 const lease=f.queue.acquireWorker('worker-a');assert.ok(lease);const claimed=f.queue.claim(lease);assert.equal(claimed.run.id,run.id);
 assert.equal(claimed.input.references.length,1);assert.equal(claimed.input.references[0].content,'Original business rule');
 assert.equal(f.queue.events(f.authority,run.id,0).events[0].type,'run.queued');
});
test('P08 explicit cancellation preserves the saved revision and rejects late candidate writes',async t=>{
 const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request),lease=f.queue.acquireWorker('worker-a'),job=f.queue.claim(lease);
 assert.equal(f.queue.cancel(f.authority,run.id).state,'CANCELLED');
 assert.equal(f.queue.cancel(f.authority,run.id).state,'CANCELLED');
 assert.throws(()=>f.queue.stage(job,{files:{'src/App.jsx':'export default ()=>null'},assets:{}},'Late',{}),/lease|cancel|running/i);
 assert.equal(f.store.getProject('alice',f.project.id).version,1);
});
test('P09 only one worker holds the execution lease and stale results are fenced',async t=>{
 const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request),a=f.queue.acquireWorker('worker-a');assert.ok(a);
 assert.equal(f.queue.acquireWorker('worker-b'),null);const job=f.queue.claim(a);f.queue.markModelStarted(job);
 f.advance(120000);const b=f.queue.acquireWorker('worker-b');assert.ok(b);f.queue.reconcile();
 assert.equal(f.queue.get(f.authority,run.id).state,'INTERRUPTED');assert.equal(f.queue.claim(b),null);
 assert.throws(()=>f.queue.stage(job,{files:{},assets:{}},'stale',{}),/lease|interrupted|running/i);
 assert.equal(f.queue.get(f.authority,run.id).outcome,'MODEL_OUTCOME_UNCERTAIN');
});
test('P09 completed model output survives a worker crash without authorizing another model request',async t=>{
 const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request),a=f.queue.acquireWorker('worker-a'),job=f.queue.claim(a);
 f.queue.markModelStarted(job);f.queue.recordModelResult(job,'<file path="src/App.jsx">export default ()=>null</file>',{inputTokens:5,outputTokens:10});
 f.advance(120000);const b=f.queue.acquireWorker('worker-b');f.queue.reconcile();const resumed=f.queue.claim(b);
 assert.equal(resumed.run.id,run.id);assert.match(resumed.output,/export default/);assert.ok(resumed.token>job.token);
 assert.throws(()=>f.queue.markModelStarted(resumed),/already|recorded/i);
});
test('P07 journal reads enforce workspace membership, stable cursors and no exposed global ordering',async t=>{
 const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request);
 const other={...f.authority,workspaceId:randomUUID()};
 assert.throws(()=>f.queue.get(other,run.id),/not found/i);assert.throws(()=>f.queue.events(other,run.id,0),/not found/i);
 const first=f.queue.events(f.authority,run.id,0);assert.equal(first.events[0].sequence,1);
 assert.equal(f.queue.events(f.authority,run.id,first.nextCursor).events.length,0);
 assert.throws(()=>f.queue.events(f.authority,run.id,-1),/cursor/i);
 f.store.db.prepare('UPDATE workspace_members SET active=0 WHERE workspace_id=?').run(f.authority.workspaceId);
 assert.throws(()=>f.queue.cancel(f.authority,run.id),/not found/i);
});
test('run creation participates in outer rollback and async transaction callbacks are rejected',t=>{
 const store=new ProjectStore(':memory:');t.after(()=>store.close());
 assert.throws(()=>store.transaction(()=>{store.createProject('alice','Temporary','gateway/m');throw new Error('abort outer');}),/abort outer/);
 assert.equal(store.listProjects('alice').length,0);
 assert.throws(()=>store.transaction(()=>Promise.resolve('invalid')),/synchronous/i);
});

test('managed source, authority and journal records are immutable even to accidental direct SQL updates',async t=>{
 const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request);
 for(const [column,value] of [['authority','{}'],['frozen_input','{}'],['request_digest','b'.repeat(64)],['deadline_at',1]]){
  assert.throws(()=>f.store.db.prepare('UPDATE run_controls SET '+column+'=? WHERE run_id=?').run(value,run.id),/immutable/i);
 }
 assert.throws(()=>f.store.db.prepare('UPDATE runs SET prompt=? WHERE id=?').run('Changed request',run.id),/immutable/i);
 assert.throws(()=>f.store.db.prepare('UPDATE run_journal SET payload=? WHERE run_id=?').run('{}',run.id),/immutable/i);
 assert.throws(()=>f.store.db.prepare('DELETE FROM run_journal WHERE run_id=?').run(run.id),/immutable/i);
});
test('corrupted stored job is quarantined and cannot permanently block unrelated queued work',async t=>{
 const f=await fixture(t),bad=f.queue.enqueue(f.authority,f.request);
 // Isolated fault injection simulates an old/corrupted database, not a product bypass.
 const triggers=f.store.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='run_controls'").all();
 for(const trigger of triggers)f.store.db.exec('DROP TRIGGER "'+trigger.name+'"');
 f.store.db.prepare('UPDATE run_controls SET authority=? WHERE run_id=?').run('{invalid-json',bad.id);
 for(const trigger of triggers)f.store.db.exec(String(trigger.sql));
 const next=f.store.createProject('alice','Next project','gateway/fixture');
 const good=f.queue.enqueue(f.authority,{...f.request,projectId:next.id,requestKey:randomUUID()});
 const lease=f.queue.acquireWorker('healthy-worker');
 assert.doesNotThrow(()=>f.queue.claim(lease));
 assert.equal(f.queue.get(f.authority,bad.id).state,'FAILED');
 assert.equal(f.queue.claim(lease)?.run.id,good.id);
});
test('an expired run lease cannot publish a failure from an old executor',async t=>{
 const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request),worker=f.queue.acquireWorker('worker-a'),job=f.queue.claim(worker);
 f.advance(15000);assert.equal(f.queue.heartbeatWorker(worker),true);f.advance(6000);
 f.queue.fail(job,'stale diagnostic');
 assert.equal(f.queue.get(f.authority,run.id).state,'RUNNING');
 assert.equal(f.queue.events(f.authority,run.id).events.some((e:{type:string})=>e.type==='run.stopped'),false);
 f.queue.reconcile();assert.equal(f.queue.get(f.authority,run.id).state,'QUEUED');
});

test('graceful shutdown requeues only safe work and never retries an uncertain model request',async t=>{
 for(const stage of ['before-model','response-recorded','request-uncertain']){
  const f=await fixture(t),run=f.queue.enqueue(f.authority,f.request),lease=f.queue.acquireWorker('draining-worker'),job=f.queue.claim(lease);
  if(stage!=='before-model')f.queue.markModelStarted(job);
  if(stage==='response-recorded')f.queue.recordModelResult(job,'<file path="src/App.jsx">export default ()=>null</file>',{});
  f.queue.fail(job,'Worker shutdown',true);
  assert.equal(f.queue.get(f.authority,run.id).state,stage==='request-uncertain'?'INTERRUPTED':'QUEUED');
  if(stage==='response-recorded')assert.equal(f.queue.claim(lease).output,'<file path="src/App.jsx">export default ()=>null</file>');
  if(stage==='request-uncertain')assert.equal(f.queue.claim(lease),null);
 }
});
