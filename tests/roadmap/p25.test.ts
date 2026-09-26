import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildLegacyImportManifest,verifyLegacyImportManifest} from '../../lib/legacy/project-import';
const snapshot={files:{'src/App.tsx':'export default function App(){return <main/>}'},assets:{}};
test('P25 creates a persistent legacy import manifest without replacing history',()=>{const manifest=buildLegacyImportManifest('sandbox-old','project-new',snapshot);assert.equal(manifest.historyDisposition,'preserved');assert.equal(manifest.filesHash.length,64);assert.doesNotThrow(()=>verifyLegacyImportManifest(manifest,snapshot));});
test('P25 rejects changed snapshots and route creation is additive',async()=>{const manifest=buildLegacyImportManifest('sandbox-old','project-new',snapshot);assert.throws(()=>verifyLegacyImportManifest(manifest,{files:{...snapshot.files,'src/Other.tsx':'changed'},assets:{}}),/changed/i);const source=await readFile(new URL('../../app/api/create-ai-sandbox-v2/route.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/sandboxManager\.terminateAll\(\)/);assert.match(source,/terminateSandbox\(createdSandboxId\)/);});
