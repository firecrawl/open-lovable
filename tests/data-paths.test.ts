import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dataDirectory} from '../lib/projects/store';

test('P02 native temporary paths work and arbitrary linked ancestors are refused before mkdir',t=>{
 const root=mkdtempSync(join(tmpdir(),'paths-')),prior=process.env.OPEN_LOVABLE_DATA_DIR;
 t.after(()=>{if(prior===undefined)delete process.env.OPEN_LOVABLE_DATA_DIR;else process.env.OPEN_LOVABLE_DATA_DIR=prior;rmSync(root,{recursive:true,force:true});});
 process.env.OPEN_LOVABLE_DATA_DIR=join(root,'private-data');assert.ok(existsSync(dataDirectory()));
 const target=join(root,'target'),link=join(root,'linked');mkdirSync(target);symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
 process.env.OPEN_LOVABLE_DATA_DIR=join(link,'must-not-exist');assert.throws(dataDirectory,/symlink|junction/i);
 assert.equal(existsSync(join(target,'must-not-exist')),false);
});

test('P02 only exact root-owned Darwin aliases may be trusted; user links are not canonicalized away',async()=>{
 const pathPolicy=await import('../lib/security/data-paths').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof pathPolicy.isTrustedSystemAlias,'function','system aliases need a narrow policy, not permissive realpath');
 const input={platform:'darwin',path:'/var',target:'/private/var',linkUid:0,parentUid:0,parentMode:0o755};
 assert.equal(pathPolicy.isTrustedSystemAlias(input),true);
 for(const change of [{platform:'linux'},{path:'/home/alice/link'},{target:'/tmp/redirect'},{linkUid:501},{parentUid:501},{parentMode:0o777}])assert.equal(pathPolicy.isTrustedSystemAlias({...input,...change}),false);
});


test('P02 a future database schema is refused without changing the database bytes',async t=>{
 const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');
 const {ProjectStore}=await import('../lib/projects/store');const {migrations}=await import('../lib/projects/schema');
 const root=mkdtempSync(join(tmpdir(),'future-schema-safe-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=join(root,'future.sqlite3');const store=new ProjectStore(path);
 store.db.exec(`PRAGMA user_version=${migrations.length+1}; PRAGMA journal_mode=DELETE;`);store.close();
 const hash=()=>createHash('sha256').update(readFileSync(path)).digest('hex');const before=hash();
 assert.throws(()=>new ProjectStore(path),/newer/i);assert.equal(hash(),before);
});
