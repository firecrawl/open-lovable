import {approvalSchema} from '../approvals/schema';
import {runIntegritySchema} from '../runs/integrity-schema';
import {durableRunSchema} from '../runs/schema';
import {identitySchema} from '../identity/schema';
/** Additive, transactional SQLite migrations. Never edit an applied migration. */
export const migrations = [{version:1, sql:`
CREATE TABLE projects (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, model TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1), snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX projects_owner ON projects(owner, updated_at);
CREATE TABLE revisions (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL,
 label TEXT NOT NULL, snapshot TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(project_id, version)
) STRICT;
CREATE TABLE runs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_key TEXT NOT NULL,
 prompt TEXT NOT NULL, model TEXT NOT NULL, base_version INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('RUNNING','AWAITING_APPROVAL','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED')),
 candidate TEXT, explanation TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 lease_until INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(project_id,request_key)
) STRICT;
CREATE UNIQUE INDEX one_active_project_run ON runs(project_id) WHERE state IN ('RUNNING','AWAITING_APPROVAL');
CREATE TABLE messages (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), run_id TEXT REFERENCES runs(id),
 role TEXT NOT NULL CHECK(role IN ('user','assistant','system')), content TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX messages_project ON messages(project_id,created_at);
CREATE TABLE run_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id),
 type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE provider_settings (
 owner TEXT NOT NULL, provider TEXT NOT NULL, version INTEGER NOT NULL,
 encrypted TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner,provider)
) STRICT;
CREATE TABLE project_documents (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
 content TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(project_id,sha256)
) STRICT;
`},{version:2,sql:`
CREATE TABLE execution_claims (
 run_id TEXT PRIMARY KEY REFERENCES runs(id), created_at TEXT NOT NULL
) STRICT;
CREATE INDEX events_by_run ON run_events(run_id,sequence);
`},{version:3,sql:`
ALTER TABLE runs ADD COLUMN inputs TEXT NOT NULL DEFAULT '{"mode":"build","images":[]}';
CREATE TABLE project_images (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('target','current')), mime TEXT NOT NULL,
 width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL,
 sha256 TEXT NOT NULL, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX images_by_project ON project_images(project_id,archived);
`},{version:4,sql:`
CREATE TABLE workspaces (
 id TEXT PRIMARY KEY, legacy_owner TEXT UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE workspace_members (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), actor_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer','billing')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 PRIMARY KEY(workspace_id,actor_id)
) STRICT;
CREATE INDEX memberships_actor ON workspace_members(actor_id,active);
ALTER TABLE projects ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
CREATE INDEX projects_workspace ON projects(workspace_id,updated_at);
CREATE TRIGGER projects_require_workspace BEFORE INSERT ON projects WHEN NEW.workspace_id IS NULL
 BEGIN SELECT RAISE(ABORT,'Workspace is required'); END;
CREATE TRIGGER projects_keep_workspace BEFORE UPDATE OF workspace_id ON projects
 WHEN OLD.workspace_id IS NOT NULL AND (NEW.workspace_id IS NULL OR NEW.workspace_id<>OLD.workspace_id)
 BEGIN SELECT RAISE(ABORT,'Workspace reassignment is not allowed'); END;
`},{version:5,sql:identitySchema},{version:6,sql:durableRunSchema}, {version:7,sql:runIntegritySchema},{version:8,sql:approvalSchema},{version:9,sql:`
-- Existing grants remain immutable. Future runs receive the bounded repair budget from migration 8.
CREATE TABLE run_limits_repair_defaults(run_id TEXT PRIMARY KEY REFERENCES runs(id),limits TEXT NOT NULL) STRICT;
INSERT INTO run_limits_repair_defaults SELECT run_id,limits FROM run_limits;
DROP TABLE run_limits;
ALTER TABLE run_limits_repair_defaults RENAME TO run_limits;
CREATE TRIGGER run_limits_immutable_update BEFORE UPDATE ON run_limits BEGIN SELECT RAISE(ABORT,'Initial budget is immutable'); END;
CREATE TRIGGER run_limits_immutable_delete BEFORE DELETE ON run_limits BEGIN SELECT RAISE(ABORT,'Initial budget is immutable'); END;
` }];
