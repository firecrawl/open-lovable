import { appConfig } from '@/config/app.config';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ProviderName, ProviderClient, ProviderResolution } from './types';
import { getProvider } from './providers/registry';

// Keep legacy exports for compatibility during migration
export type { ProviderName, ProviderClient, ProviderResolution };

const aiGatewayApiKey = process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';
const isUsingAIGateway = !!aiGatewayApiKey;

// Cache provider clients by a stable key to avoid recreating
const clientCache = new Map<string, ProviderClient>();

function getEnvDefaults(provider: ProviderName): { apiKey?: string; baseURL?: string } {
  if (isUsingAIGateway) {
    return { apiKey: aiGatewayApiKey, baseURL: aiGatewayBaseURL };
  }

  switch (provider) {
    case 'openai':
      return { apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL };
    case 'anthropic':
      return { apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1' };
    case 'groq':
      return { apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL };
    case 'google':
      return { apiKey: process.env.GEMINI_API_KEY, baseURL: process.env.GEMINI_BASE_URL };
    case 'openrouter':
      return { apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' };
    default:
      return {};
  }
}

function getOrCreateClient(provider: ProviderName, apiKey?: string, baseURL?: string): ProviderClient {
  const effective = isUsingAIGateway
    ? { apiKey: aiGatewayApiKey, baseURL: aiGatewayBaseURL }
    : { apiKey, baseURL };

  const cacheKey = `${provider}:${effective.apiKey || ''}:${effective.baseURL || ''}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  let client: ProviderClient;
  switch (provider) {
    case 'openai':
      client = createOpenAI({ apiKey: effective.apiKey || getEnvDefaults('openai').apiKey, baseURL: effective.baseURL ?? getEnvDefaults('openai').baseURL });
      break;
    case 'anthropic':
      client = createAnthropic({ apiKey: effective.apiKey || getEnvDefaults('anthropic').apiKey, baseURL: effective.baseURL ?? getEnvDefaults('anthropic').baseURL });
      break;
    case 'groq':
      client = createGroq({ apiKey: effective.apiKey || getEnvDefaults('groq').apiKey, baseURL: effective.baseURL ?? getEnvDefaults('groq').baseURL });
      break;
    case 'google':
      client = createGoogleGenerativeAI({ apiKey: effective.apiKey || getEnvDefaults('google').apiKey, baseURL: effective.baseURL ?? getEnvDefaults('google').baseURL });
      break;
    case 'openrouter':
      // Use the new provider abstraction for OpenRouter
      const openrouter = getProvider('openrouter');
      client = openrouter.getClient(effective);
      break;
    default:
      client = createGroq({ apiKey: effective.apiKey || getEnvDefaults('groq').apiKey, baseURL: effective.baseURL ?? getEnvDefaults('groq').baseURL });
  }

  clientCache.set(cacheKey, client);
  return client;
}

export function getProviderForModel(modelId: string): ProviderResolution {
  // 1) Check explicit model configuration in app config (custom models)
  const configured = appConfig.ai.modelApiConfig?.[modelId as keyof typeof appConfig.ai.modelApiConfig];
  if (configured) {
    const { provider, apiKey, baseURL, model } = configured as { provider: ProviderName; apiKey?: string; baseURL?: string; model: string };
    const client = getOrCreateClient(provider, apiKey, baseURL);
    return { client, actualModel: model };
  }

  // 2) Fallback logic based on prefixes and special cases
  const isAnthropic = modelId.startsWith('anthropic/');
  const isOpenAI = modelId.startsWith('openai/');
  const isGoogle = modelId.startsWith('google/');
  const isOpenRouter = modelId.startsWith('openrouter/') || modelId.startsWith('qwen/') || modelId.startsWith('deepseek/');
  const isKimiGroq = modelId === 'moonshotai/kimi-k2-instruct-0905';

  if (isKimiGroq) {
    const client = getOrCreateClient('groq');
    return { client, actualModel: 'moonshotai/kimi-k2-instruct-0905' };
  }

  if (isAnthropic) {
    const client = getOrCreateClient('anthropic');
    return { client, actualModel: modelId.replace('anthropic/', '') };
  }

  if (isOpenAI) {
    const client = getOrCreateClient('openai');
    return { client, actualModel: modelId.replace('openai/', '') };
  }

  if (isGoogle) {
    const client = getOrCreateClient('google');
    return { client, actualModel: modelId.replace('google/', '') };
  }

  if (isOpenRouter) {
    const client = getOrCreateClient('openrouter');
    // For OpenRouter, we often want the full model ID (e.g. qwen/qwen3-coder)
    return { client, actualModel: modelId.startsWith('openrouter/') ? modelId.replace('openrouter/', '') : modelId };
  }

  // Default: use OpenRouter with modelId as-is
  const client = getOrCreateClient('openrouter');
  return { client, actualModel: modelId };
}

export default getProviderForModel;
