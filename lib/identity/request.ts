import {ProjectError,projectStore,operatorID} from '../projects/store';
import {SqliteProjectRepository} from '../persistence/sqlite';
import {authorizeOperatorRequest} from '../security/operator-access';
import {authMode} from './config';
import {accountOrigin,requestCookie} from './http';
import {accountService} from './factory';
import type {WorkspaceContext} from '../contracts/domain';
import type {ProviderScope} from '../settings/store';
import {ID_PATTERN,READ_ROLES,WRITE_ROLES} from '../persistence/validation';
/** Authenticate before consuming uploads. This object is server-created and tied to one Request. */
export async function authenticateStudio(request:Request) {
 const mode=authMode();
 if(mode==='individual'){
  const denied=await authorizeOperatorRequest(request);if(denied)return denied;
 }
 const origin=mode==='supabase'?accountOrigin(request):'';
 const service=mode==='supabase'?accountService(origin):null;
 const session=service?await service.authenticate(requestCookie(request,origin),request.signal):null;
 return {request,mode,origin,service,session};
}
/** Resolves an authenticated request; resource IDs confer no authority. */
export async function studioAccess(request:Request,projectId?:string,authenticated?:Awaited<ReturnType<typeof authenticateStudio>>) {
 const identity=authenticated??await authenticateStudio(request);if(identity instanceof Response)return identity;
 if(identity.request!==request)throw new ProjectError('Invalid request identity.',401);
 const {mode,origin,service,session}=identity,store=projectStore(),repository=new SqliteProjectRepository(store);
 let workspace:WorkspaceContext;
 if(service&&session){
  let workspaceId=session.selected_workspace_id;
  if(projectId){
   if(!ID_PATTERN.test(projectId))throw new ProjectError('Project not found',404);
   workspaceId=String(store.db.prepare('SELECT workspace_id FROM projects WHERE id=?').get(projectId)?.workspace_id||'');
  }
  if(!workspaceId)throw new ProjectError(projectId?'Project not found':'Select or create a workspace.',projectId?404:409);
  try{workspace=service.identity.context(session.actor_id,workspaceId);}
  catch(error){if(projectId&&error instanceof ProjectError&&error.status===404)throw new ProjectError('Project not found',404);throw error;}
 }else workspace=repository.individualContext(operatorID());
 workspace.environment=process.env.NODE_ENV==='production'?'production':'development';
 const guard=(id?:string,write=false)=>{
  if(service&&session)service.identity.revalidateSession(session.id);
  const member=store.db.prepare('SELECT role FROM workspace_members WHERE workspace_id=? AND actor_id=? AND active=1').get(workspace.principal.workspaceId,workspace.principal.actorId);
  if(!member||!READ_ROLES.has(String(member.role)))throw new ProjectError('Project not found',404);
  if(write&&!WRITE_ROLES.has(String(member.role)))throw new ProjectError('Project write access required',403);
  if(id&&(!ID_PATTERN.test(id)||!store.db.prepare('SELECT id FROM projects WHERE id=? AND workspace_id=?').get(id,workspace.principal.workspaceId)))throw new ProjectError('Project not found',404);
 };
 const requireAdmin=()=>{
  if(service&&session)service.identity.revalidateSession(session.id);
  const role=store.db.prepare('SELECT role FROM workspace_members WHERE workspace_id=? AND actor_id=? AND active=1').get(workspace.principal.workspaceId,workspace.principal.actorId)?.role;
  if(role!=='owner'&&role!=='admin')throw new ProjectError('Workspace administrator permission required.',403);
 };
 const settingsOwner=mode==='individual'?operatorID():'workspace:'+workspace.principal.workspaceId;
 const scope:ProviderScope|undefined=mode==='individual'?undefined:{owner:settingsOwner,allowLoopback:process.env.OPEN_LOVABLE_ACCOUNT_ALLOW_LOOPBACK_PROVIDERS==='1'&&['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)};
 const project=projectId?await repository.read({...workspace,projectId}):undefined;
 return {mode,store,repository,workspace,project,owner:project?.owner||settingsOwner,settingsOwner,scope,guard,requireAdmin,service,session};
}
