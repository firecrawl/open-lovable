# P03 - individual recovery implementation

Base: cf4c86f84a022c8ec5073ca8b5e64fa58266f5e5. Branch: fix/p03-verified-recovery-20260923. V2 and V2.1 remain the governing plan. This report concerns the SQLite recovery increment, not completion of all 68 packages.

## Root causes and changes

The previous prototype encrypted a snapshot under any 32-byte key without checking that the same key could read the stored connection credentials. The existing negative test was rerun and failed. The fix authenticates ALL configured connection rows from the consistent snapshot, sharing the same read-only decryption path as CredentialStore. It does not rely only on checking the live database before a potentially concurrent backup.

A new test also showed that the CLI opened its source through the migrating ProjectStore. It now opens a read-only DatabaseSync connection. A schema-v2 fixture is backed up without changing source bytes, journal mode or version. The restored snapshot is not migrated until an operator deliberately opens it with the application.

Backup integrity checks now include the supported schema, SQLite structure and foreign keys, revision/document/image checksums, project-to-current-revision consistency and credential authentication. A valid SQLite file with an unexpected unversioned table is refused rather than silently certified.

The bundle encrypts its database with AES-256-GCM and a domain-separated HKDF key. A separate keyed manifest authenticates the inventory and ciphertext digest. The original master key is never bundled. This is not an asymmetric signature or a general proof of who created an artifact.

The operator CLI supports create, verify and restore. Verification uses a disposable private directory; restore only accepts a new directory and never switches an existing installation. Byte/time budgets and cancellation are applied during the operation. See docs/recovery-guide.md for exact limits, key custody and interrupted-operation behavior.

## Reproduced regression cycles

- p03-resume-red: the original wrong-master-key test failed; p03-guard-green passed after the snapshot guard.
- p03-safety-red: source mutation, absent verify command, unexpected schema and corrupt revision cases failed; p03-integrity-green passed after their corrections.
- p03-budgets-red: a cancelled call still created a bundle; p03-budgets-green passed after wiring explicit limits/cancellation.
- Existing credential and audience tests remained enabled and passed after the shared read-only decoder refactor.

All reproduction data and credentials were synthetic. No operator database, key, provider or production service was used.

## Browser verification

A test seeds a synthetic project, creates and verifies its backup, restores to a new directory and starts a separate authenticated Next server on a loopback port. It opens the project, renders and clicks the recovered counter, edits the code, saves/reloads revision 3 and checks that the original source database remains byte-identical. Saved-connection metadata is checked without exposing the fixture key. The separate server is stopped and its synthetic directories are cleaned up.

The complete existing desktop/tablet/mobile suite remains enabled. The recovered-project screenshot was inspected: project identity, saved version and revision history were visible, with no blank screen or framework overlay. These tests do not certify external model quality or cloud deployment.

## Verification state

The first complete local run passed: 113 code/API/integration tests, 8 baseline-verifier tests, 22 browser tests, lint, TypeScript, Next production build and dependency audit with zero reported advisories. A second complete run following npm ci --ignore-scripts is being recorded separately in p03-verification.json. Only exit codes and captured artifacts actually produced by that run can close its gate.

The lockfile and historical migrations are unchanged. No dependency or third-party source was newly admitted. CI of the final commit and independent review remain separate gates.

## Remaining scope and operations

This increment covers the individual SQLite control plane. It does not provide hosted PostgreSQL recovery, application-backend backups, scheduled/off-host retention, live-provider testing, disaster-recovery SLOs or a production cutover. The original worktrees and main are preserved; no merge or deployment is authorized by this report.

The Docker client was detected during a read-only prerequisite check, but its Linux daemon was not reachable. No Docker service was started, installed or reconfigured. That observation is relevant to future disposable PostgreSQL/runner tests, not a blocker or an excuse for incomplete P03 code.

The next phase remains P04 and the dependent identity/worker/runtime work. This report does not advance their states. Raw local logs are private in .audit/f00; the public evidence contains metadata and hashes, not customer data or key values.
