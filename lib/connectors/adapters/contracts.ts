import {ProjectError} from '../../projects/store';
export type AdapterState='available'|'configured'|'connected'|'operational';
export interface AdapterManifest {id:'figma'|'docs'|'sentry';version:string;capabilities:string[];requiredScopes:string[];inputSchema:string;outputSchema:string;}
export interface AdapterContext {workspaceId:string;projectId:string;credentialRef:string;scopes:string[];state:AdapterState;}
export interface Provenance {source:string;location:string;observedAt:string;projectId:string;release?:string;}
export interface AdapterResult<T> {data:T;provenance:Provenance;manifest:AdapterManifest;}
export function assertContext(context:AdapterContext,manifest:AdapterManifest):void{if(!context.workspaceId||!context.projectId||!context.credentialRef)throw new ProjectError('Adapter context is incomplete.',401);if(context.state!=='operational')throw new ProjectError('Adapter is not operational.',503);for(const scope of manifest.requiredScopes)if(!context.scopes.includes(scope))throw new ProjectError('Adapter scope is not authorized.',403);}
export function redactError(input:string):string{return input.replace(/(token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]').slice(0,1000);}
