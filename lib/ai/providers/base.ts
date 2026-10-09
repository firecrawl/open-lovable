import { AIProvider, ProviderClient, ProviderConfig, ProviderName, ProviderResolution } from '../types';

export abstract class BaseAIProvider extends AIProvider {
  protected clientCache = new Map<string, ProviderClient>();

  abstract readonly name: ProviderName;

  protected abstract createClient(config: ProviderConfig): ProviderClient;

  getClient(config: ProviderConfig = {}): ProviderClient {
    const cacheKey = `${this.name}:${config.apiKey || ''}:${config.baseURL || ''}`;
    const cached = this.clientCache.get(cacheKey);
    if (cached) return cached;

    const client = this.createClient(config);
    this.clientCache.set(cacheKey, client);
    return client;
  }

  resolveModel(modelId: string, config: ProviderConfig = {}): ProviderResolution {
    const client = this.getClient(config);
    // Default implementation assumes modelId is ready for the provider
    // unless the provider name is prefixed (handled by manager or specialized providers)
    return {
      client,
      actualModel: modelId.includes('/') ? modelId.split('/')[1] : modelId
    };
  }
}
