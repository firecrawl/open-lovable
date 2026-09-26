import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCompleteFileBlocks, normalizeProjectPath, validatePackages, readJsonObject } from '../lib/security/input-validation';

test('complete files preserve spread syntax and empty file contents', () => {
  assert.doesNotThrow(() => assertCompleteFileBlocks('<file path="src/App.tsx">const a={...props};</file><file path="empty.txt"></file>'));
});
test('truncated and nested file blocks are rejected', () => {
  for (const input of ['<file path="x">const x =', '<file path="x', '<file path="a">x<file path="b">y</file>']) {
    assert.throws(() => assertCompleteFileBlocks(input));
  }
});
test('unsafe paths and secret files are rejected', () => {
  for (const path of ['../secret', '/etc/passwd', 'src/../../a', '.git/config', '.GIT/config', 'C:\\secret', 'src/%2e%2e/a', '.env.local', '.aws/credentials']) {
    assert.throws(() => normalizeProjectPath(path), undefined, path);
  }
  assert.equal(normalizeProjectPath('/home/user/app/src/App.tsx'), 'src/App.tsx');
  assert.equal(normalizeProjectPath('.env.example'), '.env.example');
});
test('registry package names and versions are validated without shell or URL input', () => {
  assert.deepEqual(validatePackages(['react', '@scope/pkg@1.2.3', 'react']), ['react', '@scope/pkg@1.2.3']);
  for (const value of ['--prefix=/tmp', 'file:/tmp/a', 'https://example.com/a', 'foo;echo bad', 'foo$(id)', 'foo bar']) {
    assert.throws(() => validatePackages([value]));
  }
});
test('malformed, nonobject and oversized JSON are rejected', async () => {
  for (const body of ['null','[]','{broken', JSON.stringify({ large: 'x'.repeat(100) })]) {
    await assert.rejects(readJsonObject(new Request('http://localhost/', {method:'POST', body}), 30));
  }
  assert.deepEqual(await readJsonObject(new Request('http://localhost/', {method:'POST',body:'{"ok":true}'})), {ok:true});
});
