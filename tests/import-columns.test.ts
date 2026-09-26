import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ProjectStore} from '../lib/projects/store';
import {importColumns,IMPORT_TABLES} from '../lib/persistence/import-sqlite';
test('every column in the versioned application schema is accepted, including sha256',()=>{
 const store=new ProjectStore(':memory:');try{for(const table of IMPORT_TABLES)assert.ok(importColumns(store.db,table).length);assert.ok(importColumns(store.db,'revisions').includes('sha256'));}finally{store.close();}
});
test('import identifiers still reject unknown tables and SQL metacharacters',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE projects("bad;column" TEXT)');assert.throws(()=>importColumns(db,'projects'),/column/);
  assert.throws(()=>importColumns(db,'projects;DROP TABLE projects' as any),/table/);
  assert.ok(db.prepare("SELECT name FROM sqlite_schema WHERE name='projects'").get());
 }finally{db.close();}
});
