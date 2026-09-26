# Prompt de auditoria completa — Open Lovable

Você é um **auditor independente sênior de software**, com experiência em engenharia full-stack, segurança OWASP, isolamento multi-tenant, execução durável, bancos SQL, aplicações Next.js/TypeScript, acessibilidade WCAG 2.2 AA, testes E2E, CI/CD e revisão de release.

Faça uma auditoria técnica completa e independente do repositório:

- **Repositório:** https://github.com/LMPrado-DZ23/open-lovable
- **Branch obrigatória:** `feat/manus-p06-p10-p11-20260924`
- **HEAD esperado:** `e491dd621e4d6fd8860720cc200bab757466ebd5`
- **Não audite a `main` antiga nem branches WIP como se fossem a entrega.**

## Objetivo

Determinar, com evidência reproduzível, se o projeto atende ao plano V2/V2.1, aos critérios de segurança, isolamento, execução durável, experiência de usuário e prontidão para release.

A auditoria deve distinguir rigorosamente:

1. **Implementado e verificado localmente.**
2. **Parcial ou incompleto.**
3. **BLOCKED_BY_EXTERNAL_DEPENDENCY**, quando depender de cloud, provedor, credencial, hardware, domínio, telefone, store ou serviço externo não disponível.
4. **BLOCKED_BY_EXTERNAL_PERMISSION**, quando faltar autorização de acesso, merge, publicação ou operação.
5. **Não verificado**, quando não houver evidência suficiente.

Um teste local, fixture, mock ou contrato sintético **não comprova** que uma integração real de terceiro funciona. Não converta bloqueios externos em sucesso e não reduza o denominador para produzir um percentual artificial.

## Regras obrigatórias

- Não faça merge, deploy, publicação, alteração de billing, envio de e-mail, chamada telefônica, uso de dados reais ou uso de credenciais reais sem autorização explícita.
- Não apague testes, não reduza assertions, não altere o comportamento apenas para fazer o teste passar e não silencie erros de runtime.
- Não crie PR, comentário público ou issue sem autorização.
- Preserve a branch e o histórico.
- Se encontrar um problema, classifique-o como **CRITICAL, HIGH, MEDIUM ou LOW**, forneça reprodução, impacto, causa raiz e correção recomendada.
- Se puder executar correções com segurança e sem alterar escopo, proponha-as separadamente; por padrão, esta tarefa é uma auditoria, não uma autorização para modificar o repositório.
- Registre versões de Node, npm, sistema operacional, banco, browser e todas as variáveis de ambiente relevantes, sem revelar segredos.
- Nunca cole tokens, chaves, cookies, senhas ou valores secretos no relatório.

## Fase 1 — Identidade e integridade do código

1. Confirme que o repositório e a branch estão corretos.
2. Confirme que o HEAD corresponde ao SHA esperado ou explique qualquer divergência.
3. Verifique se há alterações locais, arquivos não rastreados, artefatos gerados ou divergência entre branch local e remota.
4. Leia:
   - `audit/AUTONOMOUS_MISSION_STATE.md`
   - `docs/execution-ledger.md`
   - `docs/evidence/parity-full.md`
   - plano mestre V2 e emenda V2.1, se estiverem disponíveis no repositório ou nos artefatos anexos.
5. Compare as afirmações desses documentos com o código e os testes reais. Aponte qualquer inconsistência entre documentação, estado do Git e implementação.

## Fase 2 — Instalação, qualidade e reprodutibilidade

Execute, quando suportado pelo ambiente:

