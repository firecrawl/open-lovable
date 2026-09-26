import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeOperatorRequest, getTrustedAppOrigin } from '../lib/security/operator-access';
const original = {...process.env};
afterEach(() => { for(const key of Object.keys(process.env)) if(!(key in original)) delete process.env[key]; Object.assign(process.env,original); });
function request(headers: Record<string,string> = {}) {
  Object.assign(process.env,{NODE_ENV:'production',OPEN_LOVABLE_APP_ORIGIN:'https://builder.example',OPEN_LOVABLE_USERNAME:'admin',OPEN_LOVABLE_PASSWORD:'test-only-password-never-use-in-production'});
  return new Request('https://builder.example/api/test',{headers:{host:'builder.example',...headers}});
}
const authorization = 'Basic '+Buffer.from('admin:test-only-password-never-use-in-production').toString('base64');
test('valid operator credentials allow a same-origin request',async()=>{
  assert.equal(await authorizeOperatorRequest(request({authorization,origin:'https://builder.example'})),null);
});
test('missing and invalid credentials fail without revealing the password',async()=>{
  for(const headers of [{},{authorization:'Basic invalid'}]) {
    const result=await authorizeOperatorRequest(request(headers));
    assert.equal(result?.status,401); assert.match(result!.headers.get('www-authenticate')!,/^Basic/);
    assert.ok(!(await result!.text()).includes('test-only-password'));
  }
});
test('credentials do not permit cross-origin, fetch-site or host spoofing',async()=>{
  for(const headers of [{origin:'https://attacker.example'},{'sec-fetch-site':'cross-site'},{host:'attacker.example'}]) {
    const result=await authorizeOperatorRequest(request({authorization,...headers}));
    assert.ok(result && [403,503].includes(result.status));
  }
});
test('production with missing or weak credentials fails closed',async()=>{
  const req=request();
  for(const password of ['', 'short']) { process.env.OPEN_LOVABLE_PASSWORD=password; assert.equal((await authorizeOperatorRequest(req))?.status,503); }
});
test('internal origins reject paths, credentials and public plain HTTP',()=>{
  const req=request();
  for(const origin of ['https://builder.example/path','https://user:pass@builder.example','http://builder.example']) {
    process.env.OPEN_LOVABLE_APP_ORIGIN=origin; assert.throws(()=>getTrustedAppOrigin(req));
  }
});

test('development with a configured public origin still requires credentials',async()=>{
  const req=request();
  Object.assign(process.env,{NODE_ENV:'development',OPEN_LOVABLE_PASSWORD:''});
  assert.equal((await authorizeOperatorRequest(req))?.status,503);
});
