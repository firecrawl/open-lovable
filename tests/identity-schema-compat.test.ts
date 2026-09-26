import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ProjectStore} from '../lib/projects/store';
import {migrations} from '../lib/projects/schema';
import {IMPORT_TABLES,importColumns} from '../lib/persistence/import-sqlite';
test('P05 PostgreSQL import includes every versioned control-plane table rather than silently losing accounts',()=>{
 const store=new ProjectStore(':memory:');try{
  const expected=store.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>String(r.name));
  assert.deepEqual([...IMPORT_TABLES].sort(),expected);
  for(const table of IMPORT_TABLES)assert.ok(importColumns(store.db,table).length>0);
 }finally{store.close();}
});
test('P05 legacy schema 4 stays inspectable without pretending to contain identity tables',()=>{
 const db=new DatabaseSync(':memory:');try{for(const m of migrations.slice(0,4))db.exec(m.sql);assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='identity_actors'").get()?.n,0);}finally{db.close();}
});
test('P05 PostgreSQL schema history has an additive identity migration with a distinct digest',async()=>{
 const schema=await import('../lib/persistence/postgres-schema') as Record<string,any>;
 assert.equal(schema.POSTGRES_MIGRATIONS?.length,5);
 assert.equal(schema.POSTGRES_MIGRATIONS[3].version,4);assert.match(schema.POSTGRES_MIGRATIONS[3].sql,/run_journal_immutable/);
 assert.equal(schema.POSTGRES_MIGRATIONS[2].version,3);assert.match(schema.POSTGRES_MIGRATIONS[2].sql,/run_controls/);
 assert.equal(schema.POSTGRES_MIGRATIONS[0].sql,schema.POSTGRES_SCHEMA_SQL);
 assert.equal(schema.POSTGRES_MIGRATIONS[0].digest,schema.POSTGRES_SCHEMA_DIGEST);
 assert.match(schema.POSTGRES_MIGRATIONS[1].sql,/auth_sessions/);
 assert.notEqual(schema.POSTGRES_MIGRATIONS[1].digest,schema.POSTGRES_MIGRATIONS[0].digest);
});
