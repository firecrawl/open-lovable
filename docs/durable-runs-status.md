# Durable run status ? local verification complete, release not authorized

The former WIP checkpoint f6af97c is preserved in history, including its failed tests. The current delta fixes recursive API discovery, genuine anonymous browser fixtures and Portuguese selectors; no test was disabled.

The Studio now uses v1 durable admission. It can close/reopen while an independent OS worker runs, inspect its scoped journal, approve/cancel through canonical transactional methods and download an audited metadata-only record. HTTP 202 is admission, not task completion.

Local clean install, admission, lint, types, 203 code/API/integration tests, 8 evidence-verifier tests, production web/worker build, 30 browser tests and dependency audit passed. Three OS-process tests prove cancellation and two crash/recovery outcomes using synthetic HTTP, not a real model. Windows source was tested; final-head CI must confirm PostgreSQL and macOS/Windows jobs separately.

Additional corrections: immutable control/journal boundaries, job corruption quarantine, stale failure fencing, account network-policy revocation, project/run association before cancellation, strict snapshot root fields and safe graceful drain. SQLite migration7/PostgreSQL migration4 preserve historical SQL. Restored/imported pending tasks do not replay automatically.

No main change, production deployment, user database migration or live credentials. Remaining operational warning: Next.js reports ECONNRESET/aborted on some abandoned navigation requests; preserved, not hidden. Generic HITL, budget UI, distributed worker, agent tools, runtime isolation for generated apps, backend and publication remain separate packages.

Guide: docs/durable-runs-guide.md. Verification records and log hashes: docs/evidence/p07-p09-local.json. Independent review is distinct from the local suite and CI.
