# Workspace persistence and PostgreSQL contracts (P04)

## What is active in the application

The existing individual Studio continues using SQLite. `/api/projects` now resolves a deterministic personal workspace after operator authentication, then checks the membership stored in the database. Project reads, revisions and writes use `SqliteProjectRepository`. Generation, document and image mutations are also gated by the same workspace membership. Supplied `owner`, workspace or role fields do not become authority.

This does **not** add hosted login, invitations, team UI or a complete PostgreSQL-powered Studio. Those domain integrations remain P05/P07/P08 work. In particular, a verified PostgreSQL project adapter is not a claim that legacy sandbox globals are safe for mutually untrusted users. Do not expose single-operator credentials to unrelated tenants.

## Migration compatibility

SQLite migrations 1-3 remain unchanged. Migration 4 adds workspaces, memberships and `projects.workspace_id`, and backfills the existing owners transactionally. The deterministic IDs preserve the original owner string exactly. Re-running context resolution does not reactivate or elevate an existing membership. Historical snapshots and encrypted provider rows are not rewritten.

Back up and verify a copy before applying any new application version to valuable data. No operator database was migrated by the implementation tests; fixtures use temporary directories. Restoring an older backup and deliberately opening it with this version applies the additive migration. The backup CLI itself remains read-only at the source.

## Repository contract

`ProjectRepository` exposes the operations that are implemented now: list, create, read, write authorization, save, list/read revisions and restore. Every write checks database membership, snapshot validation, quotas and expected revision. Restoring creates a new revision. The SQLite and PostgreSQL adapters run the same positive and adversarial contract scenarios.

Draft/patch/approval interfaces from the full plan are not represented by placeholder methods. They are added with their corresponding P17/P23 implementation. The concrete snapshot format stays compatible with the current UI; artifact indirection is introduced by P06.

## PostgreSQL trust boundaries

`postgres-schema.ts` contains an explicit versioned control-plane schema. An operator migration connection creates it. A separate non-owner runtime role receives only the grants needed by the implemented repository. Runtime refuses superuser, BYPASSRLS, role/database-creator and table-owner identities. RLS is enabled and forced, with transaction-local actor/workspace settings. Runtime cannot change memberships, disable RLS or access the credential table.

All values are parameterized. A transaction uses one checked-out client; context is cleared by transaction completion. Writes serialize within a workspace to protect revision quotas and compare-and-swap. Pool and statement/lock timeouts are bounded. Remote configuration requires verified TLS and explicit credentials; local plaintext is restricted to an explicitly allowed loopback connection. No database URL is accepted from a generated project or browser payload.

This does not make arbitrary SQL safe to expose to the model. The runtime database credential is server-only and must never enter a project sandbox. Hosted session validation and reauthorization of running jobs are separate features.

## Operator commands

Use a separate, authorized empty target. The runtime role must already exist without administrative privileges. Keep `OPEN_LOVABLE_POSTGRES_ADMIN_URL` in the operator environment, never in client variables or Git. The command does not print it.

```text
npm run postgres:admin -- migrate --runtime-role open_lovable_runtime
npm run postgres:admin -- import --source-db /private/staged/state.sqlite3 --key-file /private/keys/original.key --confirm-empty-target true
```

For an authorized loopback test database only, append `--allow-loopback true`. Do not put the URL or key value directly in command arguments.

The importer requires a staged SQLite schema version 4, opens the source read-only, copies a consistent snapshot and verifies it using the recovery checks and original master key. It imports every domain table in one PostgreSQL transaction, including revisions, conversations, executions, documents, images, workspace mappings and encrypted connections. Counts and content digests are compared before commit. Existing destination data cause a refusal; the source and an existing target are never reset or overwritten.

The import report says `activation: NOT_PERFORMED`. It is a data-transfer tool, **not** an automatic production cutover. Do not activate PostgreSQL as the full Studio backend until the remaining domains and authentication are wired and independently verified. There is no permanent dual-write mode.

## Test profiles

`npm test` covers the local SQLite/API/compatibility tests, including the migration and operator boundaries. `npm run test:postgres` is deliberately separate and refuses to run without an explicit disposable loopback database named `ol_test_*` and the test-only opt-in. Missing infrastructure is not a passing or skipped PostgreSQL test.

The GitHub Actions `postgres-contracts` job provides the digest-pinned official PostgreSQL test container, creates a restricted runtime role, runs the shared contract suite and verifies RLS and cross-database import. The service and all data are disposable. This validates PostgreSQL behavior, not a Supabase account, a production provider or generated full-stack applications.

Package source versions, registry integrity, installed file digests and full license notices are tracked in `docs/admission` and `docs/notices/postgres`. Admission is scoped to these 14 newly resolved packages; unrelated baseline dependencies are not retrospectively certified.
