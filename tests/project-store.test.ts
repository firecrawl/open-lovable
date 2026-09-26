import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { dataDirectory } from '../lib/projects/store';
import { join } from 'node:path';

async function setup(t: {after:(fn:()=>void)=>void}) {
  const implementation = await import('../lib/projects/store').catch(() => ({})) as Record<string, any>;
  assert.equal(typeof implementation.ProjectStore, 'function', 'A durable ProjectStore must exist');
  const dir=mkdtempSync(join(tmpdir(),'open-lovable-store-test-'));
  const path=join(dir,'state.sqlite3');
  const store=new implementation.ProjectStore(path);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {store,path,Module:implementation};
}
const first={files:{'src/App.jsx':'export default function App(){return <h1>First</h1>}'},assets:{}};
const second={files:{'src/App.jsx':'export default function App(){return <h1>Second</h1>}'},assets:{}};

test('projects persist after reopen; ownership is checked on every resource',async t=>{
  const {store,path,Module}=await setup(t);
  const p=store.createProject('owner-a','Project A','gateway/coder');
  store.saveSnapshot('owner-a',p.id,1,first,'Initial application');
  assert.equal(store.listProjects('owner-b').length,0);
  assert.throws(()=>store.getProject('owner-b',p.id),/not found/i);
  assert.throws(()=>store.revisions('owner-b',p.id),/not found/i);
  const reopened=new Module.ProjectStore(path);
  try {assert.equal(reopened.getProject('owner-a',p.id).snapshot.files['src/App.jsx'],first.files['src/App.jsx']);}
  finally {reopened.close();}
});

test('revision compare-and-swap prevents lost updates; restore creates a new revision',async t=>{
  const {store}=await setup(t);
  const p=store.createProject('owner-a','Project A','gateway/coder');
  const v2=store.saveSnapshot('owner-a',p.id,1,first,'First');
  assert.throws(()=>store.saveSnapshot('owner-a',p.id,1,second,'Stale'),/conflict/i);
  store.saveSnapshot('owner-a',p.id,v2.version,second,'Second');
  const previous=store.revisions('owner-a',p.id).find((r:any)=>r.version===2);
  const restored=store.restoreRevision('owner-a',p.id,3,previous.id);
  assert.equal(restored.version,4);assert.deepEqual(restored.snapshot,first);
  assert.equal(store.revisions('owner-a',p.id).length,4);
});

test('different projects never share files, revisions, runs or conversation',async t=>{
  const {store}=await setup(t);
  const a=store.createProject('owner','A','gateway/coder'); const b=store.createProject('owner','B','gateway/coder');
  store.saveSnapshot('owner',a.id,1,first,'A');
  assert.deepEqual(store.getProject('owner',b.id).snapshot.files,{});
  const revision=store.revisions('owner',a.id)[0];
  assert.throws(()=>store.restoreRevision('owner',b.id,1,revision.id),/not found/i);
  const run=store.beginRun('owner',a.id,'request-one','Build A','gateway/coder',2);
  assert.equal(store.runs('owner',b.id).length,0);
  assert.throws(()=>store.getRun('intruder',a.id,run.id),/not found/i);
  assert.equal(store.messages('owner',b.id).length,0);
});

test('idempotent runs and cancellation preserve the last committed revision',async t=>{
  const {store}=await setup(t);const p=store.createProject('owner','A','gateway/coder');
  const run=store.beginRun('owner',p.id,'same-request','Build','gateway/coder',1);
  assert.equal(store.beginRun('owner',p.id,'same-request','Build','gateway/coder',1).id,run.id);
  assert.throws(()=>store.beginRun('owner',p.id,'same-request','Different','gateway/coder',1),/conflict/i);
  assert.throws(()=>store.beginRun('owner',p.id,'another-request','Build','gateway/coder',1),/in progress/i);
  store.cancelRun('owner',p.id,run.id);
  assert.throws(()=>store.stageRun('owner',p.id,run.id,first,'Done'),/state|cancel/i);
  assert.equal(store.getProject('owner',p.id).version,1);
  assert.deepEqual(store.getProject('owner',p.id).snapshot.files,{});
});

