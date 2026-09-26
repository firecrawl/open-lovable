import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSnapshot} from '../lib/projects/store';
test('snapshot budgets and content validation cannot be bypassed through unrecognized root fields',()=>{
 for(const field of ['privateMetadata','ignoredAsset','__proto__']){
  const value=JSON.parse(JSON.stringify({files:{'src/App.jsx':'export default ()=>null'},assets:{}}));
  Object.defineProperty(value,field,{value:{unvalidated:'a'.repeat(1024)},enumerable:true});
  assert.throws(()=>validateSnapshot(value),/snapshot|field|unknown/i);
 }
});
test('canonical file and asset snapshot remains byte-for-byte equivalent',()=>{
 const snapshot={files:{'src/App.jsx':'export default ()=>null'},assets:{}};
 assert.deepEqual(validateSnapshot(snapshot),snapshot);
});
