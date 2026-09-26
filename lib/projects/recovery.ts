import {decodeAuthTokens} from '../identity/crypto';
import {performance} from 'node:perf_hooks';
import {backup,DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {createReadStream,createWriteStream,lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {basename,dirname,resolve,relative,sep,isAbsolute,join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import {isBase64} from '../security/base64';
import {z} from 'zod';
import {assertSafeDataAncestors} from '../security/data-paths';
import {migrations} from './schema';
import {ProjectError,type ProjectStore} from './store';
import {readProviderConfiguration} from '../settings/store';

const LIMIT=512*1024*1024;
export interface RecoveryOptions {maxBytes?:number;timeoutMs?:number;signal?:AbortSignal;}
/** Enforces a monotonic deadline even when synchronous SQLite work delays event-loop timers. */
export function createRecoveryBudget(options:RecoveryOptions={}){
 const maxBytes=options.maxBytes??LIMIT,timeoutMs=options.timeoutMs??120000;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>LIMIT||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new ProjectError('Invalid recovery size or time budget');
 const signals=[AbortSignal.timeout(timeoutMs)];if(options.signal)signals.push(options.signal);
 const signal=AbortSignal.any(signals),deadline=performance.now()+timeoutMs;
 const check=()=>{signal.throwIfAborted();if(performance.now()>=deadline)throw new DOMException('Recovery time budget exceeded','TimeoutError');};check();
 return {maxBytes,signal,check};
}
const digestSchema=z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema=z.object({formatVersion:z.literal(1),schemaVersion:z.number().int().min(1),createdAt:z.string().datetime(),
 tables:z.record(z.object({rows:z.number().int().nonnegative(),digest:digestSchema}).strict()),
 databaseDigest:digestSchema,ciphertextDigest:digestSchema,nonce:z.string().regex(/^[a-f0-9]{24}$/),tag:z.string().regex(/^[a-f0-9]{32}$/),mac:digestSchema}).strict();
export type RecoveryManifest=z.infer<typeof manifestSchema>;
const aad=Buffer.from('OpenLovable-Recovery-v1');
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value);
}
function keyBytes(key:Uint8Array):Buffer{
 if(!(key instanceof Uint8Array)||key.byteLength!==32)throw new ProjectError('Recovery requires the original 32-byte master key',503);
 return Buffer.from(key);
}
function authenticate(manifest:Omit<RecoveryManifest,'mac'>,key:Buffer):string{
 const derived=createHmac('sha256',key).update('OpenLovable-Recovery-manifest-key-v1').digest();
 return createHmac('sha256',derived).update(canonical(manifest)).digest('hex');
}
function regularFile(path:string,maxBytes=LIMIT):void{
 assertSafeDataAncestors(path);const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)throw new ProjectError('Invalid or oversized recovery file',400);
}
async function fileDigest(path:string,maxBytes=LIMIT,signal?:AbortSignal):Promise<string>{
 signal?.throwIfAborted();regularFile(path,maxBytes);const hash=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(path,{signal})){signal?.throwIfAborted();bytes+=chunk.length;if(bytes>maxBytes)throw new ProjectError('Recovery size limit exceeded',413);hash.update(chunk);}
 return hash.digest('hex');
}
function createNewTarget(path:string):string{
 const target=resolve(path);assertSafeDataAncestors(target);
 const parent=realpathSync(dirname(target)),canonicalTarget=join(parent,basename(target));
 const rel=relative(realpathSync(process.cwd()),canonicalTarget);
 if(!rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep)))throw new ProjectError('Recovery data must remain outside the checkout',400);
 try{mkdirSync(canonicalTarget,{mode:0o700});}catch(error){
  if((error as NodeJS.ErrnoException).code==='EEXIST')throw new ProjectError('Recovery target already exists; refusing to overwrite',409);throw error;
 }
 return canonicalTarget;
}
/** Read-only structural inventory; the source is never opened through migrating ProjectStore. */
export function inspectRecoverySnapshot(path:string,key:Buffer,maxBytes=LIMIT,check:()=>void=()=>{}):{schemaVersion:number;tables:RecoveryManifest['tables']}{
 check();regularFile(path,maxBytes);const db=new DatabaseSync(path,{readOnly:true});
 try{
  check();const schemaVersion=Number(db.prepare('PRAGMA user_version').get()?.user_version);
  if(schemaVersion<1||schemaVersion>migrations.length)throw new ProjectError('Backup schema is newer or unsupported by this application',503);
  if(db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new ProjectError('Backup database integrity check failed',503);
  check();const expected=new DatabaseSync(':memory:');
  try {
   for(const migration of migrations.filter(item=>item.version<=schemaVersion))expected.exec(migration.sql);
   const sql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
   if(canonical(expected.prepare(sql).all())!==canonical(db.prepare(sql).all()))throw new ProjectError('Application schema does not match its declared migration version',503);
  } finally {expected.close();}
  for(const row of db.prepare('SELECT snapshot,sha256 FROM revisions').iterate()){
   check();if(createHash('sha256').update(String(row.snapshot)).digest('hex')!==row.sha256)throw new ProjectError('Revision checksum integrity failed',503);
  }
  for(const row of db.prepare('SELECT content,sha256 FROM project_documents').iterate()){
   check();if(createHash('sha256').update(String(row.content)).digest('hex')!==row.sha256)throw new ProjectError('Document checksum integrity failed',503);
  }
  if(schemaVersion>=3)for(const row of db.prepare('SELECT data,sha256,bytes FROM project_images').iterate()){
   check();if(typeof row.data!=='string'||!isBase64(row.data))throw new ProjectError('Image encoding integrity failed',503);
   const bytes=Buffer.from(row.data,'base64');
   if(bytes.length!==Number(row.bytes)||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new ProjectError('Image checksum integrity failed',503);
  }
  if(db.prepare('SELECT p.id FROM projects p LEFT JOIN revisions r ON r.project_id=p.id AND r.version=p.version WHERE r.id IS NULL OR p.snapshot<>r.snapshot LIMIT 1').get())throw new ProjectError('Project and revision integrity mismatch',503);

  // Authenticate credentials from the immutable snapshot, not the live database.
  for(const row of db.prepare('SELECT owner,provider FROM provider_settings').all()){
   check();readProviderConfiguration(db,key,String(row.owner),String(row.provider));
  }
  if(schemaVersion>=5)for(const row of db.prepare("SELECT id,actor_id,issuer,encrypted FROM auth_sessions WHERE encrypted<>''").iterate()){
   check();decodeAuthTokens(key,String(row.id),String(row.actor_id),String(row.issuer),String(row.encrypted));
  }
  const tables:RecoveryManifest['tables']={};
  for(const row of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
   check();const name=String(row.name);if(!/^[a-z_][a-z0-9_]*$/i.test(name))throw new ProjectError('Unexpected table name in recovery database');
   let rows=0;const hash=createHash('sha256');
   for(const record of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate()){check();rows++;hash.update(canonical(record)+'\n');}
   tables[name]={rows,digest:hash.digest('hex')};
  }
  check();return {schemaVersion,tables};
 }finally{db.close();}
}

/** Create a consistent SQLite snapshot and encrypt it. Master key is deliberately not bundled. */
export async function createRecoveryBundle(store:Pick<ProjectStore,'db'>,masterKey:Uint8Array,destination:string,options:RecoveryOptions={}):Promise<RecoveryManifest>{
 const budget=createRecoveryBudget(options);const key=keyBytes(masterKey);let target:string|undefined;let encryptionKey:Buffer|undefined;
 try{
  budget.check();const pageSize=Number(store.db.prepare('PRAGMA page_size').get()?.page_size);
  const pages=Number(store.db.prepare('PRAGMA page_count').get()?.page_count);
  if(!Number.isSafeInteger(pageSize)||!Number.isSafeInteger(pages)||pageSize*pages>budget.maxBytes)throw new ProjectError('Recovery size limit exceeded',413);
  target=createNewTarget(destination);const plain=join(target,'snapshot.sqlite3'),encrypted=join(target,'database.enc');
  await backup(store.db,plain,{rate:100,progress:({totalPages})=>{budget.check();if(totalPages*pageSize>budget.maxBytes)throw new ProjectError('Recovery size limit exceeded',413);}});
  budget.check();const state=inspectRecoverySnapshot(plain,key,budget.maxBytes,budget.check),databaseDigest=await fileDigest(plain,budget.maxBytes,budget.signal),nonce=randomBytes(12);
  encryptionKey=Buffer.from(hkdfSync('sha256',key,nonce,'OpenLovable-Recovery-data-v1',32));
  const cipher=createCipheriv('aes-256-gcm',encryptionKey,nonce,{authTagLength:16});cipher.setAAD(aad);
  await pipeline(createReadStream(plain),cipher,createWriteStream(encrypted,{flags:'wx',mode:0o600,flush:true}),{signal:budget.signal});
  const payload:Omit<RecoveryManifest,'mac'>={formatVersion:1,...state,createdAt:new Date().toISOString(),databaseDigest,ciphertextDigest:await fileDigest(encrypted,budget.maxBytes,budget.signal),nonce:nonce.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
  const manifest={...payload,mac:authenticate(payload,key)};
  unlinkSync(plain);for(const suffix of ['-wal','-shm']){try{unlinkSync(plain+suffix);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  budget.check();writeFileSync(join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600,flush:true});
  return manifest;
 }catch(error){if(target)rmSync(target,{recursive:true,force:true});throw error;}
 finally{key.fill(0);encryptionKey?.fill(0);}
}

/** Restore only into a new private directory after authentication, digests and schema checks. */
async function restoreBundle(bundle:string,masterKey:Uint8Array,destination:string,materializeKey:boolean,options:RecoveryOptions={}):Promise<{schemaVersion:number;databaseDigest:string;restoredDatabaseDigest:string;sessionsInvalidated:number;invitationsInvalidated:number;runsInvalidated:number;tables:RecoveryManifest['tables']}>{
 const budget=createRecoveryBudget(options);const key=keyBytes(masterKey);let target:string|undefined;let encryptionKey:Buffer|undefined;
 try{
  budget.check();const source=resolve(bundle),manifestPath=join(source,'manifest.json'),encrypted=join(source,'database.enc');regularFile(manifestPath,1024*1024);
  const manifest=manifestSchema.parse(JSON.parse(readFileSync(manifestPath,'utf8')));const {mac,...payload}=manifest;
  if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(authenticate(payload,key),'hex')))throw new ProjectError('Recovery authentication failed. Use the original master key.',503);
  if(manifest.schemaVersion>migrations.length)throw new ProjectError('Backup schema is newer than this application',503);
  if(await fileDigest(encrypted,budget.maxBytes,budget.signal)!==manifest.ciphertextDigest)throw new ProjectError('Recovery ciphertext integrity check failed',503);
  target=createNewTarget(destination);const plain=join(target,'state.sqlite3');
  encryptionKey=Buffer.from(hkdfSync('sha256',key,Buffer.from(manifest.nonce,'hex'),'OpenLovable-Recovery-data-v1',32));
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(manifest.nonce,'hex'),{authTagLength:16});decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(manifest.tag,'hex'));
  await pipeline(createReadStream(encrypted),decipher,createWriteStream(plain,{flags:'wx',mode:0o600,flush:true}),{signal:budget.signal});
  if(await fileDigest(plain,budget.maxBytes,budget.signal)!==manifest.databaseDigest)throw new ProjectError('Restored database checksum mismatch',503);
  const actual=inspectRecoverySnapshot(plain,key,budget.maxBytes,budget.check);
  if(actual.schemaVersion!==manifest.schemaVersion||canonical(actual.tables)!==canonical(manifest.tables))throw new ProjectError('Restored database inventory mismatch',503);
  let sessionsInvalidated=0,invitationsInvalidated=0,runsInvalidated=0;
  if(materializeKey&&actual.schemaVersion>=5){
   budget.check();const restored=new DatabaseSync(plain);
   try{restored.exec('BEGIN IMMEDIATE');sessionsInvalidated=Number(restored.prepare("UPDATE auth_sessions SET revoked_at=?,encrypted='',refresh_lease=NULL,refresh_until=0 WHERE revoked_at IS NULL OR encrypted<>''").run(Date.now()).changes);invitationsInvalidated=Number(restored.prepare('UPDATE workspace_invites SET cancelled_at=? WHERE consumed_at IS NULL AND cancelled_at IS NULL').run(Date.now()).changes);restored.exec('COMMIT');}
   finally{restored.close();}
  }
  if(materializeKey&&actual.schemaVersion>=6){
   budget.check();const restored=new DatabaseSync(plain);
   try{
    restored.exec('BEGIN IMMEDIATE');
    restored.exec("UPDATE run_controls SET worker_id=NULL,phase='interrupted',outcome='RECOVERY_REVIEW_REQUIRED' WHERE run_id IN (SELECT id FROM runs WHERE state IN ('QUEUED','RUNNING'))");
    runsInvalidated=Number(restored.prepare("UPDATE runs SET state='INTERRUPTED',lease_until=0,error='Restored execution requires a new authorization; no automatic replay.' WHERE state IN ('QUEUED','RUNNING')").run().changes);
    restored.exec('DELETE FROM worker_leases; COMMIT');
   }finally{restored.close();}
  }
  const restoredDatabaseDigest=await fileDigest(plain,budget.maxBytes,budget.signal);
  budget.check();if(materializeKey)writeFileSync(join(target,'credentials.key'),key,{flag:'wx',mode:0o600,flush:true});
  return {...actual,databaseDigest:manifest.databaseDigest,restoredDatabaseDigest,sessionsInvalidated,invitationsInvalidated,runsInvalidated};
 }catch(error){if(target)rmSync(target,{recursive:true,force:true});throw error;}
 finally{key.fill(0);encryptionKey?.fill(0);}
}

/** Explicit restore never overwrites an existing directory or migrates the recovered database. */
export function restoreRecoveryBundle(bundle:string,masterKey:Uint8Array,destination:string,options:RecoveryOptions={}){
 return restoreBundle(bundle,masterKey,destination,true,options);
}
/** Verify decryption and application integrity in a disposable private directory, without installing a key. */
export async function verifyRecoveryBundle(bundle:string,masterKey:Uint8Array,options:RecoveryOptions={}){
 const root=mkdtempSync(join(realpathSync(tmpdir()),'open-lovable-verify-'));
 try{return await restoreBundle(bundle,masterKey,join(root,'verified'),false,options);}
 finally{rmSync(root,{recursive:true,force:true});}
}
