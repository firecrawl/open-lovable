# Classe A+ selective reuse - implementation plan

Approved direction: reuse useful components without merging products or changing production.
Target baseline: 660588df41edeb6422ad8800aec5712d398b8b02.
Reference: DZ23-LTDA/ollama-classe-a-plus at aee66ee988c99d2ed6da2e8e9fc1009e3c90592f.

## This increment
1. A single explicit AI resolver used by generation, edit analysis and completion.
2. Optional OpenAI Chat Completions gateway with a namespaced catalog; no provider guessing or silent paid fallback.
3. Authenticated catalog and probe endpoints plus a usable model selector and diagnostics page.
4. Credential-content detection inspired by internal/agent/secrets.go, integrated at outbound AI, application and export boundaries; structured redaction in logs.
5. Contract tests with real local HTTP/SSE fixtures, regression tests, browser inspection and build.

## Architecture
Server-only registry reads environment references, never sends keys to the client.
Explicit gateway configuration is trusted operator configuration, not a client-supplied URL.
Loopback HTTP is allowed only for an explicitly configured loopback service. Public endpoints require HTTPS.
Transport pins validated DNS results, disallows redirects, bounds responses and respects cancellation/timeouts.
Discovery is metadata only, not a health or capability certification. A probe is explicit and can consume provider tokens.
The source UI's process-global session and its simple visual renderer are not copied.

## Files
- lib/ai/provider-catalog.ts: metadata and configuration
- lib/ai/provider-manager.ts: single SDK resolver
- lib/ai/provider-transport.ts: constrained outbound transport
- lib/security/secret-content.ts: reusable detector and redaction
- app/api/ai-models/route.ts and ai-model-test/route.ts: authenticated discovery/probe
- hooks/useModelCatalog.ts and components/AIModelSelect.tsx: shared browser catalog
- app/settings/ai/page.tsx: connection diagnostics and explicit tests
- generation/edit/application/export routes: integrate the above

## Acceptance
Unknown/disabled models fail before an upstream call. Upstream model IDs retain nested namespaces.
Gateway never routes through unrelated Groq/OpenAI credentials. Recovery uses the same selected model.
Secrets embedded in code are blocked before outbound generation/apply/export; logs omit their values.
Source files remain untouched when an export is blocked. Zero new secrets in browser storage or Git.
Every new API route enforces operator access. Desktop/tablet/mobile controls work without overflow.
Existing tests remain enabled. CI and local tests are reported separately.

## Not completed by this increment
Persistent project revisions, tenant/session isolation, resumable missions, document ingestion and MCP delegation.
These require separate changes to the legacy global sandbox architecture and are not represented as implemented.
No merge/release/deploy and no paid integration tests without authorized credentials.

## Browser inspection follow-up
The editor initialized a billable sandbox and mutated conversation state merely on mount, even when the user only chose a model. A browser regression caught both requests. Initialization now requires an actual submitted URL; read-only runtime status remains available. This does not implement persistent projects or cross-user isolation.
