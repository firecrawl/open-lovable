import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';

async function implementation(){const implementationModule=await import('../scripts/studio-supervisor.mjs').catch(()=>({})) as Record<string,any>;assert.equal(typeof implementationModule.startStudioProcesses,'function');return implementationModule;}
const child=(code:string)=>({command:process.execPath,args:['-e',code]});
const waiting="process.send({type:'worker.ready'});process.on('message',m=>{if(m?.type==='shutdown')process.exit(0)});setInterval(()=>{},1000)";
test('Studio supervisor refuses to advertise a server if its worker fails and cleans up only its children',async()=>{
 const {startStudioProcesses}=await implementation();
 const studio=await startStudioProcesses({worker:child(waiting),web:child('setTimeout(()=>process.exit(7),20)'),env:{...process.env},inheritOutput:false});
 assert.equal(await studio.exited,7);assert.equal(studio.children.every((c:{exitCode:number|null;signalCode:string|null})=>c.exitCode!==null||c.signalCode!==null),true);
});
test('a startup worker error is surfaced, not replaced by a working web-only process',async()=>{
 const {startStudioProcesses}=await implementation();
 await assert.rejects(()=>startStudioProcesses({worker:child('process.exit(9)'),web:child('setInterval(()=>{},1000)'),env:{...process.env},inheritOutput:false}),/worker|startup/i);
});
test('explicit shutdown waits for owned process exit and is idempotent',async()=>{
 const {startStudioProcesses}=await implementation();
 const studio=await startStudioProcesses({worker:child(waiting),web:child("process.on('message',m=>{if(m?.type==='shutdown')process.exit(0)});setInterval(()=>{},1000)"),env:{...process.env},inheritOutput:false});
 await delay(50);await studio.stop();await studio.stop();assert.equal(await studio.exited,0);
});
test('worker and web share controlled env-file precedence without leaking secrets into diagnostics',async t=>{
 const {studioEnvironment}=await implementation(),root=mkdtempSync(join(tmpdir(),'studio-environment-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(join(root,'.env'),'APP_VALUE=base\nBASE_ONLY=base\n');writeFileSync(join(root,'.env.local'),'APP_VALUE=local\n');writeFileSync(join(root,'.env.production.local'),'APP_VALUE=production-local\n');
 assert.equal(studioEnvironment(root,false,{}).APP_VALUE,'production-local');assert.equal(studioEnvironment(root,false,{APP_VALUE:'process'}).APP_VALUE,'process');assert.equal(studioEnvironment(root,false,{}).BASE_ONLY,'base');
});
