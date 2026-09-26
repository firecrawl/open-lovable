import {createHash} from 'node:crypto';
import {ProjectError} from '../projects/store';
import {assertNoSecrets} from '../security/secret-content';
import type {WorkspaceContext} from '../contracts/domain';
export const READ_ROLES=new Set(['owner','admin','editor','viewer']);
export const WRITE_ROLES=new Set(['owner','admin','editor']);
export const REVISION_BUDGET=256*1024*1024;
export const ID_PATTERN=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const notFound=()=>new ProjectError('Project not found',404);
export const snapshotDigest=(text:string)=>createHash('sha256').update(text).digest('hex');
export function assertContext(ctx:WorkspaceContext):void {
  if(!ctx?.principal || !ID_PATTERN.test(ctx.principal.actorId) || !ID_PATTERN.test(ctx.principal.workspaceId) || !ID_PATTERN.test(ctx.requestId) || ctx.policyVersion!==1)throw notFound();
}
export function validateProjectDetails(name:string,model:string):{name:string;model:string}{
  if(typeof name!=='string'||!name.trim()||name.trim().length>120||typeof model!=='string'||model.length>240)throw new ProjectError('Provide a valid project name and model');
  assertNoSecrets(name);return {name:name.trim(),model};
}
export function validateRevisionLabel(label:string):void {
  if(typeof label!=='string'||!label.trim()||label.length>200)throw new ProjectError('Provide a revision label up to 200 characters');
  assertNoSecrets(label);
}
