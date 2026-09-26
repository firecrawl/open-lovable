import {z} from 'zod';
import type {WorkspaceRole} from '../contracts/domain';
export const emailSchema=z.string().email().max(254).transform(value=>value.toLowerCase());
export const authTokensSchema=z.object({access_token:z.string().min(1).max(16384),refresh_token:z.string().min(1).max(8192),expires_in:z.number().int().min(1).max(86400)});
export type AuthTokens=z.infer<typeof authTokensSchema>;
export interface VerifiedActor {
 id:string;issuer:string;subject:string;email:string;name:string;active:number;version:number;
}
export interface StoredSession {
 id:string;actor_id:string;issuer:string;actor_version:number;token_version:number;
 access_expires_at:number;expires_at:number;last_seen_at:number;revoked_at:number|null;
 selected_workspace_id:string|null;refresh_lease:string|null;refresh_until:number;
 purpose:'normal'|'recovery';created_at:string;actor:VerifiedActor;tokens:AuthTokens;
}
export interface WorkspaceSummary {id:string;name:string;role:WorkspaceRole;version:number;}
export interface MemberSummary {actorId:string;email:string;name:string;role:WorkspaceRole;active:number;version:number;}
