import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {WorkspaceContext,WorkspaceRole} from '../contracts/domain';

/** Domain-separated deterministic IDs preserve the exact legacy owner, including case. */
export function legacyIdentifier(kind:'actor'|'workspace',owner:string):string {
  if(!owner || !owner.trim() || owner.length>128)throw new Error('Invalid legacy owner');
  const bytes=createHash('sha256').update(`open-lovable:${kind}:v1\0${owner}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
/** Trusted provisioning only; repeating it never reactivates or elevates an existing member. */
export function ensureIndividualWorkspace(db:DatabaseSync,owner:string):{id:string;actorId:string} {
  const id=legacyIdentifier('workspace',owner),actorId=legacyIdentifier('actor',owner);
  const inserted=db.prepare('INSERT INTO workspaces(id,legacy_owner,name,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING')
    .run(id,owner,'Personal workspace',new Date().toISOString());
  if(Number(inserted.changes)===1)db.prepare('INSERT INTO workspace_members(workspace_id,actor_id,role,active,version) VALUES(?,?,?,1,1)').run(id,actorId,'owner');
  const existing=db.prepare('SELECT legacy_owner FROM workspaces WHERE id=?').get(id);
  if(existing?.legacy_owner!==owner)throw new Error('Workspace identity conflict');
  return {id,actorId};
}
/** Called inside migration 4's transaction; no existing content, revision or ciphertext is rewritten. */
export function backfillLegacyWorkspaces(db:DatabaseSync):void {
  const owners=db.prepare('SELECT owner FROM projects UNION SELECT owner FROM provider_settings').all();
  for(const row of owners){
    const owner=String(row.owner),workspace=ensureIndividualWorkspace(db,owner);
    db.prepare('UPDATE projects SET workspace_id=? WHERE owner=? AND workspace_id IS NULL').run(workspace.id,owner);
  }
  if(db.prepare('SELECT id FROM projects WHERE workspace_id IS NULL LIMIT 1').get())throw new Error('Legacy workspace migration incomplete');
}
/** Context for a caller already authenticated by the individual-mode HTTP gate. */
export function individualContext(db:DatabaseSync,owner:string):WorkspaceContext {
  const workspace={id:legacyIdentifier('workspace',owner),actorId:legacyIdentifier('actor',owner)};
  const membership=db.prepare('SELECT m.role,m.version FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.actor_id=? AND m.active=1 AND w.legacy_owner=?').get(workspace.id,workspace.actorId,owner);
  if(!membership)throw new Error('Workspace access not found');
  return {principal:{actorId:workspace.actorId,workspaceId:workspace.id,roles:[membership.role as WorkspaceRole],sessionVersion:1},environment:'development',requestId:randomUUID(),policyVersion:1};
}
