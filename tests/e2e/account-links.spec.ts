import {test,expect} from '@playwright/test';
const base='http://127.0.0.1:3102';
test('P05 invitation capability remains in memory during sign-in and is not persisted or left in the address',async({browser})=>{
 const context=await browser.newContext();try{
  const page=await context.newPage();await page.goto(base+'/invite#token='+'A'.repeat(43));
  await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
  await expect(page).toHaveURL(base+'/invite');
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  await expect(page.getByText('Abra novamente o link completo do convite.',{exact:false})).toHaveCount(0);
 }finally{await context.close();}
});
