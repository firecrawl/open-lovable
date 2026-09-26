import {randomUUID} from 'node:crypto';
import {ProjectStore,ProjectError,validateSnapshot,type ProjectSnapshot} from '../projects/store';
import type {AuthorizedContext,WorkspaceContext} from '../contracts/domain';
import type {ProjectRepository,RepositoryProject,RepositoryRevision,ProjectSummary} from './repository';
import {individualContext as trustedIndividualContext,ensureIndividualWorkspace} from './workspaces';
import {assertContext,READ_ROLES,WRITE_ROLES,ID_PATTERN,notFound,snapshotDigest,REVISION_BUDGET,validateProjectDetails,validateRevisionLabel} from './validation';

/** Uses the existing database and revision rows, not a parallel copy of project data. */
export class SqliteProjectRepository implements ProjectRepository {
  constructor(readonly store:ProjectStore){}
  individualContext(owner:string):WorkspaceContext{
    try{
      if(!this.store.db.prepare('SELECT id FROM workspaces WHERE legacy_owner=?').get(owner))return this.store.transaction(()=>{ensureIndividualWorkspace(this.store.db,owner);return trustedIndividualContext(this.store.db,owner);});
      return trustedIndividualContext(this.store.db,owner);
    }catch(error){if(error instanceof Error&&error.message==='Workspace access not found')throw notFound();throw error;}
  }
  private authorize(ctx:WorkspaceContext,write=false):void {
    assertContext(ctx);
    const member=this.store.db.prepare('SELECT role FROM workspace_members WHERE workspace_id=? AND actor_id=? AND active=1').get(ctx.principal.workspaceId,ctx.principal.actorId);
    if(!member||!READ_ROLES.has(String(member.role)))throw notFound();
    if(write&&!WRITE_ROLES.has(String(member.role)))throw new ProjectError('Project write access required',403);
  }
  private readInside(ctx:AuthorizedContext,write=false):RepositoryProject {
    this.authorize(ctx,write);if(!ID_PATTERN.test(ctx.projectId))throw notFound();
    const row=this.store.db.prepare('SELECT p.*,r.id AS revision_id FROM projects p JOIN revisions r ON r.project_id=p.id AND r.version=p.version WHERE p.id=? AND p.workspace_id=?').get(ctx.projectId,ctx.principal.workspaceId);
    if(!row)throw notFound();
    return {...row,snapshot:JSON.parse(String(row.snapshot)),workspaceId:String(row.workspace_id),revisionId:String(row.revision_id)} as unknown as RepositoryProject;
  }
  async list(ctx:WorkspaceContext):Promise<ProjectSummary[]> {
    this.authorize(ctx);
    return this.store.db.prepare('SELECT p.id,p.owner,p.name,p.model,p.version,p.created_at,p.updated_at,p.workspace_id AS workspaceId,r.id AS revisionId FROM projects p JOIN revisions r ON r.project_id=p.id AND r.version=p.version WHERE p.workspace_id=? ORDER BY p.updated_at DESC,p.id').all(ctx.principal.workspaceId) as unknown as ProjectSummary[];
  }
  async create(ctx:WorkspaceContext,name:string,model:string):Promise<RepositoryProject>{
    const details=validateProjectDetails(name,model);
    return this.store.transaction(()=>{
      this.authorize(ctx,true);const workspaceId=ctx.principal.workspaceId;
      if(Number(this.store.db.prepare('SELECT count(*) AS n FROM projects WHERE workspace_id=?').get(workspaceId)?.n)>=100)throw new ProjectError('Workspace project limit reached',413);
      const owner=this.store.db.prepare('SELECT legacy_owner FROM workspaces WHERE id=?').get(workspaceId)?.legacy_owner;
      const id=randomUUID(),now=new Date().toISOString(),snapshot=JSON.stringify({files:{},assets:{}});
      this.store.db.prepare('INSERT INTO projects(id,owner,name,model,version,snapshot,created_at,updated_at,workspace_id) VALUES(?,?,?,?,1,?,?,?,?)').run(id,String(owner||'workspace:'+workspaceId),details.name,details.model,snapshot,now,now,workspaceId);
      this.store.db.prepare('INSERT INTO revisions(id,project_id,version,label,snapshot,sha256,created_at) VALUES(?,?,1,?,?,?,?)').run(randomUUID(),id,'Project created',snapshot,snapshotDigest(snapshot),now);
      return this.readInside({...ctx,projectId:id});
    });
  }
  async read(ctx:AuthorizedContext):Promise<RepositoryProject>{return this.readInside(ctx);}
  async requireWrite(ctx:AuthorizedContext):Promise<RepositoryProject>{return this.readInside(ctx,true);}
  private saveInside(ctx:AuthorizedContext,version:number,snapshot:ProjectSnapshot,label:string):RepositoryProject {
    const project=this.readInside(ctx,true);
    if(!Number.isSafeInteger(version)||version<1||version!==project.version)throw new ProjectError('Revision conflict. Reload before applying changes.',409);
    const serialized=JSON.stringify(snapshot),workspaceId=ctx.principal.workspaceId;
    const used=Number(this.store.db.prepare('SELECT coalesce(sum(length(CAST(r.snapshot AS BLOB))),0) AS n FROM revisions r JOIN projects p ON p.id=r.project_id WHERE p.workspace_id=?').get(workspaceId)?.n);
    if(used+Buffer.byteLength(serialized)>REVISION_BUDGET)throw new ProjectError('Revision storage budget exceeded',413);
    const now=new Date().toISOString();
    this.store.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)').run(randomUUID(),project.id,version+1,label,serialized,snapshotDigest(serialized),now);
    const result=this.store.db.prepare('UPDATE projects SET snapshot=?,version=?,updated_at=? WHERE id=? AND workspace_id=? AND version=?').run(serialized,version+1,now,project.id,workspaceId,version);
    if(Number(result.changes)!==1)throw new ProjectError('Revision conflict',409);
    return this.readInside(ctx);
  }
  async save(ctx:AuthorizedContext,version:number,input:unknown,label:string):Promise<RepositoryProject>{
    this.readInside(ctx,true);const snapshot=validateSnapshot(input);validateRevisionLabel(label);
    return this.store.transaction(()=>this.saveInside(ctx,version,snapshot,label));
  }
  async revisions(ctx:AuthorizedContext):Promise<RepositoryRevision[]>{
    this.readInside(ctx);return this.store.db.prepare('SELECT id,version,label,sha256,created_at FROM revisions WHERE project_id=? ORDER BY version DESC').all(ctx.projectId) as unknown as RepositoryRevision[];
  }
  private revisionInside(ctx:AuthorizedContext,id:string):ProjectSnapshot {
    this.readInside(ctx);if(!ID_PATTERN.test(id))throw new ProjectError('Revision not found',404);
    const row=this.store.db.prepare('SELECT snapshot,sha256 FROM revisions WHERE project_id=? AND id=?').get(ctx.projectId,id);
    if(!row)throw new ProjectError('Revision not found',404);
    if(snapshotDigest(String(row.snapshot))!==row.sha256)throw new ProjectError('Revision checksum mismatch',503);
    return JSON.parse(String(row.snapshot));
  }
  async revision(ctx:AuthorizedContext,id:string):Promise<ProjectSnapshot>{return this.revisionInside(ctx,id);}
  async restore(ctx:AuthorizedContext,version:number,id:string):Promise<RepositoryProject>{
    return this.store.transaction(()=>this.saveInside(ctx,version,validateSnapshot(this.revisionInside(ctx,id)),'Restored revision '+id));
  }
}
