import type {AuthorizedContext,WorkspaceContext} from '../contracts/domain';
import type {Project,ProjectSnapshot} from '../projects/store';
export interface RepositoryProject extends Project {workspaceId:string;revisionId:string;}
export type ProjectSummary=Omit<RepositoryProject,'snapshot'>;
export interface RepositoryRevision {id:string;version:number;label:string;sha256:string;created_at:string;}
/** Existing project operations only. Future draft/patch contracts must not be implemented as stubs. */
export interface ProjectRepository {
  list(ctx:WorkspaceContext):Promise<ProjectSummary[]>;
  create(ctx:WorkspaceContext,name:string,model:string):Promise<RepositoryProject>;
  read(ctx:AuthorizedContext):Promise<RepositoryProject>;
  requireWrite(ctx:AuthorizedContext):Promise<RepositoryProject>;
  save(ctx:AuthorizedContext,expectedVersion:number,snapshot:unknown,label:string):Promise<RepositoryProject>;
  revisions(ctx:AuthorizedContext):Promise<RepositoryRevision[]>;
  revision(ctx:AuthorizedContext,id:string):Promise<ProjectSnapshot>;
  restore(ctx:AuthorizedContext,expectedVersion:number,revisionId:string):Promise<RepositoryProject>;
}
