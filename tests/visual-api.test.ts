import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import sharp from 'sharp';
import {projectStore} from '../lib/projects/store';
import {ReferenceImageStore} from '../lib/projects/images';
import * as projects from '../app/api/projects/route';

async function setup(t:any){
 const env={...process.env},root=mkdtempSync(join(tmpdir(),'visual-api-'));
 Object.assign(process.env,{NODE_ENV:'development',OPEN_LOVABLE_DATA_DIR:root,OPEN_LOVABLE_DISABLE_SAVED_SETTINGS:'1'});
 delete process.env.OPEN_LOVABLE_APP_ORIGIN;delete process.env.OPEN_LOVABLE_PASSWORD;delete process.env.AI_GATEWAY_API_KEY;
 t.after(()=>{projectStore().close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);rmSync(root,{recursive:true,force:true});});
 const store=projectStore();const p=store.createProject('admin','Visual','gateway/vision');
 const bytes=await sharp({create:{width:48,height:32,channels:3,background:'#246078'}}).png().toBuffer();
 const picture=await new ReferenceImageStore(store).add('admin',p.id,'design.png','target',bytes.toString('base64'));
 const request=(body:unknown,path='projects')=>new Request('http://127.0.0.1/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const post=(body:unknown)=>projects.POST(request(body));
 return {store,p,picture,request,post};
}
async function model(t:any,output:string){
 const requests:any[]=[];
 const server=createServer((req,res)=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
  requests.push(JSON.parse(raw));res.writeHead(200,{'content-type':'text/event-stream'});
  const base={id:'visual-fixture',object:'chat.completion.chunk',created:1,model:'vision'};
  res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{content:output},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
 });});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 Object.assign(process.env,{OPEN_LOVABLE_GATEWAY_URL:`http://127.0.0.1:${(server.address() as any).port}/v1`,OPEN_LOVABLE_GATEWAY_API_KEY:'visual-fixture-key',OPEN_LOVABLE_GATEWAY_MODELS:'["vision"]'});
 return requests;
}
const code='<file path="src/App.jsx">export default function App(){return <h1>Visual application</h1>}</file>';

test('image API requires authentication, strips data from metadata and isolates project IDs',async t=>{
 const {p,picture,request}=await setup(t);const modulePath='../app/api/project-images/route';const api=await import(modulePath).catch(()=>({}));assert.equal(typeof api.GET,'function');
 const get=(query:string)=>api.GET(new Request('http://127.0.0.1/api/project-images?'+query));
 const listing=await get('projectID='+p.id);const meta=await listing.json();assert.equal(meta.images[0].id,picture.id);assert.equal('data' in meta.images[0],false);
 const image=await get('projectID='+p.id+'&imageID='+picture.id);assert.equal(image.headers.get('content-type'),'image/png');assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width,48);
 assert.equal((await get('projectID='+randomUUID()+'&imageID='+picture.id)).status,404);
 process.env.OPEN_LOVABLE_PASSWORD='test-only-password-thirty-two-characters';
 assert.equal((await get('projectID='+p.id)).status,401);
 assert.equal((await api.POST(request({action:'archive',projectID:p.id,imageID:picture.id},'project-images'))).status,401);
});

test('visual generation transmits the selected raster as multimodal data and keeps approval mandatory',async t=>{
 const {store,p,picture,post}=await setup(t);const requests=await model(t,code);
 const body={action:'generate',id:p.id,version:1,requestKey:randomUUID(),prompt:'Use the visual reference',model:'gateway/vision',mode:'build',imageIDs:[picture.id],confirmCost:true,confirmVision:true};
 const result=await post(body);assert.equal(result.status,202);assert.match(await result.text(),/run/);
 assert.equal(requests.length,0,'legacy adapter must enqueue without invoking the model inline');
 assert.equal(store.getProject('admin',p.id).version,1);assert.equal(store.runs('admin',p.id)[0].inputs.images[0].id,picture.id);
 const duplicate=await post(body);assert.equal(duplicate.status,202);assert.equal(store.runs('admin',p.id).length,1);
});

test('images require explicit vision acknowledgment and cannot be borrowed from another project',async t=>{
 const {store,p,picture,post}=await setup(t);const requests=await model(t,code);
 const body={action:'generate',id:p.id,version:1,requestKey:randomUUID(),prompt:'Use image',model:'gateway/vision',imageIDs:[picture.id],confirmCost:true};
 assert.equal((await post(body)).status,400);assert.equal(store.runs('admin',p.id).length,0);
 const other=store.createProject('admin','Other','gateway/vision');
 assert.equal((await post({...body,id:other.id,confirmVision:true})).status,404);assert.equal(requests.length,0);
});

 test('plan mode is queued without compiling or mutating application revisions',async t=>{
 const {store,p,post}=await setup(t);const requests=await model(t,'Plan: assess the form. '+code);
 const response=await post({action:'generate',id:p.id,version:1,requestKey:randomUUID(),prompt:'Plan only',model:'gateway/vision',mode:'plan',confirmCost:true});
 assert.equal(response.status,202);assert.match(await response.text(),/run/);assert.equal(requests.length,0,'plan adapter must also remain queued');
 assert.equal(store.revisions('admin',p.id).length,1);assert.deepEqual(store.getProject('admin',p.id).snapshot.files,{});assert.equal(store.runs('admin',p.id)[0].inputs.mode,'plan');
});
