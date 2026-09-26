import {test, expect} from '@playwright/test';

for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]] as const) {
  test(`AI connection diagnostics work at ${name} size`,async({page},testInfo)=>{
    await page.setViewportSize({width,height});
    const crashes:string[]=[];page.on('pageerror',error=>crashes.push(error.message));
    await page.goto('/settings/ai');
    await expect(page.getByRole('heading',{name:'Conex\u00f5es de IA',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Atualizar cat\u00e1logo'})).toBeEnabled();
    const model=page.getByLabel('Modelo para o teste');
    await expect(model.locator('option[value="gateway/fixture/coder"]')).toHaveCount(1);
    await model.selectOption('gateway/fixture/coder');
    const probe=page.getByRole('button',{name:'Testar texto e streaming'});
    await expect(probe).toBeDisabled();
    await page.getByRole('checkbox',{name:/^Entendo que este teste pode consumir tokens/}).check();
    await expect(probe).toBeEnabled();
    // Metadata and UI only here; no inference call until the separate explicit probe test.
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`ai-settings-${name}.png`),fullPage:true});
    expect(crashes).toEqual([]);
  });
}

test('browser probe reaches a real local HTTP/SSE contract fixture after explicit consent',async({page})=>{
  await page.goto('/settings/ai');
  const model=page.getByLabel('Modelo para o teste');
  await expect(model.locator('option[value="gateway/fixture/coder"]')).toHaveCount(1);
  await model.selectOption('gateway/fixture/coder');
  await page.getByRole('checkbox',{name:/^Entendo que este teste pode consumir tokens/}).check();
  await page.getByRole('button',{name:'Testar texto e streaming'}).click();
  await expect(page.getByRole('status')).toContainText('Texto e streaming responderam ao teste.');
  await expect(page.getByRole('status')).toContainText('fixture/coder');
});

test('home and editor preserve the selected namespaced gateway model without provider fallback',async({page})=>{
  await page.goto('/');
  await page.getByPlaceholder('Enter URL or search term...').fill('example.com');
  const home=page.getByLabel('AI model',{exact:true});
  await expect(home.locator('option[value="gateway/fixture/coder"]')).toHaveCount(1);
  await home.selectOption('gateway/fixture/coder');
  await expect(home).toHaveValue('gateway/fixture/coder');
  await page.goto('/generation?model=gateway%2Ffixture%2Fcoder');
  await expect(page.getByLabel('AI model',{exact:true}).first()).toHaveValue('gateway/fixture/coder');
});


test('opening an editor to select a model does not create billable resources or mutate conversations',async({page})=>{
  const forbidden:string[]=[];
  // Prevent the unintended side effect while asserting that no such request is attempted.
  await page.route('**/api/create-ai-sandbox*', async route=>{
    forbidden.push(route.request().url());await route.abort('blockedbyclient');
  });
  await page.route('**/api/conversation-state', async route=>{
    if(route.request().method()==='POST') {forbidden.push(route.request().url());await route.abort('blockedbyclient');}
    else await route.continue();
  });
  await page.goto('/generation?model=gateway%2Ffixture%2Fcoder');
  await expect(page.getByLabel('AI model',{exact:true}).first()).toBeEnabled();
  await page.waitForTimeout(1200);
  expect(forbidden).toEqual([]);
});
