# Security and deployment scope

This branch preserves the **single-operator** builder and adds an opt-in, single-node account/workspace profile backed by Supabase Auth. Neither profile is a production security certification.
The legacy cloud builder's global sandbox and conversation state remain shared by the operator's browser sessions. The separate durable `/projects` workflow does not use those globals.
Never share operator credentials among mutually untrusted users. Account mode disables the legacy global sandbox endpoints and uses server-checked workspace memberships; runtime segregation and deployment validation remain release gates.

## Access configuration

Individual-mode production requires OPEN_LOVABLE_APP_ORIGIN and OPEN_LOVABLE_PASSWORD (32 to 512 characters). Account-mode configuration is documented in docs/identity-guide.md and does not use a shared operator password.
OPEN_LOVABLE_USERNAME defaults to admin. Use a password-manager-generated unique secret.
The password must stay in server environment variables, never NEXT_PUBLIC variables or source control.
Public deployments require HTTPS. The reverse proxy must preserve the original Host header.
The application rejects Host/Origin mismatches and cross-site requests. Browser authentication
uses the native HTTP Basic dialog; passwords are not persisted in browser localStorage.

Development binds to 127.0.0.1. Never tunnel or reverse-proxy an unauthenticated development
server. Configure credentials before access from another machine. For internet exposure,
add VPN/private access or a hardened reverse proxy with throttling and access logging.
This release does not include distributed rate limiting. Account-mode project, media and connection operations do check server-side workspace permissions; this does not authorize exposing the legacy individual APIs.

## Generated code

Generated code and commands are untrusted. The legacy command flow must run only inside E2B/Vercel. The durable preview compiles virtual files without running project scripts on the host, then runs generated JavaScript in a restricted iframe; this is not a hardened multi-user VM boundary.
Do not mount host directories or inject control-plane credentials into generated projects.
Registry package-name validation prevents argument/code interpolation; it does not prove
that npm packages or their lifecycle scripts are trustworthy. Supply-chain review remains required.
Path validation is lexical and does not establish full filesystem isolation against all
symlink races. Provider sandbox isolation remains an independent required boundary.

Legacy API JSON bodies are bounded to 2 MiB. The durable project API allows 18 MiB JSON for encoded uploads, then enforces 8 MiB decoded snapshots and per-file limits. Middleware has a 20 MiB transport ceiling so it does not silently truncate a valid project upload. File changes reject incomplete XML file blocks,
unsafe paths, credential paths, more than 200 files and files larger than 1 MiB.
The legacy sandbox workflow has no transactional multi-file rollback. The durable workflow stores whole-file snapshots transactionally, checks revision versions and requires explicit proposal approval; a conflict does not overwrite the saved version.

## Export limits and secrets

Legacy ZIP export is bounded to 500 files, 2 MiB per file and 8 MiB total before compression. Durable project imports/exports have a 300-file snapshot limit (1 MiB text, 2 MiB asset, 8 MiB total).
Common environment/credential filenames, private-key extensions, build output and symbolic
links are excluded. Binary files are preserved. The legacy data-URL response remains supported;
Accept: application/zip selects a binary response. Both are bounded in-memory exports, not streaming.
Filename filtering cannot identify secrets embedded in arbitrary source files. Review exports
and run secret scanning before distributing them. Real credentials must never enter generated code.

## Diagnostics and validation

Runtime diagnostics inspect the sandbox HTTP endpoint and bounded Vite logs. They do not
execute the application JavaScript or prove rendering; isRendering is explicitly unknown.
A previous error can remain in logs until restart. The browser smoke suite verifies the
builder UI and access/input error paths without creating paid sandboxes or making AI calls.
SDK-boundary unit tests are not live E2B/Vercel integration tests.

## Remaining release blockers

