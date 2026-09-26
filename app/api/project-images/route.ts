import {studioAccess,authenticateStudio} from '@/lib/identity/request';
import {z} from 'zod';
import {readJsonObject,ClientInputError} from '@/lib/security/input-validation';
import {assertNoSecrets,SecretContentError,safeLogger} from '@/lib/security/secret-content';
import {ProjectError} from '@/lib/projects/store';
import {ReferenceImageStore} from '@/lib/projects/images';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('upload'),projectID:z.string().uuid(),name:z.string().min(1).max(160),role:z.enum(['target','current']),data:z.string().max(7*1024*1024)}).strict(),
 z.object({action:z.literal('archive'),projectID:z.string().uuid(),imageID:z.string().uuid()}).strict(),
]);
function failure(error:unknown){
 const status=error instanceof ProjectError||error instanceof SecretContentError?error.status:error instanceof z.ZodError||error instanceof ClientInputError?400:500;
 if(status===500)safeLogger.error('Image operation failed',error);
 return Response.json({error:status===500?'Image operation failed':error instanceof ProjectError?error.message:'Invalid image request'},{status,headers:{'Cache-Control':'no-store'}});
}
/** Metadata never contains bytes; binary reads still require operator and project authorization. */
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams,projectID=query.get('projectID')||'';
  const access=await studioAccess(request,projectID);if(access instanceof Response)return access;
  const {store,owner,guard}=access;guard(projectID);const images=new ReferenceImageStore(store,guard);
  const imageID=query.get('imageID');
  if(!imageID)return Response.json({images:images.list(owner,projectID)},{headers:{'Cache-Control':'no-store'}});
  const image=images.get(owner,projectID,imageID);
  return new Response(new Uint8Array(Buffer.from(image.data,'base64')),{headers:{'Content-Type':image.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(error){return failure(error);}
}
/** Originals are normalized in memory and discarded; no uploaded filename becomes a filesystem path. */
export async function POST(request:Request){
 try{
  const authenticated=await authenticateStudio(request);if(authenticated instanceof Response)return authenticated;
  const body=schema.parse(await readJsonObject(request,8*1024*1024,false));
  // Binary data has a separate decoder; metadata still passes the textual credential check.
  if(body.action==='upload')assertNoSecrets({name:body.name,role:body.role,projectID:body.projectID});
  const access=await studioAccess(request,body.projectID,authenticated);if(access instanceof Response)return access;
  const {store,owner,guard}=access;guard(body.projectID,true);const images=new ReferenceImageStore(store,guard);
  if(body.action==='upload')return Response.json({image:await images.add(owner,body.projectID,body.name,body.role,body.data)},{status:201,headers:{'Cache-Control':'no-store'}});
  images.archive(owner,body.projectID,body.imageID);
  return Response.json({success:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
