import {createHash} from 'node:crypto';
import {authMode} from '../identity/config';
import {accountService} from '../identity/factory';
import {ProjectError,operatorID} from '../projects/store';
import {requestFrozenModel,validateRunResult} from '../projects/generation';
import {safeLogger} from '../security/secret-content';
import type {ProviderScope} from '../settings/store';
import {RunQueue} from './queue';
import {ApprovalService} from '../approvals/service';
import {modelBindingDigest} from './model-binding';
import type {ClaimedRun,WorkerLease} from './types';
import {runRepairLoop} from '../agent/repair';

/** Server configuration, current session and original connection must still match admitted work. */
function localGuard(queue:RunQueue,job:ClaimedRun):ProviderScope|undefined {
 queue.assertLease(job);const a=job.authority;
 if(authMode()!==a.mode)throw new ProjectError('Authentication profile changed; authorize a new request.',403);
 const configured=process.env.OPEN_LOVABLE_APP_ORIGIN;
 if(configured?new URL(configured).origin!==a.origin:!['localhost','127.0.0.1','[::1]'].includes(new URL(a.origin).hostname))throw new ProjectError('Studio origin changed; authorize a new request.',403);
 if(a.mode==='individual'&&a.settingsOwner!==operatorID())throw new ProjectError('Operator identity changed.',403);
 if(a.mode==='supabase'&&a.settingsOwner!=='workspace:'+a.workspaceId)throw new ProjectError('Connection scope mismatch.',403);
 const loopbackAllowed=process.env.OPEN_LOVABLE_ACCOUNT_ALLOW_LOOPBACK_PROVIDERS==='1'&&['localhost','127.0.0.1','[::1]'].includes(new URL(a.origin).hostname);
 if(a.mode==='supabase'&&a.allowLoopback&&!loopbackAllowed)throw new ProjectError('Provider network policy changed. Authorize a new request.',403);
 const scope=a.mode==='supabase'?{owner:a.settingsOwner,allowLoopback:a.allowLoopback}:undefined;
 if(modelBindingDigest(job.run.model,scope)!==a.modelBinding)throw new ProjectError('Model connection changed. Review settings and authorize a new request.',409);
 return scope;
}
async function verifySession(job:ClaimedRun,signal:AbortSignal):Promise<void> {
 if(job.authority.mode!=='supabase')return;
 const service=accountService(job.authority.origin);
 const session=await service.authenticateSession(job.authority.sessionId!,signal);
 if(session.actor_id!==job.authority.actorId)throw new ProjectError('Execution session identity changed.',401);
}
/** Executes at most one admitted run. The only model call is preceded by a durable effect marker. */
export async function runWorkerOnce(queue:RunQueue,worker:WorkerLease,stopSignal?:AbortSignal):Promise<{worked:boolean;runId?:string;state?:string}> {
 const job=queue.claim(worker);if(!job)return {worked:false};
 const cancelled=new AbortController();const signal=AbortSignal.any([cancelled.signal,AbortSignal.timeout(Math.max(1,job.deadlineAt-Date.now())),...(stopSignal?[stopSignal]:[])]);
 const heartbeat=setInterval(()=>{
  try{if(!queue.heartbeatWorker(worker))throw new ProjectError('Worker lease lost',409);localGuard(queue,job);queue.heartbeat(job);}
  catch(error){cancelled.abort(error);}
 },1000);heartbeat.unref();
 try{
  let scope=localGuard(queue,job);await verifySession(job,signal);signal.throwIfAborted();scope=localGuard(queue,job);
  let text=job.output,usage:Record<string,unknown>={},validated:Awaited<ReturnType<typeof validateRunResult>>|undefined;
  if(text===null){
   const approval=new ApprovalService(queue),limits=queue.limitsFor(job.run.id,job.run.inputs.mode);
   const toolInput={...job.input,workspaceId:job.authority.workspaceId,projectId:job.run.project_id,revisionDigest:createHash('sha256').update(JSON.stringify(job.input.snapshot)).digest('hex')};
   let modelCalls=0;
   const request=async(prompt=job.run.prompt)=>{
    const result=await requestFrozenModel({...job.run,prompt},toolInput,signal,{scope,limits,assertLive:()=>{localGuard(queue,job);},beforeModel:()=>{
     modelCalls++;
     if(modelCalls===1&&job.authority.mode==='supabase'&&process.env.OPEN_LOVABLE_REQUIRE_CONNECTION_APPROVAL==='1'){
      localGuard(queue,job);const summary={provider:'gateway',endpoint:process.env.OPEN_LOVABLE_GATEWAY_URL||'https://gateway.invalid',credentialConfigured:Boolean(process.env.OPEN_LOVABLE_GATEWAY_API_KEY)};approval.pause(job,'connection',summary);throw new ProjectError('Connection approval required',402);
     }
     if(modelCalls===1)queue.markModelStarted(job);else queue.event(job,'repair.requested',{attempt:modelCalls,reason:'deterministic validation failed'});
    },status:payload=>queue.event(job,'run.progress',payload)});
    usage=result.usage;text=result.text;return result.text;
   };
   await request();
   let failure='';
   const repair=await runRepairLoop({maxRepairs:job.run.inputs.mode==='build'?limits.maxRepairs:0,maxToolCalls:Math.max(1,(limits.maxRepairs+1)*3),deadlineMs:Math.max(1,job.deadlineAt-Date.now())},async()=>failure||'candidate validation pending',async()=>{queue.event(job,'run.progress',{phase:'repairing'});await request(`${job.run.prompt}\n\nReturn a corrected proposal. The previous proposal failed deterministic validation; preserve the requested behavior and return complete changed files.`);return 'repair proposal received';},async()=>{try{validated=await validateRunResult(job.run,toolInput,text||'',signal);failure='';return {passed:true,summary:'candidate validated'};}catch(error){failure=error instanceof Error?error.message:'candidate validation failed';return {passed:false,summary:'candidate rejected by deterministic validation'};}});
   if(!repair.passed)throw new ProjectError(failure||`Candidate validation failed after bounded repair: ${repair.reason}`);
   queue.recordModelResult(job,text||'',usage);
  } else {
   queue.event(job,'run.progress',{phase:job.run.inputs.mode==='plan'?'planning':'compiling'});
   validated=await validateRunResult(job.run,job.input,text,signal);
  }
  const result=validated!;
  await verifySession(job,signal);signal.throwIfAborted();localGuard(queue,job);
  if(result.kind==='plan')queue.completePlan(job,result.text);
  else queue.stage(job,result.snapshot,result.explanation,{entry:result.compiled.entry,sha256:result.compiled.sha256,warnings:result.compiled.warnings});
 }catch(error){
  const message=error instanceof Error?error.message:'Execution failed; saved files were preserved.';
  try{queue.fail(job,message,Boolean(stopSignal?.aborted));}catch(recordError){safeLogger.error('Worker could not record its interrupted state',recordError);}
 }finally{clearInterval(heartbeat);}
 const final=queue.store.getRun(job.owner,job.run.project_id,job.run.id);
 return {worked:true,runId:job.run.id,state:final.state};
}
