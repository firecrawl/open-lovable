# Auditoria e hardening — 2026-09-25

Branch: `chore/audit-hardening-20260925` (base `feat/manus-p06-p10-p11-20260924` @ `84cd3f3`).

## Baseline (antes das mudanças, Windows / Node 24)

| Gate | Resultado |
| --- | --- |
| `npm run check:admission` | exit 0 |
| `npm run lint` (`--max-warnings 0`) | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 367/367 (228 + 131 + 8), 0 falhas |
| `npm run security:audit` | 0 vulnerabilidades |
| `npm run build` | exit 0 |

Varredura de segredos no repositório: apenas fixtures de teste intencionais
(`tests/export-bundle.test.ts`, `tests/roadmap/p65.test.ts`, `tests/helpers/raster-fixture.ts`).
Nenhum `.env` real versionado.

## Achados e correções

Nenhum achado CRITICAL/HIGH. As camadas de autenticação (middleware + `authorizeOperatorRequest`
/ `authenticateStudio`), limites de corpo (`readJsonObject`), validação de caminhos e o transporte
de provedores com bloqueio de SSRF estão consistentes. Os problemas estavam nas rotas legadas de sandbox.

| # | Severidade | Problema | Correção |
| - | - | - | - |
| 1 | MEDIUM | `create-ai-sandbox-v2`: falha em `setupViteApp` encerrava o sandbox **anterior** (saudável) e vazava o novo | encerra apenas o provider criado na requisição, sem terminar duas vezes |
| 2 | MEDIUM | `SandboxManager` crescia sem limite (vazamento de memória e sandboxes em nuvem ativos) | registro LRU limitado (5), nunca remove o ativo, ordem monotônica |
| 3 | MEDIUM | `kill-sandbox` não limpava o `sandboxManager`; rotas seguintes recebiam provider morto | `terminateAll()` no manager, cada provider encerrado uma única vez |
| 4 | MEDIUM | `detect-and-install-packages` passava especificadores de import para `npm install` sem validação (injeção de flags/aliases) | filtro por nome de registro npm + `--` |
| 5 | LOW | stack traces em respostas 500 (`create-ai-sandbox*`) | removidos |
| 6 | LOW | mensagens internas/upstream ecoadas ao cliente | `publicErrorMessage()` (redação de segredos) em 14 rotas; corpo do Firecrawl só em log |
| 7 | LOW | `scrape-website` repassava opções arbitrárias ao Firecrawl (custo) e aceitava URL de qualquer tipo | allowlist de formatos, `waitFor` limitado, `requireHttpUrl()` também em `scrape-url-enhanced` e `extract-brand-styles` |
| 8 | LOW | `mkdir -p ${dir}` sem aspas em `apply-ai-code-stream` | `mkdir -p -- '<dir>'` |
| 9 | LOW | estado global sem limite: `userPreferences`, `majorChanges` | limite de 50 chaves/16 KiB; histórico limitado a 20 (`recordMajorChange`) |
| 10 | LOW | `report-vite-error` com `error` não-string causava 500 | validação de tipo → 400 |
| 11 | LOW | `v1/backends`: JSON inválido virava 500 e ecoava a mensagem | `readJsonObject` → 400; 5xx genérico |
| 12 | LOW (bug) | `get-sandbox-files` usava `stat -f %z` (BSD) no sandbox Linux, sem retornar conteúdo | `stat -c %s` |

Testes de regressão: `tests/audit-hardening.test.ts` (10 casos).

## Decisões assumidas

- Base na branch de trabalho mais recente (`feat/manus-p06-p10-p11-20260924`), e não em `main`
  (117 commits atrás), para não regredir o trabalho em andamento.
- Nenhuma dependência atualizada: `npm audit` retorna 0 vulnerabilidades e o repositório tem um
  processo de admissão de dependências (`check:admission`). Upgrades de major (Next 16, AI SDK 7,
  etc.) ficam para uma tarefa dedicada.
- O CI existente (`.github/workflows/ci.yml`) já cobre admission, lint, typecheck, test, audit,
  build, e2e, portabilidade (Windows/macOS) e contratos PostgreSQL/Auth; não foi reescrito.

## Pendências (fora do escopo desta mudança)

- `/api/webhooks/github`, `/api/health` e `/api/ready` exigem auth de operador (modo individual) ou
  são bloqueados (modo supabase); webhooks e probes externos não conseguem chegar. Requer decisão de produto.
- Atualizações de major de dependências.
