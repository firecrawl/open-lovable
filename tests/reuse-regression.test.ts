import test from 'node:test';
import assert from 'node:assert/strict';
import { getProviderForModel } from '../lib/ai/provider-manager';
import { zipExportManifest } from '../lib/sandbox/project-export';

test('unknown model identifiers never fall back to a different provider', async () => {
  await assert.rejects(async () => getProviderForModel('unknown/not-configured'), /model|provider/i);
});

test('export blocks credentials embedded in ordinary source files without changing the source', () => {
  const source = 'export const credential = "ghp_' + 'x'.repeat(36) + '";';
  const raw = JSON.stringify({files:[{path:'src/config.ts',base64:Buffer.from(source).toString('base64')}],excluded:[]});
  assert.throws(() => zipExportManifest(raw), /credential|secret/i);
  assert.equal(Buffer.from(JSON.parse(raw).files[0].base64,'base64').toString(), source);
});
