import {backfillLegacyWorkspaces,ensureIndividualWorkspace} from '../persistence/workspaces';
import {assertSafeDataAncestors} from '@/lib/security/data-paths';
import { isBase64 } from '@/lib/security/base64';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute, sep } from 'node:path';
import { homedir } from 'node:os';
import { migrations } from './schema';
import { assertNoSecrets, redactSecretText } from '@/lib/security/secret-content';
import { normalizeProjectPath } from '@/lib/security/input-validation';

export interface ProjectSnapshot { files: Record<string,string>; assets: Record<string,string>; }
export interface Project {
 id:string; owner:string; name:string; model:string; version:number; snapshot:ProjectSnapshot; created_at:string; updated_at:string;
}
export type RunState='QUEUED'|'RUNNING'|'AWAITING_INPUT'|'AWAITING_APPROVAL'|'SUCCEEDED'|'FAILED'|'CANCELLED'|'INTERRUPTED';
export interface RunInputs {mode:'build'|'plan';images:Array<{id:string;sha256:string}>;}
export interface RunOptions {mode?:'build'|'plan';imageIDs?:string[];queued?:boolean;}
export interface ProjectRun {
 inputs:RunInputs;
 id:string; project_id:string; request_key:string; prompt:string; model:string; base_version:number;
 state:RunState; candidate:ProjectSnapshot|null; explanation:string; error:string; lease_until:number; created_at:string; updated_at:string;
}
export class ProjectError extends Error {
 constructor(message:string,readonly status=400) {super(message);this.name='ProjectError';}
}
export const SNAPSHOT_LIMIT=8*1024*1024;
const now=()=>new Date().toISOString();
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validates only data. Never executes source, package scripts, or a project configuration. */
export function validateSnapshot(input:unknown):ProjectSnapshot {
 if(!input || typeof input!=='object') throw new ProjectError('Invalid project snapshot');
 const source=input as ProjectSnapshot;
 if(Object.keys(source).some(key=>key!=='files'&&key!=='assets'))throw new ProjectError('Unknown snapshot field; only files and assets are accepted');
 if(!source.files || typeof source.files!=='object' || Array.isArray(source.files) || !source.assets || typeof source.assets!=='object' || Array.isArray(source.assets)) throw new ProjectError('Files and assets must be objects');
 if(Object.keys(source.files).length+Object.keys(source.assets).length>300) throw new ProjectError('Project exceeds 300 files');
 let bytes=0;const paths=new Set<string>();
 for(const [kind,entries] of Object.entries({files:source.files,assets:source.assets})) {
  for(const [path,content] of Object.entries(entries)) {
   if(normalizeProjectPath(path)!==path || path.startsWith('/') || typeof content!=='string') throw new ProjectError('Invalid project path or content');
   if(paths.has(path.toLowerCase())) throw new ProjectError('Duplicate project path');paths.add(path.toLowerCase());
   if(kind==='files') {
    if(Buffer.byteLength(content)>1024*1024) throw new ProjectError('Project file exceeds 1 MiB');
    assertNoSecrets(content);bytes+=Buffer.byteLength(content);
   } else {
    if(!/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i.test(path) || !isBase64(content)) throw new ProjectError('Unsupported binary asset');
    const length=Buffer.byteLength(content,'base64');if(length>2*1024*1024) throw new ProjectError('Asset exceeds 2 MiB');bytes+=length;
   }
  }
 }
 if(bytes>SNAPSHOT_LIMIT) throw new ProjectError('Project exceeds 8 MiB');
 return JSON.parse(JSON.stringify(source));
}

