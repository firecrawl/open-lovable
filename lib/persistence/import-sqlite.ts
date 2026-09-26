import {backup,DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {lstatSync,mkdtempSync,realpathSync,rmSync,createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {Pool,PoolClient} from 'pg';
import {assertSafeDataAncestors} from '../security/data-paths';
import {createRecoveryBudget,inspectRecoverySnapshot} from '../projects/recovery';
import {ProjectError} from '../projects/store';
import {migrations} from '../projects/schema';
import {POSTGRES_SCHEMA_VERSION,assertPostgresHistory} from './postgres-schema';

export const IMPORT_TABLES=['workspaces','workspace_members','projects','revisions','runs','messages','run_events','provider_settings','project_documents','execution_claims','project_images','identity_actors','auth_sessions','workspace_invites','identity_rate_limits','identity_audit','run_controls','run_journal','worker_leases','run_limits','run_approvals','run_grants'] as const;
/** Columns come only from a known schema table and still pass strict identifier validation. */
export function importColumns(db:DatabaseSync,table:typeof IMPORT_TABLES[number]):string[]{
 if(!IMPORT_TABLES.includes(table))throw new ProjectError('Unexpected source table');
 const columns=db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>String(row.name));
 if(!columns.length||columns.some(column=>!/^[a-z_][a-z0-9_]*$/.test(column)))throw new ProjectError('Unexpected source column');
 return columns;
}
export interface ImportReport {
 sourceSchemaVersion:number;targetSchemaVersion:number;sourceSnapshotDigest:string;
 tables:Record<string,{rows:number;digest:string}>;activation:'NOT_PERFORMED';sessionsInvalidated:number;invitationsInvalidated:number;runsInvalidated:number;
}
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const inventoryDigest=(rows:string[])=>createHash('sha256').update(rows.sort().join('\n')).digest('hex');
/** Explicit one-time operator import. Never activates hosted mode or mutates the SQLite source. */
export async function importSqliteSnapshot(sourcePath:string,masterKey:Uint8Array,target:Pool):Promise<ImportReport>{
 if(!(masterKey instanceof Uint8Array)||masterKey.length!==32)throw new ProjectError('Import requires the original master key',400);
 const key=Buffer.from(masterKey),budget=createRecoveryBudget({timeoutMs:300000});let temporary:string|undefined;
 try{
  const source=resolve(sourcePath);assertSafeDataAncestors(source);if(!lstatSync(source).isFile())throw new ProjectError('Source database must be a regular file');
  temporary=mkdtempSync(join(realpathSync(tmpdir()),'open-lovable-import-'));const snapshot=join(temporary,'snapshot.sqlite3');
  const input=new DatabaseSync(source,{readOnly:true});
  try{
   const sourceVersion=Number(input.prepare('PRAGMA user_version').get()?.user_version);if(!Number.isInteger(sourceVersion)||sourceVersion<4||sourceVersion>migrations.length)throw new ProjectError(`Import requires an explicitly upgraded SQLite schema version 4 through ${migrations.length}`);
   const pageSize=Number(input.prepare('PRAGMA page_size').get()?.page_size);
   if(pageSize*Number(input.prepare('PRAGMA page_count').get()?.page_count)>budget.maxBytes)throw new ProjectError('Import size budget exceeded',413);
   await backup(input,snapshot,{rate:100,progress:({totalPages})=>{budget.check();if(totalPages*pageSize>budget.maxBytes)throw new ProjectError('Import size budget exceeded',413);}});
  }finally{input.close();}
  const certified=inspectRecoverySnapshot(snapshot,key,budget.maxBytes,budget.check);
  const digest=createHash('sha256');for await(const chunk of createReadStream(snapshot,{signal:budget.signal})){budget.check();digest.update(chunk);}
  const db=new DatabaseSync(snapshot,{readOnly:true});
  let client:PoolClient;
  try{client=await target.connect();}catch(error){db.close();throw error;}
  let released=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
   const role=await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
   if(!role.rows[0]?.rolsuper&&!role.rows[0]?.rolbypassrls)throw new ProjectError('Import requires a separate privileged operator connection',403);
   const schema=await client.query('SELECT version,digest FROM open_lovable.schema_migrations ORDER BY version');
   try{assertPostgresHistory(schema.rows);}catch{throw new ProjectError('PostgreSQL schema is not the approved import target',409);}
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('open-lovable-import-v1',0))");
   await client.query('LOCK TABLE '+IMPORT_TABLES.map(table=>'open_lovable.'+table).join(',')+' IN EXCLUSIVE MODE');
   for(const table of IMPORT_TABLES){budget.check();if((await client.query(`SELECT 1 FROM open_lovable.${table} LIMIT 1`)).rowCount)throw new ProjectError('Import target must be empty; existing data were preserved',409);}
   const tables:ImportReport['tables']={};
   for(const table of IMPORT_TABLES){
    if(!Object.hasOwn(certified.tables,table))continue;
    budget.check();const columns=importColumns(db,table);
    const rowHashes:string[]=[];let batch:unknown[][]=[],batchBytes=0,totalRows=0;
    const flush=async()=>{
     if(!batch.length)return;budget.check();
     const params=batch.flat(),values=batch.map((row,index)=>'('+row.map((_,col)=>'$'+(index*columns.length+col+1)).join(',')+')').join(',');
     await client.query(`INSERT INTO open_lovable.${table} (${columns.map(c=>'"'+c+'"').join(',')}) VALUES ${values}`,params);batch=[];batchBytes=0;
    };
    for(const row of db.prepare(`SELECT * FROM "${table}"`).iterate()){
     budget.check();rowHashes.push(hash(row));batch.push(columns.map(column=>row[column]));batchBytes+=Buffer.byteLength(canonical(row));totalRows++;
     if(totalRows>1000000)throw new ProjectError('Import row budget exceeded',413);
     if(batch.length>=64||batchBytes>=1024*1024)await flush();
    }
    await flush();const expected={rows:totalRows,digest:inventoryDigest(rowHashes)};
    const actualHashes:string[]=[];
    // A cursor bounds memory even for large tables; the identifier is a fixed internal table name.
    await client.query(`DECLARE imported_rows NO SCROLL CURSOR FOR SELECT row_to_json(t) AS row FROM open_lovable.${table} t`);
    while(true){budget.check();const result=await client.query('FETCH FORWARD 64 FROM imported_rows');if(!result.rowCount)break;for(const record of result.rows)actualHashes.push(hash(record.row));}
    await client.query('CLOSE imported_rows');
    if(expected.rows!==actualHashes.length||expected.digest!==inventoryDigest(actualHashes))throw new ProjectError('Cross-database row inventory mismatch',503);
    tables[table]=expected;
   }
   await client.query("SELECT setval(pg_get_serial_sequence('open_lovable.run_events','sequence'),GREATEST(COALESCE((SELECT max(sequence) FROM open_lovable.run_events),1),1),EXISTS(SELECT 1 FROM open_lovable.run_events))");
   await client.query("SELECT setval(pg_get_serial_sequence('open_lovable.identity_audit','sequence'),GREATEST(COALESCE((SELECT max(sequence) FROM open_lovable.identity_audit),1),1),EXISTS(SELECT 1 FROM open_lovable.identity_audit))");
   // Verify exact copied inventories first; capabilities are intentionally invalidated before activation.
   const now=Date.now();
   const sessions=await client.query("UPDATE open_lovable.auth_sessions SET revoked_at=$1,encrypted='',refresh_lease=NULL,refresh_until=0 WHERE revoked_at IS NULL OR encrypted<>''",[now]);
   const invitations=await client.query('UPDATE open_lovable.workspace_invites SET cancelled_at=$1 WHERE consumed_at IS NULL AND cancelled_at IS NULL',[now]);
   await client.query("UPDATE open_lovable.run_controls SET outcome='RECOVERY_REVIEW_REQUIRED',phase='interrupted',worker_id=NULL WHERE run_id IN (SELECT id FROM open_lovable.runs WHERE state IN ('QUEUED','RUNNING'))");
   const runs=await client.query("UPDATE open_lovable.runs SET state='INTERRUPTED',lease_until=0,error='Imported execution requires a new authorization; no automatic replay.' WHERE state IN ('QUEUED','RUNNING')");
   await client.query('DELETE FROM open_lovable.worker_leases');
   budget.check();await client.query('COMMIT');
   return {sourceSchemaVersion:certified.schemaVersion,targetSchemaVersion:POSTGRES_SCHEMA_VERSION,sourceSnapshotDigest:digest.digest('hex'),tables,activation:'NOT_PERFORMED',sessionsInvalidated:sessions.rowCount||0,invitationsInvalidated:invitations.rowCount||0,runsInvalidated:runs.rowCount||0};
  }catch(error){try{await client.query('ROLLBACK');}catch{client.release(true);released=true;}throw error;}
  finally{if(!released)client.release();db.close();}
 }finally{key.fill(0);if(temporary)rmSync(temporary,{recursive:true,force:true});}
}
