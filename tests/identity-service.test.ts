import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {ProjectStore} from '../lib/projects/store';
import {IdentityStore} from '../lib/identity/store';
async function setup(t:{after(fn:()=>void):void}) {
 const store=new ProjectStore(':memory:');t.after(()=>store.close());const identity=new IdentityStore(store,randomBytes(32));
 let refreshed=0,revoked=false;const subject=randomUUID();
 const user={subject,email:'alice@example.test',name:'Alice'},tokens={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600};
 const provider={binding:'https://identity.example/auth/v1#test',issuer:'https://identity.example/auth/v1',
  signIn:async()=>({user,tokens}),getUser:async()=>{if(revoked)throw new (await import('../lib/projects/store')).ProjectError('Identity rejected',401);return user;},
  refresh:async()=>{refreshed++;await new Promise(r=>setTimeout(r,20));return {user,tokens:{...tokens,access_token:'fixture-refreshed'}};},
  signOut:async()=>{revoked=true;},recover:async()=>{},signUp:async()=>{},confirm:async()=>({user,tokens}),updatePassword:async()=>{}};
 const implementation=await import('../lib/identity/service').catch(()=>({})) as Record<string,any>;assert.equal(typeof implementation.AccountService,'function');
 return {store,identity,service:new implementation.AccountService(identity,provider,'https://studio.example'),provider,refreshed:()=>refreshed};
}
test('P05 sessions survive service recreation, refresh once under contention, and logout fails closed',async t=>{
 const f=await setup(t),created=await f.service.login('alice@example.test','a-valid-fixture-password');
 assert.equal((await f.service.authenticate(created.token)).actor.email,'alice@example.test');
 f.store.db.prepare('UPDATE auth_sessions SET access_expires_at=0 WHERE id=?').run(created.session.id);
 const [a,b]=await Promise.all([f.service.authenticate(created.token),f.service.authenticate(created.token)]);
 assert.equal(a.tokens.access_token,'fixture-refreshed');assert.equal(b.tokens.access_token,'fixture-refreshed');assert.equal(f.refreshed(),1);
 await f.service.logout(created.token);await assert.rejects(()=>f.service.authenticate(created.token),/session|sign in/i);
});
test('P05 forged identity in a refresh cannot switch the actor behind a session',async t=>{
 const f=await setup(t),created=await f.service.login('alice@example.test','a-valid-fixture-password');
 f.provider.refresh=async()=>({user:{subject:randomUUID(),email:'attacker@example.test',name:'Other'},tokens:{access_token:'fixture-other',refresh_token:'fixture-other',expires_in:3600}});
 f.store.db.prepare('UPDATE auth_sessions SET access_expires_at=0 WHERE id=?').run(created.session.id);
 await assert.rejects(()=>f.service.authenticate(created.token),/identity|session/i);
});
test('P05 recovery sessions cannot access normal projects and password changes revoke local sessions',async t=>{
 const f=await setup(t),normal=await f.service.login('alice@example.test','a-valid-fixture-password');
 const recovery=await f.service.confirm('a'.repeat(64),'recovery');
 await assert.rejects(()=>f.service.authenticate(recovery.token),/recovery|password/i);
 await f.service.resetPassword(recovery.token,'another-valid-password');
 await assert.rejects(()=>f.service.authenticate(normal.token),/session|sign in/i);
});

test('P05 changing a publishable key or studio origin invalidates sessions, not actor ownership',async t=>{
 const f=await setup(t),first=await f.service.login('alice@example.test','a-valid-fixture-password');
 const original=f.identity.listWorkspaces(first.session.actor_id);
 const {AccountService}=await import('../lib/identity/service');
 f.provider.binding+='-rotated';const next=new AccountService(f.identity,f.provider,'https://new-studio.example');
 await assert.rejects(()=>next.authenticate(first.token),/session|sign in/i);
 const second=await next.login('alice@example.test','a-valid-fixture-password');
 assert.equal(second.session.actor_id,first.session.actor_id);
 assert.deepEqual(f.identity.listWorkspaces(second.session.actor_id),original);
});

test('P05 documented email confirmation creates a usable first workspace without a second login',async t=>{
 const f=await setup(t),created=await f.service.confirm('a'.repeat(64),'email');
 const session=await f.service.authenticate(created.token);
 assert.equal(session.purpose,'normal');assert.ok(session.selected_workspace_id);
 assert.equal(f.identity.listWorkspaces(session.actor_id).length,1);
});

test('a queued worker session is revalidated without a cookie and cannot cross a changed service binding',async t=>{
 const f=await setup(t),created=await f.service.login('alice@example.test','a-valid-fixture-password');
 assert.equal(typeof f.service.authenticateSession,'function','Workers must use the same verified session contract');
 assert.equal((await f.service.authenticateSession(created.session.id)).actor.id,created.session.actor_id);
 f.provider.binding+='-rotated';const {AccountService}=await import('../lib/identity/service');
 const rotated=new AccountService(f.identity,f.provider,'https://studio.example');
 await assert.rejects(()=>rotated.authenticateSession(created.session.id),/session|binding/i);
 await f.service.logout(created.token);await assert.rejects(()=>f.service.authenticateSession(created.session.id),/session/i);
});
