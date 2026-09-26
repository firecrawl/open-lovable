import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {projectStore} from '../lib/projects/store';
import {normalizeReferenceImage} from '../lib/projects/images';
import {scanSecretContent} from '../lib/security/secret-content';
import {createProviderFetch} from '../lib/ai/provider-transport';
import {rasterWithTokenShapedEncoding} from './helpers/raster-fixture';

test('P02 valid raster with token-shaped encoded bytes is accepted while textual names remain scanned',async t=>{
 const env={...process.env},root=mkdtempSync(join(tmpdir(),'media-boundary-'));
 Object.assign(process.env,{NODE_ENV:'development',OPEN_LOVABLE_DATA_DIR:root});delete process.env.OPEN_LOVABLE_PASSWORD;delete process.env.OPEN_LOVABLE_APP_ORIGIN;
 t.after(()=>{projectStore().close();for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);rmSync(root,{recursive:true,force:true});});
 const p=projectStore().createProject('admin','Image boundary','gateway/test');
 const {POST}=await import('../app/api/project-images/route');
 const data=(await rasterWithTokenShapedEncoding()).toString('base64');
 assert.ok(scanSecretContent(data).includes('aws_access_key'));await normalizeReferenceImage(data);
 const post=(name:string,bodyData=data)=>POST(new Request('http://127.0.0.1/api/project-images',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'upload',projectID:p.id,name,role:'target',data:bodyData})}));
 assert.equal((await post('reference.png')).status,201);
 assert.notEqual((await post('ghp_'+'x'.repeat(30)+'.png')).status,201);
 assert.notEqual((await post('bad.png',Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'))).status,201);
});

test('P02 provider transport validates image bytes in each supported protocol without dropping text-secret checks',async t=>{
 const image=(await rasterWithTokenShapedEncoding()).toString('base64');let calls=0;
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>{calls++;res.writeHead(200,{'content-type':'application/json'});res.end('{}');});});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 const base=`http://127.0.0.1:${(server.address() as any).port}/v1`,transport=createProviderFetch(base,{allowLoopback:true});
 const bodies=[
  {messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,'+image,detail:'high'}}]}]},
  {input:[{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,'+image}]}]},
  {messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:image}}]}]},
  {contents:[{role:'user',parts:[{inlineData:{mimeType:'image/png',data:image}}]}]},
 ];
 for(const body of bodies){const response=await transport(base+'/generate',{method:'POST',body:JSON.stringify(body)});await response.text();assert.equal(response.status,200);}
 assert.equal(calls,4);
 await assert.rejects(()=>transport(base+'/generate',{method:'POST',body:JSON.stringify({...bodies[0],notes:'ghp_'+'x'.repeat(30)})}),/credential|secret/i);
 await assert.rejects(()=>transport(base+'/generate',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,'+Buffer.from('not an image').toString('base64')}}]}]})}),/image|raster|decode|format/i);
 assert.equal(calls,4);
});


test('P02 unsupported remote image sources and secret text beside valid media are rejected',async()=>{
 const {prepareProviderBody}=await import('../lib/security/provider-content');
 const cases=[
  {messages:[{role:'user',content:[{type:'image',source:{type:'url',url:'https://example.com/image.png'}}]}]},
  {messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://example.com/image.png'}}]}]},
  {contents:[{role:'user',parts:[{fileData:{mimeType:'image/png',fileUri:'https://example.com/image.png'}}]}]},
 ];
 for(const input of cases)await assert.rejects(()=>prepareProviderBody(JSON.stringify(input)),/image|raster|inline|source/i);
});
