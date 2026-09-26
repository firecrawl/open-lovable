import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const providers = [
  'lib/sandbox/providers/e2b-provider.ts',
  'lib/sandbox/providers/vercel-provider.ts',
];
const required = [
  'lucide-react',
  'react-icons',
  'framer-motion',
  'motion',
  'clsx',
  'classnames',
  'tailwind-merge',
  'lodash-es',
];

test('external preview sandboxes install every dependency allowed by the bounded preview compiler', async () => {
  for (const provider of providers) {
    const source = await readFile(provider, 'utf8');
    for (const dependency of required) {
      assert.ok(source.includes(dependency), `${provider} must install ${dependency}`);
    }
  }
});

test('external preview sandboxes do not rely on the host node_modules for generated UI icons', async () => {
  for (const provider of providers) {
    const source = await readFile(provider, 'utf8');
    assert.match(source, /lucide-react.*\^0\.532\.0/s, `${provider} must pin lucide-react in the sandbox manifest`);
  }
});
