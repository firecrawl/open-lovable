import { createOpenAI } from '@ai-sdk/openai';
import { ProviderClient, ProviderConfig, ProviderName } from '../types';
import { BaseAIProvider } from './base';

export class OpenRouterProvider extends BaseAIProvider {
  readonly name: ProviderName = 'openrouter';

  protected createClient(config: ProviderConfig): ProviderClient {
    return createOpenAI({
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    });
  }
}
