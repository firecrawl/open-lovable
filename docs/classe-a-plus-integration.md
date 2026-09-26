# Ollama / Classe A+ model integration

This increment adds model inference integration and credential-content checks, not a second application or a mission runtime.

## Configure the server

Keep credentials in the server environment or an untracked `.env.local`, never in `NEXT_PUBLIC_*`, source files or browser storage.

```dotenv
# Optional explicit endpoint. `/v1` belongs in the base URL.
OPEN_LOVABLE_GATEWAY_URL=http://127.0.0.1:11434/v1
# Required for a remote HTTPS gateway; optional for a trusted loopback Ollama without gateway auth.
OPEN_LOVABLE_GATEWAY_API_KEY=
# Optional JSON allowlist of EXACT upstream IDs. Blank means query GET /v1/models.
OPEN_LOVABLE_GATEWAY_MODELS=
```

Restart the application after changing environment configuration. Existing direct provider variables remain supported.
A configured Vercel `AI_GATEWAY_API_KEY` never overrides the explicit Ollama / Classe A+ connection.

The endpoint must be reachable from the Next.js server. In Docker, `127.0.0.1` refers to that container, not the host computer. Do not expose the Ollama port publicly to work around connectivity; provision an authenticated HTTPS endpoint or a separately reviewed local transport.

The optional allowlist is a JSON array, for example `["my-model:latest","provider/model-id"]`. Use names actually returned by your server; these example names are not installed models. The UI prefixes names with `gateway/`, but the upstream request retains the original ID exactly.

## Use the interface

Open `/settings/ai` from the home-page connection link. Review configuration state and choose a model. Explicitly accept token consumption before testing text and streaming. A failed test never chooses another provider. No test is performed automatically and a listing is not a capability/health certification.

This screen includes an encrypted connection editor and diagnostic probes. Server environment configuration takes priority over saved settings. Keys are never returned by the read API; leaving the password input blank preserves an existing key unless the explicit clear-key option is selected. Gateway models appear in the home page, editor and sidebar selectors. URL state preserves a gateway selection instead of replacing it with a built-in default.

The gateway uses OpenAI Chat Completions, including SSE. Generation, edit analysis and optional completion share one resolver. Structured JSON support used in edit analysis is model-dependent; a text/streaming probe does not certify tools, vision, structured output or deployment.

## Security boundaries

- Operator authentication and same-origin controls remain mandatory in production.
- Unknown/unconfigured model IDs fail explicitly. No implicit Groq routing or cross-provider recovery.
- Public endpoints require HTTPS and a server-side key; redirects are refused.
- Public DNS answers are checked at connection time and prohibited/private destinations are rejected.
- Explicit loopback endpoints are trusted operator configuration. A loopback gateway may still forward to cloud models; this does not establish private/local-only inference.
- Request/response byte limits and timeout/cancellation apply to gateway and direct SDK calls.
- Known credential-shaped content is blocked before outbound AI, generated-file application and ZIP export. Logs in the generation/planning paths redact matching values. Source files are not rewritten to remove secrets.
- Detection is heuristic, not a complete DLP system; arbitrary secrets and encoded/binary content require additional review.

## What is not imported

The follow-up durable project workflow now adds saved revisions, proposal acceptance, cancellation and text reference documents; see `durable-projects.md`. Multi-user tenancy, distributed resumable missions, PDF/DOCX ingestion, MCP tools, Company OS and desktop control are not implemented. The legacy cloud builder still uses global sandbox state. Do not share this instance with untrusted users.

## Validation

Run `npm run check`, `npm run test:e2e`, `npm run security:audit` and `git diff --check`.
Gateway tests use local HTTP/SSE contract fixtures; browser fixtures are under `tests/fixtures`. These are test-only, not a product fallback. Actual provider credentials, network topology, quota and cloud generation require separate operator-authorized validation.

Source provenance and license: `THIRD_PARTY_NOTICES.md`.
