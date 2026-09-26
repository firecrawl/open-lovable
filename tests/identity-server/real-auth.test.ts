import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {SupabaseIdentityProvider} from '../../lib/identity/supabase';
import {AccountService} from '../../lib/identity/service';
import {IdentityStore} from '../../lib/identity/store';
import {ProjectStore} from '../../lib/projects/store';

const endpoint=process.env.OPEN_LOVABLE_AUTH_TEST_URL,secret=process.env.OPEN_LOVABLE_AUTH_TEST_JWT_SECRET;
if(process.env.OPEN_LOVABLE_AUTH_TEST_DISPOSABLE!=='1'||!endpoint||!secret||secret.length<32)throw new Error('A dedicated disposable Auth server and test signing key are required; no simulated pass');
const origin=new URL(endpoint);
if(origin.origin!=='http://127.0.0.1:19999'||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Only the dedicated loopback Auth test server is accepted');
function token(role:string){
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:'supabase',role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const body=header+'.'+claims;return body+'.'+createHmac('sha256',secret!).update(body).digest('base64url');
}
const adminToken=token('service_role'),anon=token('anon');
async function admin(path:string,body:unknown){
 const response=await fetch(origin.origin+path,{method:'POST',headers:{Authorization:'Bearer '+adminToken,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
 assert.equal(response.ok,true,'The disposable Auth admin request must succeed');return await response.json() as Record<string,any>;
}
/** Only path routing is emulated; every credential/OTP/refresh decision is made by the real upstream server. */
async function routedProvider(){
 let refreshCalls=0;
 const server=createServer((request,response)=>{
  void (async()=>{
   if(request.headers.apikey!==anon||!request.url?.startsWith('/auth/v1/')){response.writeHead(403);response.end('{}');return;}
   const path=request.url.slice('/auth/v1'.length);if(path.includes('grant_type=refresh_token'))refreshCalls++;
   const chunks:Buffer[]=[];let length=0;
   for await(const chunk of request){length+=chunk.length;if(length>32768)throw new Error('Test request too large');chunks.push(Buffer.from(chunk));}
   const upstream=await fetch(origin.origin+path,{method:request.method,headers:{'Content-Type':'application/json',...(request.headers.authorization?{Authorization:request.headers.authorization}:{})},body:request.method==='GET'?undefined:Buffer.concat(chunks),redirect:'error',signal:AbortSignal.timeout(15000)});
   const payload=Buffer.from(await upstream.arrayBuffer());assert.ok(payload.length<128*1024);
   response.writeHead(upstream.status,{'Content-Type':'application/json'});response.end(payload);
  })().catch(()=>{if(!response.destroyed){response.writeHead(502);response.end('{}');}});
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
 return {provider:new SupabaseIdentityProvider({url,publishableKey:anon,allowLoopback:true}),refreshCalls:()=>refreshCalls,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
test('P05 real Auth verifies passwords, rotates refresh once and supports restricted recovery',async t=>{
 const email='real-auth-'+randomUUID()+'@example.test',password='Initial-'+randomBytes(18).toString('hex');
 const user=await admin('/admin/users',{email,password,email_confirm:true});assert.ok(typeof user.id==='string');
 const relay=await routedProvider(),store=new ProjectStore(':memory:');t.after(async()=>{store.close();await relay.close();});
 const identity=new IdentityStore(store,randomBytes(32)),service=new AccountService(identity,relay.provider,'http://127.0.0.1:3102');
 await assert.rejects(()=>service.login(email,'wrong-password'),/rejected|identity/i);
 const normal=await service.login(email,password),session=await service.authenticate(normal.token);assert.equal(session.actor.subject,user.id);
 assert.equal(normal.token.includes('.'),false,'Browser capability is opaque, not a JWT');
 store.db.prepare('UPDATE auth_sessions SET access_expires_at=0 WHERE id=?').run(session.id);
 await Promise.all([service.authenticate(normal.token),service.authenticate(normal.token)]);assert.equal(relay.refreshCalls(),1);
 const link=await admin('/admin/generate_link',{type:'recovery',email});assert.equal(typeof link.hashed_token,'string');
 const recovery=await service.confirm(link.hashed_token,'recovery');await assert.rejects(()=>service.authenticate(recovery.token),/recovery|password/i);
 const updated='Updated-'+randomBytes(18).toString('hex');await service.resetPassword(recovery.token,updated);
 await assert.rejects(()=>service.authenticate(normal.token),/session|sign in/i);
 await assert.rejects(()=>relay.provider.signIn(email,password),/rejected|identity/i);
 const signed=await service.login(email,updated);await service.logout(signed.token);await assert.rejects(()=>service.authenticate(signed.token),/session|sign in/i);
 await assert.rejects(()=>service.confirm(link.hashed_token,'recovery'),/rejected|identity/i);
});
test('P05 real Auth unconfirmed users cannot become Studio members by metadata claims',async t=>{
 const email='unconfirmed-'+randomUUID()+'@example.test',password='Unconfirmed-'+randomBytes(18).toString('hex');
 await admin('/admin/users',{email,password,email_confirm:false,user_metadata:{role:'owner'}});
 const relay=await routedProvider();t.after(()=>relay.close());
 await assert.rejects(()=>relay.provider.signIn(email,password),/rejected|verified|identity/i);
});
