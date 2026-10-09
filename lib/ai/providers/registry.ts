import { AIProvider, ProviderName } from '../types';
import { OpenRouterProvider } from './openrouter-provider';

// For Phase 2, we only register OpenRouter but prepare for others
const registry = new Map<ProviderName, AIProvider>();

export function registerProvider(name: ProviderName, provider: AIProvider) {
  registry.set(name, provider);
}

export function getProvider(name: ProviderName): AIProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(`AI Provider not found: ${name}`);
  }
  return provider;
}

// Initial registration
registerProvider('openrouter', new OpenRouterProvider());

// Future providers will be registered here or in their own implementations
// registerProvider('openai', new OpenAIProvider());
// ...
