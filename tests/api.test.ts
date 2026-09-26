import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as health } from '../app/api/check-vite-errors/route';
import { POST as command } from '../app/api/run-command/route';
import { GET as conversation } from '../app/api/conversation-state/route';

const originalEnvironment = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  global.activeSandbox = null;
  global.activeSandboxProvider = null;
});
function localRequest(path: string, body?: unknown) {
  Object.assign(process.env, { NODE_ENV: 'development' });
  return new NextRequest(`http://localhost:3000/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('health must not claim success when there is no sandbox', async () => {
  const response = await health(localRequest('check-vite-errors'));
  const data = await response.json();
  assert.equal(data.success, false);
  assert.equal(data.hasErrors, null);
});

test('legacy command endpoint propagates a nonzero command exit code', async () => {
  const request = localRequest('run-command', { command: 'node --version' });
  global.activeSandbox = { runCommand: async () => ({
    exitCode: 2, stdout: async () => '', stderr: async () => 'command failed',
  }) };
  const response = await command(request);
  const data = await response.json();
  assert.equal(data.success, false);
  assert.equal(data.exitCode, 2);
});

test('invalid command types are a client error, not an internal crash', async () => {
  const request = localRequest('run-command', { command: 42 });
  global.activeSandbox = { runCommand: async () => { throw new Error('must not execute'); } };
  const response = await command(request);
  assert.equal(response.status, 400);
});

test('production APIs fail closed until operator credentials are configured', async () => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  delete process.env.OPEN_LOVABLE_PASSWORD;
  delete process.env.OPEN_LOVABLE_APP_ORIGIN;
  const response = await conversation(new NextRequest('https://builder.example/api/conversation-state'));
  assert.equal(response.status, 503);
});


test('ZIP export works with the active provider without requiring the legacy SDK global', async () => {
  const { POST: exportZip } = await import('../app/api/create-zip/route');
  const req = localRequest('create-zip', {});
  global.activeSandboxProvider = {
    getSandboxInfo: () => ({sandboxId:'unit-test',provider:'e2b'}),
    runCommand: async () => ({success:true,exitCode:0,stderr:'',stdout:JSON.stringify({files:[{path:'README.md',base64:Buffer.from('hello').toString('base64')}],excluded:[]})}),
  };
  const response = await exportZip(req);
  assert.equal(response.status,200);
  assert.match((await response.json()).dataUrl,/^data:application\/zip;base64,/);
});


test('an explicit package version is installed and a failed install never becomes a successful completion', async () => {
  const { POST: installPackages } = await import('../app/api/install-packages/route');
  let attempted: string[] = [];
  global.activeSandboxProvider = {
    runCommand: async () => ({success:true,exitCode:0,stdout:'',stderr:''}),
    readFile: async () => JSON.stringify({dependencies:{'@scope/package':'1.0.0'}}),
    installPackages: async (packages: string[]) => {attempted=packages;return {exitCode:1,success:false,stdout:'',stderr:'registry unavailable'};},
    restartViteServer: async () => {},
  };
  const response = await installPackages(localRequest('install-packages',{packages:['@scope/package@2.0.0']}));
  const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  assert.deepEqual(attempted,['@scope/package@2.0.0']);
  const terminal=events.findLast(event=>event.type==='complete');
  assert.equal(terminal.success,false);
  assert.deepEqual(terminal.installedPackages,[]);
  assert.deepEqual(terminal.failedPackages,['@scope/package@2.0.0']);
});
