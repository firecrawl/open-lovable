import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
/** Synthetic GoTrue contract service, explicitly loopback-only. Never used by application code. */
export async function startIdentityFixture(port=0){
 const users=[{id:'11111111-1111-4111-8111-111111111111',email:'alice@example.test'},{id:'22222222-2222-4222-8222-222222222222',email:'bob@example.test'},{id:'33333333-3333-4333-8333-333333333333',email:'carol@example.test'}];
 const access=new Map<string,typeof users[number]>(),refresh=new Map<string,typeof users[number]>();
 const issue=(user:typeof users[number])=>{const a='fixture-access-'+randomBytes(18).toString('hex'),r='fixture-refresh-'+randomBytes(18).toString('hex');access.set(a,user);refresh.set(r,user);return {access_token:a,refresh_token:r,expires_in:3600,user};};
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>32768){res.writeHead(413);res.end('{}');return;}}
  let body:Record<string,string>={};try{body=raw?JSON.parse(raw):{};}catch{res.writeHead(400);res.end('{}');return;}
  const url=new URL(req.url||'/', 'http://127.0.0.1'),token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const send=(status:number,value:unknown)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  if(url.pathname==='/ready'){send(200,{fixture:true});return;}
  if(url.pathname==='/auth/v1/token'){
   const user=url.searchParams.get('grant_type')==='refresh_token'?refresh.get(body.refresh_token):users.find(u=>u.email===body.email&&body.password==='identity-contract-password');
   if(!user){send(400,{error:'invalid_grant'});return;}if(body.refresh_token)refresh.delete(body.refresh_token);send(200,issue(user));return;
  }
  if(url.pathname==='/auth/v1/user'){
   const user=access.get(token);if(!user){send(401,{error:'invalid_token'});return;}
   send(200,{...user,email_confirmed_at:'2026-01-01T00:00:00.000Z',is_anonymous:false});return;
  }
  if(url.pathname==='/auth/v1/logout'){access.delete(token);send(200,{});return;}
  if(url.pathname==='/auth/v1/recover'||url.pathname==='/auth/v1/signup'){send(200,{});return;}
  if(url.pathname==='/auth/v1/verify'&&body.token_hash==='a'.repeat(64)){send(200,issue(users[0]));return;}
  send(404,{error:'fixture_not_found'});
 });server.listen(port,'127.0.0.1');await once(server,'listening');
 return {url:'http://127.0.0.1:'+(server.address() as {port:number}).port,async close(){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
if(process.argv.includes('--serve-identity-fixture'))void startIdentityFixture(3103).then(()=>console.log('Synthetic identity fixture listening on loopback:3103'));
