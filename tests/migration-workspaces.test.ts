import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {migrations} from '../lib/projects/schema';
import {ProjectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';

test('migration 4 backfills legacy owners once without rewriting existing history',async t=>{
 const root=mkdtempSync(join(tmpdir(),'workspace-upgrade-')),path=join(root,'state.sqlite3');t.after(()=>rmSync(root,{recursive:true,force:true}));
 const old=new DatabaseSync(path);for(const m of migrations.slice(0,3))old.exec(m.sql);old.exec('PRAGMA user_version=3');
 const id=randomUUID(),revision=randomUUID(),snapshot=JSON.stringify({files:{'src/App.jsx':'export default ()=>null'},assets:{}}),time=new Date().toISOString(),digest=createHash('sha256').update(snapshot).digest('hex');
 old.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)').run(id,'alice','Legacy','gateway/coder',1,snapshot,time,time);
 old.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)').run(revision,id,1,'Before migration',snapshot,digest,time);old.close();
 let store=new ProjectStore(path);
 try{
  const r=new SqliteProjectRepository(store),ctx=r.individualContext('alice');const p=await r.read({...ctx,projectId:id});assert.equal(p.revisionId,revision);assert.equal(p.workspaceId,ctx.principal.workspaceId);
  assert.equal(store.db.prepare('SELECT snapshot FROM revisions WHERE id=?').get(revision)?.snapshot,snapshot);
  store.db.prepare("UPDATE workspace_members SET role='viewer' WHERE workspace_id=?").run(ctx.principal.workspaceId);
 }finally{store.close();}
 store=new ProjectStore(path);
 try{const r=new SqliteProjectRepository(store),ctx=r.individualContext('alice');assert.deepEqual(ctx.principal.roles,['viewer']);assert.equal(store.db.prepare('SELECT count(*) AS n FROM workspaces').get()?.n,1);}
 finally{store.close();}
});
