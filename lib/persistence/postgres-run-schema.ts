/** Additive PostgreSQL migration 3; enables import parity, not an unimplemented distributed worker. */
export const POSTGRES_RUN_SQL=`
ALTER TABLE open_lovable.runs DROP CONSTRAINT runs_state_check;
ALTER TABLE open_lovable.runs ADD CONSTRAINT runs_state_check CHECK(state IN ('QUEUED','RUNNING','AWAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'));
DROP INDEX open_lovable.one_active_project_run;
CREATE UNIQUE INDEX one_active_project_run ON open_lovable.runs(project_id) WHERE state IN ('QUEUED','RUNNING','AWAITING_APPROVAL');
CREATE TABLE open_lovable.run_controls (
 run_id TEXT PRIMARY KEY REFERENCES open_lovable.runs(id), workspace_id TEXT NOT NULL REFERENCES open_lovable.workspaces(id),
 actor_id TEXT NOT NULL, authority TEXT NOT NULL, frozen_input TEXT NOT NULL, input_digest TEXT NOT NULL,
 request_digest TEXT NOT NULL, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, deadline_at BIGINT NOT NULL,
 lease_token INTEGER NOT NULL DEFAULT 0, worker_id TEXT, worker_epoch INTEGER NOT NULL DEFAULT 0,
 model_started INTEGER NOT NULL DEFAULT 0 CHECK(model_started IN(0,1)), output TEXT, usage TEXT NOT NULL DEFAULT '{}',
 outcome TEXT NOT NULL DEFAULT '', phase TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL
);
CREATE INDEX controls_workspace ON open_lovable.run_controls(workspace_id,created_at);
CREATE TABLE open_lovable.run_journal (
 run_id TEXT NOT NULL REFERENCES open_lovable.runs(id), sequence INTEGER NOT NULL CHECK(sequence>=1),
 event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL,
 PRIMARY KEY(run_id,sequence)
);
CREATE TABLE open_lovable.worker_leases (
 name TEXT PRIMARY KEY CHECK(name='agent'), worker_id TEXT NOT NULL, epoch INTEGER NOT NULL CHECK(epoch>=1),
 expires_at BIGINT NOT NULL, heartbeat_at BIGINT NOT NULL
);
ALTER TABLE open_lovable.run_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.run_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.run_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.run_journal FORCE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.worker_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_lovable.worker_leases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON open_lovable.run_controls,open_lovable.run_journal,open_lovable.worker_leases FROM PUBLIC;
`;
