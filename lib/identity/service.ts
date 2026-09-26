import {z} from 'zod';
import {ProjectError} from '../projects/store';
import {IdentityStore} from './store';
import {emailSchema,type StoredSession} from './types';
import type {SupabaseIdentityProvider,ProviderUser} from './supabase';
type Provider=Pick<SupabaseIdentityProvider,'binding'|'issuer'|'signIn'|'getUser'|'refresh'|'signOut'|'recover'|'signUp'|'confirm'|'updatePassword'>;
const passwordSchema=z.string().min(12).max(128);
/** Backend-for-frontend sessions; provider access and refresh tokens never leave the server. */
export class AccountService {
 readonly binding:string;
 constructor(readonly identity:IdentityStore,private readonly provider:Provider,private readonly appOrigin:string) {
  this.binding=provider.binding+'&application='+encodeURIComponent(new URL(appOrigin).origin);
 }
 private bind(user:ProviderUser){return this.identity.upsertActor({issuer:this.provider.issuer,subject:user.subject,email:user.email,name:user.name});}
 async login(emailInput:string,password:string,signal?:AbortSignal) {
  const email=emailSchema.parse(emailInput);z.string().min(1).max(1024).parse(password);
  this.identity.consumeRate('auth:global',100,60000);this.identity.consumeRate('login:'+email,5,15*60000);
  const result=await this.provider.signIn(email,password,signal),actor=this.bind(result.user);
  if(!this.identity.listWorkspaces(actor.id).length&&!this.identity.store.db.prepare('SELECT 1 FROM workspace_members WHERE actor_id=?').get(actor.id))this.identity.createWorkspace(actor.id,'Meu workspace');
  const created=this.identity.createSession(actor.id,this.binding,result.tokens);
  const first=this.identity.listWorkspaces(actor.id)[0];if(first)this.identity.selectWorkspace(created.session.id,first.id);
  return created;
 }
 private async refresh(session:StoredSession,signal?:AbortSignal):Promise<StoredSession> {
  const deadline=performance.now()+16000;let latest=session,lease:string|null=null;
  while(performance.now()<deadline){
   signal?.throwIfAborted();latest=this.identity.revalidateSession(session.id);
   if(latest.token_version!==session.token_version)return latest;
   lease=this.identity.claimRefresh(latest);if(lease)break;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(!lease)throw new ProjectError('Session refresh is busy. Retry shortly.',503);
  try {
   const result=await this.provider.refresh(latest.tokens.refresh_token,signal);
   if(result.user.subject!==latest.actor.subject)throw new ProjectError('Session identity changed unexpectedly.',401);
   this.bind(result.user);this.identity.completeRefresh(latest,lease,result.tokens);
   return this.identity.revalidateSession(session.id);
  }catch(error){
   if(error instanceof ProjectError&&(error.status===401||error.status===403))this.identity.revokeSession(session.id,session.actor_id);
   throw error;
  }finally{this.identity.releaseRefresh(session.id,lease);}
 }
 async authenticate(token:string,signal?:AbortSignal,allowRecovery=false):Promise<StoredSession> {
  return this.authenticateStored(this.identity.readSession(token,this.binding),signal,allowRecovery);
 }
 /** Trusted worker entry. No route accepts a session ID as a replacement for the opaque cookie. */
 async authenticateSession(id:string,signal?:AbortSignal):Promise<StoredSession> {
  return this.authenticateStored(this.identity.revalidateSession(id),signal,false);
 }
 private async authenticateStored(initial:StoredSession,signal?:AbortSignal,allowRecovery=false):Promise<StoredSession> {
  if(initial.issuer!==this.binding)throw new ProjectError('Session binding changed. Sign in again.',401);
  let session=initial,refreshed=false;
  if(session.purpose==='recovery'&&!allowRecovery)throw new ProjectError('Complete password recovery before opening projects.',403);
  if(session.access_expires_at<=Date.now()+30000){session=await this.refresh(session,signal);refreshed=true;}
  let user:ProviderUser;
  try{user=await this.provider.getUser(session.tokens.access_token,signal);}
  catch(error){
   if(!refreshed&&error instanceof ProjectError&&error.status===401){session=await this.refresh(session,signal);user=await this.provider.getUser(session.tokens.access_token,signal);}
   else {if(error instanceof ProjectError&&(error.status===401||error.status===403))this.identity.revokeSession(session.id,session.actor_id);throw error;}
  }
  if(user.subject!==session.actor.subject){this.identity.revokeSession(session.id,session.actor_id);throw new ProjectError('Session identity mismatch.',401);}
  this.bind(user);this.identity.touchSession(session.id);return this.identity.revalidateSession(session.id);
 }
 /** Local revocation is effective even when the upstream logout endpoint is unavailable. */
 async logout(token:string):Promise<{upstreamRevoked:boolean}> {
  const session=this.identity.readSession(token,this.binding);this.identity.revokeSession(session.id,session.actor_id);
  try{await this.provider.signOut(session.tokens.access_token);return {upstreamRevoked:true};}
  catch{return {upstreamRevoked:false};}
 }
 async requestRecovery(emailInput:string,signal?:AbortSignal):Promise<void> {
  const email=emailSchema.parse(emailInput);this.identity.consumeRate('auth:global',100,60000);this.identity.consumeRate('recover:'+email,3,15*60000);
  try{await this.provider.recover(email,this.appOrigin+'/auth/confirm',signal);}
  catch(error){if(!(error instanceof ProjectError)||error.status>=500)throw error;}
 }
 async register(emailInput:string,password:string,signal?:AbortSignal):Promise<void> {
  const email=emailSchema.parse(emailInput);passwordSchema.parse(password);this.identity.consumeRate('auth:global',100,60000);this.identity.consumeRate('register:'+email,3,15*60000);
  try{await this.provider.signUp(email,password,this.appOrigin+'/auth/confirm',signal);}
  catch(error){if(!(error instanceof ProjectError)||error.status>=500)throw error;}
 }
 async confirm(tokenHash:string,type:'signup'|'email'|'recovery',signal?:AbortSignal) {
  z.string().regex(/^[a-fA-F0-9]{32,128}$/).parse(tokenHash);
  if(type!=='signup'&&type!=='email'&&type!=='recovery')throw new ProjectError('Invalid confirmation type.');
  this.identity.consumeRate('auth:confirmation',60,60000);
  const result=await this.provider.confirm(tokenHash,type,signal),actor=this.bind(result.user);
  if(type!=='recovery'&&!this.identity.listWorkspaces(actor.id).length&&!this.identity.store.db.prepare('SELECT 1 FROM workspace_members WHERE actor_id=?').get(actor.id))this.identity.createWorkspace(actor.id,'Meu workspace');
  const created=this.identity.createSession(actor.id,this.binding,result.tokens,type==='recovery'?'recovery':'normal');
  const first=this.identity.listWorkspaces(actor.id)[0];if(first&&type!=='recovery')this.identity.selectWorkspace(created.session.id,first.id);
  return created;
 }
 async resetPassword(token:string,password:string,signal?:AbortSignal):Promise<void> {
  passwordSchema.parse(password);const session=await this.authenticate(token,signal,true);
  if(session.purpose!=='recovery')throw new ProjectError('A recent password recovery confirmation is required.',403);
  await this.provider.updatePassword(session.tokens,password,signal);this.identity.revokeAll(session.actor_id);
 }
}
