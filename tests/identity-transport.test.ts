import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
async function fixture(t:{after(fn:()=>Promise<void>):void}){
 const subject=randomUUID(),requests:Array<{url:string;body:unknown;authorization?:string}>=[];let invalid=false,redirect=false;
 const server=createServer(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;
  requests.push({url:req.url!,body:text?JSON.parse(text):null,authorization:req.headers.authorization});
  res.setHeader('Content-Type','application/json');
  if(redirect){res.writeHead(302,{Location:'/elsewhere'});res.end();return;}
  if(req.url?.startsWith('/auth/v1/token'))res.end(JSON.stringify({access_token:'contract-access',refresh_token:'contract-refresh',expires_in:3600}));
  else if(req.url==='/auth/v1/user')res.end(JSON.stringify({id:subject,email:'alice@example.test',email_confirmed_at:invalid?null:new Date().toISOString(),is_anonymous:false}));
  else res.end('{}');
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const implementation=await import('../lib/identity/supabase').catch(()=>({})) as Record<string,any>;assert.equal(typeof implementation.SupabaseIdentityProvider,'function','Bounded identity provider transport must exist');
 const config={url:'http://127.0.0.1:'+(server.address() as {port:number}).port,publishableKey:'sb_publishable_contract',allowLoopback:true};
 return {provider:new implementation.SupabaseIdentityProvider(config),requests,subject,setInvalid:()=>{invalid=true;},setRedirect:()=>{redirect=true;},implementation,config};
}
test('P05 password authentication and getUser use bounded real HTTP without trusting a client claim',async t=>{
 const {provider,requests,subject}=await fixture(t);const result=await provider.signIn('alice@example.test','not-a-real-password');
 assert.equal(result.user.subject,subject);assert.equal(result.tokens.access_token,'contract-access');
 assert.equal(requests[0].url,'/auth/v1/token?grant_type=password');assert.equal(requests[1].authorization,'Bearer contract-access');
});
test('P05 unverified email and provider redirects never create a trusted identity',async t=>{
 const f=await fixture(t);f.setInvalid();await assert.rejects(()=>f.provider.signIn('alice@example.test','not-a-real-password'),/verified|identity/i);
 f.setRedirect();await assert.rejects(()=>f.provider.signIn('alice@example.test','not-a-real-password'),/provider|identity|connect/i);
 assert.equal(f.requests.some(r=>r.url==='/elsewhere'),false);
});
test('P05 unsafe auth endpoints and privileged keys are rejected at configuration',async t=>{
 const {implementation,config}=await fixture(t);
 for(const changes of [{url:'http://public.example'},{url:'https://user:secret@identity.example'},{url:'https://identity.example/other'},{publishableKey:'sb_secret_not-public'}])assert.throws(()=>new implementation.SupabaseIdentityProvider({...config,...changes}),/config|URL|key|origin/i);
});
