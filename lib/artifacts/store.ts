import {createHash,randomUUID} from 'node:crypto';
import {lstatSync,mkdirSync,readFileSync,renameSync,realpathSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ProjectError} from '../projects/store';
export interface ArtifactRef {workspaceId:string;projectId:string;digest:string;mediaType:string;bytes:number;storageKey:string;}
export interface ArtifactManifest extends ArtifactRef {id:string;kind:'source'|'reference'|'candidate'|'log'|'capture'|'release'|'research';createdAt:string;}
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const safe=(value:string)=>/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const safeDigest=(value:string)=>/^[a-f0-9]{64}$/.test(value);
export class LocalArtifactStore {
 private readonly base:string;
 constructor(root:string){mkdirSync(resolve(root),{recursive:true,mode:0o700});this.base=realpathSync(resolve(root));this.assertDir(this.base);}
 private assertDir(path:string):void {const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw new ProjectError('Artifact storage path must be a private directory',503);}
 private directory(workspaceId:string,projectId:string):string {if(!safe(workspaceId)||!safe(projectId))throw new ProjectError('Invalid artifact scope',400);const workspace=join(this.base,workspaceId),project=join(workspace,projectId);this.ensureDirectory(workspace);this.ensureDirectory(project);return project;}
 private ensureDirectory(path:string):void {try{this.assertDir(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;mkdirSync(path,{recursive:false,mode:0o700});this.assertDir(path);}}
 private key(workspaceId:string,projectId:string,digestValue:string):string {if(!safeDigest(digestValue))throw new ProjectError('Invalid artifact digest',400);return join(this.directory(workspaceId,projectId),digestValue);}
 put(workspaceId:string,projectId:string,data:Uint8Array,mediaType:string,kind:ArtifactManifest['kind']):ArtifactManifest {
  if(data.byteLength>32*1024*1024)throw new ProjectError('Artifact exceeds the 32 MiB limit',413);
  const d=digest(data),path=this.key(workspaceId,projectId,d);
  try{const existing=lstatSync(path);if(existing.isSymbolicLink()||!existing.isFile())throw new ProjectError('Artifact target is not a regular file',503);const stored=readFileSync(path,{encoding:null});if(stored.byteLength!==data.byteLength||digest(stored)!==d)throw new ProjectError('Pre-existing artifact failed integrity validation',503);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const temporary=join(this.directory(workspaceId,projectId),`.${d}.${randomUUID()}.tmp`);writeFileSync(temporary,data,{flag:'wx',mode:0o600});try{renameSync(temporary,path);}catch(error){try{if(lstatSync(path).isFile()&&digest(readFileSync(path))===d){}else throw error;}finally{try{unlinkSync(temporary);}catch{}}}}
  return {id:randomUUID(),workspaceId,projectId,digest:d,mediaType,bytes:data.byteLength,storageKey:d,kind,createdAt:new Date().toISOString()};
 }
 get(ref:ArtifactRef,workspaceId:string,projectId:string):Buffer {if(ref.workspaceId!==workspaceId||ref.projectId!==projectId||ref.storageKey!==ref.digest)throw new ProjectError('Artifact not found',404);const path=this.key(workspaceId,projectId,ref.digest);let stat;try{stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('not regular');const data=readFileSync(path);if(data.byteLength!==ref.bytes||digest(data)!==ref.digest)throw new ProjectError('Artifact integrity check failed',503);return data;}catch(error){if(error instanceof ProjectError)throw error;throw new ProjectError('Artifact not found',404);}}
}
