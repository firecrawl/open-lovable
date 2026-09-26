import {test,expect} from '@playwright/test';
test('project settings keep the project workspace despite a different session selection',async({browser},info)=>{
 const base='http://127.0.0.1:3102',context=await browser.newContext();
 try{
  const post=async(path:string,data:unknown)=>context.request.post(base+path,{headers:{origin:base},data});
  expect((await post('/api/auth',{action:'login',email:'alice@example.test',password:'identity-contract-password'})).status()).toBe(200);
  const a=await post('/api/workspaces',{action:'create',name:'Workspace project source'});expect(a.status()).toBe(201);const first=(await a.json()).workspace;
  const created=await post('/api/projects',{action:'create',name:'Scoped settings project',model:'gateway/fixture/coder'});expect(created.status()).toBe(201);const {project}=await created.json();
  const b=await post('/api/workspaces',{action:'create',name:'Different selected workspace'});expect(b.status()).toBe(201);const second=(await b.json()).workspace;
  const page=await context.newPage();await page.goto(base+'/projects/'+project.id);
  await expect(page.getByLabel('Workspace',{exact:true})).toHaveValue(first.id);
  await page.getByRole('link',{name:'Conex\u00f5es de IA',exact:true}).click();
  await expect(page).toHaveURL(base+'/settings/ai?projectId='+project.id);
  await expect(page.getByRole('heading',{name:'Conex\u00f5es de IA',exact:true})).toBeVisible();
  await expect(page.getByLabel('Workspace',{exact:true})).toHaveValue(first.id);
  expect(new URL(page.url()).searchParams.get('projectId')).toBe(project.id);
  await expect(page.getByLabel('Endpoint da API',{exact:true})).toBeEnabled();
  await page.getByLabel('Endpoint da API',{exact:true}).fill('https://scoped.example/v1');
  await page.getByLabel('Chave de API',{exact:true}).fill('scope-contract-fixture-key');
  await page.getByLabel('IDs dos modelos',{exact:true}).fill('scoped/model');
  const saved=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/provider-settings');
  await page.getByRole('button',{name:'Salvar conex\u00e3o',exact:true}).click();const savedResponse=await saved;
  expect(savedResponse.status()).toBe(200);expect(new URL(savedResponse.url()).searchParams.get('projectId')).toBe(project.id);
  await expect(page.getByRole('status').filter({hasText:'Conex\u00e3o salva'})).toBeVisible();
  expect(await page.getByLabel('Chave de API',{exact:true}).inputValue()).toBe('');
  const selected=await context.request.get(base+'/api/provider-settings');expect((await selected.json()).providers.find((p:{provider:string})=>p.provider==='gateway').source).toBe('unconfigured');
  expect((await (await context.request.get(base+'/api/auth')).json()).selectedWorkspaceId).toBe(second.id);
  await page.screenshot({path:info.outputPath('project-settings-context.png'),fullPage:true});
 }finally{await context.close();}
});
