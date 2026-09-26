import { effectiveProvider, type ProviderScope } from '@/lib/settings/store';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { applicationModels, getGatewayConfig, loadModelCatalog, ProviderConfigError, validModelID, type ModelOption } from './provider-catalog';
import { createProviderFetch } from './provider-transport';

/** One server-side resolver for generation, search planning and recovery. Never guesses a provider. */
export async function getProviderForModel(modelId: string, signal?: AbortSignal,scope?:ProviderScope) {
  if (!validModelID(modelId)) throw new ProviderConfigError('Invalid model identifier',400);
  let option: ModelOption | undefined;
  if (modelId.startsWith('gateway/')) {
    const catalog=await loadModelCatalog(signal,scope);
    if(catalog.gateway.status==='unavailable')throw new ProviderConfigError(catalog.gateway.error||'Provider catalog unavailable',503);
    option=catalog.models.find(model => model.id===modelId);
  } else option=applicationModels(scope).find(model => model.id===modelId);
  if (!option) throw new ProviderConfigError('Model is not in the configured provider catalog',400);
  if (!option.configured) throw new ProviderConfigError('Model provider credentials are not configured');
  const actualModel=option.upstreamId;
  if (option.provider==='gateway') {
    const config=getGatewayConfig(scope);
    if (!config) throw new ProviderConfigError('Gateway provider is not configured');
    const client=createOpenAI({baseURL:config.baseURL,apiKey:config.apiKey ?? 'ollama',
      fetch:createProviderFetch(config.baseURL,{allowLoopback:scope?.allowLoopback??true})});
    return {model:client.chat(actualModel),actualModel,option};
  }
  // Vercel gateway has an OpenAI-compatible chat protocol and requires the full provider/model namespace.
  const gatewayKey=!scope&&process.env.AI_GATEWAY_API_KEY?.trim();
  if (gatewayKey) {
    const baseURL='https://ai-gateway.vercel.sh/v1';
    const client=createOpenAI({apiKey:gatewayKey,baseURL,fetch:createProviderFetch(baseURL)});
    const upstream=option.provider==='groq' ? option.upstreamId : option.id;
    return {model:client.chat(upstream),actualModel:upstream,option};
  }
  const settings=effectiveProvider(option.provider,scope);
  switch(option.provider) {
    case 'openai': {
      const baseURL=settings.baseURL || 'https://api.openai.com/v1';
      return {model:createOpenAI({apiKey:settings.apiKey,baseURL,fetch:createProviderFetch(baseURL,{allowLoopback:scope?scope.allowLoopback:Boolean(settings.baseURL)})})(actualModel),actualModel,option};
    }
    case 'anthropic': {
      const baseURL=settings.baseURL || 'https://api.anthropic.com/v1';
      return {model:createAnthropic({apiKey:settings.apiKey,baseURL,fetch:createProviderFetch(baseURL,{allowLoopback:scope?scope.allowLoopback:Boolean(settings.baseURL)})})(actualModel),actualModel,option};
    }
    case 'google': {
      const baseURL=settings.baseURL || 'https://generativelanguage.googleapis.com/v1beta';
      return {model:createGoogleGenerativeAI({apiKey:settings.apiKey,baseURL,fetch:createProviderFetch(baseURL,{allowLoopback:scope?scope.allowLoopback:Boolean(settings.baseURL)})})(actualModel),actualModel,option};
    }
    case 'groq': {
      const baseURL=settings.baseURL || 'https://api.groq.com/openai/v1';
      return {model:createGroq({apiKey:settings.apiKey,baseURL,fetch:createProviderFetch(baseURL,{allowLoopback:scope?scope.allowLoopback:Boolean(settings.baseURL)})})(actualModel),actualModel,option};
    }
  }
}
export default getProviderForModel;
