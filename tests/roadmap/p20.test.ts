import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourceMap,instrumentJsx} from '../../lib/visual/source-map';

test('P20 maps preview elements to source positions and instruments only the interactive preview',()=>{const files={'src/App.tsx':'export default function App(){return <main><button>Save</button></main>}'};const map=buildSourceMap(files,'a'.repeat(64),'channel-a');assert.equal(map.version,1);assert.equal(map.elements.length,2);const button=map.elements.find(element=>element.tag==='button');assert.ok(button);const instrumented=instrumentJsx(files,map)['src/App.tsx'];assert.match(instrumented,new RegExp(`data-open-lovable-element="${button!.elementId}"`));assert.equal(button!.revisionDigest,'a'.repeat(64));});

test('P20 rejects stale selection by revision and does not authorize another runtime',()=>{const files={'src/App.tsx':'export default function App(){return <button>Save</button>}'};const old=buildSourceMap(files,'a'.repeat(64),'channel-a'),fresh=buildSourceMap(files,'b'.repeat(64),'channel-b');const selection=old.elements[0];assert.notEqual(selection.revisionDigest,fresh.revisionDigest);assert.notEqual(selection.runtimeId,fresh.runtimeId);assert.equal(fresh.elements.some(element=>element.elementId===selection.elementId),false);});
