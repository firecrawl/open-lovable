import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unzipSync, strFromU8 } from 'fflate';
import { createExportScript, zipExportManifest } from '../lib/sandbox/project-export';
const exec = promisify(execFile);

test('actual export collector preserves binary files and excludes credential files', async () => {
  const root = await mkdtemp(join(tmpdir(),'open-lovable-export-'));
  try {
    await mkdir(join(root,'src'));
    await mkdir(join(root,'.aws'));
    await writeFile(join(root,'src','App.tsx'),'export default function App(){return null}');
    await writeFile(join(root,'image.bin'),Buffer.from([0,255,1,128,64]));
    await writeFile(join(root,'.env.local'),'SECRET=not-for-export');
    await writeFile(join(root,'.aws','credentials'),'secret');
    await writeFile(join(root,'private.pem'),'secret');
    const result = await exec(process.execPath,['--input-type=module','-e',createExportScript(root)]);
    const archive = zipExportManifest(result.stdout);
    const files = unzipSync(archive.bytes);
    assert.deepEqual(Object.keys(files).sort(),['image.bin','src/App.tsx']);
    assert.deepEqual(Array.from(files['image.bin']),[0,255,1,128,64]);
    assert.match(strFromU8(files['src/App.tsx']),/export default/);
    assert.equal(archive.excludedCount,3);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('export validation rejects traversal, secrets, duplicates and oversized files',()=>{
  for (const path of ['../outside','/etc/passwd','.env','.aws/credentials','a\\b']) {
    assert.throws(()=>zipExportManifest(JSON.stringify({files:[{path,base64:'YQ=='}]})));
  }
  assert.throws(()=>zipExportManifest(JSON.stringify({files:[{path:'a',base64:'YQ=='},{path:'a',base64:'YQ=='}]})));
  assert.throws(()=>zipExportManifest(JSON.stringify({files:[{path:'a',base64:Buffer.alloc(2*1024*1024+1).toString('base64')}]})));
});
