# Visual references and independent functional parity

Baseline: c172a1b182127a8c51d546d70f9c9ef5c35bc4b5.
Source study: abi/screenshot-to-code at d026163f586dfa8c5c10d28c36edd59a9d3b0e88 (MIT).
User authorized selective reuse and implementation in the existing Open Lovable; no merge, paid service calls or deployment.

## Scope of this increment
- Persistent per-project PNG/JPEG/WebP visual references, safe image decoding and normalization.
- Explicit image selection per request; immutable IDs and hashes bound to idempotent runs.
- Actual multimodal model input through the existing resolver, not OCR or embedding a whole screenshot as a fake page.
- Planning mode persisted in the same run system; cannot stage/apply code or change project revisions.
- Reference / preview comparison and responsive preview sizes; preserve revision approval.
- Independently authored parity matrix against official Lovable documentation. Authorized generated-app tree is not Lovable platform source.

## Design and bounds
Keep Next, React, SQLite and current provider adapters. Add migration 3, project-images endpoints and image store; never alter an applied migration. Normalize uploaded raster bytes using the application-owned sharp dependency, strip metadata, cap pixels and decoded output. No image URLs, SVG execution, original metadata storage, extraction to filesystem or automatic image generation. Inputs are untrusted data; visible secrets cannot be detected reliably and require the operator to review the screenshot before upload and sending.
Image rows are immutable. Removing one from the library archives it; active run references remain reproducible. Total stored image quota is enforced transactionally. A run stores mode plus the ordered reference IDs/hashes, with a maximum of four selected images and a bounded total payload. Unknown model vision support requires an explicit per-request acknowledgment; this is an operator declaration, never a capability certification. No silent image dropping or model fallback.
Plan mode can consume model tokens only after consent, but cannot write application files. Its text is stored in history and can be copied into a later explicitly authorized build request. The existing single-operator authentication and legacy cloud builder remain unchanged.

## Execution and verification
1. RED tests for image decoding, metadata stripping, owner/project isolation, image quotas and run-input idempotency; implement minimal store and endpoints.
2. RED local HTTP/SSE contract tests for image bytes/roles, missing acknowledgment, plan no-write, cancellation and normal text regression; adapt existing generation.
3. RED browser tests for upload/reload/select/generate/compare and plan/build, then responsive UI and original-workspace regressions.
4. Run lint, typecheck, unit/API/integration, production build, audit and all E2E. Inspect real desktop/mobile screenshots and maintain honest negative-test evidence.
5. Publish tested code on existing PR branch. Record what is and is not equivalent to Lovable; no claim of platform-source access or total parity.

## Not delivered by this increment
Managed multiuser cloud, SSO/RBAC, database/storage provisioning, live Git sync, deployment/domains, payments, visual DOM-to-source edits, video conversion, paid image generation, automatic visual similarity grading, and real-provider visual quality certification require separate implementation or operator-authorized services.
