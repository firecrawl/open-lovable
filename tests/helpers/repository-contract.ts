import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {WorkspaceContext,AuthorizedContext} from '../../lib/contracts/domain';
import type {ProjectRepository} from '../../lib/persistence/repository';
export interface ContractFixture {
 repository:ProjectRepository;
 alice:WorkspaceContext;bob:WorkspaceContext;
 grant:(workspace:string,actor:string,role:string)=>Promise<void>;
 revoke:(workspace:string,actor:string)=>Promise<void>;
}
export function context(base:WorkspaceContext,id:string):AuthorizedContext{return {...base,projectId:id};}
export function repositoryContract(label:string,setup:(t:{after(fn:()=>unknown):void})=>Promise<ContractFixture>){
 test(label+': revisions, CAS and rollback preserve immutable history',async t=>{
  const {repository:r,alice}=await setup(t);const p=await r.create(alice,'Contract project','gateway/coder');const c=context(alice,p.id);
  const first={files:{'src/App.jsx':'export default function App(){return <h1>Original</h1>}'},assets:{}};
  const saved=await r.save(c,1,first,'First edit');assert.equal(saved.version,2);assert.equal(saved.workspaceId,alice.principal.workspaceId);
  const versions=await r.revisions(c);assert.equal(versions.length,2);const second=versions.find(v=>v.version===2)!;
  await assert.rejects(()=>r.save(c,1,{files:{},assets:{}},'stale'),/conflict/i);
  await r.save(c,2,{files:{'src/App.jsx':'export default ()=>null'},assets:{}},'Second edit');
  const restored=await r.restore(c,3,second.id);assert.equal(restored.version,4);assert.deepEqual(restored.snapshot,first);
  assert.deepEqual(await r.revision(c,second.id),first);assert.equal((await r.revisions(c)).length,4);
  assert.equal((await r.list(alice)).length,1);
 });
 test(label+': foreign project and missing project have indistinguishable failures',async t=>{
  const {repository:r,alice,bob}=await setup(t);const p=await r.create(alice,'Private project','gateway/coder');
  for(const id of [p.id,randomUUID()]){
   await assert.rejects(()=>r.read(context(bob,id)),{message:'Project not found',status:404});
   await assert.rejects(()=>r.save(context(bob,id),1,{files:{},assets:{}},'Not allowed'),{message:'Project not found',status:404});
  }
  assert.equal((await r.list(bob)).length,0);
 });
 test(label+': database membership wins over client roles; revocation is immediate',async t=>{
  const {repository:r,alice,bob,grant,revoke}=await setup(t);const p=await r.create(alice,'Member project','gateway/coder');
  await grant(alice.principal.workspaceId,bob.principal.actorId,'viewer');
  const viewer:WorkspaceContext={...bob,principal:{...bob.principal,workspaceId:alice.principal.workspaceId,roles:['owner']}};
  assert.equal((await r.read(context(viewer,p.id))).id,p.id);
  await assert.rejects(()=>r.save(context(viewer,p.id),1,{files:{},assets:{}},'blocked'),{status:403});
  await revoke(alice.principal.workspaceId,bob.principal.actorId);
  await assert.rejects(()=>r.read(context(viewer,p.id)),{message:'Project not found',status:404});
 });
 test(label+': two competing edits cannot both overwrite the same revision',async t=>{
  const {repository:r,alice}=await setup(t);const p=await r.create(alice,'Concurrent project','gateway/coder');const c=context(alice,p.id);
  const values=await Promise.allSettled([r.save(c,1,{files:{'a.ts':'export const a=1'},assets:{}},'A'),r.save(c,1,{files:{'b.ts':'export const b=1'},assets:{}},'B')]);
  assert.equal(values.filter(v=>v.status==='fulfilled').length,1);assert.equal(values.filter(v=>v.status==='rejected').length,1);
  assert.equal((await r.read(c)).version,2);assert.equal((await r.revisions(c)).length,2);
 });
 test(label+': invalid source and foreign revisions never cause a partial write',async t=>{
  const {repository:r,alice,bob}=await setup(t);const p=await r.create(alice,'Validated project','gateway/coder'),other=await r.create(bob,'Other project','gateway/coder');const c=context(alice,p.id);
  for(const files of [{'../escape.ts':'x'},{'.env':'API_KEY=hidden'},{'secret.ts':'const key="sk-'+ 'x'.repeat(40)+'"'}])await assert.rejects(()=>r.save(c,1,{files,assets:{}},'bad'));
  const foreign=(await r.revisions(context(bob,other.id)))[0];await assert.rejects(()=>r.restore(c,1,foreign.id),{status:404});
  assert.equal((await r.read(c)).version,1);assert.equal((await r.revisions(c)).length,1);
 });
}
