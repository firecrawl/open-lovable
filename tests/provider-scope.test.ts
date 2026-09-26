import test from 'node:test';
import assert from 'node:assert/strict';
import {credentialStore,effectiveProvider} from '../lib/settings/store';
import {applicationModels,getGatewayConfig} from '../lib/ai/provider-catalog';
const a={owner:'workspace:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',allowLoopback:false};
const b={owner:'workspace:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',allowLoopback:false};
test('P05 workspace inference never inherits another workspace or operator environment credentials',()=>{
 process.env.OPEN_LOVABLE_DISABLE_SAVED_SETTINGS='0';process.env.OPENAI_API_KEY='operator-only-fixture';process.env.AI_GATEWAY_API_KEY='operator-gateway-fixture';
 try{
  credentialStore().save(a.owner,'openai',0,{enabled:true,baseURL:'https://api.openai.com/v1',apiKey:'workspace-a-fixture'});
  assert.equal((effectiveProvider as any)('openai',a).apiKey,'workspace-a-fixture');
  assert.equal((effectiveProvider as any)('openai',b).apiKey,undefined);
  assert.equal((applicationModels as any)(b).some((model:{configured:boolean})=>model.configured),false);
 }finally{delete process.env.OPENAI_API_KEY;delete process.env.AI_GATEWAY_API_KEY;process.env.OPEN_LOVABLE_DISABLE_SAVED_SETTINGS='1';}
});
test('P05 account gateways cannot target loopback without an explicit installation policy',()=>{
 process.env.OPEN_LOVABLE_DISABLE_SAVED_SETTINGS='0';
 try{
  credentialStore().save(a.owner,'gateway',0,{enabled:true,baseURL:'http://127.0.0.1:12345/v1',models:['fixture/coder']});
  assert.throws(()=>(getGatewayConfig as any)(a),/loopback|config|HTTPS/i);
  assert.equal((getGatewayConfig as any)({...a,allowLoopback:true}).models[0],'fixture/coder');
 }finally{process.env.OPEN_LOVABLE_DISABLE_SAVED_SETTINGS='1';}
});
