import assert from 'node:assert/strict';
import test from 'node:test';

import { getEnvPrompts } from '../lib/prompts.js';

const secretNames = new Set([
  'firecrawlApiKey',
  'e2bApiKey',
  'vercelToken',
  'anthropicApiKey',
  'openaiApiKey',
  'geminiApiKey',
  'groqApiKey'
]);

test('API key prompts mask terminal input', () => {
  const prompts = [...getEnvPrompts('e2b'), ...getEnvPrompts('vercel')];
  const secretPrompts = prompts.filter((prompt) => secretNames.has(prompt.name));

  assert.deepEqual(new Set(secretPrompts.map((prompt) => prompt.name)), secretNames);
  for (const prompt of secretPrompts) {
    assert.equal(prompt.type, 'password', prompt.name);
    assert.equal(prompt.mask, '*', prompt.name);
  }
});
