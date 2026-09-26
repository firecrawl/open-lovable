import { test, expect } from '@playwright/test';

for(const [name,width,height] of [['desktop',1440,900],['tablet',820,1180],['mobile',390,844]] as const) {
  test(`authenticated home works at ${name} size`,async({page},testInfo)=>{
    await page.setViewportSize({width,height});
    const crashes:string[]=[];
    page.on('pageerror',error=>crashes.push(error.message));
    const response=await page.goto('/');
    expect(response?.status()).toBe(200);
    const input=page.getByPlaceholder('Enter URL or search term...');
    await expect(input).toBeVisible();
    await input.fill('example.com');
    await expect(input).toHaveValue('example.com');
    const submit = page.getByText('Scrape Site', {exact:true});
    await expect(submit).toBeVisible();
    const bounds = await submit.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 12);
    const minimalist = page.getByRole('button', {name:'Minimalist',exact:true});
    await minimalist.click();
    await expect(minimalist).toHaveAttribute('aria-pressed','true');
    await page.getByLabel('Additional instructions', {exact:true}).fill('Keep the current content');
    await expect(page.getByLabel('AI model', {exact:true})).toBeVisible();
    const toggle = page.getByRole('switch', {name:'Extend brand styles'});
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked','true');
    await expect(page.getByPlaceholder("Describe the new functionality you want to build using this brand's styles...")).toBeVisible();
    await toggle.click();
    await expect(minimalist).toBeVisible();
    for (const name of ['Glassmorphism', 'Neumorphism', 'Minimalist']) {
      const button = page.getByRole('button', { name, exact: true });
      const labelFits = await button.evaluate(element => {
        const label = element.querySelector('span');
        if (!label) return false;
        const buttonBounds = element.getBoundingClientRect();
        const labelBounds = label.getBoundingClientRect();
        return labelBounds.left >= buttonBounds.left - 1 && labelBounds.right <= buttonBounds.right + 1;
      });
      expect(labelFits, `${name} must fit inside its button`).toBe(true);
    }
    // Editing the form only: no paid scraping, AI generation or sandbox creation.
    await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
    expect(crashes).toEqual([]);
  });
}

test('unauthenticated API calls are rejected by the running server',async()=>{
  // Native fetch has no Playwright project httpCredentials to inherit.
  const result=await fetch('http://127.0.0.1:3100/api/run-command-v2',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command:'pwd'}),
  });
  expect(result.status).toBe(401);
  expect(result.headers.get('www-authenticate')).toContain('Basic');
});

test('authenticated invalid commands, missing runtime and cross-origin calls do not fake success',async({request})=>{
  const invalid=await request.post('/api/run-command-v2',{data:{command:42}});
  expect(invalid.status()).toBe(400);
  const health=await request.get('/api/check-vite-errors');
  expect(health.status()).toBe(409);
  expect((await health.json()).hasErrors).toBeNull();
  const blocked=await request.post('/api/run-command-v2',{headers:{origin:'https://attacker.example'},data:{command:'pwd'}});
  expect(blocked.status()).toBe(403);
});
