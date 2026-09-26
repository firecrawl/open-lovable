import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { SandboxManager, sandboxManager } from '../lib/sandbox/sandbox-manager';
import { SandboxFactory } from '../lib/sandbox/factory';
import type { SandboxProvider } from '../lib/sandbox/types';
import { ClientInputError, publicErrorMessage, requireHttpUrl } from '../lib/security/input-validation';
import { MAX_MAJOR_CHANGES, recordMajorChange } from '../lib/conversation/history';
import { POST as createSandbox } from '../app/api/create-ai-sandbox-v2/route';
import { POST as killSandbox } from '../app/api/kill-sandbox/route';
import { POST as detectAndInstall } from '../app/api/detect-and-install-packages/route';
import { POST as reportViteError } from '../app/api/report-vite-error/route';
import { POST as conversationState } from '../app/api/conversation-state/route';
import { POST as scrapeWebsite } from '../app/api/scrape-website/route';

const originalEnvironment = { ...process.env };
const originalCreate = SandboxFactory.create;
afterEach(async () => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  SandboxFactory.create = originalCreate;
  await sandboxManager.terminateAll();
  global.activeSandbox = null;
  global.activeSandboxProvider = null;
  global.sandboxData = null;
  global.conversationState = null;
});

function localRequest(path: string, body?: unknown) {
  Object.assign(process.env, { NODE_ENV: 'development' });
  return new NextRequest(`http://localhost:3000/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function fakeProvider(id: string, options: { failSetup?: boolean } = {}) {
  const state = { terminated: 0 };
  const provider = {
    async createSandbox() { return { sandboxId: id, url: `https://${id}.example.test`, provider: 'fake', createdAt: new Date() }; },
    async setupViteApp() { if (options.failSetup) throw new Error('setup exploded at /internal/path'); },
    async terminate() { state.terminated += 1; },
    getSandboxInfo() { return null; },
  } as unknown as SandboxProvider;
  return { provider, state };
}

test('sandbox manager stays bounded and evicts the least recently used sandbox, never the active one', async () => {
  const manager = new SandboxManager(2);
  const a = fakeProvider('a');
  const b = fakeProvider('b');
  const c = fakeProvider('c');
  await manager.registerSandbox('a', a.provider);
  await manager.registerSandbox('b', b.provider);
  manager.getProvider('a');
  await manager.registerSandbox('c', c.provider);
  assert.equal(manager.size, 2);
  assert.equal(b.state.terminated, 1, 'least recently used sandbox is terminated, not just forgotten');
  assert.equal(a.state.terminated, 0);
  assert.equal(manager.getActiveProvider(), c.provider);
  assert.equal(manager.getProvider('b'), null);
});

test('a failed sandbox create terminates only the new sandbox and keeps the previous one alive', async () => {
  const previous = fakeProvider('previous');
  global.activeSandboxProvider = previous.provider;
  const broken = fakeProvider('broken', { failSetup: true });
  SandboxFactory.create = () => broken.provider;
  const response = await createSandbox(localRequest('create-ai-sandbox-v2', {}));
  const data = await response.json();
  assert.equal(response.status, 500);
  assert.equal(broken.state.terminated, 1, 'new sandbox must not leak');
  assert.equal(previous.state.terminated, 0, 'healthy previous sandbox must survive');
  assert.equal(global.activeSandboxProvider, previous.provider);
  assert.equal(data.details, undefined);
  assert.doesNotMatch(JSON.stringify(data), /internal\/path|at .*\(/);
});

test('kill-sandbox also drops manager providers so later routes cannot reuse a dead one', async () => {
  const tracked = fakeProvider('tracked');
  await sandboxManager.registerSandbox('tracked', tracked.provider);
  const response = await killSandbox(localRequest('kill-sandbox', {}));
  const data = await response.json();
  assert.equal(data.sandboxKilled, true);
  assert.equal(tracked.state.terminated, 1);
  assert.equal(sandboxManager.getActiveProvider(), null);
  assert.equal(sandboxManager.size, 0);
});

test('kill-sandbox terminates a provider shared by the legacy global and the manager exactly once', async () => {
  const shared = fakeProvider('shared');
  await sandboxManager.registerSandbox('shared', shared.provider);
  global.activeSandboxProvider = shared.provider;
  const response = await killSandbox(localRequest('kill-sandbox', {}));
  assert.equal(response.status, 200);
  assert.equal(shared.state.terminated, 1);
  assert.equal(global.activeSandboxProvider, null);
});

test('detected imports can never become npm flags or aliases', async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  global.activeSandbox = {
    runCommand: async (command: { cmd: string; args: string[] }) => {
      calls.push(command);
      return { exitCode: command.cmd === 'test' ? 1 : 0, stdout: async () => '', stderr: async () => '' };
    },
  };
  const files = {
    'src/App.jsx': [
      "import React from 'react';",
      "import evil from '-g';",
      "import prefix from '--prefix=..';",
      "import alias from 'x@npm:other';",
      "import local from './local';",
    ].join('\n'),
  };
  await detectAndInstall(localRequest('detect-and-install-packages', { files }));
  const install = calls.find(call => call.cmd === 'npm');
  assert.ok(install, 'the valid package is still installed');
  const separator = install.args.indexOf('--');
  assert.ok(separator > 0, 'package names follow an end-of-options marker');
  assert.deepEqual(install.args.slice(separator + 1), ['react']);
  assert.ok(calls.every(call => call.args.every(arg => !arg.includes('prefix') && arg !== '-g' && !arg.includes('npm:'))));
});

