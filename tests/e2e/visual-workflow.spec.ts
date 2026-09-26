import {test,expect} from '@playwright/test';
import sharp from 'sharp';

async function create(request:any,name:string){const response=await request.post('/api/projects',{data:{action:'create',name,model:'gateway/fixture/coder'}});expect(response.status()).toBe(201);return (await response.json()).project;}
for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const){
 test(`visual references survive reload and feed a reviewed proposal on ${size}`,async({page,request},info)=>{
  await page.setViewportSize({width,height});const crashes:string[]=[];page.on('pageerror',error=>crashes.push(error.message));
  const p=await create(request,'Visual '+size);await page.goto('/projects/'+p.id);
  await page.getByRole('tab',{name:'Imagens',exact:true}).click();
  const png=await sharp({create:{width:480,height:280,channels:3,background:'#e6ded0'}}).png().toBuffer();
  await page.getByLabel('Enviar imagem de referência',{exact:true}).setInputFiles({name:'layout.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('img',{name:'layout.png',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('tab',{name:'Imagens',exact:true}).click();
  await expect(page.getByRole('img',{name:'layout.png',exact:true})).toBeVisible();
  await page.getByLabel('Usar layout.png nesta solicitação',{exact:true}).check();
  await page.getByLabel('Descreva a alteração',{exact:true}).fill('Build from my visual reference');
  await page.getByLabel('Autorizar consumo de tokens para esta geração',{exact:true}).check();
  await expect(page.getByRole('button',{name:'Gerar proposta',exact:true})).toBeDisabled();
  await page.getByLabel('Confirmo suporte a imagens no modelo escolhido',{exact:true}).check();
  await page.getByRole('button',{name:'Gerar proposta',exact:true}).click();
  await expect(page.getByRole('button',{name:'Aprovar revisão',exact:true})).toBeVisible();
  await expect(page.getByTestId('project-version')).toHaveText('Revisão 1');
  await page.getByLabel('Comparar com referência',{exact:true}).check();
  await expect(page.getByRole('img',{name:'Referência: layout.png',exact:true})).toBeVisible();
  await page.getByLabel('Largura da prévia',{exact:true}).selectOption('390');
  await expect(page.frameLocator('iframe[title="Prévia isolada"]').getByRole('heading',{name:'Proposta compilada'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  const renderedFrame=page.locator('iframe[title="Prévia isolada"]');await renderedFrame.scrollIntoViewIfNeeded();
  await renderedFrame.screenshot({path:info.outputPath('visual-'+size+'-preview.png')});
  await page.screenshot({path:info.outputPath('visual-'+size+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Aprovar revisão',exact:true}).click();
  await expect(page.getByTestId('project-version')).toHaveText('Revisão 2');expect(crashes).toEqual([]);
 });
}
test('planning has no file side effect and copying a plan does not start paid generation',async({page,request})=>{
 const p=await create(request,'Planning');await page.goto('/projects/'+p.id);
 await page.getByLabel('Modo da solicitação',{exact:true}).selectOption('plan');
 await page.getByLabel('Descreva a alteração',{exact:true}).fill('Plan an accessible form');
 await page.getByLabel('Autorizar consumo de tokens para esta geração',{exact:true}).check();
 await page.getByRole('button',{name:'Gerar plano',exact:true}).click();
 await expect(page.getByRole('button',{name:'Usar plano em nova solicitação',exact:true})).toBeVisible();
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 1');
 await expect(page.getByRole('button',{name:'Aprovar revisão',exact:true})).toHaveCount(0);
 const before=(await (await request.get('/api/projects?id='+p.id)).json()).runs.length;
 await page.getByRole('button',{name:'Usar plano em nova solicitação',exact:true}).click();
 await expect(page.getByLabel('Modo da solicitação',{exact:true})).toHaveValue('build');
 await expect(page.getByRole('button',{name:'Gerar proposta',exact:true})).toBeDisabled();
 const after=await (await request.get('/api/projects?id='+p.id)).json();expect(after.runs.length).toBe(before);expect(after.project.snapshot.files).toEqual({});
});
