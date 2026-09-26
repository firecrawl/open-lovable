import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {authenticateStudio,studioAccess} from '../identity/request';
import {getTrustedAppOrigin} from '../security/operator-access';
import {readJsonObject,ClientInputError} from '../security/input-validation';
import {redactSecretText,SecretContentError,safeLogger} from '../security/secret-content';
import {ProjectError,projectStore} from '../projects/store';
import {getProviderForModel} from '../ai/provider-manager';
import {ProviderConfigError} from '../ai/provider-catalog';
import {compileProject} from '../projects/preview';
import {RunQueue} from './queue';
import {modelBindingDigest} from './model-binding';
import {ApprovalService} from '../approvals/service';
import {traceFromRequest} from '../observability/tracing';
import type {ApprovalResolution,ConnectionSummary} from '../approvals/types';
import type {RunAccess,RunAuthority,EnqueueRequest} from './types';
type Access=Exclude<Awaited<ReturnType<typeof studioAccess>>,Response>;
const id=z.string().uuid();
const requestSchema=z.object({projectId:id,baseVersion:z.number().int().min(1),requestKey:z.string().regex(/^[a-z0-9_-]{8,128}$/i),prompt:z.string().min(1).max(32768),model:z.string().min(1).max(240),mode:z.enum(['build','plan']),imageIDs:z.array(id).max(4),confirmCost:z.literal(true),confirmVision:z.boolean().optional()}).strict();
const correlation=(request:Request)=>traceFromRequest(request);
interface Correlation {requestId:string;traceId:string;}
function json(value:unknown,trace:Correlation,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Request-ID':trace.requestId,'X-Trace-ID':trace.traceId,'X-Content-Type-Options':'nosniff'}});}
function failure(error:unknown,trace:Correlation):Response {
 const status=error instanceof ProjectError||error instanceof ProviderConfigError||error instanceof SecretContentError?error.status:error instanceof z.ZodError||error instanceof ClientInputError?400:500;
 const code=({400:'INVALID_REQUEST',401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',408:'DEADLINE_EXCEEDED',409:'CONFLICT',413:'LIMIT_EXCEEDED',429:'RATE_LIMITED',503:'UNAVAILABLE'} as Record<number,string>)[status]||'INTERNAL_ERROR';
 if(status===500)safeLogger.error('Run request failed',{requestId:trace.requestId,error});
 const message=status===404?'Run not found':status>=500?'Execution service unavailable. The saved revision was preserved.':error instanceof z.ZodError?`Review the run request fields: ${error.issues.map(issue=>`${issue.path.join('.')||'body'} ${issue.message}`).join('; ')}`:redactSecretText(error instanceof Error?error.message:'Request failed');
 return json({success:false,code,error:message,...trace},trace,status);
}
export function reader(access:Access):RunAccess {
 const p=access.workspace.principal;
 const member=access.store.db.prepare('SELECT version FROM workspace_members WHERE workspace_id=? AND actor_id=? AND active=1').get(p.workspaceId,p.actorId);
 if(!member)throw new ProjectError('Run not found',404);
 return {workspaceId:p.workspaceId,actorId:p.actorId,memberVersion:Number(member.version),mode:access.mode,sessionId:access.session?.id||null};
}
function authority(access:Access,request:Request,model:string):RunAuthority {
 return {...reader(access),origin:getTrustedAppOrigin(request),settingsOwner:access.settingsOwner,allowLoopback:access.scope?.allowLoopback??true,modelBinding:modelBindingDigest(model,access.scope),policyVersion:access.workspace.policyVersion};
}
/** The command completes when admitted, not when a long-lived model stream ends. */
export async function createRun(request:Request):Promise<Response>{
 const trace=correlation(request);
 try{
  const auth=await authenticateStudio(request);if(auth instanceof Response)return auth;
  const input=requestSchema.parse(await readJsonObject(request,100000));
  const access=await studioAccess(request,input.projectId,auth);if(access instanceof Response)return access;
  access.guard(input.projectId,true);const queue=new RunQueue(access.store),prior=queue.existing(reader(access),input);
  if(prior)return json({run:prior},prior,202);
  const approved=authority(access,request,input.model);
  // Catalog/configuration checks are read-only and do not invoke inference.
  await getProviderForModel(input.model,request.signal,access.scope);
  request.signal.throwIfAborted();access.guard(input.projectId,true);
  if(modelBindingDigest(input.model,access.scope)!==approved.modelBinding)throw new ProjectError('Model configuration changed while admitting this request.',409);
  const run=queue.enqueue(approved,input as EnqueueRequest);return json({run},run,202);
 }catch(error){return failure(error,trace);}
}
export async function listRuns(request:Request):Promise<Response>{
 const trace=correlation(request);try{
  const auth=await authenticateStudio(request);if(auth instanceof Response)return auth;
  const projectId=id.parse(new URL(request.url).searchParams.get('projectId'));
  const access=await studioAccess(request,projectId,auth);if(access instanceof Response)return access;
  access.guard(projectId);return json({runs:new RunQueue(access.store).list(reader(access),projectId)},trace);
 }catch(error){return failure(error,trace);}
}
/** Authenticate before locating an execution; a foreign ID never grants project access. */
async function located(request:Request){
 const auth=await authenticateStudio(request);if(auth instanceof Response)return auth;
 const match=new URL(request.url).pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]{36})(?:\/(?:events|cancel|accept|export|approval))?$/);
 if(!match||!id.safeParse(match[1]).success)throw new ProjectError('Run not found',404);
 const runId=match[1];
 const row=projectStore().db.prepare('SELECT r.project_id FROM runs r JOIN run_controls c ON c.run_id=r.id WHERE r.id=?').get(runId);
 if(!row)throw new ProjectError('Run not found',404);
 const access=await studioAccess(request,String(row.project_id),auth);if(access instanceof Response)return access;
 access.guard(String(row.project_id));return {access,runId,projectId:String(row.project_id),queue:new RunQueue(access.store),principal:reader(access)};
}
export async function readRun(request:Request):Promise<Response>{const trace=correlation(request);try{const found=await located(request);if(found instanceof Response)return found;return json({run:found.queue.get(found.principal,found.runId)},trace);}catch(error){return failure(error,trace);}}
export async function cancelRun(request:Request):Promise<Response>{const trace=correlation(request);try{
 const found=await located(request);if(found instanceof Response)return found;
 z.object({}).strict().parse(await readJsonObject(request,1024));found.access.guard(found.projectId,true);
 return json({run:found.queue.cancel(found.principal,found.runId)},trace);
 }catch(error){return failure(error,trace);}}
