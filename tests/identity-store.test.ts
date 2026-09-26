import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {ProjectStore} from '../lib/projects/store';
import {SqliteProjectRepository} from '../lib/persistence/sqlite';
const issuer='https://identity.example/auth/v1';
async function setup(t:{after(fn:()=>void):void}) {
 const store=new ProjectStore(':memory:');t.after(()=>store.close());
 const implementation=await import('../lib/identity/store').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof implementation.IdentityStore,'function','Persistent identity store must exist');
 const identity=new implementation.IdentityStore(store,randomBytes(32));
 const alice=identity.upsertActor({issuer,subject:randomUUID(),email:'alice@example.test',name:'Alice'});
 const bob=identity.upsertActor({issuer,subject:randomUUID(),email:'bob@example.test',name:'Bob'});
 return {store,identity,alice,bob};
}
test('P05 opaque sessions are encrypted, bounded, revocable and never accept a forged identifier',async t=>{
 const {store,identity,alice}=await setup(t);
 const session=identity.createSession(alice.id,issuer,{access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_in:3600});
 assert.equal(identity.readSession(session.token,issuer).actor.id,alice.id);
 assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM auth_sessions').all()).includes('fixture-access-token'),false);
 assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM auth_sessions').all()).includes(session.token),false);
 assert.throws(()=>identity.readSession(randomBytes(32).toString('base64url'),issuer),/session|sign in/i);
 assert.throws(()=>identity.readSession(session.token,'https://other.example/auth/v1'),/session|sign in/i);
 identity.revokeSession(session.session.id,alice.id);
 assert.throws(()=>identity.readSession(session.token,issuer),/session|sign in/i);
});
test('P05 an invitation is bound to verified email, expires and can be consumed only once',async t=>{
 const {identity,alice,bob}=await setup(t);const workspace=identity.createWorkspace(alice.id,'Product team');
 const invite=identity.invite(alice.id,workspace.id,'bob@example.test','editor');
 assert.throws(()=>identity.acceptInvite(alice.id,invite.token),/invitation/i);
 identity.acceptInvite(bob.id,invite.token);
 assert.equal(identity.context(bob.id,workspace.id).principal.roles[0],'editor');
 assert.throws(()=>identity.acceptInvite(bob.id,invite.token),/invitation/i);
 const expired=identity.invite(alice.id,workspace.id,'bob@example.test','viewer');
 identity.store.db.prepare('UPDATE workspace_invites SET expires_at=0 WHERE id=?').run(expired.id);
 assert.throws(()=>identity.acceptInvite(bob.id,expired.token),/invitation/i);
});
test('P05 membership roles are server-side, admins cannot promote themselves, last owner is protected',async t=>{
 const {identity,alice,bob}=await setup(t);const w=identity.createWorkspace(alice.id,'Team');
 identity.acceptInvite(bob.id,identity.invite(alice.id,w.id,bob.email,'admin').token);
 assert.throws(()=>identity.changeMember(bob.id,w.id,bob.id,'owner',1),/permission|owner|role/i);
 assert.throws(()=>identity.revokeMember(bob.id,w.id,alice.id,1),/permission|owner/i);
 assert.throws(()=>identity.revokeMember(alice.id,w.id,alice.id,1),/owner/i);
 identity.changeMember(alice.id,w.id,bob.id,'viewer',1);
 assert.equal(identity.context(bob.id,w.id).principal.roles[0],'viewer');
 identity.revokeMember(alice.id,w.id,bob.id,2);
 assert.throws(()=>identity.context(bob.id,w.id),/not found|access/i);
 assert.throws(()=>identity.changeMember(alice.id,w.id,bob.id,'editor',1),/conflict/i);
});
test('P05 team project access honors editor/viewer/revocation without changing legacy storage ownership',async t=>{
 const {store,identity,alice,bob}=await setup(t),repo=new SqliteProjectRepository(store);
 const w=identity.createWorkspace(alice.id,'Applications');identity.acceptInvite(bob.id,identity.invite(alice.id,w.id,bob.email,'viewer').token);
 const project=await repo.create(identity.context(alice.id,w.id),'Team project','gateway/coder');
 const reader={...identity.context(bob.id,w.id),projectId:project.id};assert.equal((await repo.read(reader)).id,project.id);
 await assert.rejects(()=>repo.save(reader,1,{files:{},assets:{}},'Unauthorized'),/write|access/i);
 identity.revokeMember(alice.id,w.id,bob.id,1);await assert.rejects(()=>repo.read(reader),/not found/i);
});
test('P05 persistent rate limits bound login attempts without storing plaintext identifiers',async t=>{
 const {identity,store}=await setup(t);
 for(let i=0;i<5;i++)identity.consumeRate('login:alice@example.test',5,60000);
 assert.throws(()=>identity.consumeRate('login:alice@example.test',5,60000),/attempt|rate|later/i);
 assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM identity_rate_limits').all()).includes('alice@example.test'),false);
});

test('P05 refresh lease covers both bounded identity HTTP calls before it can be reclaimed',async t=>{
 const {IdentityStore}=await import('../lib/identity/store');
 let now=Date.now();const store=new ProjectStore(':memory:');t.after(()=>store.close());
 const identity=new IdentityStore(store,randomBytes(32),()=>now);
 const actor=identity.upsertActor({issuer,subject:randomUUID(),email:'lease@example.test'});
 const {session}=identity.createSession(actor.id,issuer,{access_token:'fixture',refresh_token:'fixture-refresh',expires_in:3600});
 assert.ok(identity.claimRefresh(session));now+=31000;
 assert.equal(identity.claimRefresh(session),null,'A token exchange plus verified-user request may require 30 seconds');
 now+=15000;assert.ok(identity.claimRefresh(session));
});
