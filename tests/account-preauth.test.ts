import test from 'node:test';
import assert from 'node:assert/strict';
import {startIdentityFixture} from './helpers/identity-fixture';
const origin='http://127.0.0.1:3905';
test('P05 protected uploads authenticate before reading or parsing untrusted bodies',async t=>{
 const fixture=await startIdentityFixture();t.after(()=>fixture.close());
 const values={OPEN_LOVABLE_AUTH_MODE:'supabase',OPEN_LOVABLE_SUPABASE_URL:fixture.url,OPEN_LOVABLE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_contract',OPEN_LOVABLE_AUTH_ALLOW_LOOPBACK:'1',OPEN_LOVABLE_APP_ORIGIN:origin};
 Object.assign(process.env,values);t.after(()=>{for(const key of Object.keys(values))delete process.env[key];});
 const routes=[await import('../app/api/projects/route'),await import('../app/api/project-images/route')];
 for(const route of routes){
  let accessed=false;
  const request=new Request(origin+'/api/projects',{method:'POST',headers:{host:'127.0.0.1:3905',origin,'Content-Type':'application/json'},body:'not-json'});
  Object.defineProperty(request,'body',{get(){accessed=true;throw new Error('The request body must not be touched before authentication');}});
  const response=await route.POST(request);assert.equal(response.status,401);assert.equal(accessed,false);
 }
});
