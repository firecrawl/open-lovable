/** Additive identity schema; applying it is the migration runner's responsibility. */
export const identitySchema = `
CREATE TABLE identity_actors (
 id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, email TEXT NOT NULL,
 name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), created_at TEXT NOT NULL,
 UNIQUE(issuer,subject)
) STRICT;
CREATE TABLE auth_sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL REFERENCES identity_actors(id),
 issuer TEXT NOT NULL, actor_version INTEGER NOT NULL, encrypted TEXT NOT NULL,
 token_version INTEGER NOT NULL DEFAULT 1, access_expires_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, revoked_at INTEGER,
 selected_workspace_id TEXT REFERENCES workspaces(id), refresh_lease TEXT, refresh_until INTEGER NOT NULL DEFAULT 0,
 purpose TEXT NOT NULL DEFAULT 'normal' CHECK(purpose IN ('normal','recovery')), created_at TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_actor ON auth_sessions(actor_id,expires_at);
CREATE TABLE workspace_invites (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), email TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer','billing')), token_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER, cancelled_at INTEGER,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX invites_workspace ON workspace_invites(workspace_id,expires_at);
CREATE TABLE identity_rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT;
CREATE TABLE identity_audit (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, workspace_id TEXT,
 action TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
`;
