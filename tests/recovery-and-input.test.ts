import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {POST as search} from '../app/api/search/route';
import {POST as screenshot} from '../app/api/scrape-screenshot/route';

for(const [name,handler] of [['search',search],['screenshot',screenshot]] as const){
 test(name+' rejects malformed JSON as a client error before an external call',async()=>{
  const original={...process.env};process.env.NODE_ENV='development';delete process.env.OPEN_LOVABLE_APP_ORIGIN;delete process.env.OPEN_LOVABLE_PASSWORD;
  try{
   const response=await handler(new NextRequest('http://127.0.0.1/api/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:'{ invalid'}));
   assert.equal(response.status,400);
  }finally{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);}
 });
}

test('files, revisions and conversation survive full process termination and a new Node process',()=>{
 const root=mkdtempSync(join(tmpdir(),'project-process-recovery-'));
 const env={...process.env,OPEN_LOVABLE_DATA_DIR:root,OPEN_LOVABLE_DISABLE_SAVED_SETTINGS:'1'};
 const execute=(code:string)=>{
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:process.cwd(),env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 };
 try{
  const created=execute(`import {projectStore} from './lib/projects/store.ts';const s=projectStore();const p=s.createProject('owner','Recovery','gateway/test');s.saveSnapshot('owner',p.id,1,{files:{'src/App.jsx':'export default function App(){return <h1>Persisted</h1>}'},assets:{}},'Saved');s.beginRun('owner',p.id,'recovery-request','Retained message','gateway/test',2);console.log(JSON.stringify({id:p.id}));s.close();`);
  const state=execute(`import {projectStore} from './lib/projects/store.ts';const s=projectStore();const p=s.getProject('owner',${JSON.stringify(created.id)});console.log(JSON.stringify({p,messages:s.messages('owner',p.id),revisions:s.revisions('owner',p.id)}));s.close();`);
  assert.equal(state.p.version,2);assert.match(state.p.snapshot.files['src/App.jsx'],/Persisted/);
  assert.equal(state.messages[0].content,'Retained message');assert.equal(state.revisions.length,2);
 }finally{rmSync(root,{recursive:true,force:true});}
});


test('settings metadata refuses environment URLs containing secret material',async()=>{
 const previous={...process.env};process.env.NODE_ENV='development';delete process.env.OPEN_LOVABLE_APP_ORIGIN;delete process.env.OPEN_LOVABLE_PASSWORD;
 process.env.OPENAI_BASE_URL='https://username:do-not-return-this@example.invalid/v1?api_key=hidden-value';
 try{
  const {GET}=await import('../app/api/provider-settings/route');
  const response=await GET(new Request('http://127.0.0.1/api/provider-settings'));
  const body=await response.text();assert.equal(body.includes('do-not-return-this'),false);assert.equal(body.includes('hidden-value'),false);assert.equal(response.status,503);
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});


test('large valid base64 assets are validated without overflowing the regular-expression stack',async()=>{
 const {validateSnapshot}=await import('../lib/projects/store');
 const payload=Buffer.alloc(2*1024*1024,17).toString('base64');
 const snapshot=validateSnapshot({files:{},assets:{'public/big.pdf':payload}});
 assert.equal(snapshot.assets['public/big.pdf'],payload);
 assert.throws(()=>validateSnapshot({files:{},assets:{'bad.pdf':payload.slice(0,-1)+'!'}}),/asset/i);
});


test('large ZIP base64 decoding stays within bounded memory and does not recurse per quartet',async()=>{
 const {importProjectZip}=await import('../lib/projects/archive');const {zipSync}=await import('fflate');
 const files:Record<string,Uint8Array>={};for(let i=0;i<4;i++)files[`public/image-${i}.pdf`]=Buffer.alloc(2000000,17+i);
 const archive=Buffer.from(zipSync(files,{level:0})).toString('base64');assert.ok(archive.length>10*1024*1024);
 const {snapshot}=importProjectZip(archive);assert.equal(Object.keys(snapshot.assets).length,4);
});
