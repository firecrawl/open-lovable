import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {repositoryContract,context} from '../helpers/repository-contract';
import {legacyIdentifier} from '../../lib/persistence/workspaces';
import type {WorkspaceContext} from '../../lib/contracts/domain';
import {migratePostgres} from '../../lib/persistence/postgres-schema';
import {PostgresProjectRepository} from '../../lib/persistence/postgres';
const url=process.env.OPEN_LOVABLE_TEST_POSTGRES_URL;
if(!url||process.env.OPEN_LOVABLE_TEST_DATABASE_DISPOSABLE!=='1')throw new Error('PostgreSQL contract tests require an explicitly disposable test database');
const parsed=new URL(url);
if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!/^\/ol_test_[a-z0-9_]+$/.test(parsed.pathname))throw new Error('Only a dedicated loopback test database is accepted');
const admin=new Pool({connectionString:url,max:3,connectionTimeoutMillis:5000});
let pool:Pool;
const runtimeRole='ol_test_runtime_'+randomUUID().replaceAll('-','');
const runtimePassword=randomBytes(24).toString('hex');
let runtimeRoleCreated=false;
before(async()=>{
 await admin.query(`CREATE ROLE "${runtimeRole}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);runtimeRoleCreated=true;
 await migratePostgres(admin,{runtimeRole});
});
after(async()=>{
 try{await pool?.end();}finally{
  try{if(runtimeRoleCreated){await admin.query(`DROP OWNED BY "${runtimeRole}"`);await admin.query(`DROP ROLE "${runtimeRole}"`);}}
  finally{await admin.end();}
 }
});
async function setup(t:{after(fn:()=>unknown):void}){
 const {grantPostgresRuntime}=await import('../../lib/persistence/postgres-schema');
 await grantPostgresRuntime(admin,runtimeRole);
 if(!pool){const application=new URL(url!);application.username=runtimeRole;application.password=runtimePassword;pool=new Pool({connectionString:application.toString(),max:3,connectionTimeoutMillis:5000});}
 const repository=new PostgresProjectRepository(pool);
 async function seed(owner:string):Promise<WorkspaceContext>{
  const actorId=legacyIdentifier('actor',owner),workspaceId=legacyIdentifier('workspace',owner);
  await admin.query('INSERT INTO open_lovable.workspaces(id,legacy_owner,name,created_at) VALUES($1,$2,$3,$4)',[workspaceId,owner,'Test workspace',new Date().toISOString()]);
  await admin.query("INSERT INTO open_lovable.workspace_members(workspace_id,actor_id,role,active,version) VALUES($1,$2,'owner',1,1)",[workspaceId,actorId]);
  return {principal:{actorId,workspaceId,roles:['owner'],sessionVersion:1},environment:'development',requestId:randomUUID(),policyVersion:1};
 }
 const alice=await seed('alice-'+randomUUID()),bob=await seed('bob-'+randomUUID());
 return {repository,alice,bob,
  grant:async(workspace:string,actor:string,role:string)=>{await admin.query('INSERT INTO open_lovable.workspace_members(workspace_id,actor_id,role,active,version) VALUES($1,$2,$3,1,1)',[workspace,actor,role]);},
  revoke:async(workspace:string,actor:string)=>{await admin.query('UPDATE open_lovable.workspace_members SET active=0,version=version+1 WHERE workspace_id=$1 AND actor_id=$2',[workspace,actor]);}};
}
repositoryContract('PostgreSQL',setup);
test('PostgreSQL RLS denies unscoped reads and database role cannot administer schema or memberships',async t=>{
 const fixture=await setup(t),r=fixture.repository;const p=await r.create(fixture.alice,'RLS project','gateway/coder');
 assert.equal((await pool.query('SELECT id FROM open_lovable.projects')).rowCount,0);
 assert.equal((await pool.query('SELECT id FROM open_lovable.revisions')).rowCount,0);
 await assert.rejects(()=>pool.query("UPDATE open_lovable.workspace_members SET role='owner'"));
 await assert.rejects(()=>pool.query('ALTER TABLE open_lovable.projects DISABLE ROW LEVEL SECURITY'));
 assert.equal((await r.read(context(fixture.alice,p.id))).id,p.id);
 assert.equal((await pool.query('SELECT id FROM open_lovable.projects')).rowCount,0,'Transaction-local context must not escape into pooled connections');
});
test('PostgreSQL adapter refuses a privileged migration connection',async t=>{
 const fixture=await setup(t);const unsafe=new PostgresProjectRepository(admin);
 await assert.rejects(()=>unsafe.list(fixture.alice),/privileg|role|owner/i);
});

test('SQLite snapshot import preserves all data and rejects a second import into a nonempty target',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {ProjectStore}=await import('../../lib/projects/store');
 const {CredentialStore}=await import('../../lib/settings/store');const {ReferenceImageStore}=await import('../../lib/projects/images');
 const {rasterWithTokenShapedEncoding}=await import('../helpers/raster-fixture');
 const {mkdtempSync,rmSync,readFileSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {randomBytes,createHash}=await import('node:crypto');
 const {importSqliteSnapshot}=await import('../../lib/persistence/import-sqlite');
 const root=mkdtempSync(join(tmpdir(),'pg-import-source-')),file=join(root,'state.sqlite3'),key=randomBytes(32),source=new ProjectStore(file);
 const owner='import-'+randomUUID(),project=source.createProject(owner,'Imported app','gateway/coder');
 source.saveSnapshot(owner,project.id,1,{files:{'src/App.jsx':'export default ()=>null'},assets:{}},'Imported revision');
 source.addDocument(owner,project.id,'rules.md','Keep original history');
 const image=await new ReferenceImageStore(source).add(owner,project.id,'reference.png','target',(await rasterWithTokenShapedEncoding()).toString('base64'));
 const run=source.beginRun(owner,project.id,'import-plan-request','Plan my app','gateway/coder',2,{mode:'plan',imageIDs:[image.id]});source.claimRun(owner,project.id,run.id);source.event(owner,project.id,run.id,'planned',{count:1});source.completePlan(owner,project.id,run.id,'Persist this plan');
 new CredentialStore(source,key).save(owner,'gateway',0,{enabled:true,baseURL:'https://example.test/v1',apiKey:'synthetic-import-key'});
 const {IdentityStore}=await import('../../lib/identity/store');const identity=new IdentityStore(source,key);
 const actor=identity.upsertActor({issuer:'https://identity.example/auth/v1',subject:randomUUID(),email:'import@example.test'});
 const workspace=identity.createWorkspace(actor.id,'Imported team');
 identity.createSession(actor.id,actor.issuer,{access_token:'synthetic-import-access',refresh_token:'synthetic-import-refresh',expires_in:3600});
 identity.invite(actor.id,workspace.id,'invitee@example.test','editor');
 const {RunQueue}=await import('../../lib/runs/queue');const {SqliteProjectRepository}=await import('../../lib/persistence/sqlite');
 const context=new SqliteProjectRepository(source).individualContext(owner),queue=new RunQueue(source);
 const queued=queue.enqueue({workspaceId:context.principal.workspaceId,actorId:context.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:owner,allowLoopback:true,modelBinding:'a'.repeat(64),policyVersion:1},{projectId:project.id,baseVersion:2,requestKey:randomUUID(),prompt:'Queued before backup',model:'gateway/coder',mode:'build',imageIDs:[],confirmCost:true});
 source.close();
 const original=readFileSync(file);const dbName='ol_test_import_'+randomUUID().replaceAll('-','');
 const targetURL=new URL(url!);targetURL.pathname='/'+dbName;
 await admin.query('CREATE DATABASE "'+dbName+'"');const target=new Pool({connectionString:targetURL.toString(),max:2});
 try{
  await migratePostgres(target,{runtimeRole});
  await assert.rejects(()=>importSqliteSnapshot(file,randomBytes(32),target),/key|credential|decrypt/i);
  assert.equal((await target.query('SELECT count(*) AS n FROM open_lovable.workspaces')).rows[0].n,'0');
  const report=await importSqliteSnapshot(file,key,target);assert.equal(report.activation,'NOT_PERFORMED');assert.equal(report.tables.projects.rows,1);assert.equal(report.tables.revisions.rows,2);assert.equal(report.tables.project_images.rows,1);assert.equal(report.tables.runs.rows,2);assert.equal(report.tables.run_events.rows,1);assert.equal(report.tables.execution_claims.rows,1);assert.equal(report.tables.messages.rows,3);
  assert.deepEqual(readFileSync(file),original);
  assert.equal(report.tables.identity_actors.rows,1);assert.equal(report.tables.auth_sessions.rows,1);assert.equal(report.tables.workspace_invites.rows,1);
  assert.equal(report.sessionsInvalidated,1);assert.equal(report.invitationsInvalidated,1);
  assert.equal(report.tables.run_controls.rows,1);assert.equal(report.tables.run_journal.rows,1);assert.equal(report.runsInvalidated,1);
  assert.equal((await target.query('SELECT state FROM open_lovable.runs WHERE id=$1',[queued.id])).rows[0].state,'INTERRUPTED');
  assert.equal((await target.query('SELECT outcome FROM open_lovable.run_controls WHERE run_id=$1',[queued.id])).rows[0].outcome,'RECOVERY_REVIEW_REQUIRED');
  await assert.rejects(()=>target.query('UPDATE open_lovable.run_controls SET authority=$1 WHERE run_id=$2',['{}',queued.id]),/immutable/i);
  await assert.rejects(()=>target.query('UPDATE open_lovable.runs SET prompt=$1 WHERE id=$2',['Changed prompt',queued.id]),/immutable/i);
  await assert.rejects(()=>target.query('DELETE FROM open_lovable.run_journal WHERE run_id=$1',[queued.id]),/immutable/i);

  assert.equal((await target.query("SELECT count(*) AS n FROM open_lovable.auth_sessions WHERE revoked_at IS NULL OR encrypted<>''")).rows[0].n,'0');
  assert.equal((await target.query('SELECT count(*) AS n FROM open_lovable.workspace_invites WHERE cancelled_at IS NULL')).rows[0].n,'0');
  const loaded=await target.query('SELECT snapshot,version,id FROM open_lovable.projects');assert.equal(loaded.rows[0].id,project.id);assert.equal(loaded.rows[0].version,2);
  const connection=await target.query('SELECT encrypted FROM open_lovable.provider_settings');assert.equal(connection.rows[0].encrypted.includes('synthetic-import-key'),false);
  await assert.rejects(()=>importSqliteSnapshot(file,key,target),/empty|nonempty|exist/i);assert.equal((await target.query('SELECT count(*) AS n FROM open_lovable.revisions')).rows[0].n,'2');
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),createHash('sha256').update(original).digest('hex'));
 }finally{await target.end();await admin.query('DROP DATABASE "'+dbName+'"');rmSync(root,{recursive:true,force:true});key.fill(0);}
});

test('P05 identity storage is denied to the project runtime role',async t=>{
 await setup(t);
 for(const table of ['identity_actors','auth_sessions','workspace_invites','identity_audit','identity_rate_limits','run_controls','run_journal','worker_leases']){
  await assert.rejects(()=>pool.query('SELECT * FROM open_lovable.'+table),/permission denied/);
 }
});
test('P05 migration 2 upgrades a real v1 database without rewriting its migration history',async()=>{
 const {POSTGRES_SCHEMA_SQL,POSTGRES_SCHEMA_DIGEST,POSTGRES_MIGRATIONS}=await import('../../lib/persistence/postgres-schema');
 const dbName='ol_test_upgrade_'+randomUUID().replaceAll('-',''),targetURL=new URL(url!);targetURL.pathname='/'+dbName;
 await admin.query('CREATE DATABASE "'+dbName+'"');const target=new Pool({connectionString:targetURL.toString(),max:2});
 try{
  await target.query('CREATE SCHEMA open_lovable; CREATE TABLE open_lovable.schema_migrations(version INTEGER PRIMARY KEY,digest TEXT NOT NULL,applied_at TEXT NOT NULL)');
  await target.query(POSTGRES_SCHEMA_SQL);
  await target.query('INSERT INTO open_lovable.schema_migrations VALUES(1,$1,$2)',[POSTGRES_SCHEMA_DIGEST,'2026-01-01']);
  await migratePostgres(target,{runtimeRole});await migratePostgres(target,{runtimeRole});
  const rows=(await target.query('SELECT version,digest,applied_at FROM open_lovable.schema_migrations ORDER BY version')).rows;
  assert.equal(rows.length,POSTGRES_MIGRATIONS.length);assert.deepEqual(rows.map(row=>row.digest),POSTGRES_MIGRATIONS.map(migration=>migration.digest));assert.equal(rows[0].applied_at,'2026-01-01');
 }finally{await target.end();await admin.query('DROP DATABASE "'+dbName+'"');}
});

test('PostgreSQL import preserves previously uncertain outcomes while invalidating newly pending work',async()=>{
 const {ProjectStore}=await import('../../lib/projects/store');const {SqliteProjectRepository}=await import('../../lib/persistence/sqlite');
 const {RunQueue}=await import('../../lib/runs/queue');const {importSqliteSnapshot}=await import('../../lib/persistence/import-sqlite');
 const {mkdtempSync,rmSync,readFileSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
 const root=mkdtempSync(join(tmpdir(),'pg-uncertain-source-')),file=join(root,'state.sqlite3'),key=randomBytes(32),source=new ProjectStore(file);
 const dbName='ol_test_uncertain_'+randomUUID().replaceAll('-',''),targetURL=new URL(url!);targetURL.pathname='/'+dbName;
 let target:Pool|undefined,created=false;
 try{
  const repository=new SqliteProjectRepository(source),ctx=repository.individualContext('alice'),project=await repository.create(ctx,'Uncertain history','gateway/model');
  const authority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual' as const,sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'alice',allowLoopback:true,modelBinding:'a'.repeat(64),policyVersion:1};
  const request={projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'Historical request',model:'gateway/model',mode:'build' as const,imageIDs:[],confirmCost:true};
  let now=Date.now();const queue=new RunQueue(source,()=>now),uncertain=queue.enqueue(authority,request),worker=queue.acquireWorker('crashed')!,job=queue.claim(worker)!;
  queue.markModelStarted(job);now+=21000;queue.reconcile();assert.equal(queue.get(authority,uncertain.id).outcome,'MODEL_OUTCOME_UNCERTAIN');
  const pending=queue.enqueue(authority,{...request,requestKey:randomUUID()});source.close();const original=readFileSync(file);
  await admin.query('CREATE DATABASE "'+dbName+'"');created=true;target=new Pool({connectionString:targetURL.toString(),max:2});await migratePostgres(target,{runtimeRole});
  const report=await importSqliteSnapshot(file,key,target);assert.equal(report.runsInvalidated,1);assert.equal(report.activation,'NOT_PERFORMED');
  const controls=(await target.query('SELECT run_id,outcome FROM open_lovable.run_controls')).rows;
  assert.equal(controls.find(row=>row.run_id===uncertain.id)?.outcome,'MODEL_OUTCOME_UNCERTAIN');
  assert.equal(controls.find(row=>row.run_id===pending.id)?.outcome,'RECOVERY_REVIEW_REQUIRED');
  assert.equal((await target.query("SELECT count(*) AS n FROM open_lovable.runs WHERE state='INTERRUPTED'")).rows[0].n,'2');assert.deepEqual(readFileSync(file),original);
 }finally{source.close();await target?.end();if(created)await admin.query('DROP DATABASE "'+dbName+'"');rmSync(root,{recursive:true,force:true});key.fill(0);}
});
