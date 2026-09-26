# Backup, verification and isolated restore

This command covers the individual SQLite control-plane data in this revision. It is not a PostgreSQL backup, an application-backend backup, a cloud disaster-recovery service, or a deployment command. Run it locally as the authorized operator. No HTTP endpoint or model tool exposes these operations.

## Prerequisites

Use the repository's supported Node version and installed dependencies. Determine the actual configured OPEN_LOVABLE_DATA_DIR; do not assume a path from another installation. Supply the original 32-byte master key as a private regular file. The application may use credentials.key or an OPEN_LOVABLE_MASTER_KEY deployment setting; a new random key is not a replacement for that original key. Never paste key values into arguments, chat, source control or logs.

The parent destination directory must already exist. Each backup and restore requires a NEW directory outside the checkout. Existing directories are refused, including empty ones. The source database is opened read-only by the CLI; backup does not run migrations or change its journal mode. SQLite's backup API captures committed WAL data rather than copying only the main database file.

## Commands

From the repository directory, replace the bracketed paths with the actual authorized locations:

```text
npm run recovery -- create --data-dir <source-data-directory> --destination <new-backup-directory> --key-file <original-private-key-file>
npm run recovery -- verify --bundle <backup-directory> --key-file <original-private-key-file>
npm run recovery -- restore --bundle <backup-directory> --destination <new-data-directory> --key-file <original-private-key-file>
```

`create` makes a consistent snapshot, authenticates every stored connection using the supplied key, checks the application schema and content integrity, and encrypts the database. A successful bundle contains only database.enc and manifest.json. The master key is deliberately excluded and must be backed up separately under an appropriate access policy.

`verify` authenticates the manifest, decrypts into a disposable private directory, checks database/schema/inventory/content integrity and validates the stored connections. It does not switch the application to another data directory or install a key. Its temporary files are removed on normal completion or caught failure.

`restore` performs these same checks and materializes state.sqlite3 and credentials.key only in a newly created private directory. It does not overwrite the old installation. Opening the restored database with a newer application may subsequently run supported migrations; verification itself does not do so.

## Cutover and recovery procedure

1. Stop writes for an operational cutover and retain the original data directory and key. Read-only backup does not itself stop an application that is still writing.
2. Create and verify a bundle. Keep an off-host encrypted copy and a separate recoverable key. An existing file is not proof of a usable backup.
3. Restore into a new private directory. Start a separate authorized test instance against that directory with the matching operator configuration and key setting.
4. Open projects, check revisions and references, test encrypted-connection metadata and edit a test project. Do not invoke live paid providers just to test restoration.
5. Switch the production configuration only after separate approval and an environment-specific rollback plan. This command never edits service configuration or restarts production.

## Boundaries and failure behavior

- Wrong or missing keys, inconsistent connection encryption, unsupported schema, invalid checksums, altered manifests/ciphertext and linked paths are rejected. Data already present at a destination is never overwritten.
- The supported application schema is checked against the numbered migrations; unversioned custom tables are not silently certified. Preserve originals and investigate any schema mismatch.
- Defaults limit the database to 512 MiB and apply a two-minute operation budget. Library callers may select smaller byte budgets, up to the fixed cap, and a deadline of at most five minutes. Cancellation is checked between copy/inspection steps and in streams; this is not a real-time guarantee for an OS or SQLite call already running.
- Plaintext temporary SQLite files exist during snapshot/decryption inside private directories. A process kill or power failure can leave an incomplete directory. Do not upload it as a valid bundle: only a successfully verified manifest counts. This tool does not claim secure erasure or protection against a malicious process running with the same OS account.
- POSIX modes are requested for private output. Windows ACLs, encrypted disks and key custody remain installation responsibilities. No broad filesystem permissions are changed by the command.
- Corruption detection is not a malware scanner. Imported code is not executed by verification. The application and its later runner still require their own safety controls.
- A key cannot be matched to connection ciphertext when the database contains no configured connections; the supplied key nevertheless protects that bundle. The CLI never invents or silently replaces a missing key.
- This increment neither schedules off-host backups nor certifies RPO/RTO for a real installation. Scheduled backup, retention, PostgreSQL/app data and disaster recovery remain under the broader operations plan.

## Verification scope

Automated coverage includes restored code/history/documents/images, all stored connections, wrong-key rejection, a non-migrating CLI, schema/content corruption, limits/cancellation, path boundaries, ciphertext/manifest tampering and refusal to overwrite. A browser test starts a separately restored loopback server, opens the recovered application, exercises its counter, saves a new revision and confirms the original source database remains unchanged. These are synthetic test data, not a backup or restore of the operator's real projects.

Primary API references consulted: Node.js node:sqlite backup and readOnly connection documentation; Node.js node:crypto AES-GCM and HKDF documentation. No third-party code or new dependencies were copied for this implementation.

Deadline checks use a monotonic clock at synchronous inventory boundaries. A single SQLite/OS call cannot be preempted; caller cancellation triggered by event-loop callbacks is observed after control returns to that loop. This is cooperative cancellation, not an instantaneous wall-clock kill guarantee.
