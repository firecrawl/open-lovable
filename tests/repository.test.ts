import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore} from '../lib/projects/store';
import {repositoryContract,context} from './helpers/repository-contract';
import {createHash} from 'node:crypto';
import {migrations} from '../lib/projects/schema';
async function setup(t:{after(fn:()=>unknown):void}){
 const loaded=await import('../lib/persistence/sqlite').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof loaded.SqliteProjectRepository,'function','Workspace-aware SQLite repository is required');
 const store=new ProjectStore(':memory:');t.after(()=>store.close());const repository=new loaded.SqliteProjectRepository(store);
 const alice=repository.individualContext('alice'),bob=repository.individualContext('bob');
 return {repository,alice,bob,store,
  grant:async(workspace:string,actor:string,role:string)=>{store.db.prepare('INSERT INTO workspace_members(workspace_id,actor_id,role,active,version) VALUES(?,?,?,1,1)').run(workspace,actor,role);},
  revoke:async(workspace:string,actor:string)=>{store.db.prepare('UPDATE workspace_members SET active=0,version=version+1 WHERE workspace_id=? AND actor_id=?').run(workspace,actor);}};
}
repositoryContract('SQLite',setup);
test('P04 deterministic legacy workspaces survive reopen without regranting membership',async t=>{
 const {store,repository,alice}=await setup(t);const again=repository.individualContext('alice');assert.equal(again.principal.workspaceId,alice.principal.workspaceId);
 const p=store.createProject('alice','Legacy writer','gateway/coder');assert.equal((await repository.read(context(alice,p.id))).id,p.id);
 store.db.prepare('UPDATE workspace_members SET active=0 WHERE workspace_id=?').run(alice.principal.workspaceId);
 assert.throws(()=>repository.individualContext('alice'),/not found|access/i);
 assert.equal(store.db.prepare('SELECT active FROM workspace_members WHERE workspace_id=?').get(alice.principal.workspaceId)?.active,0);
});
test('P04 historical SQLite migrations remain byte-identical',()=>{
 const hashes=migrations.slice(0,3).map(m=>createHash('sha256').update(m.sql).digest('hex'));
 assert.deepEqual(hashes,["700a63e98e67da70330147e214400c938d8a6dd632a85c5199985c91c486898d", "79a4f3de5bca6f85b4130006fbe597a034fcf3b017536654754662918df9fd63", "dba43708dc97dabd1f986f8849173d94cf012f2ec960caaf151e3b16d3587abc"]);
});
