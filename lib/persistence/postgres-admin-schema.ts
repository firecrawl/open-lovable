/** Additive PostgreSQL migration 5 for durable execution approvals and immutable grants. */
export const POSTGRES_ADMIN_SQL=`
ALTER TABLE open_lovable.runs DROP CONSTRAINT runs_state_check;
ALTER TABLE open_lovable.runs ADD CONSTRAINT runs_state_check CHECK(state IN ('QUEUED','RUNNING','AWAITING_INPUT','AWAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'));
DROP INDEX open_lovable.one_active_project_run;
CREATE UNIQUE INDEX one_active_project_run ON open_lovable.runs(project_id) WHERE state IN ('QUEUED','RUNNING','AWAITING_INPUT','AWAITING_APPROVAL');
ALTER TABLE open_lovable.run_controls ADD COLUMN waiting_kind TEXT CHECK(waiting_kind IN ('connection','cost'));
ALTER TABLE open_lovable.run_controls ADD COLUMN wait_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE open_lovable.run_controls ADD COLUMN pause_count INTEGER NOT NULL DEFAULT 0 CHECK(pause_count>=0 AND pause_count<=5);
CREATE TABLE open_lovable.run_limits(run_id TEXT PRIMARY KEY REFERENCES open_lovable.runs(id),limits TEXT NOT NULL);
CREATE TABLE open_lovable.run_approvals(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES open_lovable.runs(id),kind TEXT NOT NULL CHECK(kind IN ('connection','cost')),action TEXT NOT NULL,action_digest TEXT NOT NULL,input_digest TEXT NOT NULL,base_version INTEGER NOT NULL,actor_id TEXT NOT NULL,nonce TEXT NOT NULL UNIQUE,expires_at BIGINT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','approved','denied','expired','invalidated')),created_at BIGINT NOT NULL,resolved_at BIGINT,UNIQUE(id,run_id));
CREATE UNIQUE INDEX one_pending_run_approval ON open_lovable.run_approvals(run_id) WHERE state='pending';
CREATE TABLE open_lovable.run_grants(run_id TEXT NOT NULL REFERENCES open_lovable.runs(id),sequence INTEGER NOT NULL CHECK(sequence>=1),approval_id TEXT NOT NULL UNIQUE,authority TEXT NOT NULL,limits TEXT NOT NULL,deadline_at BIGINT NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(run_id,sequence),FOREIGN KEY(approval_id,run_id) REFERENCES open_lovable.run_approvals(id,run_id));
ALTER TABLE open_lovable.run_limits ENABLE ROW LEVEL SECURITY; ALTER TABLE open_lovable.run_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.run_approvals ENABLE ROW LEVEL SECURITY; ALTER TABLE open_lovable.run_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.run_grants ENABLE ROW LEVEL SECURITY; ALTER TABLE open_lovable.run_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON open_lovable.run_limits,open_lovable.run_approvals,open_lovable.run_grants FROM PUBLIC;
`;
