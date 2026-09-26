import {randomBytes} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';

const app=`import {useState} from 'react';export default function App(){const [n,setN]=useState(0);return <main className="p-8"><h1>Projeto persistente</h1><button onClick={()=>setN(n+1)}>Contagem {n}</button></main>}`;
test('operator creates, imports, edits, reopens, restores and exports a durable project',async({page,request},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/projects');
 await expect(page.getByRole('heading',{name:'Seus projetos',exact:true})).toBeVisible();
 await page.getByLabel('Nome do projeto',{exact:true}).fill('Persistência '+Date.now());
 await page.getByRole('button',{name:'Criar projeto',exact:true}).click();
 await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
 const projectURL=page.url();
 await page.getByLabel('Importar ZIP',{exact:true}).setInputFiles({name:'project.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'src/App.jsx':strToU8(app)}))});
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 2');
 const preview=page.frameLocator('iframe[title="Prévia isolada"]');
 await expect(preview.getByRole('heading',{name:'Projeto persistente'})).toBeVisible();
 await preview.getByRole('button',{name:'Contagem 0'}).click();await expect(preview.getByRole('button',{name:'Contagem 1'})).toBeVisible();
 await page.getByRole('tab',{name:'Código',exact:true}).click();
 await page.getByLabel('Conteúdo do arquivo',{exact:true}).fill(app.replace('Projeto persistente','Edição salva'));
 await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 3');
 await page.reload();await page.getByRole('tab',{name:'Código',exact:true}).click();
 await expect(page.getByLabel('Conteúdo do arquivo',{exact:true})).toHaveValue(/Edição salva/);
 await page.getByRole('tab',{name:'Histórico',exact:true}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Restaurar revisão 2',exact:true}).click();
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 4');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Baixar ZIP',exact:true}).click();
 expect((await downloadPromise).suggestedFilename()).toMatch(/\.zip$/);
 const created=await request.post('/api/projects',{data:{action:'create',name:'Outro projeto',model:'gateway/fixture/coder'}});
 const other=(await created.json()).project;const result=await request.get('/api/projects?id='+other.id);
 expect((await result.json()).project.snapshot.files).toEqual({});
 await page.goto(projectURL);await page.getByRole('tab',{name:'Código',exact:true}).click();
 await expect(page.getByLabel('Conteúdo do arquivo',{exact:true})).toHaveValue(/Projeto persistente/);
 await page.screenshot({path:info.outputPath('project-workspace.png'),fullPage:true});expect(errors).toEqual([]);
});

test('generation stages a compiled candidate and a failed generation preserves the saved revision',async({page,request})=>{
 const created=await request.post('/api/projects',{data:{action:'create',name:'Proposta '+Date.now(),model:'gateway/fixture/coder'}});const p=(await created.json()).project;
 await page.goto('/projects/'+p.id);
 await page.getByLabel('Modelo do projeto',{exact:true}).selectOption('gateway/fixture/coder');
 await page.getByLabel('Descreva a alteração',{exact:true}).fill('Create a counter for contract testing');
 await page.getByLabel('Autorizar consumo de tokens para esta geração',{exact:true}).check();
 await page.getByRole('button',{name:'Gerar proposta',exact:true}).click();
 await expect(page.getByRole('button',{name:'Aprovar revisão',exact:true})).toBeVisible();
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 1');
 await expect(page.frameLocator('iframe[title="Prévia isolada"]').getByRole('heading',{name:'Proposta compilada'})).toBeVisible();
 await page.getByRole('button',{name:'Aprovar revisão',exact:true}).click();
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 2');
 await page.getByLabel('Descreva a alteração',{exact:true}).fill('FIXTURE_INVALID');
 await page.getByLabel('Autorizar consumo de tokens para esta geração',{exact:true}).check();
 await page.getByRole('button',{name:'Gerar proposta',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'compilation failed'})).toBeVisible();
 await expect(page.getByTestId('project-version')).toHaveText('Revisão 2');
});

for(const [device,width,height] of [['mobile',390,844],['tablet',820,1180]] as const){
 test(`projects remain usable on ${device}`,async({page,request},info)=>{
  await page.setViewportSize({width,height});await page.goto('/projects');
  await expect(page.getByRole('heading',{name:'Seus projetos'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  const result=await request.post('/api/projects',{data:{action:'create',name:'Responsivo '+device,model:'gateway/fixture/coder'}});
  const p=(await result.json()).project;await page.goto('/projects/'+p.id);
  await expect(page.getByLabel('Descreva a alteração',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Histórico',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.screenshot({path:info.outputPath('projects-'+device+'.png'),fullPage:true});
 });
}


test('a bounded project ZIP larger than the middleware default is not silently truncated',async({request})=>{
 const create=await request.post('/api/projects',{data:{action:'create',name:'Large archive',model:'gateway/fixture/coder'}});const p=(await create.json()).project;
 const entries:Record<string,Uint8Array>={'src/App.jsx':strToU8('export default function App(){return <h1>Large project</h1>}')};
 for(let i=0;i<4;i++)entries[`public/asset-${i}.pdf`]=randomBytes(2000000);
 const archive=Buffer.from(zipSync(entries,{level:0})).toString('base64');expect(archive.length).toBeGreaterThan(10*1024*1024);
 const response=await request.post('/api/projects',{data:{action:'import',id:p.id,version:1,archive}});
 expect(response.status()).toBe(200);const data=await response.json();expect(data.project.version).toBe(2);expect(Object.keys(data.project.snapshot.assets)).toHaveLength(4);
});
