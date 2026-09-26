/** New tables are control-plane data, never a second source of project files or accepted state. */
export const RUN_CONTROL_TABLES=`
CREATE TABLE run_controls (
 run_id TEXT PRIMARY KEY REFERENCES runs(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 actor_id TEXT NOT NULL, authority TEXT NOT NULL, frozen_input TEXT NOT NULL, input_digest TEXT NOT NULL,
 request_digest TEXT NOT NULL, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, deadline_at INTEGER NOT NULL,
 lease_token INTEGER NOT NULL DEFAULT 0, worker_id TEXT, worker_epoch INTEGER NOT NULL DEFAULT 0,
 model_started INTEGER NOT NULL DEFAULT 0 CHECK(model_started IN(0,1)), output TEXT, usage TEXT NOT NULL DEFAULT '{}',
 outcome TEXT NOT NULL DEFAULT '', phase TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL
) STRICT;
CREATE INDEX controls_workspace ON run_controls(workspace_id,created_at);
CREATE TABLE run_journal (
 run_id TEXT NOT NULL REFERENCES runs(id), sequence INTEGER NOT NULL CHECK(sequence>=1),
 event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL,
 PRIMARY KEY(run_id,sequence)
) STRICT;
CREATE TABLE worker_leases (
 name TEXT PRIMARY KEY CHECK(name='agent'), worker_id TEXT NOT NULL, epoch INTEGER NOT NULL CHECK(epoch>=1),
 expires_at INTEGER NOT NULL, heartbeat_at INTEGER NOT NULL
) STRICT;
`;
/** Rebuild only runs to widen its CHECK. The runner validates FKs before committing and restores enforcement. */
export const durableRunSchema=`
CREATE TABLE runs_next (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_key TEXT NOT NULL,
 prompt TEXT NOT NULL, model TEXT NOT NULL, base_version INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','AWAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED')),
 candidate TEXT, explanation TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 lease_until INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 inputs TEXT NOT NULL DEFAULT '{"mode":"build","images":[]}', UNIQUE(project_id,request_key)
) STRICT;
INSERT INTO runs_next SELECT id,project_id,request_key,prompt,model,base_version,state,candidate,explanation,error,lease_until,created_at,updated_at,inputs FROM runs;
DROP TABLE runs;
ALTER TABLE runs_next RENAME TO runs;
CREATE UNIQUE INDEX one_active_project_run ON runs(project_id) WHERE state IN ('QUEUED','RUNNING','AWAITING_APPROVAL');
${RUN_CONTROL_TABLES}
`;
