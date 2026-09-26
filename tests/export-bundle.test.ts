import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {exportProjectBundle,validateExportBundleManifest,verifyExportBundle,verifyExportBundleBytes} from '../lib/artifacts/export-bundle';
import type {ProjectSnapshot} from '../lib/projects/store';

const snapshot:ProjectSnapshot={files:{'src/App.jsx':'export default function App(){return <h1>Ready</h1>}'},assets:{'public/icon.png':Buffer.from([0,1,2,255]).toString('base64')}};

test('ExportBundle includes a versioned manifest and verifies source provenance',()=>{
 const result=exportProjectBundle(snapshot,{projectId:'project-1',projectVersion:3,source:'project'},'2026-09-24T00:00:00.000Z');
 const files=unzipSync(result.bytes);
 const manifest=validateExportBundleManifest(JSON.parse(strFromU8(files['__open_lovable__/manifest.json'])));
 assert.equal(manifest.manifestVersion,1);assert.equal(manifest.projectVersion,3);assert.equal(manifest.files.length,2);
 verifyExportBundle(snapshot,manifest);verifyExportBundleBytes(result.bytes,snapshot,manifest);assert.equal(strFromU8(files['src/App.jsx']),snapshot.files['src/App.jsx']);
});

test('ExportBundle records a candidate without accepting it and detects source drift',()=>{
 const result=exportProjectBundle(snapshot,{projectId:'project-1',projectVersion:3,runId:'run-1',baseVersion:3,source:'candidate'},'2026-09-24T00:00:00.000Z');
 const manifest=validateExportBundleManifest(result.manifest);assert.equal(manifest.source,'candidate');assert.equal(manifest.runId,'run-1');
 const changed={...snapshot,files:{...snapshot.files,'src/App.jsx':'export default function App(){return null}'}};
 assert.throws(()=>verifyExportBundle(changed,manifest),/does not match/);
});

test('ExportBundle rejects unsafe paths and secret-bearing generated content',()=>{
 assert.throws(()=>exportProjectBundle({files:{'../outside.ts':'bad'},assets:{}},{projectId:'project-1',projectVersion:1,source:'project'}),/Invalid source path/);
 assert.throws(()=>exportProjectBundle({files:{'src/App.jsx':'const OPENAI_API_KEY = "sk-123456789012345678901234"'},assets:{}},{projectId:'project-1',projectVersion:1,source:'project'}));
});
test('ExportBundle preserves a user manifest.json without metadata collision',()=>{const source={files:{...snapshot.files,'manifest.json':'{"app":true}'},assets:{}};const result=exportProjectBundle(source,{projectId:'project-1',projectVersion:1,source:'project'}),files=unzipSync(result.bytes);assert.equal(strFromU8(files['manifest.json']),source.files['manifest.json']);assert.ok(files['__open_lovable__/manifest.json']);});
