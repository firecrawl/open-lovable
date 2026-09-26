import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProjectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';
import {migrations} from '../lib/projects/schema';
import {RunQueue} from '../lib/runs/queue';
import {createRecoveryBundle,restoreRecoveryBundle} from '../lib/projects/recovery';
import {IMPORT_TABLES} from '../lib/persistence/import-sqlite';
import type {RunAuthority} from '../lib/runs/types';

test('run migration preserves old children and turns foreign-key enforcement back on',t=>{
 const root=mkdtempSync(join(tmpdir(),'run-migration-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const path=join(root,'state.sqlite3'),old=new DatabaseSync(path);
 for(const m of migrations.slice(0,5))old.exec(m.sql);old.exec('PRAGMA user_version=5');
 old.prepare('INSERT INTO workspaces VALUES(?,?,?,?)').run('w','alice','Legacy','date');
 old.prepare('INSERT INTO workspace_members VALUES(?,?,?,?,?)').run('w','alice','owner',1,1);
 const snapshot=JSON.stringify({files:{},assets:{}});
 old.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?)').run('p','alice','Legacy','model',1,snapshot,'date','date','w');
 old.prepare('INSERT INTO runs(id,project_id,request_key,prompt,model,base_version,state,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('r','p','request-key','old request','model',1,'SUCCEEDED',0,'date','date');
 old.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run('m','p','r','assistant','Old result','date');
 old.prepare('INSERT INTO execution_claims VALUES(?,?)').run('r','date');old.close();
 const store=new ProjectStore(path);try{
  assert.equal(store.db.prepare('SELECT content FROM messages WHERE run_id=?').get('r')?.content,'Old result');
  assert.equal(store.db.prepare('SELECT run_id FROM execution_claims').get()?.run_id,'r');
  assert.equal(store.db.prepare('PRAGMA foreign_keys').get()?.foreign_keys,1);
  assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>store.db.prepare('INSERT INTO execution_claims VALUES(?,?)').run('missing','date'),/foreign key/i);
 }finally{store.close();}
});
test('run migration refuses corrupt legacy relationships without committing the new schema',t=>{
 const root=mkdtempSync(join(tmpdir(),'run-migration-fail-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const path=join(root,'state.sqlite3'),old=new DatabaseSync(path);
 for(const m of migrations.slice(0,5))old.exec(m.sql);old.exec('PRAGMA user_version=5; PRAGMA foreign_keys=OFF');old.prepare('INSERT INTO execution_claims VALUES(?,?)').run('nonexistent','date');old.close();
 assert.throws(()=>new ProjectStore(path),/integrity/i);const checked=new DatabaseSync(path,{readOnly:true});
 try{assert.equal(checked.prepare('PRAGMA user_version').get()?.user_version,5);assert.equal(checked.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='run_controls'").get()?.n,0);}finally{checked.close();}
});
test('restoring a control-plane snapshot never restarts a previously queued run',async t=>{
 const root=mkdtempSync(join(tmpdir(),'run-restore-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const store=new ProjectStore(join(root,'source','state.sqlite3'));
 try{
  const repository=new SqliteProjectRepository(store),ctx=repository.individualContext('alice'),project=await repository.create(ctx,'Restore queue','gateway/model');
  const authority:RunAuthority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'alice',allowLoopback:true,modelBinding:'a'.repeat(64),policyVersion:1};
  const queue=new RunQueue(store),run=queue.enqueue(authority,{projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'Original request',model:'gateway/model',mode:'build',imageIDs:[],confirmCost:true});
  queue.acquireWorker('before-restore');const key=randomBytes(32),bundle=join(root,'backup');await createRecoveryBundle(store,key,bundle);
  const report=await restoreRecoveryBundle(bundle,key,join(root,'restored'));assert.equal(report.runsInvalidated,1);
  const recovered=new ProjectStore(join(root,'restored','state.sqlite3'));
  try{const after=new RunQueue(recovered);assert.equal(after.get(authority,run.id).state,'INTERRUPTED');const lease=after.acquireWorker('after-restore');assert.ok(lease);assert.equal(after.claim(lease!),null);assert.equal(store.getRun('alice',project.id,run.id).state,'QUEUED');}finally{recovered.close();}
 }finally{store.close();}
});
test('the complete control-plane table inventory includes queue records and cannot drop them on import',()=>{
 const store=new ProjectStore(':memory:');try{const tables=store.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>String(r.name));assert.deepEqual([...IMPORT_TABLES].sort(),tables.sort());}finally{store.close();}
});

test('recovery retains uncertain historical outcomes and invalidates only pending work',async t=>{
 const root=mkdtempSync(join(tmpdir(),'run-uncertainty-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const store=new ProjectStore(join(root,'source','state.sqlite3'));try{
  const repository=new SqliteProjectRepository(store),ctx=repository.individualContext('alice'),project=await repository.create(ctx,'Retain uncertainty','gateway/model');
  const authority:RunAuthority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'alice',allowLoopback:true,modelBinding:'a'.repeat(64),policyVersion:1};
  const request={projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'Original request',model:'gateway/model',mode:'build' as const,imageIDs:[],confirmCost:true};
  let now=Date.now();const queue=new RunQueue(store,()=>now),uncertain=queue.enqueue(authority,request),worker=queue.acquireWorker('crashed')!,job=queue.claim(worker)!;
  queue.markModelStarted(job);now+=21000;queue.reconcile();assert.equal(queue.get(authority,uncertain.id).outcome,'MODEL_OUTCOME_UNCERTAIN');
  const pending=queue.enqueue(authority,{...request,requestKey:randomUUID()}),key=randomBytes(32),bundle=join(root,'backup');
  await createRecoveryBundle(store,key,bundle);const result=await restoreRecoveryBundle(bundle,key,join(root,'restored'));assert.equal(result.runsInvalidated,1);
  const restored=new ProjectStore(join(root,'restored','state.sqlite3'));try{
   const after=new RunQueue(restored);assert.equal(after.get(authority,uncertain.id).outcome,'MODEL_OUTCOME_UNCERTAIN');assert.equal(after.get(authority,pending.id).outcome,'RECOVERY_REVIEW_REQUIRED');
   assert.equal(store.getRun('alice',project.id,pending.id).state,'QUEUED');
  }finally{restored.close();}
 }finally{store.close();}
});
