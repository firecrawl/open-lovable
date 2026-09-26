import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRootlessRunnerCommand} from '../../runtime/runner/policy';

test('P13-A builds a rootless isolated command with logical workspace only',()=>{
 const result=buildRootlessRunnerCommand({argv:['npm','test'],cwd:'/workspace/app',env:{CI:'1'}});
 assert.equal(result.networkMode,'none');assert.ok(result.args.includes('--read-only'));assert.ok(result.args.includes('--cap-drop'));assert.ok(result.args.includes('ALL'));assert.ok(result.args.includes('--user'));assert.ok(result.args.includes('65532:65532'));assert.ok(!result.args.some(arg=>arg.includes('/home/')||arg.includes('docker.sock')));
});

test('P13-B rejects host paths, unsafe argv and unapproved network selection',()=>{
 assert.throws(()=>buildRootlessRunnerCommand({argv:['sh','-c','cat /etc/passwd'],cwd:'/home/user'}),/logical workspace/i);
 assert.throws(()=>buildRootlessRunnerCommand({argv:['sh\nrm -rf /'],cwd:'/workspace'}),/Invalid argv/i);
 assert.throws(()=>buildRootlessRunnerCommand({argv:['npm','test'],cwd:'/workspace'},'build','cloud-network'),/outside approved install/i);
 assert.throws(()=>buildRootlessRunnerCommand({argv:['npm','install'],cwd:'/workspace'},'install'),/Approved install network/i);
 const install=buildRootlessRunnerCommand({argv:['npm','install'],cwd:'/workspace'},'install','registry-net');assert.equal(install.networkMode,'registry-net');
});
