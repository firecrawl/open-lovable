import {test,expect} from '@playwright/test';

test('operator configures a provider in the UI without exposing its saved key',async({page,request})=>{
 await page.goto('/settings/ai');
 await expect(page.getByRole('heading',{name:'Cadastrar e editar conexões'})).toBeVisible();
 await page.getByLabel('Provedor da conexão',{exact:true}).selectOption('openai');
 await page.getByLabel('Chave de API',{exact:true}).fill('fixture-ui-private-key');
 await page.getByLabel('IDs dos modelos',{exact:true}).fill('my-test-model');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Conexão salva'})).toBeVisible();
 await expect(page.getByLabel('Chave de API',{exact:true})).toHaveValue('');
 await page.reload();
 await page.getByLabel('Provedor da conexão',{exact:true}).selectOption('openai');
 await expect(page.getByLabel('Chave de API',{exact:true})).toHaveValue('');
 await expect(page.getByText('Chave armazenada; o valor nunca é devolvido.')).toBeVisible();
 const response=await request.get('/api/provider-settings');
 expect(response.ok()).toBe(true);
 expect(await response.text()).not.toContain('fixture-ui-private-key');
 await page.getByLabel('Limpar chave armazenada',{exact:true}).check();
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Conexão salva'})).toBeVisible();
});


test('changing a provider destination never silently moves its saved credential',async({page,request},info)=>{
 await page.goto('/settings/ai');await page.getByLabel('Provedor da conexão',{exact:true}).selectOption('anthropic');
 await page.getByLabel('Endpoint da API',{exact:true}).fill('https://provider-a.example/v1');
 await page.getByLabel('Chave de API',{exact:true}).fill('fixture-audience-a');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Conexão salva'})).toBeVisible();
 await expect(page.getByText('Ao mudar o endpoint, informe a chave para o novo destino ou marque a limpeza da chave armazenada.',{exact:true})).toBeVisible();
 await page.getByLabel('Endpoint da API',{exact:true}).fill('https://provider-b.example/v1');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Endpoint changed'})).toBeVisible();
 let response=await request.get('/api/provider-settings');let row=(await response.json()).providers.find((r:{provider:string})=>r.provider==='anthropic');
 expect(row.baseURL).toBe('https://provider-a.example/v1');
 await page.getByLabel('Chave de API',{exact:true}).fill('fixture-audience-b');
 await page.getByRole('button',{name:'Salvar conexão',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Conexão salva'})).toBeVisible();
 response=await request.get('/api/provider-settings');const text=await response.text();row=JSON.parse(text).providers.find((r:{provider:string})=>r.provider==='anthropic');
 expect(row.baseURL).toBe('https://provider-b.example/v1');expect(text).not.toContain('fixture-audience');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('audience-mobile.png'),fullPage:true});
});
