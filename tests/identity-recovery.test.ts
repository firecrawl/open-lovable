import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectStore} from '../lib/projects/store';
import {IdentityStore} from '../lib/identity/store';
import {createRecoveryBundle,restoreRecoveryBundle,verifyRecoveryBundle} from '../lib/projects/recovery';
const issuer='https://identity.example/auth/v1';
function setup(t:{after(fn:()=>void):void}) {
 const root=mkdtempSync(join(tmpdir(),'account-recovery-contract-')),store=new ProjectStore(join(root,'source','state.sqlite3')),key=randomBytes(32);
 t.after(()=>{store.close();key.fill(0);rmSync(root,{recursive:true,force:true});});
 const identity=new IdentityStore(store,key),actor=identity.upsertActor({issuer,subject:randomUUID(),email:'alice@example.test'});
 const w=identity.createWorkspace(actor.id,'Recovery team');
 const session=identity.createSession(actor.id,issuer,{access_token:'synthetic-access-for-recovery',refresh_token:'synthetic-refresh-for-recovery',expires_in:3600});
 return {root,store,key,identity,actor,w,session};
}
test('P05 recovery authenticates every encrypted identity row even without saved LLM credentials',async t=>{
 const f=setup(t),bundle=join(f.root,'bad-key');
 await assert.rejects(()=>createRecoveryBundle(f.store,randomBytes(32),bundle),/session|credential|authentic/i);
 assert.equal(existsSync(bundle),false);assert.equal(f.identity.readSession(f.session.token,issuer).actor.id,f.actor.id);
 f.store.db.prepare("UPDATE auth_sessions SET encrypted='corrupted' WHERE id=?").run(f.session.session.id);
 await assert.rejects(()=>createRecoveryBundle(f.store,f.key,join(f.root,'corrupt')),/session|credential|authentic/i);
});
test('P05 isolated restore preserves team data but never resurrects an old browser session',async t=>{
 const f=setup(t),bundle=join(f.root,'bundle');await createRecoveryBundle(f.store,f.key,bundle);await verifyRecoveryBundle(bundle,f.key);
 const before=readFileSync(join(bundle,'database.enc'));
 const target=join(f.root,'restored'),report=await restoreRecoveryBundle(bundle,f.key,target);
 const restored=new ProjectStore(join(target,'state.sqlite3'));
 try{
  const accounts=new IdentityStore(restored,f.key);assert.equal(accounts.listWorkspaces(f.actor.id)[0].id,f.w.id);
  assert.throws(()=>accounts.readSession(f.session.token,issuer),/session|sign in/i);
  assert.equal((report as any).sessionsInvalidated,1);assert.match((report as any).restoredDatabaseDigest,/^[a-f0-9]{64}$/);
  assert.equal(restored.db.prepare("SELECT count(*) AS n FROM auth_sessions WHERE encrypted<>''").get()?.n,0);
 }finally{restored.close();}
 assert.deepEqual(readFileSync(join(bundle,'database.enc')),before);
 assert.equal(f.identity.readSession(f.session.token,issuer).actor.id,f.actor.id);
});

test('P05 restore cannot revive an invitation that was consumed or revoked after the snapshot',async t=>{
 const f=setup(t),bob=f.identity.upsertActor({issuer,subject:randomUUID(),email:'bob@example.test'});
 const invite=f.identity.invite(f.actor.id,f.w.id,bob.email,'editor'),bundle=join(f.root,'invitation-bundle');
 await createRecoveryBundle(f.store,f.key,bundle);f.identity.acceptInvite(bob.id,invite.token);
 const target=join(f.root,'invite-restored'),report=await restoreRecoveryBundle(bundle,f.key,target);
 const db=new ProjectStore(join(target,'state.sqlite3'));try{
  const identity=new IdentityStore(db,f.key);assert.throws(()=>identity.acceptInvite(bob.id,invite.token),/invitation|invalid|expired/i);
  assert.equal((report as any).invitationsInvalidated,1);
 }finally{db.close();}
 assert.ok(f.identity.context(bob.id,f.w.id));
});
