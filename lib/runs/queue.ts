import {isBase64} from '../security/base64';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ProjectError,ProjectStore,validateSnapshot} from '../projects/store';
import {ReferenceImageStore} from '../projects/images';
import {assertNoSecrets,redactSecretText} from '../security/secret-content';
import {READ_ROLES,WRITE_ROLES} from '../persistence/validation';
import {checkStoredLimits,resolveRunLimits,type RunLimits,RunBudgetError} from '../budgets/run-limits';
import {assertTransition} from './state-machine';
import type {RunAccess,RunAuthority,EnqueueRequest,FrozenRunInput,ClaimedRun,WorkerLease,RunSummary,RunEvent} from './types';

const LEASE_MS=20000,MAX_FROZEN_BYTES=24*1024*1024;
const id=z.string().uuid();
const requestSchema=z.object({projectId:id,baseVersion:z.number().int().min(1),requestKey:z.string().regex(/^[a-z0-9_-]{8,128}$/i),prompt:z.string().trim().min(1).max(32768),model:z.string().min(1).max(240),mode:z.enum(['build','plan']),imageIDs:z.array(id).max(4),confirmCost:z.literal(true),confirmVision:z.boolean().optional()}).strict();
const accessSchema=z.object({workspaceId:id,actorId:id,memberVersion:z.number().int().min(1),mode:z.enum(['individual','supabase']),sessionId:id.nullable()});
const authoritySchema=accessSchema.extend({origin:z.string().url().max(2048),settingsOwner:z.string().min(1).max(128),allowLoopback:z.boolean(),modelBinding:z.string().regex(/^[a-f0-9]{64}$/),policyVersion:z.literal(1)}).strict();
export function canonicalRunData(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonicalRunData).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalRunData((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
export const runDigest=(value:unknown)=>createHash('sha256').update(canonicalRunData(value)).digest('hex');
const frozenSchema=z.object({workspaceId:z.string().uuid().optional(),projectId:z.string().uuid().optional(),revisionDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),snapshot:z.unknown(),references:z.array(z.object({name:z.string().max(200),content:z.string().max(200000)}).strict()).max(20),history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(32768)}).strict()).max(12),images:z.array(z.object({id:z.string().uuid(),name:z.string().max(200),role:z.enum(['target','current']),mime:z.enum(['image/png','image/jpeg','image/webp']),width:z.number().int().positive(),height:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),data:z.string().max(9*1024*1024)}).strict()).max(4)}).strict();
function frozenInput(encoded:string,digest:unknown):FrozenRunInput {
 if(Buffer.byteLength(encoded)>MAX_FROZEN_BYTES)throw new ProjectError('Stored execution input size failed validation',503);
 const input=frozenSchema.parse(JSON.parse(encoded));
 if(runDigest(input)!==digest)throw new ProjectError('Frozen execution input integrity failed',503);
 const snapshot=validateSnapshot(input.snapshot);let bytes=0;
 for(const image of input.images){
  if(!isBase64(image.data))throw new ProjectError('Frozen image encoding failed validation',503);
  const content=Buffer.from(image.data,'base64');bytes+=content.length;
  if(createHash('sha256').update(content).digest('hex')!==image.sha256)throw new ProjectError('Frozen image digest failed validation',503);
 }
 if(bytes>6*1024*1024)throw new ProjectError('Frozen images exceed their budget',413);
 return {...input,snapshot};
}

type Control=Record<string,unknown>;

