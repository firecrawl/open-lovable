import { safeLogger } from '@/lib/security/secret-content';
import { streamText } from 'ai';
import {studioAccess} from '@/lib/identity/request';
import {ProjectError} from '@/lib/projects/store';
import { readJsonObject, ClientInputError } from '@/lib/security/input-validation';
import { getProviderForModel } from '@/lib/ai/provider-manager';
import { ProviderConfigError } from '@/lib/ai/provider-catalog';

let inFlight = false;
let lastProbe = 0;
export async function POST(request: Request) {
  let individualClaim=false;
  try {
    const access=await studioAccess(request,new URL(request.url).searchParams.get('projectId')||undefined);if(access instanceof Response)return access;access.requireAdmin();
    if(access.mode==='individual'){
      if(inFlight||Date.now()-lastProbe<3000)return Response.json({success:false,error:'Wait before another model test'},{status:429});
      inFlight=true;individualClaim=true;
    }else access.service!.identity.consumeRate('probe:'+access.workspace.principal.workspaceId,1,3000);
    const body = await readJsonObject(request,4096);
    if (body.confirmTokenUse !== true) throw new ClientInputError('Confirm that this test may consume provider tokens');
    const resolved = await getProviderForModel(body.model,request.signal,access.scope);
    if(individualClaim)lastProbe=Date.now();
    const started=performance.now();
    const result=streamText({model:resolved.model,onError:({error})=>safeLogger.error('Model probe failed',error),prompt:'Reply with READY.',maxOutputTokens:32,maxRetries:0,
      abortSignal:AbortSignal.any([request.signal,AbortSignal.timeout(30000)])});
    let content='';
    for await (const part of result.fullStream) {
      if (part.type==='error') throw part.error;
      if (part.type==='text-delta') {content+=part.text;if(content.length>8192)throw new Error('Probe output limit exceeded');}
      access.requireAdmin();
    }
    if (!content.trim()) throw new Error('Empty provider response');
    return Response.json({success:true,model:resolved.actualModel,provider:resolved.option.provider,
      checkedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started),verified:['text','streaming']}, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const status = error instanceof ProviderConfigError||error instanceof ProjectError ? error.status : error instanceof ClientInputError ? 400 : 502;
    return Response.json({success:false,error:status===502 ? 'Model test failed. Check provider credentials, quota, model support and server logs. No fallback was used.' : (error as Error).message}, {status,headers:{'Cache-Control':'no-store'}});
  } finally {if(individualClaim)inFlight=false;}
}
