import {authorizeOperatorRequest} from '@/lib/security/operator-access';
import {z} from 'zod';
import {authMode,sessionCookie} from '@/lib/identity/config';
import {accountOrigin,accountFailure,privateJSON,requestCookie} from '@/lib/identity/http';
import {accountService} from '@/lib/identity/factory';
import {readJsonObject} from '@/lib/security/input-validation';
import {ProjectError} from '@/lib/projects/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const credentials={email:z.string().email().max(254),password:z.string().min(1).max(1024)};
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('login'),...credentials}).strict(),
 z.object({action:z.literal('register'),...credentials}).strict(),
 z.object({action:z.literal('recover'),email:credentials.email}).strict(),
 z.object({action:z.literal('logout')}).strict(),
 z.object({action:z.literal('confirm'),tokenHash:z.string().regex(/^[a-fA-F0-9]{32,128}$/),type:z.enum(['signup','email','recovery'])}).strict(),
 z.object({action:z.literal('reset-password'),password:z.string().min(12).max(128)}).strict(),
]);
/** Returns session metadata only. Cookie secrets and provider tokens are never serialized. */
export async function GET(request:Request):Promise<Response> {
 if((process.env.OPEN_LOVABLE_AUTH_MODE||'individual')==='individual'){const denied=await authorizeOperatorRequest(request);if(denied)return denied;}
 try{
  const origin=accountOrigin(request),mode=authMode();
  if(mode==='individual')return privateJSON({mode,authenticated:false});
  const service=accountService(origin),token=requestCookie(request,origin);
  if(!token)return privateJSON({mode,authenticated:false,signupEnabled:process.env.OPEN_LOVABLE_SIGNUP_ENABLED==='1'});
  const session=await service.authenticate(token,request.signal,true);
  return privateJSON({mode,authenticated:true,user:{id:session.actor.id,email:session.actor.email,name:session.actor.name},purpose:session.purpose,selectedWorkspaceId:session.selected_workspace_id,workspaces:service.identity.listWorkspaces(session.actor_id)});
 }catch(error){
  if(error instanceof ProjectError&&error.status===401)return privateJSON({mode:'supabase',authenticated:false});
  return accountFailure(error);
 }
}
/** Credential forms have their own bounded endpoint and never enter model context or application logs. */
export async function POST(request:Request):Promise<Response> {
 if((process.env.OPEN_LOVABLE_AUTH_MODE||'individual')==='individual'){const denied=await authorizeOperatorRequest(request);if(denied)return denied;}
 try{
  const origin=accountOrigin(request),service=accountService(origin);
  const body=schema.parse(await readJsonObject(request,4096,false));
  const token=requestCookie(request,origin);
  if(body.action==='login'){
   const created=await service.login(body.email,body.password,request.signal);
   return privateJSON({success:true},200,{'Set-Cookie':sessionCookie(origin,created.token)});
  }
  if(body.action==='logout'){
   let upstreamRevoked=false;
   if(token)try{upstreamRevoked=(await service.logout(token)).upstreamRevoked;}catch(error){if(!(error instanceof ProjectError)||error.status!==401)throw error;}
   return privateJSON({success:true,upstreamRevoked},200,{'Set-Cookie':sessionCookie(origin,'',true)});
  }
  if(body.action==='recover'){await service.requestRecovery(body.email,request.signal);return privateJSON({success:true,message:'If this address is eligible, follow the account recovery instructions.'},202);}
  if(body.action==='register'){
   if(process.env.OPEN_LOVABLE_SIGNUP_ENABLED!=='1')throw new ProjectError('Registration is not enabled on this installation.',403);
   await service.register(body.email,body.password,request.signal);return privateJSON({success:true,message:'Follow the confirmation instructions when this address is eligible.'},202);
  }
  if(body.action==='confirm'){
   const created=await service.confirm(body.tokenHash,body.type,request.signal);
   return privateJSON({success:true,purpose:created.session.purpose},200,{'Set-Cookie':sessionCookie(origin,created.token)});
  }
  await service.resetPassword(token,body.password,request.signal);
  return privateJSON({success:true},200,{'Set-Cookie':sessionCookie(origin,'',true)});
 }catch(error){return accountFailure(error);}
}