/** Single-node durable scheduler. Only this service writes the control/journal, never browser/model payloads. */
export class RunQueue {
 constructor(readonly store:ProjectStore,private readonly clock:()=>number=Date.now) {}
 private control(runId:string):Control {
  const row=this.store.db.prepare('SELECT c.*,r.project_id FROM run_controls c JOIN runs r ON r.id=c.run_id WHERE c.run_id=?').get(runId);
  if(!row)throw new ProjectError('Run not found',404);return row;
 }
 /** Re-evaluate real membership, not roles copied into a client object. */
 assertAuthority(authority:RunAccess,projectId:string,write=false,originalVersion=false):string {
  accessSchema.parse(authority);
  const row=this.store.db.prepare('SELECT p.owner,m.role,m.version FROM projects p JOIN workspace_members m ON m.workspace_id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND m.actor_id=? AND m.active=1').get(projectId,authority.workspaceId,authority.actorId);
  if(!row||!READ_ROLES.has(String(row.role)))throw new ProjectError('Run not found',404);
  if(write&&!WRITE_ROLES.has(String(row.role)))throw new ProjectError('Project write access required',403);
  if(originalVersion&&Number(row.version)!==authority.memberVersion)throw new ProjectError('Execution permission changed; authorize a new request.',403);
  if(authority.mode==='supabase'){
   const session=this.store.db.prepare("SELECT s.actor_id,s.actor_version,s.issuer,s.expires_at,s.last_seen_at,a.version,a.active FROM auth_sessions s JOIN identity_actors a ON a.id=s.actor_id WHERE s.id=? AND s.revoked_at IS NULL AND s.purpose='normal'").get(authority.sessionId||'');
   if(!session||session.actor_id!==authority.actorId||session.active!==1||session.version!==session.actor_version||Number(session.expires_at)<=this.clock()||Number(session.last_seen_at)+7200000<=this.clock())throw new ProjectError('Execution session expired or revoked.',401);
  }
  return String(row.owner);
 }
 private scoped(authority:RunAccess,runId:string,write=false):Control {
  id.parse(runId);const c=this.control(runId);
  if(c.workspace_id!==authority.workspaceId)throw new ProjectError('Run not found',404);
  this.assertAuthority(authority,String(c.project_id),write);return c;
 }
 private append(c:Control,type:string,payload:Record<string,unknown>):void {
  if(!/^[a-z][a-z0-9_.-]{0,79}$/.test(type))throw new ProjectError('Invalid event type');
  const body=JSON.stringify(payload);assertNoSecrets(body);
  if(Buffer.byteLength(body)>16384)throw new ProjectError('Event size limit exceeded',413);
  const last=Number(this.store.db.prepare('SELECT coalesce(max(sequence),0) AS n FROM run_journal WHERE run_id=?').get(String(c.run_id))?.n);
  if(last>=1000)throw new ProjectError('Run journal budget exceeded',413);
  this.store.db.prepare('INSERT INTO run_journal VALUES(?,?,?,?,?,?)').run(String(c.run_id),last+1,randomUUID(),type,body,new Date(this.clock()).toISOString());
 }
 /** Replays an already admitted command without consulting a now-unavailable model connection. */
 existing(authority:RunAccess,request:EnqueueRequest):RunSummary|null {
  const valid=requestSchema.parse(request);this.assertAuthority(authority,valid.projectId,true);
  const row=this.store.db.prepare('SELECT id FROM runs WHERE project_id=? AND request_key=?').get(valid.projectId,valid.requestKey);
  if(!row)return null;const previous=this.control(String(row.id));
  if(previous.request_digest!==runDigest(valid)||previous.actor_id!==authority.actorId)throw new ProjectError('Idempotency key conflict',409);
  return this.get(authority,String(row.id));
 }
 /** Context and user intent are frozen in the same transaction as run creation. */
 enqueue(authorityInput:RunAuthority,input:EnqueueRequest):RunSummary {
  const authority=authoritySchema.parse(authorityInput),request=requestSchema.parse(input);
  if(request.imageIDs.length&&!request.confirmVision)throw new ProjectError('Confirm image support before sending visual context.');
  return this.store.transaction(()=>{
   const owner=this.assertAuthority(authority,request.projectId,true,true);
   const existing=this.store.db.prepare('SELECT id FROM runs WHERE project_id=? AND request_key=?').get(request.projectId,request.requestKey);
   const intent=runDigest(request);
   if(existing){const previous=this.control(String(existing.id));if(previous.request_digest!==intent||previous.actor_id!==authority.actorId)throw new ProjectError('Idempotency key conflict',409);return this.get(authority,String(existing.id));}
   const count=Number(this.store.db.prepare("SELECT count(*) AS n FROM run_controls c JOIN runs r ON r.id=c.run_id WHERE c.workspace_id=? AND r.state IN ('QUEUED','RUNNING')").get(authority.workspaceId)?.n);
   if(count>=20)throw new ProjectError('Workspace queue limit reached',429);
   const project=this.store.getProject(owner,request.projectId);
   const history=this.store.messages(owner,project.id).filter(row=>row.role==='user'||row.role==='assistant').slice(-12).map(row=>({role:row.role as 'user'|'assistant',content:row.content}));
   const references=this.store.documents(owner,project.id).map(row=>({name:row.name,content:row.content}));
   const context=JSON.stringify({files:project.snapshot.files,assetPaths:Object.keys(project.snapshot.assets),references});
   if(Buffer.byteLength(context)>2*1024*1024)throw new ProjectError('Project context exceeds 2 MiB; reduce references or split the task.',413);
   const limits=resolveRunLimits(undefined,request.mode);
   const run=this.store.beginRun(owner,project.id,request.requestKey,request.prompt,request.model,request.baseVersion,{mode:request.mode,imageIDs:request.imageIDs,queued:true});
   const images=new ReferenceImageStore(this.store).forRun(owner,project.id,run.id).map(({id,name,role,mime,width,height,sha256,data})=>({id,name,role,mime,width,height,sha256,data}));
   const frozen:FrozenRunInput={workspaceId:authority.workspaceId,projectId:project.id,revisionDigest:runDigest(project.snapshot),snapshot:project.snapshot,history,references,images},encoded=JSON.stringify(frozen);
   if(Buffer.byteLength(encoded)>MAX_FROZEN_BYTES)throw new ProjectError('Frozen input exceeds its storage budget',413);
   const used=Number(this.store.db.prepare('SELECT coalesce(sum(length(CAST(frozen_input AS BLOB))+coalesce(length(CAST(output AS BLOB)),0)),0) AS n FROM run_controls WHERE workspace_id=?').get(authority.workspaceId)?.n);
   if(used+Buffer.byteLength(encoded)>256*1024*1024)throw new ProjectError('Execution context storage budget exceeded',413);
   this.store.db.prepare('INSERT INTO run_controls(run_id,workspace_id,actor_id,authority,frozen_input,input_digest,request_digest,request_id,trace_id,deadline_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(run.id,authority.workspaceId,authority.actorId,JSON.stringify(authority),encoded,runDigest(frozen),intent,randomUUID(),randomBytes(16).toString('hex'),this.clock()+limits.timeoutMs,new Date(this.clock()).toISOString());
   this.store.db.prepare('INSERT INTO run_limits(run_id,limits) VALUES(?,?)').run(run.id,JSON.stringify(limits));
   this.append(this.control(run.id),'run.queued',{mode:run.inputs.mode,baseVersion:run.base_version,model:run.model});
   return this.get(authority,run.id);
  });
 }
 /** Every public response excludes session identifiers, connection credentials and frozen content. */
 get(authority:RunAccess,runId:string):RunSummary {
  const c=this.scoped(authority,runId),owner=this.assertAuthority(authority,String(c.project_id));
  const run=this.store.getRun(owner,String(c.project_id),runId);
  const worker=this.store.db.prepare("SELECT expires_at FROM worker_leases WHERE name='agent'").get();
  const last=Number(this.store.db.prepare('SELECT coalesce(max(sequence),0) AS n FROM run_journal WHERE run_id=?').get(runId)?.n);
  return {id:run.id,projectId:run.project_id,workspaceId:String(c.workspace_id),state:run.state,mode:run.inputs.mode,model:run.model,baseVersion:run.base_version,requestId:String(c.request_id),traceId:String(c.trace_id),inputDigest:String(c.input_digest),deadlineAt:Number(c.deadline_at),createdAt:run.created_at,updatedAt:run.updated_at,phase:String(c.phase),error:run.error,outcome:String(c.outcome),lastSequence:last,usage:JSON.parse(String(c.usage)),workerAvailable:Number(worker?.expires_at||0)>this.clock()};
 }
 list(authority:RunAccess,projectId:string):RunSummary[] {
  this.assertAuthority(authority,projectId);
  return this.store.db.prepare('SELECT c.run_id FROM run_controls c JOIN runs r ON r.id=c.run_id WHERE r.project_id=? AND c.workspace_id=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT 100').all(projectId,authority.workspaceId).map(row=>this.get(authority,String(row.run_id)));
 }
 events(authority:RunAccess,runId:string,cursor=0):{events:RunEvent[];nextCursor:number;hasMore:boolean} {
  const c=this.scoped(authority,runId);
  if(!Number.isSafeInteger(cursor)||cursor<0)throw new ProjectError('Invalid event cursor');
  const latest=Number(this.store.db.prepare('SELECT coalesce(max(sequence),0) AS n FROM run_journal WHERE run_id=?').get(runId)?.n);
  if(cursor>latest)throw new ProjectError('Event cursor is ahead of this run',409);
  const rows=this.store.db.prepare('SELECT * FROM run_journal WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT 65').all(runId,cursor);
  const events=rows.slice(0,64).map(row=>({eventId:String(row.event_id),sequence:Number(row.sequence),workspaceId:String(c.workspace_id),projectId:String(c.project_id),runId,requestId:String(c.request_id),traceId:String(c.trace_id),type:String(row.type),occurredAt:String(row.occurred_at),payload:JSON.parse(String(row.payload))}));
  return {events,nextCursor:events.at(-1)?.sequence??cursor,hasMore:rows.length>64};
 }
 /** Exports only the public journal and records this access without exposing prompts or capabilities. */
 exportJournal(authority:RunAccess,runId:string) {
  return this.store.transaction(()=>{
   const c=this.scoped(authority,runId);
   const count=Number(this.store.db.prepare("SELECT count(*) AS n FROM run_journal WHERE run_id=? AND type='audit.exported'").get(runId)?.n);
   const total=Number(this.store.db.prepare('SELECT count(*) AS n FROM run_journal WHERE run_id=?').get(runId)?.n);
   if(count>=10||total>=950)throw new ProjectError('Journal export limit reached. Keep the previously downloaded record.',429);
   this.append(c,'audit.exported',{actorId:authority.actorId,format:'json-v1'});
   const events:RunEvent[]=[];let cursor=0;
   do{const batch=this.events(authority,runId,cursor);events.push(...batch.events);cursor=batch.nextCursor;if(!batch.hasMore)break;}while(events.length<=1000);
   return {format:'open-lovable-run-journal',version:1,exportedAt:new Date(this.clock()).toISOString(),run:this.get(authority,runId),events};
  });
 }
 cancel(authority:RunAccess,runId:string):RunSummary {
  return this.store.transaction(()=>{const c=this.scoped(authority,runId,true),owner=this.assertAuthority(authority,String(c.project_id),true),before=this.store.getRun(owner,String(c.project_id),runId);
   if(before.state==='SUCCEEDED')throw new ProjectError('Completed work cannot be cancelled; use a new revision.',409);
   if(['QUEUED','RUNNING','AWAITING_APPROVAL'].includes(before.state)){
    this.store.cancelRun(owner,String(c.project_id),runId);
    this.store.db.prepare("UPDATE run_approvals SET state='invalidated',resolved_at=? WHERE run_id=? AND state='pending'").run(this.clock(),runId);
    this.store.db.prepare("UPDATE run_controls SET phase='cancelled',outcome=? WHERE run_id=?").run(c.model_started?'CANCELLED_AFTER_MODEL_START':'CANCELLED_BEFORE_MODEL_START',runId);
    this.append(c,'run.cancelled',{state:'CANCELLED',modelStarted:Boolean(c.model_started)});
   }return this.get(authority,runId);
  });
 }
 acquireWorker(workerId:string):WorkerLease|null {
  z.string().min(1).max(128).parse(workerId);
  return this.store.transaction(()=>{const row=this.store.db.prepare("SELECT * FROM worker_leases WHERE name='agent'").get();if(row&&Number(row.expires_at)>this.clock())return null;
   const epoch=Number(row?.epoch||0)+1;this.store.db.prepare("INSERT INTO worker_leases VALUES('agent',?,?,?,?) ON CONFLICT(name) DO UPDATE SET worker_id=excluded.worker_id,epoch=excluded.epoch,expires_at=excluded.expires_at,heartbeat_at=excluded.heartbeat_at").run(workerId,epoch,this.clock()+LEASE_MS,this.clock());return {workerId,epoch};});
 }
 heartbeatWorker(worker:WorkerLease):boolean {
  return Number(this.store.db.prepare("UPDATE worker_leases SET expires_at=?,heartbeat_at=? WHERE name='agent' AND worker_id=? AND epoch=? AND expires_at>?").run(this.clock()+LEASE_MS,this.clock(),worker.workerId,worker.epoch,this.clock()).changes)===1;
 }
 releaseWorker(worker:WorkerLease):void {this.store.db.prepare("UPDATE worker_leases SET expires_at=0 WHERE name='agent' AND worker_id=? AND epoch=?").run(worker.workerId,worker.epoch);}
 private assertWorker(worker:WorkerLease):void {
  if(!this.store.db.prepare("SELECT 1 FROM worker_leases WHERE name='agent' AND worker_id=? AND epoch=? AND expires_at>?").get(worker.workerId,worker.epoch,this.clock()))throw new ProjectError('Worker lease lost',409);
 }
 /** Safe recovery distinguishes a durable response from an uncertain remote request. */
 reconcile():void {
  this.store.transaction(()=>{
   const rows=this.store.db.prepare("SELECT c.*,r.project_id,r.state,r.lease_until AS run_lease_until FROM run_controls c JOIN runs r ON r.id=c.run_id WHERE (r.state='QUEUED' AND c.deadline_at<=?) OR (r.state='AWAITING_INPUT' AND (c.wait_until<=? OR c.deadline_at<=?)) OR (r.state='RUNNING' AND (r.lease_until<=? OR NOT EXISTS(SELECT 1 FROM worker_leases w WHERE w.name='agent' AND w.worker_id=c.worker_id AND w.epoch=c.worker_epoch AND w.expires_at>?))) LIMIT 100").all(this.clock(),this.clock(),this.clock(),this.clock(),this.clock());
   for(const c of rows){
    const waiting=String(c.state)==='AWAITING_INPUT',expired=Number(c.deadline_at)<=this.clock()||waiting&&Number(c.wait_until)<=this.clock(),safe=!c.model_started||c.output!==null;
    const state=expired?'FAILED':safe?'QUEUED':'INTERRUPTED',outcome=expired?'DEADLINE_EXCEEDED':safe?(c.output?'MODEL_RESULT_RECORDED':'NOT_STARTED'):'MODEL_OUTCOME_UNCERTAIN';
    assertTransition(String(c.state) as import('../projects/store').RunState,state as import('../projects/store').RunState);this.store.db.prepare('UPDATE runs SET state=?,error=?,lease_until=0,updated_at=? WHERE id=?').run(state,state==='INTERRUPTED'?'The worker stopped after a model request. Review before retrying; no automatic second call.':expired?'Execution deadline exceeded.':'',new Date(this.clock()).toISOString(),String(c.run_id));
    this.store.db.prepare('UPDATE run_controls SET worker_id=NULL,waiting_kind=NULL,wait_until=0,phase=?,outcome=? WHERE run_id=?').run(state==='QUEUED'?'queued':'interrupted',outcome,String(c.run_id));
    if(waiting)this.store.db.prepare("UPDATE run_approvals SET state='expired',resolved_at=? WHERE run_id=? AND state='pending'").run(this.clock(),String(c.run_id));
    this.append(c,'run.'+(state==='QUEUED'?'requeued':'interrupted'),{state,outcome});
   }
  });
 }
 claim(worker:WorkerLease):ClaimedRun|null {
  this.reconcile();
  return this.store.transaction(()=>{
   this.assertWorker(worker);
   if(this.store.db.prepare("SELECT 1 FROM runs r JOIN run_controls c ON c.run_id=r.id WHERE r.state='RUNNING'").get())return null;
   const c=this.store.db.prepare("SELECT c.*,r.project_id FROM run_controls c JOIN runs r ON r.id=c.run_id WHERE r.state='QUEUED' ORDER BY c.created_at,c.rowid LIMIT 1").get();if(!c)return null;
   let authority:RunAuthority,input:FrozenRunInput;
   try{
    authority=authoritySchema.parse(JSON.parse(String(c.authority)));
    const grant=this.store.db.prepare("SELECT authority,deadline_at FROM run_grants WHERE run_id=? ORDER BY sequence DESC LIMIT 1").get(String(c.run_id)) as {authority?:string;deadline_at?:number}|undefined;
    if(grant?.authority){if(Number(grant.deadline_at)<=this.clock())throw new ProjectError('Execution grant expired',409);authority=authoritySchema.parse(JSON.parse(grant.authority));}
    if(authority.workspaceId!==c.workspace_id||authority.actorId!==c.actor_id)throw new ProjectError('Stored authority mismatch',503);
    input=frozenInput(String(c.frozen_input),c.input_digest);
   }catch{
    this.store.db.prepare("UPDATE runs SET state='FAILED',error='Stored execution data failed integrity checks. No model request was made.',updated_at=? WHERE id=? AND state='QUEUED'").run(new Date(this.clock()).toISOString(),String(c.run_id));
    this.store.db.prepare("UPDATE run_controls SET phase='failed',outcome='INVALID_CONTROL_RECORD' WHERE run_id=?").run(String(c.run_id));
    this.append(c,'run.invalid-data',{state:'FAILED',outcome:'INVALID_CONTROL_RECORD'});return null;
   }
   let owner:string;try{owner=this.assertAuthority(authority,String(c.project_id),true,true);}catch(error){
    this.store.db.prepare("UPDATE runs SET state='CANCELLED',error=?,updated_at=? WHERE id=?").run('Execution authorization expired or changed.',new Date(this.clock()).toISOString(),String(c.run_id));this.append(c,'run.authorization-denied',{state:'CANCELLED'});return null;
   }
   const token=Number(c.lease_token)+1;
   this.store.db.prepare('UPDATE run_controls SET lease_token=?,worker_id=?,worker_epoch=?,phase=? WHERE run_id=?').run(token,worker.workerId,worker.epoch,c.output?'validating':'context',String(c.run_id));
   assertTransition('QUEUED','RUNNING');this.store.db.prepare("UPDATE runs SET state='RUNNING',lease_until=?,updated_at=? WHERE id=? AND state='QUEUED'").run(this.clock()+LEASE_MS,new Date(this.clock()).toISOString(),String(c.run_id));
   this.store.db.prepare('INSERT INTO execution_claims VALUES(?,?) ON CONFLICT(run_id) DO NOTHING').run(String(c.run_id),new Date(this.clock()).toISOString());
   this.append(c,'run.claimed',{state:'RUNNING',resumingRecordedOutput:c.output!==null});
   return {run:this.store.getRun(owner,String(c.project_id),String(c.run_id)),authority,input,inputDigest:String(c.input_digest),owner,token,worker,deadlineAt:Number(c.deadline_at),output:c.output===null?null:String(c.output)};
  });
 }
 assertLease(job:ClaimedRun):Control {
  this.assertWorker(job.worker);const c=this.control(job.run.id);
  const run=this.store.getRun(job.owner,job.run.project_id,job.run.id);
  if(run.state!=='RUNNING'||run.lease_until<=this.clock()||c.lease_token!==job.token||c.worker_id!==job.worker.workerId||c.worker_epoch!==job.worker.epoch)throw new ProjectError('Execution lease lost or run no longer running',409);
  if(Number(c.deadline_at)<=this.clock())throw new ProjectError('Execution deadline exceeded',408);
  this.assertAuthority(job.authority,job.run.project_id,true,true);return c;
 }
 heartbeat(job:ClaimedRun):void {this.assertLease(job);this.store.db.prepare("UPDATE runs SET lease_until=? WHERE id=? AND state='RUNNING'").run(this.clock()+LEASE_MS,job.run.id);}
 event(job:ClaimedRun,type:string,payload:Record<string,unknown>):void {this.store.transaction(()=>{const c=this.assertLease(job);this.append(c,type,payload);if(typeof payload.phase==='string')this.store.db.prepare('UPDATE run_controls SET phase=? WHERE run_id=?').run(payload.phase.slice(0,64),job.run.id);});}
 /** Persist effect intent and reserve the approved call budget before any provider call. */
 public limitsFor(runId:string,mode:'build'|'plan'):RunLimits {const row=this.store.db.prepare('SELECT limits FROM run_limits WHERE run_id=?').get(runId) as {limits?:string}|undefined;return row?checkStoredLimits(JSON.parse(row.limits!),mode):checkStoredLimits({},mode);}
  markModelStarted(job:ClaimedRun):void {this.store.transaction(()=>{const c=this.assertLease(job);if(c.model_started||c.output!==null)throw new ProjectError('Model request already started or result recorded',409);const limits=this.limitsFor(job.run.id,job.run.inputs.mode);if(limits.maxModelCalls<1)throw new RunBudgetError('Model-call budget exhausted before dispatch.');this.store.db.prepare("UPDATE run_controls SET model_started=1,phase='generating',outcome='MODEL_OUTCOME_UNCERTAIN' WHERE run_id=?").run(job.run.id);this.append(c,'model.requested',{model:job.run.model,budgetReserved:{maxModelCalls:limits.maxModelCalls,maxOutputTokens:limits.maxOutputTokens}});});}
 recordModelResult(job:ClaimedRun,text:string,usage:Record<string,unknown>):void {
  assertNoSecrets(text);if(!text||Buffer.byteLength(text)>2*1024*1024)throw new ProjectError('Model output size is invalid',413);
  const data=JSON.stringify(usage);assertNoSecrets(data);if(data.length>8192)throw new ProjectError('Usage payload too large');
  this.store.transaction(()=>{const c=this.assertLease(job);if(!c.model_started||c.output!==null)throw new ProjectError('Unexpected repeated model result',409);const limits=this.limitsFor(job.run.id,job.run.inputs.mode),outputTokens=typeof usage.outputTokens==='number'?usage.outputTokens:null,totalTokens=typeof usage.totalTokens==='number'?usage.totalTokens:null;if(outputTokens!==null&&outputTokens>limits.maxOutputTokens)throw new RunBudgetError('Reported model output exceeded the approved token budget.');const outcome=outputTokens===null||totalTokens===null?'MODEL_USAGE_UNKNOWN':'MODEL_RESULT_RECORDED';this.store.db.prepare("UPDATE run_controls SET output=?,usage=?,outcome=?,phase='validating' WHERE run_id=?").run(text,data,outcome,job.run.id);this.append(c,'model.responded',{characters:text.length,usage,usageState:outcome});});
 }
 stage(job:ClaimedRun,snapshot:unknown,explanation:string,evidence:Record<string,unknown>):void {
  this.store.transaction(()=>{const c=this.assertLease(job);this.store.stageRun(job.owner,job.run.project_id,job.run.id,snapshot,explanation);this.store.db.prepare("UPDATE run_controls SET phase='approval',outcome='CANDIDATE_COMPILED' WHERE run_id=?").run(job.run.id);this.append(c,'proposal.compiled',{...evidence,state:'AWAITING_APPROVAL',applicationTested:false});});
 }
 completePlan(job:ClaimedRun,text:string):void {this.store.transaction(()=>{const c=this.assertLease(job);this.store.completePlan(job.owner,job.run.project_id,job.run.id,text);this.store.db.prepare("UPDATE run_controls SET phase='complete',outcome='PLAN_SAVED' WHERE run_id=?").run(job.run.id);this.append(c,'plan.completed',{state:'SUCCEEDED',codeChanged:false});});}
 fail(job:ClaimedRun,message:string,interrupted=false):void {
  this.store.transaction(()=>{this.assertWorker(job.worker);const c=this.control(job.run.id),run=this.store.getRun(job.owner,job.run.project_id,job.run.id);
   if(run.state!=='RUNNING'||run.lease_until<=this.clock()||c.lease_token!==job.token||c.worker_id!==job.worker.workerId||c.worker_epoch!==job.worker.epoch)return;
   const expired=Number(c.deadline_at)<=this.clock();
   const resumable=interrupted&&!expired&&(!c.model_started||c.output!==null);
   const state=resumable?'QUEUED':interrupted&&!expired?'INTERRUPTED':'FAILED';
   this.store.db.prepare('UPDATE runs SET state=?,candidate=NULL,error=?,lease_until=0,updated_at=? WHERE id=?').run(state,resumable?'':redactSecretText(message).slice(0,2000),new Date(this.clock()).toISOString(),job.run.id);
   this.store.db.prepare('UPDATE run_controls SET phase=?,worker_id=NULL WHERE run_id=?').run(resumable?'queued':'stopped',job.run.id);
   this.append(c,resumable?'run.requeued':'run.stopped',{state,outcome:String(c.outcome),reason:interrupted?'worker-shutdown':'failure'});
  });
 }
 accept(authority:RunAccess,runId:string,version:number) {
  return this.store.transaction(()=>{const c=this.scoped(authority,runId,true),owner=this.assertAuthority(authority,String(c.project_id),true);
   const project=this.store.acceptRun(owner,String(c.project_id),runId,version);this.store.db.prepare("UPDATE run_controls SET phase='complete',outcome='REVISION_ACCEPTED' WHERE run_id=?").run(runId);this.append(c,'revision.accepted',{state:'SUCCEEDED',version:project.version});return project;
  });
 }
}
