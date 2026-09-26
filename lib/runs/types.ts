import type {ProjectRun,ProjectSnapshot,RunState} from '../projects/store';
/** Created by a verified server request, not accepted from the browser's JSON payload. */
export interface RunAccess {workspaceId:string;actorId:string;memberVersion:number;mode:'individual'|'supabase';sessionId:string|null;}
export interface RunAuthority extends RunAccess {
 origin:string; settingsOwner:string; allowLoopback:boolean; modelBinding:string; policyVersion:number;
}
export interface EnqueueRequest {
 projectId:string; baseVersion:number; requestKey:string; prompt:string; model:string; mode:'build'|'plan';
 imageIDs:string[]; confirmCost:boolean; confirmVision?:boolean;
}
export interface FrozenRunInput {
 workspaceId?:string;projectId?:string;revisionDigest?:string;
 snapshot:ProjectSnapshot;
 references:Array<{name:string;content:string}>;
 history:Array<{role:'user'|'assistant';content:string}>;
 images:Array<{id:string;name:string;role:string;mime:string;width:number;height:number;sha256:string;data:string}>;
}
export interface WorkerLease {workerId:string;epoch:number;}
export interface ClaimedRun {
 run:ProjectRun; authority:RunAuthority; input:FrozenRunInput; inputDigest:string; owner:string;
 token:number; worker:WorkerLease; deadlineAt:number; output:string|null;
}
export interface RunSummary {
 id:string;projectId:string;workspaceId:string;state:RunState;mode:'build'|'plan';model:string;baseVersion:number;
 requestId:string;traceId:string;inputDigest:string;deadlineAt:number;createdAt:string;updatedAt:string;
 phase:string;error:string;outcome:string;lastSequence:number;usage:Record<string,unknown>;workerAvailable:boolean;
}
export interface RunEvent {
 eventId:string;sequence:number;workspaceId:string;projectId:string;runId:string;requestId:string;traceId:string;
 type:string;occurredAt:string;payload:Record<string,unknown>;
}
