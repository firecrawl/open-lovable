import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {ProjectStore} from '../lib/projects/store';
import {importSqliteSnapshot} from '../lib/persistence/import-sqlite';
test('unavailable PostgreSQL connection preserves the source and returns the original failure',async t=>{
 const root=mkdtempSync(join(tmpdir(),'import-unavailable-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const path=join(root,'state.sqlite3');
 const store=new ProjectStore(path);store.createProject('alice','Preflight','gateway/coder');store.close();const before=readFileSync(path);
 const unavailable={connect:async()=>{throw new Error('fixture database unavailable');}} as unknown as Pool;
 await assert.rejects(()=>importSqliteSnapshot(path,randomBytes(32),unavailable),/fixture database unavailable/);
 assert.deepEqual(readFileSync(path),before);
});
