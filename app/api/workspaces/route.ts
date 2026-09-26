import {authorizeOperatorRequest} from '@/lib/security/operator-access';
import {z} from 'zod';
import {accountOrigin,accountFailure,privateJSON,requestCookie} from '@/lib/identity/http';
import {accountService} from '@/lib/identity/factory';
import {readJsonObject} from '@/lib/security/input-validation';
const id=z.string().uuid(),version=z.number().int().min(1);
const role=z.enum(['owner','admin','editor','viewer','billing']);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:z.string().min(1).max(120)}).strict(),
 z.object({action:z.literal('select'),workspaceId:id}).strict(),
 z.object({action:z.literal('invite'),workspaceId:id,email:z.string().email().max(254),role}).strict(),
 z.object({action:z.literal('accept-invite'),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict(),
 z.object({action:z.literal('cancel-invite'),workspaceId:id,inviteId:id}).strict(),
 z.object({action:z.literal('change-member'),workspaceId:id,actorId:id,role,version}).strict(),
 z.object({action:z.literal('revoke-member'),workspaceId:id,actorId:id,version}).strict(),
]);
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response> {
 if((process.env.OPEN_LOVABLE_AUTH_MODE||'individual')==='individual'){const denied=await authorizeOperatorRequest(request);if(denied)return denied;}
 try{
  const origin=accountOrigin(request),service=accountService(origin);
  const session=await service.authenticate(requestCookie(request,origin),request.signal);
  const workspaceId=new URL(request.url).searchParams.get('id');
  if(!workspaceId)return privateJSON({workspaces:service.identity.listWorkspaces(session.actor_id),selectedWorkspaceId:session.selected_workspace_id});
  return privateJSON({members:service.identity.members(session.actor_id,id.parse(workspaceId)),invitations:service.identity.invites(session.actor_id,workspaceId)});
 }catch(error){return accountFailure(error);}
}
/** Management decisions are checked against current database membership, never body-supplied roles. */
export async function POST(request:Request):Promise<Response> {
 if((process.env.OPEN_LOVABLE_AUTH_MODE||'individual')==='individual'){const denied=await authorizeOperatorRequest(request);if(denied)return denied;}
 try{
  const origin=accountOrigin(request),service=accountService(origin);
  const session=await service.authenticate(requestCookie(request,origin),request.signal);
  const body=schema.parse(await readJsonObject(request,4096,false)),identity=service.identity,actor=session.actor_id;
  identity.revalidateSession(session.id);identity.consumeRate('workspace:'+actor,120,60000);
  switch(body.action){
   case 'create':{
    const workspace=identity.createWorkspace(actor,body.name);identity.selectWorkspace(session.id,workspace.id);
    return privateJSON({workspace},201);
   }
   case 'select':identity.selectWorkspace(session.id,body.workspaceId);return privateJSON({success:true});
   case 'invite':{
    const invitation=identity.invite(actor,body.workspaceId,body.email,body.role);
    return privateJSON({invitation,delivery:'LINK_CREATED_NOT_EMAILED'},201);
   }
   case 'accept-invite':{
    const workspace=identity.acceptInvite(actor,body.token);identity.selectWorkspace(session.id,workspace.id);
    return privateJSON({workspace});
   }
   case 'cancel-invite':identity.cancelInvite(actor,body.workspaceId,body.inviteId);return privateJSON({success:true});
   case 'change-member':identity.changeMember(actor,body.workspaceId,body.actorId,body.role,body.version);return privateJSON({success:true});
   case 'revoke-member':identity.revokeMember(actor,body.workspaceId,body.actorId,body.version);return privateJSON({success:true});
  }
 }catch(error){return accountFailure(error);}
}
