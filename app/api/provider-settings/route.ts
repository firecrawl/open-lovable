import { validateProviderURL } from '@/lib/ai/provider-transport';
import { z } from 'zod';
import {studioAccess} from '@/lib/identity/request';
import { readJsonObject, ClientInputError } from '@/lib/security/input-validation';
import { credentialStore, providerIDs, effectiveProvider } from '@/lib/settings/store';
import { ProjectError } from '@/lib/projects/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({provider:z.enum(providerIDs),version:z.number().int().min(0),enabled:z.boolean(),baseURL:z.string().max(2048).optional(),apiKey:z.string().max(8192).optional(),clearKey:z.boolean().optional(),models:z.array(z.string().max(200)).max(500).optional()}).strict();
export async function GET(request:Request) {
 try {
  const access=await studioAccess(request,new URL(request.url).searchParams.get('projectId')||undefined);if(access instanceof Response)return access;access.requireAdmin();
  const saved=credentialStore().metadata(access.settingsOwner);
  return Response.json({providers:providerIDs.map(provider=>{
   const value=effectiveProvider(provider,access.scope);if(value.baseURL)validateProviderURL(value.baseURL,access.scope?.allowLoopback??true);const metadata=saved.find(item=>item.provider===provider);
   return {provider,version:metadata?.version||0,source:value.source,enabled:value.enabled,baseURL:value.baseURL,credentialConfigured:Boolean(value.apiKey),models:value.models||[]};
  })},{headers:{'Cache-Control':'no-store'}});
 }catch(error) {if(error instanceof ProjectError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});return Response.json({error:'Unable to read encrypted settings. Check the private data directory and master key.'},{status:503});}
}
export async function POST(request:Request) {
 try {
  const access=await studioAccess(request,new URL(request.url).searchParams.get('projectId')||undefined);if(access instanceof Response)return access;access.requireAdmin();
  // This dedicated credential endpoint accepts bounded secrets; it never logs or returns their values.
  const body=schema.parse(await readJsonObject(request,16384,false));
  if(effectiveProvider(body.provider,access.scope).source==='environment')throw new ProjectError('This provider is managed by environment variables. Remove the deployment override before editing it here.',409);
  access.requireAdmin();if(body.baseURL)validateProviderURL(body.baseURL,access.scope?.allowLoopback??true);
  credentialStore().save(access.settingsOwner,body.provider,body.version,body);
  return Response.json({success:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error) {
  const status=error instanceof ProjectError?error.status:error instanceof ClientInputError||error instanceof z.ZodError?400:400;
  return Response.json({error:error instanceof ProjectError?error.message:'Invalid settings. Use an HTTPS endpoint or explicitly configured loopback, and review the fields.'},{status,headers:{'Cache-Control':'no-store'}});
 }
}
