# Selective reuse attribution

Reference: DZ23-LTDA/ollama-classe-a-plus at aee66ee988c99d2ed6da2e8e9fc1009e3c90592f.

- `internal/agent/secrets.go`: credential patterns and recursive redaction adapted in `lib/security/secret-content.ts`.
- `internal/multillm/registry.go`: explicit provider namespaces, catalog metadata and server credential boundaries informed the new TypeScript registry.

Copyright (c) Ollama. The source MIT notice is preserved verbatim in `docs/notices/OLLAMA_LICENSE`.
The original Open Lovable license remains unchanged. No Go runtime, Company OS, desktop controller or visual HTML renderer was copied.

## Screenshot-to-code reference

Reference: abi/screenshot-to-code at d026163f586dfa8c5c10d28c36edd59a9d3b0e88.
`backend/prompts/system_prompt.py` and `backend/prompts/message_builder.py` informed visual analysis guidance and explicit image/text message construction. Guidance was adapted to the existing multi-file React proposal workflow in `lib/projects/visual-guidance.ts` and `generation.ts`; the Python engine, frontend, CDN scripts and image-service integrations were not copied.
Copyright (c) 2023 Abi Raja. MIT notice retained in `docs/notices/SCREENSHOT_TO_CODE_LICENSE`.
Lovable product documentation is a behavioral reference only. No proprietary Lovable platform source, branding, fonts or downloaded bundles were copied.

## PostgreSQL client dependency admission (P04)

The pinned pg driver and 13 newly resolved transitive/type packages are recorded in docs/admission/candidates.json with registry integrity, actual file checksums, exact versions and license evidence. Full license notices are retained in docs/notices/postgres. No package lifecycle script was executed during admission. Their code remains an npm dependency, not a copied second application framework.

## Supabase Auth CI integration

The separately executed test-only Auth container is pinned in `docs/admission/auth-ci-image.json`. Its upstream MIT notice is preserved at `docs/notices/supabase-auth/LICENSE.txt`. It is not bundled as the production identity service.
