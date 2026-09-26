import test from 'node:test';
import assert from 'node:assert/strict';
import {startIdentityFixture} from './helpers/identity-fixture';
import {accountApiAllowed} from '../lib/identity/config';
const origin='http://127.0.0.1:3905';
const request=(path:string,body?:unknown,cookie='',requestOrigin=origin)=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:3905',origin:requestOrigin,'Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
test('Supabase account allowlist admits only the versioned run approval route',()=>{
 const run='/api/v1/runs/00000000-0000-4000-8000-000000000000';
 assert.equal(accountApiAllowed(run+'/approval'),true);
 assert.equal(accountApiAllowed(run+'/unknown'),false);
 assert.equal(accountApiAllowed('/api/projects'),true);
});
test('P05 HTTP uses opaque HttpOnly cookies, rejects CSRF and keeps operator credentials out of account access',async t=>{
 const fixture=await startIdentityFixture();t.after(()=>fixture.close());
 Object.assign(process.env,{OPEN_LOVABLE_AUTH_MODE:'supabase',OPEN_LOVABLE_SUPABASE_URL:fixture.url,OPEN_LOVABLE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_contract',OPEN_LOVABLE_AUTH_ALLOW_LOOPBACK:'1',OPEN_LOVABLE_APP_ORIGIN:origin});
 t.after(()=>{for(const k of ['OPEN_LOVABLE_AUTH_MODE','OPEN_LOVABLE_SUPABASE_URL','OPEN_LOVABLE_SUPABASE_PUBLISHABLE_KEY','OPEN_LOVABLE_AUTH_ALLOW_LOOPBACK','OPEN_LOVABLE_APP_ORIGIN'])delete process.env[k];});
 const auth=await import('../app/api/auth/route').catch(()=>({})) as Record<string,any>;assert.equal(typeof auth.POST,'function');
 const loginBody={action:'login',email:'alice@example.test',password:'identity-contract-password'};
 const blocked=await auth.POST(request('/api/auth',loginBody,'','https://evil.example'));assert.equal(blocked.status,403);
 const logged=await auth.POST(request('/api/auth',loginBody));assert.equal(logged.status,200,await logged.clone().text());
 const cookie=logged.headers.get('set-cookie')||'';assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i);
 assert.equal((await logged.text()).includes('fixture-access-'),false);assert.equal(cookie.includes('fixture-access-'),false);
 const current=await auth.GET(request('/api/auth',undefined,cookie.split(';')[0]));assert.equal((await current.json()).user.email,'alice@example.test');
 const legacy=await import('../lib/security/operator-access');assert.equal((await legacy.authorizeOperatorRequest(request('/api/run-command',{})))?.status,403);
 const logout=await auth.POST(request('/api/auth',{action:'logout'},cookie.split(';')[0]));assert.equal(logout.status,200);
 const expired=await auth.GET(request('/api/auth',undefined,cookie.split(';')[0]));assert.equal((await expired.json()).authenticated,false);
});
