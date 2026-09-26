import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ProjectStore } from '../lib/projects/store';
async function credentials(t:{after:(fn:()=>void)=>void}) {
 const m=await import('../lib/settings/store').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof m.CredentialStore,'function','Encrypted credential storage must exist');
 const db=new ProjectStore(':memory:');t.after(()=>db.close());
 return {db,vault:new m.CredentialStore(db,randomBytes(32)),Module:m};
}
test('provider keys are encrypted, metadata is redacted and owner-scoped',async t=>{
 const {db,vault}=await credentials(t);const key='sk-'+ 'z'.repeat(40);
 vault.save('alice','gateway',0,{enabled:true,baseURL:'http://127.0.0.1:11434/v1',apiKey:key});
 assert.equal(vault.read('alice','gateway').apiKey,key);
 assert.equal(vault.read('bob','gateway'),null);
 assert.equal(JSON.stringify(vault.metadata('alice')).includes(key),false);
 assert.equal(JSON.stringify(db.db.prepare('SELECT * FROM provider_settings').all()).includes(key),false);
});
test('editing within the same audience keeps its key unless explicitly cleared; stale writes fail',async t=>{
 const {vault}=await credentials(t);
 vault.save('alice','gateway',0,{enabled:true,baseURL:'http://127.0.0.1:11434/v1',apiKey:'fixture-private-key'});
 vault.save('alice','gateway',1,{enabled:true,baseURL:'http://127.0.0.1:11434/v1/',apiKey:''});
 assert.equal(vault.read('alice','gateway').apiKey,'fixture-private-key');
 assert.throws(()=>vault.save('alice','gateway',1,{enabled:false}),/conflict/i);
 vault.save('alice','gateway',2,{enabled:false,clearKey:true});
 assert.equal(vault.read('alice','gateway').apiKey,undefined);
});
test('untrusted URLs and unsupported providers cannot enter the credential store',async t=>{
 const {vault}=await credentials(t);
 for(const baseURL of ['http://example.com/v1','https://169.254.169.254/v1','https://user:password@example.com/v1','file:///etc/passwd']) {
  assert.throws(()=>vault.save('alice','gateway',0,{enabled:true,baseURL}));
 }
 assert.throws(()=>vault.save('alice','../../outside',0,{enabled:true}));
 assert.deepEqual(vault.metadata('alice'),[]);
});
test('corrupt ciphertext and wrong encryption keys fail closed without wiping configuration',async t=>{
 const {db,vault,Module}=await credentials(t);
 vault.save('alice','openai',0,{enabled:true,apiKey:'fixture-private-key'});
 const other=new Module.CredentialStore(db,randomBytes(32));
 assert.throws(()=>other.read('alice','openai'),/decrypt|credential/i);
 assert.equal(vault.read('alice','openai').apiKey,'fixture-private-key');
});
