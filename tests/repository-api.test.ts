import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GET,POST} from '../app/api/projects/route';
import {projectStore} from '../lib/projects/store';
const original={...process.env};
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);});
function setup(){process.env.NODE_ENV='development';delete process.env.OPEN_LOVABLE_PASSWORD;delete process.env.OPEN_LOVABLE_APP_ORIGIN;process.env.OPEN_LOVABLE_USERNAME='workspace-api-'+randomUUID();}
const req=(data:unknown)=>new Request('http://127.0.0.1/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
test('project API derives workspace identity on the server and rejects injected owner/roles',async()=>{
 setup();const injected=await POST(req({action:'create',name:'forged',model:'gateway/coder',owner:'another',workspaceId:randomUUID()}));assert.equal(injected.status,400);
 const created=await POST(req({action:'create',name:'workspace api',model:'gateway/coder'}));assert.equal(created.status,201);const {project}=await created.json();assert.match(project.workspaceId,/^[a-f0-9-]{36}$/);
 assert.equal((await GET(new Request('http://127.0.0.1/api/projects?id='+project.id))).status,200);
 process.env.OPEN_LOVABLE_USERNAME='different-api-'+randomUUID();
 const foreign=await GET(new Request('http://127.0.0.1/api/projects?id='+project.id));const absent=await GET(new Request('http://127.0.0.1/api/projects?id='+randomUUID()));
 assert.equal(foreign.status,404);assert.deepEqual(await foreign.json(),await absent.json());
});
test('workspace membership gates every project mutation, including generation and documents',async()=>{
 setup();const created=await POST(req({action:'create',name:'viewer tests',model:'gateway/coder'}));const {project}=await created.json();
 assert.ok(project.workspaceId,'API must use workspace-aware repository');const store=projectStore();
 store.db.prepare("UPDATE workspace_members SET role='viewer' WHERE workspace_id=?").run(project.workspaceId);
 for(const body of [
  {action:'save',id:project.id,version:1,snapshot:{files:{},assets:{}},label:'forbidden'},
  {action:'document',id:project.id,name:'rules.md',content:'Cannot write'},
  {action:'generate',id:project.id,version:1,requestKey:'read-only-request',prompt:'Must not call a model',model:'gateway/coder',confirmCost:true}])assert.equal((await POST(req(body))).status,403);
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM runs WHERE project_id=?').get(project.id)?.n,0);
 assert.equal((await GET(new Request('http://127.0.0.1/api/projects?id='+project.id))).status,200);
});

test('image API applies the same workspace role and revocation boundaries',async()=>{
 setup();const created=await POST(req({action:'create',name:'image permissions',model:'gateway/coder'}));const {project}=await created.json();
 const {POST:upload,GET:readImages}=await import('../app/api/project-images/route');const {rasterWithTokenShapedEncoding}=await import('./helpers/raster-fixture');
 const store=projectStore();store.db.prepare("UPDATE workspace_members SET role='viewer' WHERE workspace_id=?").run(project.workspaceId);
 const image=new Request('http://127.0.0.1/api/project-images',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'upload',projectID:project.id,name:'reference.png',role:'target',data:(await rasterWithTokenShapedEncoding()).toString('base64')})});
 assert.equal((await upload(image)).status,403);
 store.db.prepare('UPDATE workspace_members SET active=0 WHERE workspace_id=?').run(project.workspaceId);
 assert.equal((await readImages(new Request('http://127.0.0.1/api/project-images?projectID='+project.id))).status,404);
});