export async function acceptRun(request:Request):Promise<Response>{const trace=correlation(request);try{
 const found=await located(request);if(found instanceof Response)return found;
 const body=z.object({version:z.number().int().min(1)}).strict().parse(await readJsonObject(request,1024));
 found.access.guard(found.projectId,true);
 const run=found.access.store.getRun(found.access.owner,found.projectId,found.runId);
 if(!run.candidate)throw new ProjectError('No candidate is awaiting approval',409);
 await compileProject(run.candidate);request.signal.throwIfAborted();found.access.guard(found.projectId,true);
 const project=found.queue.accept(found.principal,found.runId,body.version);return json({project,run:found.queue.get(found.principal,found.runId)},trace);
 }catch(error){return failure(error,trace);}}

const subscribers=new Map<string,number>();
/** Read-only per-run event stream. Cancellation releases only this observer, never the job. */
export async function observeRun(request:Request):Promise<Response>{
 const trace=correlation(request);try{
  const found=await located(request);if(found instanceof Response)return found;
  const parameter=new URL(request.url).searchParams.get('cursor'),header=request.headers.get('last-event-id');
  if(parameter!==null&&header!==null&&parameter!==header)throw new ProjectError('Conflicting event cursors');
  const supplied=parameter??header??'0';if(!/^\d{1,15}$/.test(supplied))throw new ProjectError('Invalid event cursor');let cursor=Number(supplied);
  found.queue.events(found.principal,found.runId,cursor);
  const key=found.principal.workspaceId+':'+found.principal.actorId;
  if((subscribers.get(key)||0)>=8||[...subscribers.values()].reduce((a,b)=>a+b,0)>=128)throw new ProjectError('Too many active event observers',429);
  subscribers.set(key,(subscribers.get(key)||0)+1);
  const stop=new AbortController(),signal=AbortSignal.any([request.signal,stop.signal,AbortSignal.timeout(30000)]);
  let closed=false,released=false;
  const release=()=>{if(!released){released=true;const n=(subscribers.get(key)||1)-1;if(n<=0)subscribers.delete(key);else subscribers.set(key,n);}};
  const body=new ReadableStream<Uint8Array>({
   start(controller){
    const write=(text:string)=>{if(!closed)controller.enqueue(new TextEncoder().encode(text));};
    const pump=async()=>{
     try{while(!signal.aborted){
      found.access.guard(found.projectId);found.queue.assertAuthority(found.principal,found.projectId);
      const batch=found.queue.events(found.principal,found.runId,cursor);
      for(const event of batch.events){
       while(!closed&&(controller.desiredSize??0)<=0)await delay(50,undefined,{signal});
       signal.throwIfAborted();found.access.guard(found.projectId);
       write('id: '+event.sequence+'\nevent: run\ndata: '+JSON.stringify(event)+'\n\n');cursor=event.sequence;
      }
      const run=found.queue.get(found.principal,found.runId);
      if(!batch.hasMore&&!['QUEUED','RUNNING'].includes(run.state))break;
      if(!batch.hasMore){await delay(1000,undefined,{signal});if((controller.desiredSize??0)>0)write(': heartbeat\n\n');}
     }}catch(error){if(!signal.aborted&&!closed)write('event: error\ndata: '+JSON.stringify({code:'OBSERVATION_INTERRUPTED',error:'Observation stopped. Reopen the run to check access and state.'})+'\n\n');}
     finally{release();if(!closed){closed=true;controller.close();}}
    };void pump();
   },cancel(){closed=true;stop.abort();release();},
  });
  return new Response(body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Accel-Buffering':'no','X-Request-ID':trace.requestId,'X-Trace-ID':trace.traceId}});
 }catch(error){return failure(error,trace);}
}

/** Audited download is a CSRF-protected command; no public blob URL or database path is returned. */
export async function exportRun(request:Request):Promise<Response>{const trace=correlation(request);try{
 const found=await located(request);if(found instanceof Response)return found;
 z.object({}).strict().parse(await readJsonObject(request,1024));
 const data=found.queue.exportJournal(found.principal,found.runId);
 return new Response(JSON.stringify(data,null,2)+'\n',{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="run-${found.runId}.json"`,'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff','X-Request-ID':trace.requestId,'X-Trace-ID':trace.traceId}});
 }catch(error){return failure(error,trace);}}

export async function readApproval(request:Request):Promise<Response>{const trace=correlation(request);try{
 const found=await located(request);if(found instanceof Response)return found;
 const run=found.queue.get(found.principal,found.runId);
 return json(new ApprovalService(found.queue).status(authority(found.access,request,run.model),found.runId),trace);
 }catch(error){return failure(error,trace);}}

export async function resolveApproval(request:Request):Promise<Response>{const trace=correlation(request);try{
 const found=await located(request);if(found instanceof Response)return found;
 const run=found.queue.get(found.principal,found.runId),current=authority(found.access,request,run.model);
 const body=z.object({approvalId:id,actionDigest:z.string().regex(/^[a-f0-9]{64}$/),nonce:z.string().regex(/^[a-f0-9]{32}$/),decision:z.enum(['approve','deny']),connection:z.object({provider:z.string().min(1).max(120),endpoint:z.string().url().max(2048),credentialConfigured:z.boolean()}).strict()}).strict().parse(await readJsonObject(request,10000));
 found.access.guard(found.projectId,true);
 const {connection,...resolution}=body;
 const result=new ApprovalService(found.queue).resolve(current,found.runId,resolution as ApprovalResolution,current,connection as ConnectionSummary);
 return json({approval:result,run:found.queue.get(found.principal,found.runId)},trace);
 }catch(error){return failure(error,trace);}}
