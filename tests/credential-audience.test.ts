import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ProjectStore } from '../lib/projects/store';
import { CredentialStore } from '../lib/settings/store';

function setup(t: {after(fn:()=>void):void}) {
 const store=new ProjectStore(':memory:');t.after(()=>store.close());
 const vault=new CredentialStore(store,randomBytes(32));
 vault.save('alice','gateway',0,{enabled:true,baseURL:'https://provider-a.example/v1',apiKey:'fixture-key-for-a'});
 return {store,vault};
}
test('P01-A same audience retains its key, including normalized host/default port/trailing slash',t=>{
 const {vault}=setup(t);
 vault.save('alice','gateway',1,{enabled:true,baseURL:'https://PROVIDER-A.example:443/v1/',models:['coder'],apiKey:''});
 assert.equal(vault.read('alice','gateway')?.apiKey,'fixture-key-for-a');
 assert.equal(vault.read('alice','gateway')?.version,2);
 assert.equal(JSON.stringify(vault.metadata('alice')).includes('fixture-key-for-a'),false);
 assert.equal(vault.read('bob','gateway'),null);
});
for(const endpoint of ['https://provider-b.example/v1','https://provider-a.example:8443/v1','https://provider-a.example/v2','https://provider-a.example/V1']) {
 test('P01-B changed audience cannot reuse a hidden key: '+endpoint,t=>{
  const {vault,store}=setup(t);const before=JSON.stringify(store.db.prepare('SELECT * FROM provider_settings').all());
  assert.throws(()=>vault.save('alice','gateway',1,{enabled:true,baseURL:endpoint,apiKey:'   '}),/endpoint|audience|destino|credential/i);
  assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM provider_settings').all()),before);
 });
}
test('P01 changing scheme even on loopback needs an explicit new key or clearing',t=>{
 const {vault}=setup(t);vault.save('alice','gateway',1,{enabled:true,baseURL:'https://127.0.0.1:11434/v1',apiKey:'fixture-local'});
 assert.throws(()=>vault.save('alice','gateway',2,{enabled:false,baseURL:'http://127.0.0.1:11434/v1'}),/endpoint|audience|destino|credential/i);
 vault.save('alice','gateway',2,{enabled:false,baseURL:'http://127.0.0.1:11434/v1',clearKey:true});
 assert.equal(vault.read('alice','gateway')?.apiKey,undefined);
});
test('P01 an explicitly re-entered key can be bound to a new audience; stale edits stay blocked',t=>{
 const {vault}=setup(t);
 vault.save('alice','gateway',1,{enabled:true,baseURL:'https://provider-b.example/v1',apiKey:'fixture-key-for-b'});
 assert.equal(vault.read('alice','gateway')?.apiKey,'fixture-key-for-b');
 assert.throws(()=>vault.save('alice','gateway',1,{enabled:true,baseURL:'https://provider-a.example/v1',apiKey:'fixture-a'}),/conflict/i);
});
test('P01 failed writes retain the old audience and encrypted configuration atomically',t=>{
 const {vault,store}=setup(t);
 store.db.exec("CREATE TRIGGER reject_settings BEFORE UPDATE ON provider_settings BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END");
 assert.throws(()=>vault.save('alice','gateway',1,{enabled:true,baseURL:'https://provider-b.example/v1',apiKey:'fixture-b'}),/simulated disk failure/);
 assert.equal(vault.read('alice','gateway')?.baseURL,'https://provider-a.example/v1');
 assert.equal(vault.read('alice','gateway')?.apiKey,'fixture-key-for-a');
});