test('a generated proposal becomes a revision only after explicit acceptance',async t=>{
  const {store}=await setup(t);const p=store.createProject('owner','A','gateway/coder');
  const run=store.beginRun('owner',p.id,'generate-one','Build','gateway/coder',1);
  store.stageRun('owner',p.id,run.id,first,'Generated code');
  assert.equal(store.getProject('owner',p.id).version,1);
  assert.equal(store.getRun('owner',p.id,run.id).state,'AWAITING_APPROVAL');
  const saved=store.acceptRun('owner',p.id,run.id,1);
  assert.equal(saved.version,2);assert.deepEqual(saved.snapshot,first);
  assert.equal(store.getRun('owner',p.id,run.id).state,'SUCCEEDED');
  assert.throws(()=>store.acceptRun('owner',p.id,run.id,1),/state|conflict/i);
});

test('unsafe paths, source secrets and oversized files are rejected without a partial write',async t=>{
  const {store}=await setup(t);const p=store.createProject('owner','A','gateway/coder');
  for(const snapshot of [{files:{'../escape':'x'},assets:{}},{files:{'.env':'hidden'},assets:{}},{files:{'a.ts':'const key="sk-'+ 'x'.repeat(40)+'"'},assets:{}},{files:{'a.ts':'x'.repeat(1024*1024+1)},assets:{}}]) {
    assert.throws(()=>store.saveSnapshot('owner',p.id,1,snapshot,'Rejected'));
  }
  assert.equal(store.getProject('owner',p.id).version,1);
  assert.equal(store.revisions('owner',p.id).length,1);
});


test('an expired execution is marked interrupted and never restarted automatically',async t=>{
 const {store}=await setup(t);const p=store.createProject('owner','Recovery','gateway/coder');
 const run=store.beginRun('owner',p.id,'recovery-request','Build','gateway/coder',1);
 store.db.prepare('UPDATE runs SET lease_until=? WHERE id=?').run(0,run.id);
 assert.equal(store.runs('owner',p.id)[0].state,'INTERRUPTED');
 assert.equal(store.getProject('owner',p.id).version,1);
});

test('concurrent connections cannot overwrite an accepted revision or a changed candidate base',async t=>{
 const {store,path,Module}=await setup(t);const other=new Module.ProjectStore(path);
 try {
 const p=store.createProject('owner','Concurrency','gateway/coder');
 store.saveSnapshot('owner',p.id,1,first,'First');
 assert.throws(()=>other.saveSnapshot('owner',p.id,1,second,'Stale'),/conflict/i);
 const run=store.beginRun('owner',p.id,'candidate-request','Change','gateway/coder',2);
 store.stageRun('owner',p.id,run.id,second,'Candidate');
 other.saveSnapshot('owner',p.id,2,first,'Manual save');
 assert.throws(()=>store.acceptRun('owner',p.id,run.id,2),/conflict/i);
 assert.deepEqual(store.getProject('owner',p.id).snapshot,first);
 } finally {other.close();}
});


test('the state directory cannot hide inside the checkout with a double-dot name',()=>{
 const previous=process.env.OPEN_LOVABLE_DATA_DIR;
 const folder=join(process.cwd(),'..state-test-'+randomUUID());
 try {
  process.env.OPEN_LOVABLE_DATA_DIR=folder;
  assert.throws(()=>dataDirectory(),/outside the application checkout/i);
 } finally {
  if(previous===undefined)delete process.env.OPEN_LOVABLE_DATA_DIR;else process.env.OPEN_LOVABLE_DATA_DIR=previous;
  rmSync(folder,{recursive:true,force:true});
 }
});


test('a junction ancestor cannot redirect persistent data into another directory',()=>{
 const previous=process.env.OPEN_LOVABLE_DATA_DIR;
 const temporary=mkdtempSync(join(tmpdir(),'open-lovable-path-test-'));
 const real=join(temporary,'real');mkdirSync(real);
 symlinkSync(real,join(temporary,'link'),'junction');
 try {
  process.env.OPEN_LOVABLE_DATA_DIR=join(temporary,'link','new-data');
  assert.throws(()=>dataDirectory(),/symlink|junction/i);
  assert.equal(existsSync(join(real,'new-data')),false,'validation must precede directory creation');
 } finally {
  if(previous===undefined)delete process.env.OPEN_LOVABLE_DATA_DIR;else process.env.OPEN_LOVABLE_DATA_DIR=previous;
  rmSync(temporary,{recursive:true,force:true});
 }
});
