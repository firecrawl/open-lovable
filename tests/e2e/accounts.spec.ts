import {test,expect,type Page} from '@playwright/test';
const base='http://127.0.0.1:3102';
async function login(page:Page,email:string){
 await page.goto(base+'/login');await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill('identity-contract-password');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(base+'/projects');
}
test('P05 browser signs in, shares a workspace, enforces roles and logs out without browser tokens',async({browser},info)=>{
 const a=await browser.newContext(),b=await browser.newContext();
 try{
  const alice=await a.newPage(),bob=await b.newPage();const errors:string[]=[];alice.on('pageerror',e=>errors.push(e.message));bob.on('pageerror',e=>errors.push(e.message));
  await login(alice,'alice@example.test');await login(bob,'bob@example.test');
  const cookies=await a.cookies();expect(cookies.find(c=>c.name==='ol_session')?.httpOnly).toBe(true);
  expect(await alice.evaluate(()=>Object.keys(localStorage).some(k=>/token|auth/i.test(k)))).toBe(false);
  await alice.getByRole('link',{name:'Gerenciar workspace',exact:true}).click();
  await alice.getByLabel('Nome do novo workspace',{exact:true}).fill('Equipe de produto');await alice.getByRole('button',{name:'Criar workspace',exact:true}).click();
  await expect(alice.getByRole('heading',{name:'Equipe de produto',exact:true})).toBeVisible();
  await expect(alice.getByLabel('Workspace',{exact:true}).locator('option:checked')).toHaveText('Equipe de produto');
  await alice.getByLabel('E-mail do convidado',{exact:true}).fill('bob@example.test');await alice.getByLabel('Permissão do convite',{exact:true}).selectOption('editor');
  await alice.getByRole('button',{name:'Criar convite',exact:true}).click();
  const link=await alice.getByLabel('Link do convite',{exact:true}).inputValue();await bob.goto(link);
  await bob.getByRole('button',{name:'Aceitar convite',exact:true}).click();await expect(bob).toHaveURL(base+'/projects');
  await bob.getByLabel('Nome do projeto',{exact:true}).fill('Aplicacao compartilhada');await bob.getByRole('button',{name:'Criar projeto',exact:true}).click();
  await expect(bob).toHaveURL(/\/projects\/[0-9a-f-]+$/);const projectURL=bob.url();
  await alice.getByRole('button',{name:'Atualizar membros',exact:true}).click();
  const row=alice.getByTestId('member-row').filter({hasText:'bob@example.test'});
  await row.getByLabel('Permissão do membro',{exact:true}).selectOption('viewer');await row.getByRole('button',{name:'Salvar permissão',exact:true}).click();
  await bob.reload();await expect(bob.getByRole('button',{name:'Gerar proposta',exact:true})).toBeDisabled();
  alice.once('dialog',dialog=>dialog.accept());
  const revoked=alice.waitForResponse(response=>response.url().endsWith('/api/workspaces')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='revoke-member');
  await row.getByRole('button',{name:'Revogar acesso',exact:true}).click();expect((await revoked).status()).toBe(200);
  await expect(row.getByText(/Acesso revogado/)).toBeVisible();await bob.goto(projectURL);await expect(bob.getByRole('alert').filter({hasText:/not found|acesso/i}).first()).toBeVisible();
  await alice.screenshot({path:info.outputPath('workspace-management.png'),fullPage:true});expect(errors).toEqual([]);
  await alice.getByRole('button',{name:'Sair',exact:true}).click();await expect(alice).toHaveURL(base+'/login');
 }finally{await a.close();await b.close();}
});
for(const [name,width,height] of [['mobile',390,844],['tablet',820,1180]] as const){
 test(`P05 account entry fits ${name}`,async({browser},info)=>{const context=await browser.newContext({viewport:{width,height}});try{const page=await context.newPage();await page.goto(base+'/login');await expect(page.getByRole('heading',{name:'Entre no seu workspace',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);const field=await page.getByLabel('E-mail',{exact:true}).boundingBox();expect(field?.height).toBeGreaterThanOrEqual(44);expect(field?.x).toBeGreaterThanOrEqual(20);await page.screenshot({path:info.outputPath('account-'+name+'.png'),fullPage:true});}finally{await context.close();}});
}
