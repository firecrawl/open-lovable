import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {ProjectStore} from '../lib/projects/store';
import {CredentialStore} from '../lib/settings/store';
import {ReferenceImageStore} from '../lib/projects/images';
import {rasterWithTokenShapedEncoding} from './helpers/raster-fixture';
import {migrations} from '../lib/projects/schema';

async function setup(t:{after(fn:()=>void):void}){
 const root=mkdtempSync(join(tmpdir(),'recovery-roundtrip-'));const store=new ProjectStore(join(root,'source','state.sqlite3'));const key=randomBytes(32);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const recovery=await import('../lib/projects/recovery').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof recovery.createRecoveryBundle,'function','consistent encrypted recovery must exist');
 assert.equal(typeof recovery.restoreRecoveryBundle,'function','verified restore must exist');
 return {root,store,key,...recovery};
}
test('P03 backup and isolated restore preserve code/history/references/images and encrypted connections',async t=>{
 const {root,store,key,createRecoveryBundle,restoreRecoveryBundle}=await setup(t);
 const project=store.createProject('alice','Recovery','gateway/coder');
 const original={files:{'src/App.jsx':'export default function App(){return <h1>Original</h1>}'},assets:{}};
 store.saveSnapshot('alice',project.id,1,original,'Saved');store.addDocument('alice',project.id,'rules.md','Keep the booking rule');
 const images=new ReferenceImageStore(store);const image=await images.add('alice',project.id,'reference.png','target',(await rasterWithTokenShapedEncoding()).toString('base64'));
 const run=store.beginRun('alice',project.id,'recovery-plan','Plan the booking','gateway/coder',2,{mode:'plan',imageIDs:[image.id]});store.completePlan('alice',project.id,run.id,'A persisted plan');
 new CredentialStore(store,key).save('alice','gateway',0,{enabled:true,baseURL:'https://fixture.example/v1',apiKey:'fixture-recovery-key'});
 const bundle=join(root,'bundle');const manifest=await createRecoveryBundle(store,key,bundle);assert.equal(manifest.schemaVersion,migrations.length);
 assert.equal(existsSync(join(bundle,'credentials.key')),false);
 assert.equal(readFileSync(join(bundle,'manifest.json'),'utf8').includes('fixture-recovery-key'),false);
 store.saveSnapshot('alice',project.id,2,{files:{'src/App.jsx':'export default ()=>null'},assets:{}},'After backup');
 const target=join(root,'restored');await restoreRecoveryBundle(bundle,key,target);
 const restored=new ProjectStore(join(target,'state.sqlite3'));
 try{
  assert.deepEqual(restored.getProject('alice',project.id).snapshot,original);assert.equal(restored.revisions('alice',project.id).length,2);
  assert.equal(restored.documents('alice',project.id)[0].content,'Keep the booking rule');
  assert.equal(restored.messages('alice',project.id).at(-1)?.content,'A persisted plan');
  assert.equal(new ReferenceImageStore(restored).forRun('alice',project.id,run.id)[0].sha256,image.sha256);
  assert.equal(new CredentialStore(restored,readFileSync(join(target,'credentials.key'))).read('alice','gateway')?.apiKey,'fixture-recovery-key');
  assert.throws(()=>restored.getProject('bob',project.id),/not found/i);
 }finally{restored.close();}
 assert.equal(store.getProject('alice',project.id).version,3);
});
test('P03 wrong/missing key and tampered ciphertext fail without creating or overwriting a restore',async t=>{
 const {root,store,key,createRecoveryBundle,restoreRecoveryBundle}=await setup(t);
 store.createProject('alice','Protected','gateway/coder');const bundle=join(root,'bundle');await createRecoveryBundle(store,key,bundle);
 for(const invalid of [Buffer.alloc(0),randomBytes(32)]){
  const target=join(root,'wrong-key');await assert.rejects(()=>restoreRecoveryBundle(bundle,invalid,target));assert.equal(existsSync(target),false);
 }
 const existing=join(root,'existing');mkdirSync(existing);writeFileSync(join(existing,'keep.txt'),'original');
 await assert.rejects(()=>restoreRecoveryBundle(bundle,key,existing),/exist|overwrite/i);assert.equal(readFileSync(join(existing,'keep.txt'),'utf8'),'original');
 const cipher=readFileSync(join(bundle,'database.enc'));cipher[0]^=1;writeFileSync(join(bundle,'database.enc'),cipher);
 const target=join(root,'tampered');await assert.rejects(()=>restoreRecoveryBundle(bundle,key,target),/integrity|checksum|authentic/i);assert.equal(existsSync(target),false);
});
test('P03 rejecting a future database schema must not change its bytes or journal mode',t=>{
 const root=mkdtempSync(join(tmpdir(),'future-schema-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=join(root,'future.sqlite3');const store=new ProjectStore(path);
 store.db.exec(`PRAGMA user_version=${migrations.length+1}; PRAGMA journal_mode=DELETE;`);store.close();
 const hash=()=>createHash('sha256').update(readFileSync(path)).digest('hex');const before=hash();
 assert.throws(()=>new ProjectStore(path),/newer/i);assert.equal(hash(),before);
});


test('P03 creation rejects a key that cannot recover the stored provider credentials',async t=>{
 const {root,store,key,createRecoveryBundle}=await setup(t);
 new CredentialStore(store,key).save('alice','gateway',0,{enabled:true,baseURL:'https://fixture.example/v1',apiKey:'fixture-restore-source'});
 const target=join(root,'wrong-master-bundle');
 await assert.rejects(()=>createRecoveryBundle(store,randomBytes(32),target),/key|credential|decrypt/i);
 assert.equal(existsSync(target),false);
 assert.equal(new CredentialStore(store,key).read('alice','gateway')?.apiKey,'fixture-restore-source');
});

test('P03 every stored connection must authenticate, not only the first owner',async t=>{
 const {root,store,key,createRecoveryBundle}=await setup(t);
 new CredentialStore(store,key).save('alice','openai',0,{enabled:true,apiKey:'fixture-alice'});
 new CredentialStore(store,randomBytes(32)).save('bob','anthropic',0,{enabled:true,apiKey:'fixture-bob'});
 await assert.rejects(()=>createRecoveryBundle(store,key,join(root,'mixed')),/credential|decrypt/i);
 assert.equal(existsSync(join(root,'mixed')),false);
});

test('P03 a valid SQLite file with an unexpected application schema cannot be certified',async t=>{
 const {root,store,key,createRecoveryBundle}=await setup(t);
 store.db.exec('CREATE TABLE unexpected_unversioned_table (content TEXT);');
 await assert.rejects(()=>createRecoveryBundle(store,key,join(root,'bad-schema')),/schema/i);
 assert.equal(existsSync(join(root,'bad-schema')),false);
});

test('P03 a corrupted revision fails semantic integrity before backup success',async t=>{
 const {root,store,key,createRecoveryBundle}=await setup(t);
 const p=store.createProject('alice','Integrity','gateway/coder');
 store.db.prepare('UPDATE revisions SET sha256=? WHERE project_id=?').run('0'.repeat(64),p.id);
 await assert.rejects(()=>createRecoveryBundle(store,key,join(root,'bad-content')),/integrity|checksum|digest/i);
 assert.equal(existsSync(join(root,'bad-content')),false);
});

test('P03 cancellation and explicit byte budgets fail without exposing incomplete results',async t=>{
 const {root,store,key,createRecoveryBundle,restoreRecoveryBundle}=await setup(t);
 store.createProject('alice','Bounded','gateway/coder');
 const controller=new AbortController();controller.abort();
 const cancelled=join(root,'cancelled'),small=join(root,'too-small');
 await assert.rejects(()=>createRecoveryBundle(store,key,cancelled,{signal:controller.signal}),/abort|cancel/i);assert.equal(existsSync(cancelled),false);
 await assert.rejects(()=>createRecoveryBundle(store,key,small,{maxBytes:4096}),/limit|size|budget/i);assert.equal(existsSync(small),false);
 const bundle=join(root,'bundle');await createRecoveryBundle(store,key,bundle);
 const restore=join(root,'cancel-restore');await assert.rejects(()=>restoreRecoveryBundle(bundle,key,restore,{signal:controller.signal}),/abort|cancel/i);assert.equal(existsSync(restore),false);
});

test('P03 manifest tampering and linked source/destination paths do not overwrite files',async t=>{
 const {root,store,key,createRecoveryBundle,restoreRecoveryBundle}=await setup(t);
 store.createProject('alice','Boundaries','gateway/coder');const bundle=join(root,'bundle');await createRecoveryBundle(store,key,bundle);
 const link=join(root,'linked');symlinkSync(bundle,link,process.platform==='win32'?'junction':'dir');
 await assert.rejects(()=>restoreRecoveryBundle(link,key,join(root,'linked-restore')),/link|junction/i);
 await assert.rejects(()=>createRecoveryBundle(store,key,join(link,'nested')),/link|junction/i);
 assert.equal(existsSync(join(bundle,'nested')),false);
 const path=join(bundle,'manifest.json');const m=JSON.parse(readFileSync(path,'utf8'));m.createdAt='2024-01-01T00:00:00.000Z';writeFileSync(path,JSON.stringify(m));
 const target=join(root,'tampered-manifest');await assert.rejects(()=>restoreRecoveryBundle(bundle,key,target),/authentic/i);assert.equal(existsSync(target),false);
});

test('P03 successful bundles retain no plaintext or master key and preserve caller key bytes',async t=>{
 const {root,store,key,createRecoveryBundle,restoreRecoveryBundle}=await setup(t);const original=Buffer.from(key);
 const p=store.createProject('alice','Private recovery source','gateway/coder');
 const one=join(root,'one'),two=join(root,'two');
 const a=await createRecoveryBundle(store,key,one),b=await createRecoveryBundle(store,key,two);
 assert.deepEqual(key,original);assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.ciphertextDigest,b.ciphertextDigest);
 assert.deepEqual(readdirSync(one).sort(),['database.enc','manifest.json']);
 assert.equal(readFileSync(join(one,'database.enc')).includes(Buffer.from(p.name)),false);
 assert.equal(readFileSync(join(one,'database.enc')).includes(key),false);
 const manifestBefore=readFileSync(join(one,'manifest.json'));
 await assert.rejects(()=>createRecoveryBundle(store,key,one),/exists|overwrite/i);
 assert.deepEqual(readFileSync(join(one,'manifest.json')),manifestBefore);
 await restoreRecoveryBundle(one,key,join(root,'restored'));assert.deepEqual(key,original);
});
