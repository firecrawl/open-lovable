import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export type ProviderName = 'openai' | 'anthropic' | 'groq' | 'google' | 'openrouter';

export type ProviderClient =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGroq>
  | ReturnType<typeof createGoogleGenerativeAI>;

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
}

export interface ProviderResolution {
  client: ProviderClient;
  actualModel: string;
}

export abstract class AIProvider {
  abstract readonly name: ProviderName;
  abstract getClient(config?: ProviderConfig): ProviderClient;
  abstract resolveModel(modelId: string, config?: ProviderConfig): ProviderResolution;
}
