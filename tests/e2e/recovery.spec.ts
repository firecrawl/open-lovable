import {test,expect,type BrowserContext} from '@playwright/test';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {once} from 'node:events';

test('P03 a separately restored server reopens and edits the application without changing its source',async({browser},info)=>{
 test.setTimeout(60000);
 const root=mkdtempSync(join(tmpdir(),'open-lovable-recovery-e2e-'));
 const allowed=new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','SYSTEMDRIVE','PROGRAMFILES','COMSPEC','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA']);
 const env:NodeJS.ProcessEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase())));
 Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',CI:'1',OPEN_LOVABLE_DISABLE_SAVED_SETTINGS:'0'});
 const seed=spawnSync(process.execPath,['--import','tsx','tests/helpers/recovery-e2e.ts',root],{env,encoding:'utf8',timeout:20000});
 if(seed.status!==0){rmSync(root,{recursive:true,force:true});throw new Error(seed.stderr||'Recovery fixture failed');}
 const project=JSON.parse(readFileSync(join(root,'fixture.json'),'utf8')) as {id:string;version:number;code:string};
 const original=readFileSync(join(root,'source','state.sqlite3'));
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
 const port=(reservation.address() as {port:number}).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
 const origin=`http://127.0.0.1:${port}`,password='isolated-recovery-e2e-password-not-production';
 Object.assign(env,{OPEN_LOVABLE_DATA_DIR:join(root,'restored'),OPEN_LOVABLE_APP_ORIGIN:origin,OPEN_LOVABLE_USERNAME:'admin',OPEN_LOVABLE_PASSWORD:password});
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
 const logs:string[]=[];server.stdout.on('data',data=>logs.push(String(data)));server.stderr.on('data',data=>logs.push(String(data)));
 const exited=new Promise<void>((resolve,reject)=>{server.once('exit',()=>resolve());server.once('error',reject);});
 let context:BrowserContext|undefined;
 try {
  context=await browser.newContext({baseURL:origin,httpCredentials:{username:'admin',password,origin,send:'always'}});
  await expect.poll(async()=>{try{return (await context!.request.get('/projects',{timeout:1000})).status();}catch{return 0;}},{timeout:20000}).toBe(200);
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/projects/'+project.id);await expect(page.getByRole('heading',{name:'Recovered application',exact:true})).toBeVisible();
  await expect(page.getByTestId('project-version')).toHaveText('Revisão 2');
  const preview=page.frameLocator('iframe[title="Prévia isolada"]');
  await expect(preview.getByRole('heading',{name:'Recovery verified',exact:true})).toBeVisible();
  await preview.getByRole('button',{name:'Clicks 0',exact:true}).click();await expect(preview.getByRole('button',{name:'Clicks 1',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Código',exact:true}).click();
  await page.getByLabel('Conteúdo do arquivo',{exact:true}).fill(project.code.replace('Recovery verified','Edited after restore'));
  await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();await expect(page.getByTestId('project-version')).toHaveText('Revisão 3');
  await page.reload();await page.getByRole('tab',{name:'Código',exact:true}).click();await expect(page.getByLabel('Conteúdo do arquivo',{exact:true})).toHaveValue(/Edited after restore/);
  await page.getByRole('tab',{name:'Histórico',exact:true}).click();await expect(page.getByRole('button',{name:'Restaurar revisão 2',exact:true})).toBeVisible();
  const settings=await context.request.get('/api/provider-settings');expect(settings.ok()).toBe(true);const raw=await settings.text();expect(raw).not.toContain('fixture-recovery-ui-key');
  expect(JSON.parse(raw).providers.find((item:{provider:string})=>item.provider==='openai').credentialConfigured).toBe(true);
  expect(readFileSync(join(root,'source','state.sqlite3')).equals(original)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('recovered-project.png'),fullPage:true});
 }finally{
  try{await context?.close();}finally{if(server.exitCode===null)server.kill();}
  const watchdog=setTimeout(()=>server.kill('SIGKILL'),5000);try{await exited;}finally{clearTimeout(watchdog);}
  await info.attach('restored-server.log',{body:Buffer.from(logs.join('')),contentType:'text/plain'});
  rmSync(root,{recursive:true,force:true});
 }
});
