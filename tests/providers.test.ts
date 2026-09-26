import {appConfig} from '../config/app.config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { E2BProvider } from '../lib/sandbox/providers/e2b-provider';
import { VercelProvider } from '../lib/sandbox/providers/vercel-provider';

// SDK-boundary unit tests: no cloud credentials, network calls, or paid sandboxes.
class LocalE2B extends E2BProvider {
  constructor(sdk: unknown) { super({}); this.sandbox = sdk; }
}
class LocalVercel extends VercelProvider {
  constructor(sdk: unknown) { super({}); this.sandbox = sdk; }
}

test('E2B propagates actual subprocess failure, not wrapper success', async () => {
  const output = { exitCode: 7, stdout: '', stderr: 'failed' };
  const provider = new LocalE2B({
    commands: { run: async () => output },
    runCode: async () => ({ logs: { stdout: ['Return code: 7'], stderr: [] } }),
  });
  const result = await provider.runCommand('node --version');
  assert.equal(result.success, false);
  assert.equal(result.exitCode, 7);
  assert.equal(result.stderr, 'failed');
});

test('Vercel preserves quoted command arguments inside the sandbox shell', async () => {
  let received: any;
  const provider = new LocalVercel({ runCommand: async (args: unknown) => {
    received = args;
    return { exitCode: 0, stdout: async () => 'hello world', stderr: async () => '' };
  } });
  const result = await provider.runCommand('printf "%s" "hello world"');
  assert.deepEqual(received.args, ['-c', 'printf "%s" "hello world"']);
  assert.equal(received.cmd, 'sh');
  assert.equal(result.stdout, 'hello world');
});

test('Vercel must propagate output-read failures instead of fabricating empty output', async () => {
  const provider = new LocalVercel({ runCommand: async () => ({
    exitCode: 0, stdout: async () => { throw new Error('transport lost'); }, stderr: async () => '',
  }) });
  await assert.rejects(provider.runCommand('pwd'), /transport lost/);
});

test('package injection is rejected before an SDK operation', async () => {
  const provider = new LocalE2B({ runCode: async () => { throw new Error('SDK_CALLED'); } });
  await assert.rejects(provider.installPackages(["react'); print('bad"]), /Only npm registry/);
});


test('restarting Vite replaces the current diagnostic log instead of preserving old errors',async()=>{
 const previous=appConfig.e2b.viteStartupDelay;appConfig.e2b.viteStartupDelay=0;
 let script='';const provider=new LocalE2B({runCode:async(code:string)=>{script=code;return {logs:{stdout:[],stderr:[]}};}});
 try{await provider.restartViteServer();assert.match(script,/stdout=open\('\/tmp\/vite\.log', 'wb'/);}
 finally{appConfig.e2b.viteStartupDelay=previous;}
});
