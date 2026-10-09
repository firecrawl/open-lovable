import { appConfig } from '@/config/app.config';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

type ProviderName = 'openai' | 'anthropic' | 'groq' | 'google' | 'siliconflow';

// Client function type returned by @ai-sdk providers
export type ProviderClient =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGroq>
  | ReturnType<typeof createGoogleGenerativeAI>;

export interface ProviderResolution {
  client: ProviderClient;
  actualModel: string;
}

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
      // Default Anthropic base URL mirrors existing routes
      return { apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1' };
    case 'groq':
      return { apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL };
    case 'google':
      return { apiKey: process.env.GEMINI_API_KEY, baseURL: process.env.GEMINI_BASE_URL };
    case 'siliconflow':
      return { apiKey: process.env.SILICONFLOW_API_KEY, baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1' };
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
    case 'siliconflow':
      client = createOpenAI({ apiKey: effective.apiKey || getEnvDefaults('siliconflow').apiKey, baseURL: effective.baseURL ?? getEnvDefaults('siliconflow').baseURL });
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
  const isSiliconFlow = modelId.startsWith('siliconflow/');
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

  if (isSiliconFlow) {
    const client = getOrCreateClient('siliconflow');
    return { client, actualModel: modelId.replace('siliconflow/', '') };
  }

  // Default: use Groq with modelId as-is
  const client = getOrCreateClient('groq');
  return { client, actualModel: modelId };
}

export default getProviderForModel;


