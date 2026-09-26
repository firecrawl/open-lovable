# Product completion - durable individual workspace

Baseline: ce056f7a91d703cad9f0bb1402ddee6e227c7dd2. User authorized implementation and tests; production changes and paid service consumption remain approval-gated.

## Acceptance target
The operator can configure an AI connection in the UI, create/import multiple projects, generate/edit using the existing model resolver, inspect a candidate in an isolated browser preview, approve and save a revision, restart and reopen without losing files/conversation, restore an earlier revision and export the project. A failed or cancelled generation must not replace the saved revision. Project A must not affect project B.

## Architecture
- SQLite local durable storage, versioned additive migrations, WAL, prepared statements, owner-scoped queries and revision CAS. Local single-operator deployment, not a public multitenant SaaS.
- AES-256-GCM encrypted provider configuration; master key outside project directories; API never returns secret values. Environment configuration retains explicit precedence.
- Existing inference/provider architecture retained. New durable runs coordinate existing inference primitives; no imported Go engine, desktop control or Company OS.
- New project workspace UI uses immutable candidate revisions. Safe preview compiles virtual files with an allowlisted compiler configuration, never executes package scripts on the host. Code executes only in an opaque-origin sandboxed iframe with restrictive CSP.
- Existing cloud generation interface stays available. Its global state must not be used by durable projects. Request-scoped generation context isolates the existing generator for project requests.
- Durable run state, cancellation, idempotency and restart recovery; uncertain runs are surfaced, never automatically re-sent to a paid model.

## Tasks and verification
1. Revalidate independent review findings, reproduce and fix valid generation/input/transport regressions without weakening validation.
2. tests/project-store.test.ts -> lib/projects/store.ts + lib/projects/schema.ts: persist, restart, owner denial, compare-and-swap, revisions, stale approval, transactions, leases.
3. tests/credentials.test.ts -> lib/settings/store.ts + api/provider-settings: encrypted writes, keep/clear semantics, secret-free metadata, version conflicts, URL validation.
4. tests/project-preview.test.ts -> lib/projects/preview.ts: real React compilation, denied host imports, invalid source, assets, CSP and binary bounds. Existing syntax never executed server-side.
5. tests/project-workflow.test.ts -> project APIs and scoped generation: start/cancel/recover, candidate instead of partial commit, API ownership, export/import bounds.
6. app/projects and app/projects/[id], settings forms: accessible responsive UI, real empty/loading/error/success states, no invented project data. Preserve existing reference-by-URL entry.
7. Playwright: create/import A/B, edit, preview interaction, save/reload/restore/export, settings, denied requests and failed generation with unchanged revision. Verify restart using an actual persistent store.
8. Full lint/typecheck/unit/integration/build/audit/E2E, visual inspection, update PR with exact evidence and external blockers.

## Boundaries
No automatic production deployment, destructive migration, credentials harvesting or paid provider/sandbox calls. Missing live services are BLOCKED_BY_EXTERNAL_DEPENDENCY, not a justification to skip local implementation. Application runtime authentication remains single-operator; owner scoping is testable but does not advertise account provisioning or SaaS tenancy. Arbitrary npm scripts execute only in an explicitly configured cloud/container sandbox, never in the local compiler.

## Recovery verification
The double-dot directory regression was reproduced, along with an ancestor-junction bypass. Validation now compares parent segments precisely and refuses linked ancestors before creating directories. Work continues in the existing isolated checkout; the legacy cloud builder is preserved and durable project APIs will not use its global state.

## Validated delivery checkpoint
- Durable project API and workspace cover ZIP import, manual edit, per-project generation proposals, explicit acceptance, revisions, restoration and export.
- Separate-process recovery verifies source, messages and revisions after process termination.
- Encrypted provider connections are editable in the UI without echoing saved keys.
- Native esbuild resolution fixes the production Next preview compilation failure while retaining path boundaries.
- Large ZIP tests reproduce middleware truncation and regexp-stack exhaustion; bounded transport and linear base64 validation correct both.
- Positive Playwright API requests send credentials preemptively only to their loopback test origin; native unauthenticated rejection tests remain unchanged. Duplicate 401/retry body aborts no longer appear in positive-flow logs; server errors were not suppressed.
- Final Windows gates: clean install, lint, TypeScript, 70 unit/API tests, build, 17 browser tests and dependency audit passed. CI is a separate gate on the pushed commit.
- Remaining outside delivery: commercial multi-user auth/tenancy, automatic migration of legacy cloud sessions, arbitrary backend/dependency execution locally, distributed autonomous workers, PDF/DOCX ingestion, MCP and live-provider/cloud qualification.