test('report-vite-error rejects non-string errors with 400 instead of crashing', async () => {
  const response = await reportViteError(localRequest('report-vite-error', { error: { nested: true } }));
  assert.equal(response.status, 400);
  const accepted = await reportViteError(localRequest('report-vite-error', { error: "Failed to resolve import 'x' from 'src/App.jsx'" }));
  assert.equal(accepted.status, 200);
});

test('conversation preferences cannot grow process memory without bound', async () => {
  await conversationState(localRequest('conversation-state', { action: 'reset' }));
  if (!global.conversationState) {
    global.conversationState = {
      conversationId: 'test', startedAt: Date.now(), lastUpdated: Date.now(),
      context: { messages: [], edits: [], projectEvolution: { majorChanges: [] }, userPreferences: {} },
    };
  }
  const big: Record<string, string> = {};
  for (let index = 0; index < 60; index++) big[`k${index}`] = 'v';
  const rejected = await conversationState(localRequest('conversation-state', { action: 'update', data: { userPreferences: big } }));
  assert.equal(rejected.status, 400);
  const accepted = await conversationState(localRequest('conversation-state', { action: 'update', data: { userPreferences: { editStyle: 'targeted' }, currentTopic: 'header' } }));
  assert.equal(accepted.status, 200);
});

test('scrape-website refuses non-http URLs before contacting any provider', async () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 42]) {
    const response = await scrapeWebsite(localRequest('scrape-website', { url }));
    assert.equal(response.status, 400, String(url));
  }
});

test('public error messages keep validation text and redact secrets from internal errors', () => {
  assert.equal(publicErrorMessage(new ClientInputError('Invalid path')), 'Invalid path');
  const leaked = publicErrorMessage(new Error('upstream rejected key sk-abcdefghijklmnopqrstuvwxyz123456'));
  assert.doesNotMatch(leaked, /sk-abcdefghijklmnopqrstuvwxyz123456/);
  assert.equal(publicErrorMessage('not an error', 'fallback'), 'fallback');
  assert.equal(requireHttpUrl('https://example.com/a'), 'https://example.com/a');
  assert.throws(() => requireHttpUrl('ftp://example.com'), ClientInputError);
  assert.throws(() => requireHttpUrl('not a url'), ClientInputError);
});

test('major change history keeps only the most recent entries', () => {
  const evolution = { majorChanges: [] as Array<{ timestamp: number; description: string; filesAffected: string[] }> };
  for (let index = 0; index < MAX_MAJOR_CHANGES + 15; index++) {
    recordMajorChange(evolution, { timestamp: index, description: `change ${index}`, filesAffected: [] });
  }
  assert.equal(evolution.majorChanges.length, MAX_MAJOR_CHANGES);
  assert.equal(evolution.majorChanges[0].timestamp, 15);
  assert.equal(evolution.majorChanges.at(-1)?.timestamp, MAX_MAJOR_CHANGES + 14);
});
