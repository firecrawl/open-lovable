import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {WorkspaceContext,WorkspaceRole} from '../contracts/domain';
import {ProjectError,ProjectStore} from '../projects/store';
import {assertNoSecrets} from '../security/secret-content';
import {legacyIdentifier} from '../persistence/workspaces';
import {decodeAuthTokens,encodeAuthTokens} from './crypto';
import {emailSchema,authTokensSchema,type AuthTokens,type VerifiedActor,type StoredSession,type WorkspaceSummary,type MemberSummary} from './types';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const inviteRoles=new Set(['admin','editor','viewer','billing']);
const sessionError=()=>new ProjectError('Session expired or unavailable. Sign in again.',401);
/** Identity and membership share the canonical control-plane database. */
export class IdentityStore {
 constructor(readonly store:ProjectStore,private readonly key:Buffer,private readonly clock:()=>number=Date.now) {
  if(key.length!==32)throw new ProjectError('Identity master key must have 32 bytes.',503);
 }
 private audit(actor:string,workspace:string|null,action:string,target:string):void {
  this.store.db.prepare('INSERT INTO identity_audit(actor_id,workspace_id,action,target_id,created_at) VALUES(?,?,?,?,?)').run(actor,workspace,action,target,new Date(this.clock()).toISOString());
 }
 /** Only the configured identity adapter may supply these already-verified subject claims. */
 upsertActor(input:{issuer:string;subject:string;email:string;name?:string}):VerifiedActor {
  const subject=z.string().uuid().parse(input.subject),email=emailSchema.parse(input.email);
  const issuer=z.string().url().max(2048).parse(input.issuer),name=(input.name||email).slice(0,120);
  const id=legacyIdentifier('actor',digest(issuer+'\0'+subject));
  this.store.db.prepare('INSERT INTO identity_actors(id,issuer,subject,email,name,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(issuer,subject) DO UPDATE SET email=excluded.email,name=excluded.name').run(id,issuer,subject,email,name,new Date(this.clock()).toISOString());
  return this.actor(id);
 }
 actor(id:string):VerifiedActor {
  const row=this.store.db.prepare('SELECT * FROM identity_actors WHERE id=? AND active=1').get(id);
  if(!row)throw sessionError();return row as unknown as VerifiedActor;
 }
 /** The cookie is opaque; only its digest and encrypted upstream tokens are persisted. */
 createSession(actorId:string,issuer:string,tokens:AuthTokens,purpose:'normal'|'recovery'='normal'):{token:string;session:StoredSession} {
  const actor=this.actor(actorId);if(issuer!==actor.issuer&&!issuer.startsWith(actor.issuer+'#'))throw sessionError();const valid=authTokensSchema.parse(tokens);
  const id=randomUUID(),token=randomBytes(32).toString('base64url'),now=this.clock();
  this.store.transaction(()=>{
   this.store.db.prepare('DELETE FROM auth_sessions WHERE expires_at<? OR revoked_at IS NOT NULL').run(now-86400000);
   const rows=this.store.db.prepare('SELECT id FROM auth_sessions WHERE actor_id=? AND revoked_at IS NULL ORDER BY created_at DESC').all(actorId);
   for(const row of rows.slice(9))this.store.db.prepare('UPDATE auth_sessions SET revoked_at=?,encrypted=? WHERE id=?').run(now,'',String(row.id));
   this.store.db.prepare('INSERT INTO auth_sessions(id,token_hash,actor_id,issuer,actor_version,encrypted,access_expires_at,expires_at,last_seen_at,purpose,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,digest(token),actorId,issuer,actor.version,encodeAuthTokens(this.key,id,actorId,issuer,valid),now+valid.expires_in*1000,now+(purpose==='recovery'?15*60000:12*3600000),now,purpose,new Date(now).toISOString());
   this.audit(actorId,null,'session.created',id);
  });
  return {token,session:this.readSession(token,issuer)};
 }
 private decode(row:Record<string,unknown>|undefined):StoredSession {
  if(!row||row.revoked_at!==null||Number(row.expires_at)<=this.clock()||Number(row.last_seen_at)+2*3600000<=this.clock())throw sessionError();
  const actor=this.actor(String(row.actor_id));if(actor.version!==row.actor_version)throw sessionError();
  const {encrypted,token_hash:ignored,...publicFields}=row;void ignored;
  return {...publicFields,actor,tokens:decodeAuthTokens(this.key,String(row.id),actor.id,String(row.issuer),String(encrypted))} as unknown as StoredSession;
 }
 readSession(token:string,issuer:string):StoredSession {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw sessionError();
  return this.decode(this.store.db.prepare('SELECT * FROM auth_sessions WHERE token_hash=? AND issuer=?').get(digest(token),issuer));
 }
 revalidateSession(id:string):StoredSession {return this.decode(this.store.db.prepare('SELECT * FROM auth_sessions WHERE id=?').get(id));}
 touchSession(id:string):void {this.revalidateSession(id);this.store.db.prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=?').run(this.clock(),id);}
 revokeSession(id:string,actorId:string):void {
  this.store.transaction(()=>{this.store.db.prepare('UPDATE auth_sessions SET revoked_at=?,encrypted=?,refresh_lease=NULL,refresh_until=0 WHERE id=? AND actor_id=?').run(this.clock(),'',id,actorId);this.audit(actorId,null,'session.revoked',id);});
 }
 revokeAll(actorId:string):void {this.store.transaction(()=>{this.store.db.prepare('UPDATE auth_sessions SET revoked_at=?,encrypted=?,refresh_lease=NULL WHERE actor_id=?').run(this.clock(),'',actorId);this.audit(actorId,null,'sessions.revoked',actorId);});}
 /** A durable lease prevents two requests from consuming the same refresh token. */
 claimRefresh(session:StoredSession):string|null {
  const lease=randomUUID(),now=this.clock();
  const result=this.store.db.prepare('UPDATE auth_sessions SET refresh_lease=?,refresh_until=? WHERE id=? AND token_version=? AND revoked_at IS NULL AND refresh_until<=?').run(lease,now+45000,session.id,session.token_version,now);
  return Number(result.changes)===1?lease:null;
 }
 completeRefresh(session:StoredSession,lease:string,tokens:AuthTokens):void {
  const valid=authTokensSchema.parse(tokens);this.revalidateSession(session.id);
  const changed=this.store.db.prepare('UPDATE auth_sessions SET encrypted=?,access_expires_at=?,token_version=token_version+1,refresh_lease=NULL,refresh_until=0 WHERE id=? AND refresh_lease=? AND token_version=? AND revoked_at IS NULL').run(encodeAuthTokens(this.key,session.id,session.actor_id,session.issuer,valid),this.clock()+valid.expires_in*1000,session.id,lease,session.token_version);
  if(Number(changed.changes)!==1)throw new ProjectError('Session refresh conflict. Retry the request.',409);
 }
 releaseRefresh(id:string,lease:string):void {this.store.db.prepare('UPDATE auth_sessions SET refresh_lease=NULL,refresh_until=0 WHERE id=? AND refresh_lease=?').run(id,lease);}
 selectWorkspace(sessionId:string,workspaceId:string):void {
  const session=this.revalidateSession(sessionId);this.context(session.actor_id,workspaceId);
  this.store.db.prepare('UPDATE auth_sessions SET selected_workspace_id=? WHERE id=? AND revoked_at IS NULL').run(workspaceId,sessionId);
 }
 listWorkspaces(actorId:string):WorkspaceSummary[] {
  this.actor(actorId);return this.store.db.prepare('SELECT w.id,w.name,m.role,m.version FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.actor_id=? AND m.active=1 ORDER BY w.created_at,w.id LIMIT 100').all(actorId) as unknown as WorkspaceSummary[];
 }
 context(actorId:string,workspaceId:string):WorkspaceContext {
  const actor=this.actor(actorId),member=this.store.db.prepare('SELECT role FROM workspace_members WHERE actor_id=? AND workspace_id=? AND active=1').get(actorId,workspaceId);
  if(!member)throw new ProjectError('Workspace access not found.',404);
  return {principal:{actorId,workspaceId,roles:[member.role as WorkspaceRole],sessionVersion:actor.version},requestId:randomUUID(),environment:'development',policyVersion:1};
 }
 private admin(actorId:string,workspaceId:string):WorkspaceRole {
  const role=this.context(actorId,workspaceId).principal.roles[0];
  if(role!=='owner'&&role!=='admin')throw new ProjectError('Workspace administrator permission required.',403);return role;
 }
 createWorkspace(actorId:string,name:string):WorkspaceSummary {
  this.actor(actorId);if(typeof name!=='string'||!name.trim()||name.length>120)throw new ProjectError('Provide a workspace name up to 120 characters.');assertNoSecrets(name);
  return this.store.transaction(()=>{
   if(this.listWorkspaces(actorId).length>=25)throw new ProjectError('Workspace limit reached.',413);
   const id=randomUUID();this.store.db.prepare('INSERT INTO workspaces(id,legacy_owner,name,created_at) VALUES(?,NULL,?,?)').run(id,name.trim(),new Date(this.clock()).toISOString());
   this.store.db.prepare('INSERT INTO workspace_members(workspace_id,actor_id,role,active,version) VALUES(?,?,?,1,1)').run(id,actorId,'owner');
   this.audit(actorId,id,'workspace.created',id);return {id,name:name.trim(),role:'owner',version:1};
  });
 }
 members(actorId:string,workspaceId:string):MemberSummary[] {
  this.admin(actorId,workspaceId);
  return this.store.db.prepare('SELECT m.actor_id AS actorId,a.email,a.name,m.role,m.active,m.version FROM workspace_members m LEFT JOIN identity_actors a ON a.id=m.actor_id WHERE m.workspace_id=? ORDER BY m.role,a.email LIMIT 500').all(workspaceId) as unknown as MemberSummary[];
 }
 invites(actorId:string,workspaceId:string) {
  this.admin(actorId,workspaceId);return this.store.db.prepare('SELECT id,email,role,expires_at,consumed_at,cancelled_at,created_at FROM workspace_invites WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100').all(workspaceId);
 }
 invite(actorId:string,workspaceId:string,emailInput:string,role:WorkspaceRole):{id:string;token:string;expiresAt:number} {
  const email=emailSchema.parse(emailInput);if(!inviteRoles.has(role))throw new ProjectError('Invitation role is not allowed.',403);
  return this.store.transaction(()=>{
   const authority=this.admin(actorId,workspaceId);if(authority!=='owner'&&role==='admin')throw new ProjectError('Only the owner can grant administrator role.',403);
   const count=Number(this.store.db.prepare('SELECT count(*) AS n FROM workspace_invites WHERE workspace_id=? AND created_at>?').get(workspaceId,new Date(this.clock()-86400000).toISOString())?.n);
   if(count>=100)throw new ProjectError('Invitation rate limit reached.',429);
   const id=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=this.clock()+86400000;
   this.store.db.prepare('UPDATE workspace_invites SET cancelled_at=? WHERE workspace_id=? AND email=? AND consumed_at IS NULL AND cancelled_at IS NULL').run(this.clock(),workspaceId,email);
   this.store.db.prepare('INSERT INTO workspace_invites(id,workspace_id,email,role,token_hash,created_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,workspaceId,email,role,digest(token),actorId,expiresAt,new Date(this.clock()).toISOString());
   this.audit(actorId,workspaceId,'invitation.created',id);return {id,token,expiresAt};
  });
 }
 cancelInvite(actorId:string,workspaceId:string,id:string):void {
  this.store.transaction(()=>{this.admin(actorId,workspaceId);this.store.db.prepare('UPDATE workspace_invites SET cancelled_at=? WHERE id=? AND workspace_id=? AND consumed_at IS NULL').run(this.clock(),id,workspaceId);this.audit(actorId,workspaceId,'invitation.cancelled',id);});
 }
 /** Email-bound capabilities are consumed in the same transaction as membership creation. */
 acceptInvite(actorId:string,token:string):WorkspaceSummary {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ProjectError('Invitation is invalid or expired.',404);
  return this.store.transaction(()=>{
   const actor=this.actor(actorId),row=this.store.db.prepare('SELECT * FROM workspace_invites WHERE token_hash=? AND email=? AND expires_at>? AND consumed_at IS NULL AND cancelled_at IS NULL').get(digest(token),actor.email,this.clock());
   if(!row)throw new ProjectError('Invitation is invalid or expired.',404);
   const workspace=String(row.workspace_id),authority=this.admin(String(row.created_by),workspace);
   if(row.role==='admin'&&authority!=='owner')throw new ProjectError('Invitation issuer no longer has permission.',403);
   const previous=this.store.db.prepare('SELECT role,active FROM workspace_members WHERE workspace_id=? AND actor_id=?').get(workspace,actorId);
   if(previous?.active===1)throw new ProjectError('Already a member; use explicit role management.',409);
   if(this.listWorkspaces(actorId).length>=25)throw new ProjectError('Workspace limit reached.',413);
   this.store.db.prepare('INSERT INTO workspace_members(workspace_id,actor_id,role,active,version) VALUES(?,?,?,1,1) ON CONFLICT(workspace_id,actor_id) DO UPDATE SET role=excluded.role,active=1,version=workspace_members.version+1').run(workspace,actorId,String(row.role));
   this.store.db.prepare('UPDATE workspace_invites SET consumed_at=? WHERE id=?').run(this.clock(),String(row.id));this.audit(actorId,workspace,'invitation.accepted',String(row.id));
   return this.listWorkspaces(actorId).find(item=>item.id===workspace)!;
  });
 }
 changeMember(actorId:string,workspaceId:string,target:string,role:WorkspaceRole,version:number):void {this.mutateMember(actorId,workspaceId,target,role,version,false);}
 revokeMember(actorId:string,workspaceId:string,target:string,version:number):void {this.mutateMember(actorId,workspaceId,target,null,version,true);}
 private mutateMember(actorId:string,workspaceId:string,target:string,role:WorkspaceRole|null,version:number,revoke:boolean):void {
  this.store.transaction(()=>{
   const authority=this.admin(actorId,workspaceId),member=this.store.db.prepare('SELECT role,version FROM workspace_members WHERE workspace_id=? AND actor_id=?').get(workspaceId,target);
   if(!member)throw new ProjectError('Member not found.',404);if(member.version!==version)throw new ProjectError('Member version conflict. Reload.',409);
   if(member.role==='owner')throw new ProjectError('Workspace owner cannot be changed by this operation.',403);
   if(role==='owner'||(!revoke&&!inviteRoles.has(role!))||(authority!=='owner'&&(member.role==='admin'||role==='admin'))||actorId===target)throw new ProjectError('Insufficient permission for this role change.',403);
   this.store.db.prepare('UPDATE workspace_members SET role=?,active=?,version=version+1 WHERE workspace_id=? AND actor_id=? AND version=?').run(revoke?String(member.role):role!,revoke?0:1,workspaceId,target,version);
   this.audit(actorId,workspaceId,revoke?'membership.revoked':'membership.changed',target);
  });
 }
 /** Persistent bounded counters do not retain the email/IP-like identifier in plaintext. */
 consumeRate(scope:string,limit:number,windowMs:number):void {
  const bucket=createHmac('sha256',this.key).update('rate:v1:'+scope).digest('hex'),now=this.clock();
  this.store.transaction(()=>{
   this.store.db.prepare('DELETE FROM identity_rate_limits WHERE expires_at<=?').run(now);
   const row=this.store.db.prepare('SELECT count FROM identity_rate_limits WHERE bucket=?').get(bucket);
   if(Number(row?.count||0)>=limit)throw new ProjectError('Too many attempts. Try again later.',429);
   if(!row&&Number(this.store.db.prepare('SELECT count(*) AS n FROM identity_rate_limits').get()?.n)>=10000)throw new ProjectError('Rate limit capacity reached. Try later.',429);
   this.store.db.prepare('INSERT INTO identity_rate_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(bucket,now+windowMs);
  });
 }
}
