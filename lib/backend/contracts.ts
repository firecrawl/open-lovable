import {ProjectError} from '../projects/store';
export type BackendState='connected'|'provisioning'|'ready'|'blocked';
export interface BackendCapabilities {auth:boolean;storage:boolean;functions:boolean;database:boolean;schema?:string;health:'healthy'|'unknown'|'unhealthy';}
export interface BackendBinding {projectId:string;environment:'development'|'staging'|'production';provider:'supabase'|'neon';resourceId:string;credentialRef:string;state:BackendState;capabilities:BackendCapabilities;}
export function assertNoSecret(value:string):void {if(!value||value.length>240||/^(sk|eyJ|sbp|service_role|postgres):/i.test(value)||/secret|token|password/i.test(value))throw new ProjectError('Backend credential must be an opaque server-side reference.',400);}
