import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('P02 generated source never reaches process stdout or stderr',()=>{
 const child=spawnSync(process.execPath,['--import','tsx','--import','./tests/setup.mjs',fileURLToPath(new URL('./helpers/logging-child.ts',import.meta.url))],{encoding:'utf8',timeout:30000});
 assert.equal(child.status,0,child.error?.message||child.stderr);
 assert.equal((child.stdout+child.stderr).includes('PRIVATE_GENERATED_SOURCE_92743'),false);
});