- Hosted PostgreSQL activation for all operational domains, multi-replica consistency, full runtime/resource isolation and independent account-profile security verification. Identity/workspace checks are implemented; public SaaS certification is not.
- Distributed jobs, durable autonomous workers, automatic legacy-to-project migration and cloud sandbox revision transactions.
- Live AI, Firecrawl, E2B and Vercel end-to-end checks with explicitly authorized credentials.
- Distributed throttling, full log redaction and a complete security review of legacy routes.
- Visual/functional review of generated applications, not only the builder interface.

Never advertise this branch as fully secure, production-certified or multi-tenant ready.

## Durable data and credentials

Data is stored outside the checkout in `OPEN_LOVABLE_DATA_DIR` (default: the server user home `.open-lovable`). Database migrations are versioned and additive. Directory validation rejects nested checkout paths and linked ancestors before creating data. Source content and exported credentials are checked heuristically, not certified secret-free.

Connection values in SQLite are encrypted with AES-256-GCM and owner/provider/version authenticated data. Keep `credentials.key` or the separately configured `OPEN_LOVABLE_MASTER_KEY` private and backed up. Missing/corrupt keys fail closed; the application does not erase stored configuration. Operating-system ACLs and encrypted backups remain deployment responsibilities.

See `docs/durable-projects.md` for backup/recovery and the exact scope of the React preview. Imported source is data, never permission to run scripts, install packages, publish, or access the host.


## F00 corrections: connection destination and raster input

A saved credential is retained on a blank edit only when the canonical endpoint is unchanged. Changing host, port, scheme or API base path requires explicitly providing a key or clearing the existing key. This is a save-time authorization boundary; it does not revoke credentials already disclosed to a provider or cancel every already-running SDK request.

Inline PNG/JPEG/WebP parts are decoded and bounded separately from textual content. Only recognized protocol image fields are exempted from the text heuristic after raster validation; surrounding metadata remains scanned. Remote image/file source URLs are not supported by this transport. Normalization strips metadata, not secrets or personal data visible in pixels. Provider fixtures are not proof that a live model accepts a given image.

On macOS, exact root-owned system aliases /var, /tmp and /etc may be recognized under a narrow ownership/target policy. Arbitrary links and Windows junctions stay blocked. Unsupported future database schemas are rejected before switching persistent journal mode.

The superseded P03 prototype is replaced by the operator-only recovery workflow documented below. Validate a backup and an isolated restore with the original key before relying on it; production cutover, off-host retention and disaster-recovery targets require separate approval and verification.


## Verified individual recovery

The operator-only `npm run recovery -- create|verify|restore ...` workflow is documented in [docs/recovery-guide.md](docs/recovery-guide.md). It uses the original key and a consistent SQLite snapshot, verifies schema/content/connection integrity, and never overwrites an existing restore destination. It does not switch production configuration, schedule off-host backups or cover application backends. See the guide for limits and interrupted-operation handling.

## Account profile and recovery capabilities

See `docs/identity-guide.md` for verified-email login, opaque HttpOnly cookies, server-held encrypted refresh tokens, CSRF/origin checks, roles and one-use invitations. A restored/imported account database invalidates local sessions and pending invitations; the original snapshot digest and the transformed result are distinguished. Memberships themselves reflect the backup time: before an operator activates an old copy, reconcile current revocations and access decisions with the authoritative directory. No recovery command automatically cuts over a live installation.

Tests use controlled identities and bounded services. A separate CI job executes pinned upstream Auth software; SMTP delivery and a specific operator Supabase project require their own acceptance. Do not infer provider homology from a fixture or from the presence of a login screen.

During cancelled navigation requests, the current Next.js 15.5.26 server can report `ECONNRESET`/`aborted` from `node:_http_server` as an uncaught exception. An observation-only monitor reproduced the framework stack, and subsequent authenticated requests continued. Logs are retained; no global exception handler was added to hide the condition, and middleware was not disabled. This operational warning must be addressed/revalidated before a public production release. Upstream references: vercel/next.js issues #84649/#56529 and unmerged PR #94658 (consulted 23/09/2026); their proposed changes have not been imported.
