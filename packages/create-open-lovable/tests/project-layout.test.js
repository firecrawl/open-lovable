import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MAIN_PROJECT_ITEMS,
  resolveMainProjectRoot
} from '../lib/project-layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, '../templates');
const expectedRoot = path.resolve(here, '../../..');

test('fallback main project root resolves to repository root', () => {
  assert.equal(resolveMainProjectRoot(templatesDir), expectedRoot);
});

test('fallback copy list tracks current project structure', () => {
  assert.ok(MAIN_PROJECT_ITEMS.includes('eslint.config.mjs'));
  assert.ok(MAIN_PROJECT_ITEMS.includes('next.config.ts'));
  assert.ok(MAIN_PROJECT_ITEMS.includes('hooks'));
  assert.ok(MAIN_PROJECT_ITEMS.includes('utils'));
  assert.ok(!MAIN_PROJECT_ITEMS.includes('.eslintrc.json'));
  assert.ok(!MAIN_PROJECT_ITEMS.includes('next.config.js'));
});