/** One local database, durable across process restarts; every public data method checks ownership. */
export class ProjectStore {
 readonly db:DatabaseSync;
 private closed=false;
 private transactionDepth=0;
 constructor(readonly path:string) {
  if(path!==':memory:') {
   mkdirSync(dirname(path),{recursive:true,mode:0o700});
   for(const candidate of [dirname(path),path]) {
    try {if(lstatSync(candidate).isSymbolicLink()) throw new ProjectError('Database path must not be a symlink',503);}
    catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
   }
  }
  this.db=new DatabaseSync(path);
  try {
   // Reject an unsupported version before changing persistent journal mode or running migrations.
   const version=Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
   if(version>migrations.length)throw new ProjectError('Database schema is newer than this application',503);
   this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
   for(const migration of migrations.filter(item=>item.version>version)) {
    // SQLite requires connection-local FK enforcement paused during a table replacement. Validate every relation before commit and re-enable in finally.
    const rebuild= [6,8].includes(migration.version);
    if(rebuild)this.db.exec('PRAGMA foreign_keys=OFF');
    try {this.transaction(()=>{
     const current=Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
     if(current>=migration.version)return;
     this.db.exec(migration.sql);if(migration.version===4)backfillLegacyWorkspaces(this.db);
     if(rebuild&&this.db.prepare('PRAGMA foreign_key_check').all().length)throw new ProjectError('Migration would violate database integrity',503);
     this.db.exec(`PRAGMA user_version=${migration.version}`);
    });} finally {if(rebuild)this.db.exec('PRAGMA foreign_keys=ON');}
   }
  }
  catch(error) {this.db.close();throw error;}
 }
 close():void {if(!this.closed) {this.db.close();this.closed=true;}}
 transaction<T>(fn:()=>T):T {
  if(fn.constructor.name==='AsyncFunction')throw new ProjectError('Transaction callbacks must be synchronous');
  const depth=this.transactionDepth,name='ol_nested_'+depth;
  this.db.exec(depth?'SAVEPOINT '+name:'BEGIN IMMEDIATE');this.transactionDepth++;
  try {
   const result=fn();
   if(result&&typeof (result as {then?:unknown}).then==='function')throw new ProjectError('Transaction callbacks must be synchronous');
   this.db.exec(depth?'RELEASE SAVEPOINT '+name:'COMMIT');return result;
  } catch(error) {
   this.db.exec(depth?'ROLLBACK TO SAVEPOINT '+name+'; RELEASE SAVEPOINT '+name:'ROLLBACK');throw error;
  } finally {this.transactionDepth--; }
 }
 private owner(owner:string):void {if(typeof owner!=='string'||!owner.trim()||owner.length>128) throw new ProjectError('Invalid owner',403);}
 getProject(owner:string,id:string):Project {
  this.owner(owner);
  if(!UUID.test(id)) throw new ProjectError('Project not found',404);
  const row=this.db.prepare('SELECT * FROM projects WHERE id=? AND owner=?').get(id,owner);
  if(!row) throw new ProjectError('Project not found',404);
  return {...row,snapshot:JSON.parse(row.snapshot as string)} as unknown as Project;
 }
 listProjects(owner:string):Array<Omit<Project,'snapshot'>> {
  this.owner(owner);
  return this.db.prepare('SELECT id,owner,name,model,version,created_at,updated_at FROM projects WHERE owner=? ORDER BY updated_at DESC').all(owner) as unknown as Array<Omit<Project,'snapshot'>>;
 }
 createProject(owner:string,name:string,model:string):Project {
  this.owner(owner);name=typeof name==='string'?name.trim():'';
  if(!name || name.length>120 || typeof model!=='string' || model.length>240) throw new ProjectError('Provide a project name (up to 120 characters) and model');
  assertNoSecrets(name);
  const id=randomUUID(),time=now(),snapshot=JSON.stringify({files:{},assets:{}});
  this.transaction(()=>{
   if(Number(this.db.prepare('SELECT count(*) AS n FROM projects WHERE owner=?').get(owner)?.n)>=100) throw new ProjectError('Project limit reached; export a backup before requesting more storage');
   const workspace=ensureIndividualWorkspace(this.db,owner);
   this.db.prepare('INSERT INTO projects(id,owner,name,model,version,snapshot,created_at,updated_at,workspace_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,name,model,1,snapshot,time,time,workspace.id);
   this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,1,'Project created',snapshot,digest(snapshot),time);
  });
  return this.getProject(owner,id);
 }
 private writeSnapshot(owner:string,id:string,expectedVersion:number,snapshot:ProjectSnapshot,label:string):Project {
  const p=this.getProject(owner,id);
  if(!Number.isSafeInteger(expectedVersion)||p.version!==expectedVersion) throw new ProjectError('Revision conflict. Reload before applying changes.',409);
  const serialized=JSON.stringify(snapshot);
  const size=Number(this.db.prepare('SELECT coalesce(sum(length(r.snapshot)),0) AS bytes FROM revisions r JOIN projects p ON p.id=r.project_id WHERE p.owner=?').get(owner)?.bytes);
  if(size+serialized.length>256*1024*1024) throw new ProjectError('Revision storage budget exceeded; export a backup',413);
  const version=p.version+1,time=now();
  this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,version,label.slice(0,200),serialized,digest(serialized),time);
  const result=this.db.prepare('UPDATE projects SET snapshot=?,version=?,updated_at=? WHERE id=? AND owner=? AND version=?').run(serialized,version,time,id,owner,expectedVersion);
  if(Number(result.changes)!==1) throw new ProjectError('Revision conflict',409);
  return this.getProject(owner,id);
 }
 saveSnapshot(owner:string,id:string,expectedVersion:number,snapshot:unknown,label:string):Project {
  const validated=validateSnapshot(snapshot);assertNoSecrets(label);
  return this.transaction(()=>this.writeSnapshot(owner,id,expectedVersion,validated,label));
 }
 revisions(owner:string,id:string):Array<{id:string;version:number;label:string;sha256:string;created_at:string}> {
  this.getProject(owner,id);
  return this.db.prepare('SELECT id,version,label,sha256,created_at FROM revisions WHERE project_id=? ORDER BY version DESC').all(id) as any;
 }
 revision(owner:string,id:string,revisionID:string):ProjectSnapshot {
  this.getProject(owner,id);
  const row=this.db.prepare('SELECT snapshot,sha256 FROM revisions WHERE project_id=? AND id=?').get(id,revisionID);
  if(!row) throw new ProjectError('Revision not found',404);
  if(digest(row.snapshot as string)!==row.sha256) throw new ProjectError('Revision checksum mismatch',503);
  return JSON.parse(row.snapshot as string);
 }
 restoreRevision(owner:string,id:string,expectedVersion:number,revisionID:string):Project {
  return this.saveSnapshot(owner,id,expectedVersion,this.revision(owner,id,revisionID),'Restored revision '+revisionID);
 }
 /** Idempotency keys bind to exact input. Only one active run per project, enforced by SQLite. */
 beginRun(owner:string,id:string,requestKey:string,prompt:string,model:string,baseVersion:number,options:RunOptions={}):ProjectRun {
  if(typeof requestKey!=='string'||!/^[a-z0-9_-]{8,128}$/i.test(requestKey)) throw new ProjectError('Invalid idempotency key');
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>32768||typeof model!=='string'||model.length>240) throw new ProjectError('Invalid generation request');
  assertNoSecrets(prompt);
  const mode=options.mode??'build';const imageIDs=options.imageIDs??[];
  if(!['build','plan'].includes(mode)||!Array.isArray(imageIDs)||imageIDs.length>4||imageIDs.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(imageIDs).size!==imageIDs.length)throw new ProjectError('Invalid mode or image selection (up to four unique images)');
  return this.transaction(()=>{
   const p=this.getProject(owner,id);
   const existing=this.db.prepare('SELECT * FROM runs WHERE project_id=? AND request_key=?').get(id,requestKey);
   if(existing) {
    const previous=this.decodeRun(existing);
    if(existing.prompt!==prompt||existing.model!==model||existing.base_version!==baseVersion||previous.inputs.mode!==mode||JSON.stringify(previous.inputs.images.map(image=>image.id))!==JSON.stringify(imageIDs)) throw new ProjectError('Idempotency key conflict',409);
    return previous;
   }
   const selected=imageIDs.map(imageID=>{
    const row=this.db.prepare('SELECT id,sha256,bytes FROM project_images WHERE id=? AND project_id=? AND archived=0').get(imageID,id);
    if(!row)throw new ProjectError('Selected image not found or archived',404);return row;
   });
   if(selected.reduce((sum,row)=>sum+Number(row.bytes),0)>6*1024*1024)throw new ProjectError('Selected images exceed the 6 MiB model input budget',413);
   const inputs:RunInputs={mode,images:selected.map(row=>({id:row.id as string,sha256:row.sha256 as string}))};
   this.expireRuns(id);
   if(this.db.prepare("SELECT id FROM runs WHERE project_id=? AND state IN ('QUEUED','RUNNING','AWAITING_APPROVAL')").get(id)) throw new ProjectError('A generation or proposal is already in progress',409);
   if(p.version!==baseVersion) throw new ProjectError('Revision conflict',409);
   const runID=randomUUID(),time=now();
   this.db.prepare('INSERT INTO runs(id,project_id,request_key,prompt,model,base_version,state,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,?,?)').run(runID,id,requestKey,prompt,model,baseVersion,options.queued?'QUEUED':'RUNNING',options.queued?0:Date.now()+120000,time,time);
   this.db.prepare('UPDATE runs SET inputs=? WHERE id=?').run(JSON.stringify(inputs),runID);
   this.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(randomUUID(),id,runID,'user',prompt,time);
   return this.getRun(owner,id,runID);
  });
 }
 /** Exactly one caller claims a run, including concurrent requests with the same idempotency key. */
 claimRun(owner:string,id:string,runID:string):boolean {
  return this.transaction(()=>{
   const run=this.getRun(owner,id,runID);
   if(run.state!=='RUNNING')return false;
   return Number(this.db.prepare('INSERT INTO execution_claims(run_id,created_at) VALUES(?,?) ON CONFLICT(run_id) DO NOTHING').run(runID,now()).changes)===1;
  });
 }
 events(owner:string,id:string,runID:string):Array<{sequence:number;type:string;payload:unknown;created_at:string}> {
  this.getRun(owner,id,runID);
  return this.db.prepare('SELECT sequence,type,payload,created_at FROM run_events WHERE run_id=? ORDER BY sequence LIMIT 1000').all(runID).map(row=>({...row,payload:JSON.parse(row.payload as string)})) as any;
 }
 private decodeRun(row:Record<string,unknown>):ProjectRun {return {...row,inputs:row.inputs?JSON.parse(row.inputs as string):{mode:'build',images:[]},candidate:row.candidate?JSON.parse(row.candidate as string):null} as ProjectRun;}
 getRun(owner:string,projectID:string,runID:string):ProjectRun {
  this.getProject(owner,projectID);
  const row=this.db.prepare('SELECT * FROM runs WHERE id=? AND project_id=?').get(runID,projectID);
  if(!row) throw new ProjectError('Run not found',404);
  return this.decodeRun(row);
 }
 runs(owner:string,id:string):ProjectRun[] {
  this.getProject(owner,id);this.expireRuns(id);
  return this.db.prepare('SELECT * FROM runs WHERE project_id=? ORDER BY created_at DESC LIMIT 100').all(id).map(row=>this.decodeRun(row));
 }
 private expireRuns(id:string):void {
  this.db.prepare("UPDATE runs SET state='INTERRUPTED',error='Execution interrupted. The saved revision is intact; retry explicitly.',updated_at=? WHERE project_id=? AND state='RUNNING' AND lease_until<? AND NOT EXISTS(SELECT 1 FROM run_controls c WHERE c.run_id=runs.id)").run(now(),id,Date.now());
 }
 heartbeat(owner:string,id:string,runID:string):boolean {
  this.getRun(owner,id,runID);
  return Number(this.db.prepare("UPDATE runs SET lease_until=?,updated_at=? WHERE id=? AND project_id=? AND state='RUNNING'").run(Date.now()+120000,now(),runID,id).changes)===1;
 }
 stageRun(owner:string,id:string,runID:string,snapshot:unknown,explanation:string):ProjectRun {
  const validated=validateSnapshot(snapshot);
  return this.transaction(()=>{
   const run=this.getRun(owner,id,runID);
   if(run.inputs.mode==='plan')throw new ProjectError('Plan mode cannot stage code',409);
   if(run.state!=='RUNNING') throw new ProjectError('Run state is not running; cancelled output cannot be applied',409);
   if(this.getProject(owner,id).version!==run.base_version) throw new ProjectError('Revision conflict',409);
   this.db.prepare("UPDATE runs SET state='AWAITING_APPROVAL',candidate=?,explanation=?,updated_at=? WHERE id=?").run(JSON.stringify(validated),redactSecretText(explanation).slice(0,16000),now(),runID);
   return this.getRun(owner,id,runID);
  });
 }
 /** Plans persist as conversation evidence, never as application-file revisions. */
 completePlan(owner:string,id:string,runID:string,text:string):ProjectRun {
  if(typeof text!=='string'||!text.trim()||text.length>32000)throw new ProjectError('Plan must be nonempty and within 32,000 characters');
  assertNoSecrets(text);
  return this.transaction(()=>{
   const run=this.getRun(owner,id,runID);
   if(run.inputs.mode!=='plan'||run.state!=='RUNNING')throw new ProjectError('Run is not an active plan',409);
   if(this.getProject(owner,id).version!==run.base_version)throw new ProjectError('Project changed during planning. Request a new plan.',409);
   this.db.prepare("UPDATE runs SET state='SUCCEEDED',explanation=?,candidate=NULL,updated_at=? WHERE id=?").run(text,now(),runID);
   this.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(randomUUID(),id,runID,'assistant',text,now());
   return this.getRun(owner,id,runID);
  });
 }
 acceptRun(owner:string,id:string,runID:string,expectedVersion:number):Project {
  return this.transaction(()=>{
   const run=this.getRun(owner,id,runID);
   if(run.state!=='AWAITING_APPROVAL'||!run.candidate) throw new ProjectError('Run state is not awaiting approval',409);
   if(run.base_version!==expectedVersion) throw new ProjectError('Revision conflict',409);
   const p=this.writeSnapshot(owner,id,expectedVersion,validateSnapshot(run.candidate),'AI: '+run.prompt.slice(0,170));
   this.db.prepare("UPDATE runs SET state='SUCCEEDED',candidate=NULL,updated_at=? WHERE id=?").run(now(),runID);
   this.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(randomUUID(),id,runID,'assistant',run.explanation||'Revision accepted.',now());
   return p;
  });
 }
 cancelRun(owner:string,id:string,runID:string):ProjectRun {
  const run=this.getRun(owner,id,runID);
  if(run.state==='SUCCEEDED') throw new ProjectError('Accepted revision cannot be cancelled; use restore',409);
  this.db.prepare("UPDATE runs SET state='CANCELLED',candidate=NULL,updated_at=? WHERE id=? AND state IN ('QUEUED','RUNNING','AWAITING_APPROVAL')").run(now(),runID);
  return this.getRun(owner,id,runID);
 }
 failRun(owner:string,id:string,runID:string,error:string):void {
  this.getRun(owner,id,runID);
  this.db.prepare("UPDATE runs SET state='FAILED',candidate=NULL,error=?,updated_at=? WHERE id=? AND state='RUNNING'").run(redactSecretText(error).slice(0,2000),now(),runID);
 }
 messages(owner:string,id:string):Array<{id:string;role:string;content:string;created_at:string}> {
  this.getProject(owner,id);
  return this.db.prepare('SELECT id,role,content,created_at FROM (SELECT rowid AS message_order,* FROM messages WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at,message_order').all(id) as any;
 }
 event(owner:string,id:string,runID:string,type:string,payload:unknown):void {
  this.getRun(owner,id,runID);
  const data=JSON.stringify(payload);assertNoSecrets(data);
  if(data.length>16384) throw new ProjectError('Run event too large');
  this.db.prepare('INSERT INTO run_events(run_id,type,payload,created_at) VALUES(?,?,?,?)').run(runID,type,data,now());
 }
 documents(owner:string,id:string):Array<{id:string;name:string;content:string;sha256:string;created_at:string}> {
  this.getProject(owner,id);return this.db.prepare('SELECT id,name,content,sha256,created_at FROM project_documents WHERE project_id=? ORDER BY created_at').all(id) as any;
 }
 addDocument(owner:string,id:string,name:string,content:string) {
  this.getProject(owner,id);
  if(typeof name!=='string'||!name.trim()||name.length>200||typeof content!=='string'||!content.trim()||content.length>200000) throw new ProjectError('Invalid reference document (up to 200,000 characters)');
  assertNoSecrets(content);
  return this.transaction(()=>{
   if(this.documents(owner,id).length>=20) throw new ProjectError('Project reference limit reached');
   const hash=digest(content);
   const existing=this.db.prepare('SELECT id FROM project_documents WHERE project_id=? AND sha256=?').get(id,hash);
   if(!existing)this.db.prepare('INSERT INTO project_documents VALUES(?,?,?,?,?,?)').run(randomUUID(),id,name,content,hash,now());
   return this.documents(owner,id);
  });
 }
}

