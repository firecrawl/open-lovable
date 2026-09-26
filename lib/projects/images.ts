import {normalizeRasterInput,RasterInputError} from '@/lib/security/raster-input';
import {createHash,randomUUID} from 'node:crypto';
import {assertNoSecrets} from '@/lib/security/secret-content';
import {ProjectError,type ProjectStore} from './store';
import {QuotaService} from '../quotas/service';

export interface ReferenceImage {
 id:string;project_id:string;name:string;role:'target'|'current';mime:string;
 width:number;height:number;bytes:number;sha256:string;created_at:string;
}
interface StoredImage extends ReferenceImage {data:string;archived:number;}
/** Preserve the project API error contract while sharing the validated raster decoder. */
export async function normalizeReferenceImage(data:unknown) {
 try {return await normalizeRasterInput(data);}
 catch(error){throw new ProjectError(error instanceof Error?error.message:'Invalid raster image',error instanceof RasterInputError?error.status:400);}
}
/** Only normalized immutable references live here; archives retain evidence used by past runs. */
export class ReferenceImageStore {
 constructor(private readonly store:ProjectStore,private readonly authorize?:(projectID:string,write:boolean)=>void,private readonly quotas=new QuotaService({maxBytes:32*1024*1024,maxArtifacts:32,retentionMs:365*24*60*60*1000})){}
 list(owner:string,projectID:string):ReferenceImage[]{
  this.authorize?.(projectID,false);this.store.getProject(owner,projectID);
  return this.store.db.prepare('SELECT id,project_id,name,role,mime,width,height,bytes,sha256,created_at FROM project_images WHERE project_id=? AND archived=0 ORDER BY created_at,id').all(projectID) as unknown as ReferenceImage[];
 }
 get(owner:string,projectID:string,id:string):StoredImage {
  this.authorize?.(projectID,false);this.store.getProject(owner,projectID);
  const row=this.store.db.prepare('SELECT * FROM project_images WHERE project_id=? AND id=? AND archived=0').get(projectID,id);
  if(!row)throw new ProjectError('Image not found',404);
  return row as unknown as StoredImage;
 }
 async add(owner:string,projectID:string,name:string,role:'target'|'current',data:string):Promise<ReferenceImage>{
  this.authorize?.(projectID,false);this.store.getProject(owner,projectID);
  if(typeof name!=='string'||!name.trim()||name.length>160||/[\\/\p{Cc}]/u.test(name)||!['target','current'].includes(role))throw new ProjectError('Invalid image name or role');
  assertNoSecrets(name);
  const normalized=await normalizeReferenceImage(data),id=randomUUID(),created_at=new Date().toISOString();
  this.store.transaction(()=>{
   this.authorize?.(projectID,true);this.store.getProject(owner,projectID);
   const quota=this.store.db.prepare('SELECT count(*) AS count, coalesce(sum(bytes),0) AS bytes FROM project_images WHERE project_id=?').get(projectID)!;
   this.quotas.assertCanStore({source:0,references:Number(quota.bytes),candidates:0,logs:0,captures:0,research:0,release:0},'references',normalized.bytes,Number(quota.count),1);
   this.store.db.prepare('INSERT INTO project_images(id,project_id,name,role,mime,width,height,bytes,sha256,data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,projectID,name.trim(),role,normalized.mime,normalized.width,normalized.height,normalized.bytes,normalized.sha256,normalized.data,created_at);
  });
  return this.list(owner,projectID).find(image=>image.id===id)!;
 }
 archive(owner:string,projectID:string,id:string):void {
  this.authorize?.(projectID,true);this.get(owner,projectID,id);
  this.store.db.prepare('UPDATE project_images SET archived=1 WHERE project_id=? AND id=?').run(projectID,id);
 }
 forRun(owner:string,projectID:string,runID:string):StoredImage[]{
  const run=this.store.getRun(owner,projectID,runID);
  return run.inputs.images.map(reference=>{
   const row=this.store.db.prepare('SELECT * FROM project_images WHERE project_id=? AND id=?').get(projectID,reference.id) as unknown as StoredImage;
   if(!row||row.sha256!==reference.sha256||createHash('sha256').update(Buffer.from(row.data,'base64')).digest('hex')!==reference.sha256)throw new ProjectError('Run image integrity check failed',503);
   return row;
  });
 }
}
