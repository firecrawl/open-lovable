import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
test('queued model connections are fingerprinted without exposing credentials and rotation invalidates the binding',async t=>{
 const keys=['OPEN_LOVABLE_MASTER_KEY','OPEN_LOVABLE_GATEWAY_URL','OPEN_LOVABLE_GATEWAY_API_KEY','OPEN_LOVABLE_GATEWAY_MODELS'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 t.after(()=>{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}});
 Object.assign(process.env,{OPEN_LOVABLE_MASTER_KEY:randomBytes(32).toString('base64'),OPEN_LOVABLE_GATEWAY_URL:'http://127.0.0.1:3111/v1',OPEN_LOVABLE_GATEWAY_API_KEY:'binding-fixture-a',OPEN_LOVABLE_GATEWAY_MODELS:'["fixture/coder"]'});
 const implementationModule=await import('../lib/runs/model-binding').catch(()=>({})) as Record<string,any>;assert.equal(typeof implementationModule.modelBindingDigest,'function');
 const first=implementationModule.modelBindingDigest('gateway/fixture/coder');assert.match(first,/^[a-f0-9]{64}$/);
 assert.equal(implementationModule.modelBindingDigest('gateway/fixture/coder'),first);
 process.env.OPEN_LOVABLE_GATEWAY_API_KEY='binding-fixture-b';assert.notEqual(implementationModule.modelBindingDigest('gateway/fixture/coder'),first);
 process.env.OPEN_LOVABLE_GATEWAY_API_KEY='binding-fixture-a';process.env.OPEN_LOVABLE_GATEWAY_URL='http://127.0.0.1:3222/v1';assert.notEqual(implementationModule.modelBindingDigest('gateway/fixture/coder'),first);
});
