import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

for(const [profile,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const){
test('closing the Studio tab preserves the run on '+profile,async({page,context,request},info)=>{
 await page.setViewportSize({width,height});
 const response=await request.post('/api/projects',{data:{action:'create',name:'Execucao independente '+Date.now(),model:'gateway/fixture/coder'}});
 const {project}=await response.json(),marker='DURABLE_BROWSER_CLOSE_'+randomUUID();
 await page.goto('/projects/'+project.id);
 await page.getByLabel('Descreva a altera\u00e7\u00e3o',{exact:true}).fill(marker+' Build the page');
 await page.getByLabel('Autorizar consumo de tokens para esta gera\u00e7\u00e3o',{exact:true}).check();
 await page.getByRole('button',{name:'Gerar proposta',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cancelar gera\u00e7\u00e3o',exact:true})).toBeVisible();
 await page.close();
 const reopened=await context.newPage();await reopened.setViewportSize({width,height});await reopened.goto('/projects/'+project.id);
 await expect(reopened.getByRole('button',{name:'Aprovar revis\u00e3o',exact:true})).toBeVisible({timeout:20000});
 await expect(reopened.getByTestId('project-version')).toHaveText('Revis\u00e3o 1');
 await reopened.getByRole('tab',{name:'Execu\u00e7\u00f5es',exact:true}).click();
 await expect(reopened.getByRole('heading',{name:'Execu\u00e7\u00e3o rastre\u00e1vel',exact:true})).toBeVisible();
 await expect(reopened.getByText('Proposta compilada',{exact:true})).toBeVisible();
 const stats=await fetch('http://127.0.0.1:3101/stats?marker='+marker,{headers:{authorization:'Bearer browser-contract-fixture'}});expect((await stats.json()).calls).toBe(1);
 const exported=reopened.waitForEvent('download');await reopened.getByRole('button',{name:'Baixar registro da execu\u00e7\u00e3o',exact:true}).click();
 const file=await exported;const contents=JSON.parse(await readFile((await file.path())!,'utf-8'));expect(contents.run.projectId).toBe(project.id);expect(contents.events.at(-1).type).toBe('audit.exported');
 expect(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await reopened.screenshot({path:info.outputPath('durable-run-journal.png'),fullPage:true});
 await reopened.getByRole('button',{name:'Aprovar revis\u00e3o',exact:true}).click();await expect(reopened.getByTestId('project-version')).toHaveText('Revis\u00e3o 2');await expect(reopened.getByText('Revis\u00e3o aprovada',{exact:true})).toBeVisible();
});
}

test('versioned execution endpoints reject anonymous and cross-origin requests against the running server',async({request})=>{
 const route='/api/v1/runs';
 const invalid=await fetch('http://127.0.0.1:3100'+route,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});expect(invalid.status).toBe(401);
 const foreign=await request.post(route,{headers:{origin:'https://foreign.example'},data:{}});expect(foreign.status()).toBe(403);
});

test('account worker honors verified session scope and losing membership blocks a pending result',async({browser})=>{
 const base='http://127.0.0.1:3102',a=await browser.newContext(),b=await browser.newContext();
 try{
  const request=async(context:typeof a,path:string,data:unknown)=>context.request.post(base+path,{headers:{origin:base},data});
  for(const [context,email] of [[a,'alice@example.test'],[b,'bob@example.test']] as const){const result=await request(context,'/api/auth',{action:'login',email,password:'identity-contract-password'});expect(result.status()).toBe(200);}
  const created=await request(a,'/api/workspaces',{action:'create',name:'Execution permission test'});expect(created.status()).toBe(201);const {workspace}=await created.json();
  const invitation=await request(a,'/api/workspaces',{action:'invite',workspaceId:workspace.id,email:'bob@example.test',role:'editor'});expect(invitation.status()).toBe(201);
  expect((await request(b,'/api/workspaces',{action:'accept-invite',token:(await invitation.json()).invitation.token})).status()).toBe(200);
  const configured=await request(a,'/api/provider-settings',{provider:'gateway',version:0,enabled:true,baseURL:'http://127.0.0.1:3101/v1',apiKey:'browser-contract-fixture',models:['fixture/coder']});expect(configured.status()).toBe(200);
  const p=await request(b,'/api/projects',{action:'create',name:'Account execution',model:'gateway/fixture/coder'});expect(p.status()).toBe(201);const {project}=await p.json();
  const page=await b.newPage();await page.goto(base+'/projects/'+project.id);
  await page.getByLabel('Descreva a altera\u00e7\u00e3o',{exact:true}).fill('Build account page');await page.getByLabel('Autorizar consumo de tokens para esta gera\u00e7\u00e3o',{exact:true}).check();await page.getByRole('button',{name:'Gerar proposta',exact:true}).click();
  await expect(page.getByRole('button',{name:'Aprovar revis\u00e3o',exact:true})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'Aprovar revis\u00e3o',exact:true}).click();await expect(page.getByTestId('project-version')).toHaveText('Revis\u00e3o 2');
  const admitted=await request(b,'/api/v1/runs',{projectId:project.id,baseVersion:2,requestKey:randomUUID(),prompt:'DURABLE_BROWSER_CLOSE_'+randomUUID()+' preserve source',model:'gateway/fixture/coder',mode:'build',imageIDs:[],confirmCost:true});expect(admitted.status()).toBe(202);const {run}=await admitted.json();
  await expect.poll(async()=>{const result=await a.request.get(base+'/api/v1/runs/'+run.id);return (await result.json()).run.phase;}).toBe('generating');
  const actor=(await (await b.request.get(base+'/api/auth')).json()).user.id;
  expect((await request(a,'/api/workspaces',{action:'revoke-member',workspaceId:workspace.id,actorId:actor,version:1})).status()).toBe(200);
  expect((await b.request.get(base+'/api/v1/runs/'+run.id)).status()).toBe(404);
  expect((await request(b,'/api/v1/runs/'+run.id+'/cancel',{})).status()).toBe(404);
  await expect.poll(async()=>{const result=await a.request.get(base+'/api/v1/runs/'+run.id);return (await result.json()).run.state;},{timeout:15000}).toBe('FAILED');
  const state=await a.request.get(base+'/api/projects?id='+project.id);const body=await state.json();expect(body.project.version).toBe(2);expect(body.runs.find((item:{id:string})=>item.id===run.id).candidate).toBeNull();
 }finally{await a.close();await b.close();}
});
