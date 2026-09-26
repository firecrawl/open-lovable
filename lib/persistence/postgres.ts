import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AuthorizedContext,WorkspaceContext} from '../contracts/domain';
import {ProjectError,validateSnapshot,type ProjectSnapshot} from '../projects/store';
import type {ProjectRepository,RepositoryProject,RepositoryRevision,ProjectSummary} from './repository';
import {assertContext,READ_ROLES,WRITE_ROLES,ID_PATTERN,notFound,snapshotDigest,REVISION_BUDGET,validateProjectDetails,validateRevisionLabel} from './validation';

/** A runtime-only adapter. Schema management and data imports use a separate operator connection. */
export class PostgresProjectRepository implements ProjectRepository {
 constructor(private readonly pool:Pool){}
 private async transaction<T>(ctx:WorkspaceContext,write:boolean,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  assertContext(ctx);const client=await this.pool.connect();let released=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='15s'");
   const role=await client.query("SELECT r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='open_lovable' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_schema FROM pg_roles r WHERE r.rolname=current_user");
   if(role.rowCount!==1||Object.values(role.rows[0]).some(Boolean))throw new ProjectError('PostgreSQL runtime requires a non-privileged, non-owner role',503);
   await client.query("SELECT set_config('open_lovable.workspace_id',$1,true),set_config('open_lovable.actor_id',$2,true)",[ctx.principal.workspaceId,ctx.principal.actorId]);
   if(write)await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['workspace:'+ctx.principal.workspaceId]);
   const member=await client.query('SELECT role FROM open_lovable.workspace_members WHERE workspace_id=$1 AND actor_id=$2 AND active=1',[ctx.principal.workspaceId,ctx.principal.actorId]);
   if(!member.rowCount||!READ_ROLES.has(member.rows[0].role))throw notFound();
   if(write&&!WRITE_ROLES.has(member.rows[0].role))throw new ProjectError('Project write access required',403);
   const result=await work(client);await client.query('COMMIT');return result;
  }catch(error){try{await client.query('ROLLBACK');}catch{client.release(true);released=true;}throw error;}
  finally{if(!released)client.release();}
 }
 private async readInside(client:PoolClient,ctx:AuthorizedContext):Promise<RepositoryProject>{
  if(!ID_PATTERN.test(ctx.projectId))throw notFound();
  const rows=await client.query('SELECT p.*,r.id AS revision_id FROM open_lovable.projects p JOIN open_lovable.revisions r ON r.project_id=p.id AND r.version=p.version WHERE p.id=$1 AND p.workspace_id=$2',[ctx.projectId,ctx.principal.workspaceId]);
  if(rows.rowCount!==1)throw notFound();const row=rows.rows[0];
  return {...row,snapshot:JSON.parse(row.snapshot),workspaceId:row.workspace_id,revisionId:row.revision_id};
 }
 async read(ctx:AuthorizedContext):Promise<RepositoryProject>{return this.transaction(ctx,false,c=>this.readInside(c,ctx));}
 async requireWrite(ctx:AuthorizedContext):Promise<RepositoryProject>{return this.transaction(ctx,true,c=>this.readInside(c,ctx));}
 async list(ctx:WorkspaceContext):Promise<ProjectSummary[]>{return this.transaction(ctx,false,async c=>{
  const rows=await c.query('SELECT p.id,p.owner,p.name,p.model,p.version,p.created_at,p.updated_at,p.workspace_id AS "workspaceId",r.id AS "revisionId" FROM open_lovable.projects p JOIN open_lovable.revisions r ON r.project_id=p.id AND r.version=p.version WHERE p.workspace_id=$1 ORDER BY p.updated_at DESC,p.id',[ctx.principal.workspaceId]);return rows.rows;
 });}
 async create(ctx:WorkspaceContext,name:string,model:string):Promise<RepositoryProject>{
  const details=validateProjectDetails(name,model);return this.transaction(ctx,true,async c=>{
   const workspaceId=ctx.principal.workspaceId,quota=await c.query('SELECT count(*) AS n FROM open_lovable.projects WHERE workspace_id=$1',[workspaceId]);
   if(Number(quota.rows[0].n)>=100)throw new ProjectError('Workspace project limit reached',413);
   const owner=await c.query('SELECT legacy_owner FROM open_lovable.workspaces WHERE id=$1',[workspaceId]);
   const id=randomUUID(),now=new Date().toISOString(),serialized=JSON.stringify({files:{},assets:{}});
   await c.query('INSERT INTO open_lovable.projects(id,owner,name,model,version,snapshot,created_at,updated_at,workspace_id) VALUES($1,$2,$3,$4,1,$5,$6,$6,$7)',[id,owner.rows[0]?.legacy_owner||'workspace:'+workspaceId,details.name,details.model,serialized,now,workspaceId]);
   await c.query('INSERT INTO open_lovable.revisions VALUES($1,$2,1,$3,$4,$5,$6)',[randomUUID(),id,'Project created',serialized,snapshotDigest(serialized),now]);
   return this.readInside(c,{...ctx,projectId:id});
  });
 }
 private async saveInside(c:PoolClient,ctx:AuthorizedContext,version:number,snapshot:ProjectSnapshot,label:string):Promise<RepositoryProject>{
  const current=await this.readInside(c,ctx);
  if(!Number.isSafeInteger(version)||version<1||version!==current.version)throw new ProjectError('Revision conflict. Reload before applying changes.',409);
  const serialized=JSON.stringify(snapshot),workspaceId=ctx.principal.workspaceId;
  const used=await c.query('SELECT coalesce(sum(octet_length(r.snapshot)),0) AS n FROM open_lovable.revisions r JOIN open_lovable.projects p ON p.id=r.project_id WHERE p.workspace_id=$1',[workspaceId]);
  if(Number(used.rows[0].n)+Buffer.byteLength(serialized)>REVISION_BUDGET)throw new ProjectError('Revision storage budget exceeded',413);
  const now=new Date().toISOString();
  await c.query('INSERT INTO open_lovable.revisions VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),ctx.projectId,version+1,label,serialized,snapshotDigest(serialized),now]);
  const changed=await c.query('UPDATE open_lovable.projects SET version=$1,snapshot=$2,updated_at=$3 WHERE id=$4 AND workspace_id=$5 AND version=$6',[version+1,serialized,now,ctx.projectId,workspaceId,version]);
  if(changed.rowCount!==1)throw new ProjectError('Revision conflict',409);
  return this.readInside(c,ctx);
 }
 async save(ctx:AuthorizedContext,version:number,snapshot:unknown,label:string):Promise<RepositoryProject>{return this.transaction(ctx,true,async c=>{
  await this.readInside(c,ctx);const valid=validateSnapshot(snapshot);validateRevisionLabel(label);return this.saveInside(c,ctx,version,valid,label);
 });}
 async revisions(ctx:AuthorizedContext):Promise<RepositoryRevision[]>{return this.transaction(ctx,false,async c=>{
  await this.readInside(c,ctx);return (await c.query('SELECT id,version,label,sha256,created_at FROM open_lovable.revisions WHERE project_id=$1 ORDER BY version DESC',[ctx.projectId])).rows;
 });}
 private async revisionInside(c:PoolClient,ctx:AuthorizedContext,id:string):Promise<ProjectSnapshot>{
  await this.readInside(c,ctx);if(!ID_PATTERN.test(id))throw new ProjectError('Revision not found',404);
  const rows=await c.query('SELECT snapshot,sha256 FROM open_lovable.revisions WHERE project_id=$1 AND id=$2',[ctx.projectId,id]);if(rows.rowCount!==1)throw new ProjectError('Revision not found',404);
  if(snapshotDigest(rows.rows[0].snapshot)!==rows.rows[0].sha256)throw new ProjectError('Revision checksum mismatch',503);return JSON.parse(rows.rows[0].snapshot);
 }
 async revision(ctx:AuthorizedContext,id:string):Promise<ProjectSnapshot>{return this.transaction(ctx,false,c=>this.revisionInside(c,ctx,id));}
 async restore(ctx:AuthorizedContext,version:number,id:string):Promise<RepositoryProject>{return this.transaction(ctx,true,async c=>this.saveInside(c,ctx,version,validateSnapshot(await this.revisionInside(c,ctx,id)),'Restored revision '+id));}
}
