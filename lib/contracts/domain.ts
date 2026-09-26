/** Server-derived identity. Client-supplied roles are never an authorization decision. */
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'billing';
export interface Principal {
  actorId: string;
  workspaceId: string;
  roles: readonly WorkspaceRole[];
  sessionVersion: number;
}
export interface WorkspaceContext {
  principal: Principal;
  environment: 'development' | 'staging' | 'production';
  requestId: string;
  policyVersion: number;
}
export interface AuthorizedContext extends WorkspaceContext { projectId: string; }
export interface ExecutionContext extends AuthorizedContext {
  runId: string; draftId: string; baseRevisionId: string;
  baseRevisionDigest: string; leaseToken: number; deadlineAt: string;
}