/** Preserve the domain error while admitting only verified native system aliases. */
function assertPlainAncestors(path:string):void {
 try {assertSafeDataAncestors(path);}
 catch {throw new ProjectError('Data path cannot contain an untrusted symlink or junction',503);}
}

/** Server configuration only. User requests cannot select database paths. */
export function dataDirectory():string {
 const root=resolve(process.env.OPEN_LOVABLE_DATA_DIR||join(homedir(),'.open-lovable'));
 const checkout=realpathSync(process.cwd());
 const rel=relative(checkout,root);
 if(!rel||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))) throw new ProjectError('Persistent data must be outside the application checkout',503);
 // Reject existing links before mkdir: even an ancestor junction can redirect a new child.
 assertPlainAncestors(root);
 mkdirSync(root,{recursive:true,mode:0o700});
 assertPlainAncestors(root);
 const canonical=realpathSync(root);
 const canonicalRelative=relative(checkout,canonical);
 if(!canonicalRelative||(!isAbsolute(canonicalRelative)&&canonicalRelative!=='..'&&!canonicalRelative.startsWith('..'+sep))) throw new ProjectError('Persistent data must be outside the application checkout',503);
 return canonical;
}
let cached:ProjectStore|undefined;
export function projectStore():ProjectStore {
 const path=join(dataDirectory(),'state.sqlite3');
 if(!cached||cached.path!==path) {cached?.close();cached=new ProjectStore(path);}
 return cached;
}
export function operatorID():string {return (process.env.OPEN_LOVABLE_USERNAME||'admin').trim();}
