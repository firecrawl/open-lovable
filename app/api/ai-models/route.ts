import {studioAccess} from '@/lib/identity/request';
import {accountFailure} from '@/lib/identity/http';
import {loadModelCatalog} from '@/lib/ai/provider-catalog';
import {assessCapability,type CapabilityName} from '@/lib/ai/capability-probes';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request):Promise<Response> {
 try{
  const projectId=new URL(request.url).searchParams.get('projectId')||undefined;
  const access=await studioAccess(request,projectId);if(access instanceof Response)return access;
  access.guard(projectId);
  const catalog=await loadModelCatalog(request.signal,access.scope);access.guard(projectId);
  const capability=new URL(request.url).searchParams.get('capability');
  const allowed=['text','coding','vision','tools','reasoning'];
  if(capability&&!allowed.includes(capability))return Response.json({success:false,error:'Invalid capability.'},{status:400});
  const selected=new URL(request.url).searchParams.get('model');
  const model=selected?catalog.models.find(option=>option.id===selected):undefined;
  const capabilityEvidence=capability&&model?assessCapability(model,capability as CapabilityName,catalog.models):undefined;
  return Response.json({...catalog,capabilityEvidence,profile:access.mode,workspaceId:access.workspace.principal.workspaceId},{headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
 }catch(error){return accountFailure(error);}
}
