import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const providerManager = readFileSync('lib/ai/provider-manager.ts', 'utf8');
const appConfig = readFileSync('config/app.config.ts', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const analyzeEditIntentRoute = readFileSync('app/api/analyze-edit-intent/route.ts', 'utf8');
const generateCodeRoute = readFileSync('app/api/generate-ai-code-stream/route.ts', 'utf8');

assert.match(providerManager, /type ProviderName = .*'siliconflow'/s);
assert.match(providerManager, /SILICONFLOW_API_KEY/);
assert.match(providerManager, /SILICONFLOW_BASE_URL/);
assert.match(providerManager, /https:\/\/api\.siliconflow\.cn\/v1/);
assert.match(providerManager, /modelId\.startsWith\('siliconflow\/'\)/);

assert.match(appConfig, /'siliconflow\/Qwen\/Qwen3\.6-27B'/);
assert.match(appConfig, /provider:\s*'siliconflow'/);
assert.match(appConfig, /model:\s*'Qwen\/Qwen3\.6-27B'/);

assert.match(envExample, /SILICONFLOW_API_KEY/);
assert.match(envExample, /SILICONFLOW_BASE_URL/);

for (const route of [analyzeEditIntentRoute, generateCodeRoute]) {
  assert.match(route, /SILICONFLOW_API_KEY/);
  assert.match(route, /SILICONFLOW_BASE_URL/);
  assert.match(route, /model\.startsWith\('siliconflow\/'\)/);
}

assert.match(analyzeEditIntentRoute, /siliconflow\(model\.replace\('siliconflow\/', ''\)\)/);
assert.match(generateCodeRoute, /isSiliconFlow \? siliconflow/);
assert.match(generateCodeRoute, /actualModel = model\.replace\('siliconflow\/', ''\)/);
assert.match(generateCodeRoute, /model\.includes\('siliconflow'\)/);
assert.match(generateCodeRoute, /completionClient = siliconflow/);
assert.match(generateCodeRoute, /completionModelName = model\.replace\('siliconflow\/', ''\)/);

console.log('SiliconFlow provider configuration is present.');
