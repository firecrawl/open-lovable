import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {migrations} from '../lib/projects/schema';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ProjectStore} from '../lib/projects/store';

test('P03 operator CLI creates an encrypted backup and restores a separate working database',t=>{
 const root=mkdtempSync(join(tmpdir(),'recovery-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const store=new ProjectStore(join(root,'source','state.sqlite3'));const p=store.createProject('alice','CLI recovery','gateway/coder');store.close();
 const key=join(root,'test.key');writeFileSync(key,randomBytes(32));const bundle=join(root,'bundle'),target=join(root,'restored');
 const script=fileURLToPath(new URL('../scripts/recovery.ts',import.meta.url));
 const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx',script,...args],{encoding:'utf8',timeout:30000});
 const create=run(['create','--data-dir',join(root,'source'),'--destination',bundle,'--key-file',key]);assert.equal(create.status,0,create.stderr);
 const restored=run(['restore','--bundle',bundle,'--destination',target,'--key-file',key]);assert.equal(restored.status,0,restored.stderr);
 const db=new ProjectStore(join(target,'state.sqlite3'));try{assert.equal(db.getProject('alice',p.id).name,'CLI recovery');}finally{db.close();}
 assert.deepEqual(readFileSync(join(target,'credentials.key')),readFileSync(key));
 assert.notEqual(run(['restore','--bundle',bundle,'--destination',target,'--key-file',key]).status,0);
});

test('P03 CLI backup does not migrate or change the source database',t=>{
 const root=mkdtempSync(join(tmpdir(),'recovery-old-schema-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=join(root,'state.sqlite3'),db=new DatabaseSync(path);
 for(const m of migrations.slice(0,2))db.exec(m.sql);
 db.exec('PRAGMA user_version=2; PRAGMA journal_mode=DELETE;');db.close();
 const hash=()=>createHash('sha256').update(readFileSync(path)).digest('hex');const before=hash();
 const key=join(root,'key');writeFileSync(key,randomBytes(32));
 const script=fileURLToPath(new URL('../scripts/recovery.ts',import.meta.url));
 const result=spawnSync(process.execPath,['--import','tsx',script,'create','--data-dir',root,'--destination',join(root,'backup'),'--key-file',key],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);assert.equal(hash(),before,'read-only backup must preserve source bytes');
 const manifest=JSON.parse(readFileSync(join(root,'backup','manifest.json'),'utf8'));assert.equal(manifest.schemaVersion,2);
});

test('P03 CLI verifies a bundle without requiring a restore destination',t=>{
 const root=mkdtempSync(join(tmpdir(),'recovery-verify-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const store=new ProjectStore(join(root,'source','state.sqlite3'));store.createProject('alice','Verify bundle','gateway/coder');store.close();
 const key=join(root,'key');writeFileSync(key,randomBytes(32));const bundle=join(root,'backup');
 const script=fileURLToPath(new URL('../scripts/recovery.ts',import.meta.url));
 const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx',script,...args],{encoding:'utf8',timeout:30000});
 assert.equal(run(['create','--data-dir',join(root,'source'),'--destination',bundle,'--key-file',key]).status,0);
 const result=run(['verify','--bundle',bundle,'--key-file',key]);assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).operation,'backup-verified');
 const bytes=readFileSync(join(bundle,'database.enc'));bytes[0]^=1;writeFileSync(join(bundle,'database.enc'),bytes);
 assert.notEqual(run(['verify','--bundle',bundle,'--key-file',key]).status,0);
});