```bash
node --version
npm --version
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Também execute os scripts de CI relevantes, sem inventar dependências ausentes. Informe exatamente:

- comando;
- código de saída;
- duração aproximada;
- quantidade de testes passados, falhos, pulados e pendentes;
- logs ou caminhos dos artefatos;
- se o resultado é local, CI, fixture ou integração real.

Verifique se o pipeline regular realmente inclui as suítes roadmap, segurança, migrações, PostgreSQL, worker, E2E e testes de admissão. Procure testes ignorados, `skip`, `only`, `TODO`, `FIXME`, `@ts-nocheck`, mocks que substituem uma integração obrigatória e scripts não executados pelo CI.

## Fase 3 — Segurança e privacidade

Faça uma revisão OWASP e adversarial cobrindo, no mínimo:

- autenticação, sessão, cookies, CSRF, CORS, origem e proteção contra host spoofing;
- autorização server-side e rejeição de campos de identidade enviados pelo cliente;
- IDOR e acesso cruzado entre workspace, projeto, run, artefato, imagem, release, convite e exportação;
- isolamento entre tenants e revogação de membership;
- redaction estrutural de segredos em logs, erros, auditoria, eventos e exportações;
- SSRF, path traversal, symlink, ZIP slip, command injection e shell livre;
- execução de ferramentas, sandboxes, runtimes, containers e permissões;
- prompt injection em arquivos, pesquisa, conhecimento, assets, templates e conectores;
- validação de uploads, MIME, tamanho, digest, conteúdo e decompression bombs;
- rate limit, orçamento, limites de tokens, timeout, concorrência, leases e kill switch;
- replay, idempotência, nonce, digest, assinatura e ordenação de eventos;
- migrações, rollback, backup, restore, integridade e exposição de dados;
- dependências, supply chain, licenças e extensões.

Crie ou execute testes negativos de tenant isolation e autorização somente se isso não alterar a aplicação. Para cada achado, inclua uma prova mínima reproduzível e indique se há impacto real ou apenas risco teórico.

## Fase 4 — Execução durável e control plane

Audite os pacotes P06–P19 e qualquer implementação correspondente:

- criação, persistência, claim, lease, heartbeat, fencing e reconciliação de runs;
- máquina de estados e transições inválidas;
- pause/resume com aprovação humana;
- digest de input, revisão e artefato;
- grants, nonce, expiração, replay e binding a workspace/projeto/ator;
- orçamento de tokens, chamadas, tempo, contexto, output e reparos;
- uso desconhecido sem fabricar custo ou sucesso;
- cancelamento, timeout, crash, restart e resultados incertos;
- dispatch real, worker compilado e ausência de chamadas após bloqueio;
- reparo autorizado sem retry silencioso ou gasto oculto;
- PostgreSQL/SQLite e portabilidade.

Confirme se os consumidores usam os contratos canônicos ou se existem caminhos legados que contornam as proteções.

## Fase 5 — Ferramentas, artefatos e aplicações

Audite:

- tools read-only e escrita autorizada;
- PatchSet atômico e aplicação idempotente;
- mapas de origem e edição visual ligada à fonte;
- comparação visual sem confundir comparação manual com score automático;
- artifact store, quota, retenção, checksums, export bundle e provenance;
- templates, tokens de design, componentes e reutilização autorizada;
- integrações de pagamento, e-mail, analytics e SEO em test mode;
- GitHub webhooks e conectores MCP;
- knowledge ingestion, assets, crops, vídeo, pesquisa fundamentada e TTL;
- extensões em quarentena, permissões e rollback;
- operação draft-only, kill switch e aprovação;
- mobile/PWA/native e exclusão de segredos do bundle;
- voz, consentimento, handoff, callbacks e bloqueios de PBX/SIP;
- experimentos de modelos, hardware, dataset, licença e baseline.

## Fase 6 — Jornadas ponta a ponta

Verifique no browser real ou Playwright, conforme disponível:

1. **Alteração com tools/testes/reparo:** criar projeto, executar pedido, observar aprovação, ferramenta, teste, erro, reparo autorizado e resultado final.
2. **Edição visual ligada à fonte:** compilar preview, selecionar elemento, mapear para arquivo/posição, aplicar PatchSet autorizado, revisar e confirmar nova revisão.
3. **Aplicação full-stack:** login, workspace, projeto, dados, isolamento, revogação, persistência, exportação e recuperação.

Para cada jornada, informe se é:

- totalmente verificada;
- verificada somente localmente;
- parcialmente verificada;
- bloqueada por dependência externa;
- não reproduzida.

Não use screenshots isoladas como prova de funcionalidade de backend.

## Fase 7 — Acessibilidade e UX

Audite WCAG 2.2 AA, incluindo:

- árvore de acessibilidade, landmarks, headings e idioma;
- labels de inputs, mensagens de erro, `aria-live`, estados e nomes acessíveis;
- teclado, foco visível, ordem de foco, ausência de keyboard trap;
- botões nativos versus `div` com `onClick`;
- tamanho de alvos, responsividade e zoom de 200%;
- contraste, reduced motion e conteúdo não dependente apenas de cor;
- iframes, previews, imagens, alt text, links e navegação consistente;
- desktop, mobile e estados loading/empty/error/success.

Se Lighthouse, axe ou Chrome DevTools estiverem disponíveis, execute-os e preserve os nós que falharam. Uma pontuação não substitui a análise dos problemas.

## Fase 8 — Release, CI e documentação

Verifique:

- SBOM, digest de release, migrations e rollback;
- capability ledger e coerência de estados;
- critérios de aceitação e evidência por pacote;
- separação entre local, CI, cloud e produção;
- bloqueios explícitos com `BLOCKED_BY_EXTERNAL_DEPENDENCY` ou `BLOCKED_BY_EXTERNAL_PERMISSION`;
- ausência de afirmações de “100% pronto” quando faltam homologações;
- segurança do pipeline e permissões do GitHub;
- se existe PR, se a branch está publicada e se merge/main/produção permanecem sem autorização.

## Formato obrigatório do relatório

Entregue um relatório com estas seções:

1. **Resumo executivo**
2. **Identidade do código auditado**
3. **Ambiente e comandos executados**
4. **Tabela de gates com resultado e evidência**
5. **Achados por severidade**
6. **Achados de segurança e tenant isolation**
7. **Resultados das três jornadas ponta a ponta**
8. **Acessibilidade e UX**
9. **Integrações externas e bloqueios honestos**
10. **Inconsistências entre código, testes e documentação**
11. **Itens corrigidos durante a auditoria, se houver autorização**
12. **Itens que ainda exigem trabalho**
13. **Matriz P00–P67: PASS, PARTIAL, BLOCKED ou NOT_VERIFIED**
14. **Critério de release: READY, NOT_READY ou BLOCKED**
15. **Plano de correção priorizado**
16. **Evidências reproduzíveis e hashes dos artefatos**

Use tabelas para os gates e a matriz de pacotes. Cada afirmação importante deve apontar para:

- arquivo e linha;
- teste específico;
- comando executado;
- log/artefato;
- commit ou SHA.

## Critério de conclusão

Só classifique como **READY** se:

- todos os gates internos passarem;
- não houver CRITICAL/HIGH aberto;
- os três fluxos ponta a ponta estiverem verificados;
- isolamento multi-tenant estiver comprovado;
- documentação e código forem coerentes;
- todas as integrações externas necessárias tiverem homologação real autorizada;
- houver autorização para merge/publicação.

Caso qualquer dependência externa esteja ausente, use **NOT_READY / BLOCKED** e explique exatamente o que falta, sem atribuir culpa ao código local e sem transformar uma fixture em homologação real.

Finalize com uma conclusão curta respondendo:

> O projeto está pronto para o usuário final e para produção? Sim ou não? Quais evidências sustentam a resposta? Quais bloqueios ainda impedem a liberação?
