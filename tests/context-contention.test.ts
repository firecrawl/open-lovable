import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';
test('reading an existing personal workspace does not acquire a database write lock',t=>{
 const root=mkdtempSync(join(tmpdir(),'workspace-contention-')),path=join(root,'state.sqlite3');
 const writer=new ProjectStore(path),reader=new ProjectStore(path);t.after(()=>{reader.close();writer.close();rmSync(root,{recursive:true,force:true});});
 const repo=new SqliteProjectRepository(reader),first=repo.individualContext('alice');
 reader.db.exec('PRAGMA busy_timeout=50');writer.db.exec('BEGIN IMMEDIATE');
 try{assert.equal(repo.individualContext('alice').principal.workspaceId,first.principal.workspaceId);}finally{writer.db.exec('ROLLBACK');}
});
