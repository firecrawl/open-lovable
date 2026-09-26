import type {RunAuthority} from '../runs/types';
import type {RunLimits} from '../budgets/run-limits';
/** Other planned effects require registered executors; these two are the only live resume actions. */
export type ResumeKind='connection'|'cost';
export interface ConnectionSummary {provider:string;endpoint:string;credentialConfigured:boolean;}
export interface ResumeAction {version:1;kind:ResumeKind;runId:string;workspaceId:string;actorId:string;baseVersion:number;inputDigest:string;authority:RunAuthority;limits:RunLimits;connection:ConnectionSummary;}
export interface ApprovalView {id:string;kind:ResumeKind;runId:string;actionDigest:string;nonce:string;expiresAt:number;state:string;model:string;baseVersion:number;inputDigest:string;limits:RunLimits;connection:ConnectionSummary;}
export interface ApprovalResolution {approvalId:string;actionDigest:string;nonce:string;decision:'approve'|'deny';}
