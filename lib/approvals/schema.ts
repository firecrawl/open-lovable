/** Version 8: rebuild only runs, retain its identity trigger, and add append-only authorization grants. */
export const approvalSchema=`
CREATE TABLE runs_next (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_key TEXT NOT NULL,
 prompt TEXT NOT NULL, model TEXT NOT NULL, base_version INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','AWAITING_INPUT','AWAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED')),
 candidate TEXT, explanation TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,inputs TEXT NOT NULL DEFAULT '{"mode":"build","images":[]}',UNIQUE(project_id,request_key)
) STRICT;
INSERT INTO runs_next SELECT id,project_id,request_key,prompt,model,base_version,state,candidate,explanation,error,lease_until,created_at,updated_at,inputs FROM runs;
DROP TABLE runs;
ALTER TABLE runs_next RENAME TO runs;
CREATE UNIQUE INDEX one_active_project_run ON runs(project_id) WHERE state IN ('QUEUED','RUNNING','AWAITING_INPUT','AWAITING_APPROVAL');
CREATE TRIGGER managed_run_identity_immutable BEFORE UPDATE ON runs WHEN EXISTS(SELECT 1 FROM run_controls WHERE run_id=OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.request_key IS NOT OLD.request_key OR NEW.prompt IS NOT OLD.prompt OR NEW.model IS NOT OLD.model OR NEW.base_version IS NOT OLD.base_version OR NEW.inputs IS NOT OLD.inputs OR NEW.created_at IS NOT OLD.created_at) BEGIN SELECT RAISE(ABORT,'Run input is immutable'); END;
ALTER TABLE run_controls ADD COLUMN waiting_kind TEXT CHECK(waiting_kind IN ('connection','cost'));
ALTER TABLE run_controls ADD COLUMN wait_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE run_controls ADD COLUMN pause_count INTEGER NOT NULL DEFAULT 0 CHECK(pause_count>=0 AND pause_count<=5);
CREATE TABLE run_limits (run_id TEXT PRIMARY KEY REFERENCES runs(id),limits TEXT NOT NULL) STRICT;
 INSERT INTO run_limits SELECT c.run_id,CASE WHEN json_extract(r.inputs,'$.mode')='plan' THEN '{"maxOutputTokens":4000,"maxModelCalls":1,"timeoutMs":600000,"maxContextBytes":2097152,"maxOutputBytes":2097152,"maxSteps":1,"maxRepairs":0,"privacy":"configured"}' ELSE '{"maxOutputTokens":12000,"maxModelCalls":1,"timeoutMs":600000,"maxContextBytes":2097152,"maxOutputBytes":2097152,"maxSteps":1,"maxRepairs":0,"privacy":"configured"}' END FROM run_controls c JOIN runs r ON r.id=c.run_id;
CREATE TABLE run_approvals (
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),kind TEXT NOT NULL CHECK(kind IN ('connection','cost')),
 action TEXT NOT NULL,action_digest TEXT NOT NULL,input_digest TEXT NOT NULL,base_version INTEGER NOT NULL,
 actor_id TEXT NOT NULL,nonce TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','approved','denied','expired','invalidated')),created_at INTEGER NOT NULL,resolved_at INTEGER,
 UNIQUE(id,run_id)
) STRICT;
CREATE UNIQUE INDEX one_pending_run_approval ON run_approvals(run_id) WHERE state='pending';
CREATE TABLE run_grants (
 run_id TEXT NOT NULL REFERENCES runs(id),sequence INTEGER NOT NULL CHECK(sequence>=1),approval_id TEXT NOT NULL UNIQUE,
 authority TEXT NOT NULL,limits TEXT NOT NULL,deadline_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(run_id,sequence),FOREIGN KEY(approval_id,run_id) REFERENCES run_approvals(id,run_id)
) STRICT;
CREATE TRIGGER run_limits_immutable_update BEFORE UPDATE ON run_limits BEGIN SELECT RAISE(ABORT,'Initial budget is immutable'); END;
CREATE TRIGGER run_limits_immutable_delete BEFORE DELETE ON run_limits BEGIN SELECT RAISE(ABORT,'Initial budget is immutable'); END;
CREATE TRIGGER run_grants_immutable_update BEFORE UPDATE ON run_grants BEGIN SELECT RAISE(ABORT,'Execution grants are immutable'); END;
CREATE TRIGGER run_grants_immutable_delete BEFORE DELETE ON run_grants BEGIN SELECT RAISE(ABORT,'Execution grants are immutable'); END;
CREATE TRIGGER run_approval_identity_immutable BEFORE UPDATE ON run_approvals WHEN NEW.id IS NOT OLD.id OR NEW.run_id IS NOT OLD.run_id OR NEW.kind IS NOT OLD.kind OR NEW.action IS NOT OLD.action OR NEW.action_digest IS NOT OLD.action_digest OR NEW.input_digest IS NOT OLD.input_digest OR NEW.base_version IS NOT OLD.base_version OR NEW.actor_id IS NOT OLD.actor_id OR NEW.nonce IS NOT OLD.nonce OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at OR (OLD.state<>'pending' AND NEW.state<>OLD.state) BEGIN SELECT RAISE(ABORT,'Approval identity or final decision is immutable'); END;
`;
