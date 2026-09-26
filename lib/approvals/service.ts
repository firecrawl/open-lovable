import {randomUUID,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {ProjectError,ProjectStore} from '../projects/store';
import {runDigest,RunQueue} from '../runs/queue';
import type {ClaimedRun,RunAuthority} from '../runs/types';
import {checkStoredLimits,resolveRunLimits,type RunLimits} from '../budgets/run-limits';
import type {ApprovalResolution,ApprovalView,ConnectionSummary,ResumeAction,ResumeKind} from './types';

const resolutionSchema=z.object({approvalId:z.string().uuid(),actionDigest:z.string().regex(/^[a-f0-9]{64}$/),nonce:z.string().regex(/^[a-f0-9]{32}$/),decision:z.enum(['approve','deny'])}).strict();
const connectionSchema=z.object({provider:z.string().min(1).max(120),endpoint:z.string().url().max(2048),credentialConfigured:z.boolean()}).strict();
const authorityKey=(a:RunAuthority)=>({workspaceId:a.workspaceId,actorId:a.actorId,memberVersion:a.memberVersion,mode:a.mode,sessionId:a.sessionId,origin:a.origin,settingsOwner:a.settingsOwner,allowLoopback:a.allowLoopback,modelBinding:a.modelBinding,policyVersion:a.policyVersion});

/** HITL is the only writer allowed to turn a waiting run into a new execution grant. */
export class ApprovalService {
 constructor(private readonly queue:RunQueue,private readonly clock:()=>number=Date.now) {}
 private append(runId:string,type:string,payload:Record<string,unknown>):void {
  const body=JSON.stringify(payload);const last=Number(this.queue.store.db.prepare('SELECT coalesce(max(sequence),0) AS n FROM run_journal WHERE run_id=?').get(runId)?.n);
  this.queue.store.db.prepare('INSERT INTO run_journal VALUES(?,?,?,?,?,?)').run(runId,last+1,randomUUID(),type,body,new Date(this.clock()).toISOString());
 }
 private expire(runId:string):void {
  const pending=this.queue.store.db.prepare("SELECT * FROM run_approvals WHERE run_id=? AND state='pending'").get(runId) as Record<string,unknown>|undefined;
  if(pending&&Number(pending.expires_at)<=this.clock()) {
   this.queue.store.db.prepare("UPDATE run_approvals SET state='expired',resolved_at=? WHERE id=? AND state='pending'").run(this.clock(),String(pending.id));
   this.queue.store.db.prepare("UPDATE runs SET state='FAILED',error='Approval expired; authorize a new execution.',updated_at=? WHERE id=? AND state='AWAITING_INPUT'").run(new Date(this.clock()).toISOString(),runId);
   this.queue.store.db.prepare("UPDATE run_controls SET waiting_kind=NULL,wait_until=0,phase='stopped',outcome='APPROVAL_EXPIRED' WHERE run_id=?").run(runId);
   this.append(runId,'approval.expired',{state:'FAILED',outcome:'APPROVAL_EXPIRED'});
  }
 }
 private row(authority:RunAuthority,runId:string):Record<string,unknown> {
  this.queue.get(authority,runId);this.expire(runId);
  const row=this.queue.store.db.prepare('SELECT a.*,r.model,r.base_version,r.project_id,c.input_digest,c.workspace_id FROM run_approvals a JOIN runs r ON r.id=a.run_id JOIN run_controls c ON c.run_id=a.run_id WHERE a.run_id=? AND a.state=\'pending\'').get(runId) as Record<string,unknown>|undefined;
  if(!row)throw new ProjectError('Approval expired or no longer pending.',409);
  return row;
 }
 private view(row:Record<string,unknown>):ApprovalView {
  const action=JSON.parse(String(row.action)) as ResumeAction;
  return {id:String(row.id),kind:String(row.kind) as ResumeKind,runId:String(row.run_id),actionDigest:String(row.action_digest),nonce:String(row.nonce),expiresAt:Number(row.expires_at),state:String(row.state),model:String(row.model),baseVersion:Number(row.base_version),inputDigest:String(row.input_digest),limits:action.limits,connection:action.connection};
 }
 pause(job:ClaimedRun,kind:ResumeKind,connection:ConnectionSummary={provider:'pending',endpoint:'https://pending.invalid',credentialConfigured:false}):ApprovalView {
  connectionSchema.parse(connection);
  if(kind!=='connection'&&kind!=='cost')throw new ProjectError('Unsupported approval kind');
  return this.queue.store.transaction(()=>{
   const control=this.queue.assertLease(job),run=this.queue.store.getRun(job.owner,job.run.project_id,job.run.id);
   if(run.state!=='RUNNING'||control.model_started||control.output!==null)throw new ProjectError('A started or uncertain model request cannot be paused for approval.',409);
   const existing=this.queue.store.db.prepare("SELECT id FROM run_approvals WHERE run_id=? AND state='pending'").get(run.id);
   if(existing)throw new ProjectError('A decision is already pending.',409);
   const limitsRow=this.queue.store.db.prepare('SELECT limits FROM run_limits WHERE run_id=?').get(run.id) as {limits?:string}|undefined;
   const limits:RunLimits=limitsRow?checkStoredLimits(JSON.parse(limitsRow.limits!),run.inputs.mode):resolveRunLimits(undefined,run.inputs.mode);
   const expiresAt=Math.min(Number(control.deadline_at),this.clock()+600000),action:ResumeAction={version:1,kind,runId:run.id,workspaceId:job.authority.workspaceId,actorId:job.authority.actorId,baseVersion:run.base_version,inputDigest:String(control.input_digest),authority:job.authority,limits,connection};
   const actionText=JSON.stringify(action),approvalId=randomUUID(),nonce=randomBytes(16).toString('hex');
   this.queue.store.db.prepare('INSERT INTO run_approvals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(approvalId,run.id,kind,actionText,runDigest(action),action.inputDigest,run.base_version,job.authority.actorId,nonce,expiresAt,'pending',this.clock(),null);
   this.queue.store.db.prepare("UPDATE runs SET state='AWAITING_INPUT',lease_until=0,updated_at=? WHERE id=? AND state='RUNNING'").run(new Date(this.clock()).toISOString(),run.id);
   this.queue.store.db.prepare("UPDATE run_controls SET waiting_kind=?,wait_until=?,pause_count=pause_count+1,worker_id=NULL,phase='waiting',outcome='APPROVAL_PENDING' WHERE run_id=?").run(kind,expiresAt,run.id);
   this.append(run.id,'approval.requested',{kind,approvalId,actionDigest:runDigest(action),expiresAt});
   return this.view(this.queue.store.db.prepare('SELECT a.*,r.model,r.base_version,c.input_digest,c.workspace_id FROM run_approvals a JOIN runs r ON r.id=a.run_id JOIN run_controls c ON c.run_id=a.run_id WHERE a.id=?').get(approvalId) as Record<string,unknown>);
  });
 }
 prepare(authority:RunAuthority,runId:string,nextAuthority:RunAuthority,connection:ConnectionSummary):ApprovalView {
  const run=this.queue.get(authority,runId);this.queue.assertAuthority(authority,run.projectId,true);
  const existing=this.queue.store.db.prepare("SELECT id FROM run_approvals WHERE run_id=? AND state='pending'").get(runId) as {id?:string}|undefined;
  if(existing?.id)this.queue.store.db.prepare("UPDATE run_approvals SET state='invalidated',resolved_at=? WHERE id=? AND state='pending'").run(this.clock(),existing.id);
  const control=this.queue.store.db.prepare('SELECT * FROM run_controls WHERE run_id=?').get(runId) as Record<string,unknown>;
  if(run.state!=='AWAITING_INPUT'||!control)throw new ProjectError('Run is not waiting for input.',409);
  const limitsRow=this.queue.store.db.prepare('SELECT limits FROM run_limits WHERE run_id=?').get(runId) as {limits?:string}|undefined;
  const limits:RunLimits=limitsRow?checkStoredLimits(JSON.parse(limitsRow.limits!),run.mode):resolveRunLimits(undefined,run.mode);
  const action:ResumeAction={version:1,kind:String(control.waiting_kind) as ResumeKind,runId,workspaceId:nextAuthority.workspaceId,actorId:nextAuthority.actorId,baseVersion:run.baseVersion,inputDigest:String(control.input_digest),authority:nextAuthority,limits,connection};
  const id=randomUUID(),nonce=randomBytes(16).toString('hex'),expiresAt=Math.min(Number(control.deadline_at),this.clock()+600000),digest=runDigest(action);
  this.queue.store.db.prepare('INSERT INTO run_approvals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,runId,action.kind,JSON.stringify(action),digest,action.inputDigest,run.baseVersion,nextAuthority.actorId,nonce,expiresAt,'pending',this.clock(),null);
  return this.view(this.queue.store.db.prepare('SELECT a.*,r.model,r.base_version,r.project_id,c.input_digest,c.workspace_id FROM run_approvals a JOIN runs r ON r.id=a.run_id JOIN run_controls c ON c.run_id=a.run_id WHERE a.id=?').get(id) as Record<string,unknown>);
 }
 status(authority:RunAuthority,runId:string):{pending:ApprovalView|null} {
  this.queue.get(authority,runId);this.expire(runId);
  const row=this.queue.store.db.prepare("SELECT a.*,r.model,r.base_version,c.input_digest,c.workspace_id FROM run_approvals a JOIN runs r ON r.id=a.run_id JOIN run_controls c ON c.run_id=a.run_id WHERE a.run_id=? AND a.state='pending'").get(runId) as Record<string,unknown>|undefined;
  return {pending:row?this.view(row):null};
 }
 resolve(authority:RunAuthority,runId:string,resolution:ApprovalResolution,nextAuthority:RunAuthority,connection:ConnectionSummary):{state:string;grantSequence?:number} {
  resolutionSchema.parse(resolution);connectionSchema.parse(connection);
  return this.queue.store.transaction(()=>{
   const row=this.row(authority,runId),action=JSON.parse(String(row.action)) as ResumeAction;
   this.queue.assertAuthority(authority,String(row.project_id),true);
   if(String(row.actor_id)!==authority.actorId)throw new ProjectError('Approval requester or actor is not authorized.',403);
   if(resolution.approvalId!==String(row.id)||resolution.nonce!==String(row.nonce)||resolution.actionDigest!==String(row.action_digest))throw new ProjectError('Approval response does not match the pending action.',409);
   if(Number(row.expires_at)<=this.clock())throw new ProjectError('Approval expired.',409);
   const currentRun=this.queue.store.getRun(action.authority.settingsOwner,String(row.project_id),runId);
   if(currentRun.base_version!==Number(row.base_version)||String(row.input_digest)!==action.inputDigest)throw new ProjectError('Approval input or revision changed; authorize again.',409);
   if(runDigest(authorityKey(nextAuthority))!==runDigest(authorityKey(action.authority))||runDigest(connection)!==runDigest(action.connection))throw new ProjectError('Connection or authorization context changed; authorize again.',409);
   if(resolution.decision==='deny') {
    this.queue.store.db.prepare("UPDATE run_approvals SET state='denied',resolved_at=? WHERE id=? AND state='pending'").run(this.clock(),String(row.id));
    this.queue.store.db.prepare("UPDATE runs SET state='CANCELLED',error='Approval denied.',updated_at=? WHERE id=? AND state='AWAITING_INPUT'").run(new Date(this.clock()).toISOString(),runId);
    this.queue.store.db.prepare("UPDATE run_controls SET waiting_kind=NULL,wait_until=0,phase='cancelled',outcome='APPROVAL_DENIED' WHERE run_id=?").run(runId);
    this.append(runId,'approval.denied',{approvalId:String(row.id),state:'CANCELLED'});return {state:'CANCELLED'};
   }
   const sequence=Number(this.queue.store.db.prepare('SELECT coalesce(max(sequence),0) AS n FROM run_grants WHERE run_id=?').get(runId)?.n)+1;
   this.queue.store.db.prepare("UPDATE run_approvals SET state='approved',resolved_at=? WHERE id=? AND state='pending'").run(this.clock(),String(row.id));
   this.queue.store.db.prepare('INSERT INTO run_grants VALUES(?,?,?,?,?,?,?)').run(runId,sequence,String(row.id),JSON.stringify(nextAuthority),JSON.stringify(action.limits),Math.min(Number(row.expires_at),this.clock()+action.limits.timeoutMs),this.clock());
   this.queue.store.db.prepare("UPDATE runs SET state='QUEUED',updated_at=? WHERE id=? AND state='AWAITING_INPUT'").run(new Date(this.clock()).toISOString(),runId);
   this.queue.store.db.prepare("UPDATE run_controls SET waiting_kind=NULL,wait_until=0,worker_id=NULL,phase='queued',outcome='APPROVAL_GRANTED' WHERE run_id=?").run(runId);
   this.append(runId,'approval.granted',{approvalId:String(row.id),sequence,state:'QUEUED'});return {state:'QUEUED',grantSequence:sequence};
  });
 }
}
