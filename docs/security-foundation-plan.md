# Security foundation - first implementation batch

Repository: LMPrado-DZ23/open-lovable
Baseline: 69bd93bae7a9c97ef989eb70aabe6797fb3dac89
Branch: fix/security-foundation-20260922

## Scope

Preserve the existing builder and provider abstraction. Make single-operator
operation safer and error reporting truthful before expanding the product.
This batch does NOT implement project persistence, tenant isolation or full SaaS.

## Verified baseline failures

- npm run test:all references missing test:integration.
- npm ci fails because package-lock.json lacks optional dependency entries.
- check-vite-errors reports success without performing a check.
- run-command reports success even when the command exits nonzero.
- E2B command execution reports the Python wrapper status, not subprocess status.
- Server endpoints do not enforce operator access.
- Raw AI file paths / package strings and incomplete file blocks need validation.

## Plan

1. Reproduce failures with regression tests.
2. Refresh Next/React patches within existing major versions; maintain npm lockfile.
3. Add single-operator authentication and same-origin checks at API handlers and middleware.
4. Fix provider command/result handling and validate packages and generated changes.
5. Replace fictitious health with bounded diagnostics; export without secret files.
6. Run unit/API tests, lint, typecheck, build, browser smoke and dependency audit.
7. Publish a review branch and pull request, without merge or deployment.

## Acceptance and limitations

Unauthenticated production requests must fail closed. Test rejection paths without
contacting paid APIs. Never count mocked SDK tests as live E2B/Vercel validation.
Generated output must not be applied when structurally incomplete or unsafe.
Unknown health must be distinguishable from a healthy runtime.
All remaining failures and external dependencies must be documented in the PR.

## Deliberately deferred

Persistent workspaces, multi-user authorization/tenant isolation, resumable runs,
full project revisions, database templates, local runners and publishing UX.
Global sandbox/conversation state remains single-operator and must not be shared
across untrusted users. A password is not a multitenancy implementation.

## Additional issues found during verification

- A Playwright API client inherited project HTTP credentials after its initial 401.
  The anonymous HTTP check now uses native fetch without any credential inheritance.
  Trace evidence showed 401 before authorization, then 400 only after the retry added credentials.
- The mobile form clipped the submit action and style labels despite the document reporting
  no horizontal overflow. Added an element-boundary regression and fixed grid/min-width constraints.
  Form labels, model selection semantics and switch state were improved without replacing the design.
- Development configured with a public origin could otherwise remain password-free.
  Public origins now require operator credentials even in development.
- Explicit package versions could be incorrectly skipped when any version was already present.
  Explicit versions/tags now go through npm resolution; failed installation completion remains a failure.

- Final tablet screenshot inspection found that the form remained narrow until `lg`,
  while its inner controls switched to horizontal layouts at `sm`. A new label-boundary
  assertion reproduced the clipping. Inner breakpoints now align with the existing
  container's `lg` transition; labels remain visible without hiding overflow.
