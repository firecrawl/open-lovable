# Matriz comparativa de melhorias para o open-lovable

**Data da pesquisa:** 24 de setembro de 2026
**Projeto-alvo:** [LMPrado-DZ23/open-lovable][1]
**Natureza:** síntese técnica comparativa para evolução incremental do produto

## Conclusão executiva

A pesquisa oficial sobre IDEs com agentes, builders, runtimes, gateways, modelos locais e orquestração multiagente converge para um conjunto de **contratos e invariantes**, não para uma implementação que deva ser copiada. O open-lovable deve preservar seus runs duráveis, approvals e limites, leases, políticas, verificação, `PatchSet`, repair e planos. As melhorias recomendadas são incrementais: tornar esses elementos explícitos, versionados, auditáveis e aplicados no backend.

Os maiores ganhos vêm de cinco frentes. Primeiro, toda ferramenta e todo `PatchSet` devem passar por preflight de política e verificação postflight, com precedência `deny > ask > allow` e falha fechada em operações de alto impacto. Segundo, cada run deve ter workspace, lease, ambiente e orçamento identificáveis. Terceiro, checkpoints, evidências e trajetória devem ser persistidos sem segredos nem raciocínio privado bruto. Quarto, preview, repair e produção devem ser estados distintos, promovidos por um artefato imutável após verificação. Quinto, providers, modelos, MCP e execução paralela devem ser adapters governados por capabilities, e não novas fontes de autoridade.

> **Limite de interpretação:** esta pesquisa revisou documentação e repositórios oficiais. Isso comprova que uma capacidade é documentada ou está presente na fonte, mas **não prova que qualquer integração funcione no open-lovable**, nem que desempenho, segurança, custo, isolamento ou qualidade sejam equivalentes. Marketing, estrelas de GitHub, quantidade de modelos e existência de uma API não são critérios de aceite.

## 1. Escopo e método

Foram comparadas as seguintes famílias de produto e infraestrutura: Cursor Cloud Agents, Windsurf/Cascade, Cline, Roo Code, Claude Code, Aider e Void; OpenHands, Devin e SWE-agent; Replit Agent, Bolt.new, v0, Lovable.dev, Builder.io e Create.xyz; FlutterFlow, Databutton/Riff e Marblism; Dify, LiteLLM, HarnessRouter e OmniRoute; E2B, Ollama e vLLM; AutoGen, CrewAI, MetaGPT, OpenSquad e AgentConnect; e, em uma varredura adicional de repositórios, Buzz, OpenClaw, Lemonade, OpenDesign, Dyad e Tel-Agent.

A coleta priorizou documentação do fornecedor, README, documentação de segurança, referências de API e código oficial. Cada afirmação recebeu uma das três classificações abaixo.

| Classificação | Significado operacional |
|---|---|
| **Comprovada** | A fonte oficial documenta explicitamente o comportamento ou o repositório contém a capacidade descrita. Isso comprova existência documental ou de implementação, não eficácia no open-lovable. |
| **Declarada** | O fornecedor ou projeto afirma a capacidade, normalmente em descrição de produto, visão ou roadmap, sem validação independente nesta pesquisa. |
| **Desconhecida** | Não foi encontrada evidência oficial suficiente sobre a propriedade específica, ou ela depende de testes no ambiente do open-lovable. |

O backlog foi tratado como autoridade de escopo fornecida na solicitação: **P06** storage local; **P10/P11** contexto, modelos, aprovações ou limites conforme o ponto de integração; **P12** runtime e leases; **P13** políticas; **P15** verificação; **P16–P17** tools e `PatchSet`; **P18** repair; **P19** planos; e **P51+** apenas para capacidades que não couberem nesses invariantes. O conteúdo público consultado do README não descreve todos esses identificadores. Portanto, o mapeamento de P10/P11/P51+ é uma hipótese de integração que deve ser confirmada no backlog interno; não é uma afirmação sobre a implementação atual.

Não foram executados benchmarks comparativos, testes de penetração, testes de escape, testes de compatibilidade cross-provider, testes de custo ou deploys reais de cada concorrente. A matriz abaixo é, por isso, uma base de decisão e não um aceite de integração.

## 2. Tabela comparativa por categoria

| Categoria | Evidência comparativa | O que é aproveitável | Status para o open-lovable |
|---|---|---|---|
| **Planejamento e execução durável** | Replit documenta Plan mode com lista revisável; v0 documenta estados Ask/Auto/Full, VM por chat e retomada no mesmo chat; Devin documenta planos, Todo lists e checkpoints. CrewAI documenta Flows com estado persistente e retomada. [2] [3] [4] [5] | Transformar P19 em um task graph versionado, com etapas `proposed`, `approved`, `running`, `blocked`, `succeeded` e `failed`, orçamento e checkpoint por mutação. | A direção é comprovada externamente; durabilidade, retomada idempotente e divergência entre plano e filesystem são **desconhecidas** no alvo. |
| **ACI e edição** | SWE-agent demonstra viewer, busca, linter, feedback compacto e trajetórias JSON; Aider demonstra repo map e execução de lint/teste; Cline combina Plan/Act, checkpoints e aprovação explícita. [6] [7] [8] | Schemas determinísticos para leitura, busca, edição dry-run e comando. Validar sintaxe antes de materializar o `PatchSet` e registrar a evidência selecionada. | O padrão é adaptável; recall do mapa, qualidade da edição e cobertura de linguagens precisam ser **testados** no projeto. |
| **Políticas, hooks e aprovações** | Cursor, Windsurf e Claude Code documentam hooks; Claude explicita `deny > defer > ask > allow`; Cursor admite fail-closed configurável. Marblism documenta níveis always allow/ask/never e approval cards. [9] [10] [11] [12] | Um único contrato preflight/postflight para shell, arquivo, MCP, deploy e subagente, com escopo, justificativa, TTL e decisão persistida. | A precedência e a UX são comprovadas como padrões. Enforcement real do alvo, inclusive contra ferramentas indiretas, é **desconhecido**. |
| **Sandbox, workspace e ambiente** | Cursor documenta VMs, ambientes clonáveis, snapshots, rede configurável e secrets; E2B documenta sandbox Linux, pause/resume, snapshots e fork; v0 documenta VM isolada por chat, mas rede allow-all por padrão; OpenHands alerta sobre host sem sandbox. [13] [14] [15] [16] | `WorkspaceCapabilities` explícito para filesystem, rede, processos, CPU, memória, tempo e secrets. Perfil de ambiente versionado e workspace por run, com egress default-deny. | A existência dos mecanismos é comprovada ou declarada conforme a fonte; isolamento, paridade de providers e testes de escape no open-lovable são **desconhecidos**. |
| **Checkpoints, diffs e promoção** | Roo Code documenta shadow Git, diffs e restauração; Devin documenta checkpoints e revert; Lovable, Builder.io, v0 e FlutterFlow documentam branches, PRs ou histórico; FlutterFlow recomenda branch gerada separada da branch de customização. [17] [18] [19] [20] | Snapshot imutável antes de cada `PatchSet`, `base_revision`, manifest de arquivos, restore não destrutivo e promoção preview→produção por release hash. | O padrão é comprovado; segurança de restauração, concorrência e round-trip de bundle são **desconhecidos** até teste próprio. |
| **Contexto de repositório** | Aider usa repo map com símbolos, assinaturas, dependências e orçamento de tokens; Devin documenta DeepWiki com links de fonte; Windsurf usa Rules, AGENTS, Workflows, Skills e Memories. [7] [21] [22] | Índice incremental de arquivos, símbolos, dependências, comandos e citações de linha. Rules/AGENTS/Skills/Workflows devem ser versionados e subordinados à policy. | Redução de contexto é comprovada como técnica. Recall, frescor, redaction e impacto na qualidade são **desconhecidos**. |
| **Verificação, segurança e repair** | Replit e Lovable documentam scans antes do publish; Builder.io e v0 documentam correção assistida; FlutterFlow documenta testes baixáveis; SWE-agent documenta trajetória e status de saída. [2] [19] [23] [24] | `evidence manifest` com comando, ambiente, duração, hash, resultado e redaction. P18 só pode produzir `PatchSet` filho a partir de uma falha observável e deve rerodar P15. | Os componentes são comprovados na documentação dos concorrentes; taxa de falso positivo, cobertura e poder de detecção do open-lovable são **desconhecidos**. |
| **Paralelismo e multiagente** | Cline Kanban demonstra worktree por card, dependências e retomada, mas é Research Preview e alerta para bypass; AutoGen GraphFlow e CrewAI Flows documentam fan-out, joins, condições e loops; MetaGPT documenta papéis e artefatos. [25] [26] [27] | IR de orquestração tipado compilado para o runtime atual, leases conscientes de caminhos, DAG limitado, workspaces efêmeros e merge somente após P15. | A forma do grafo é comprovada; concorrência segura, determinismo, conflitos e custo no alvo são **desconhecidos**. |
| **Providers e roteamento** | Dify oferece administração de providers e logs; LiteLLM documenta gateway, budgets, routing, cooldown, retry e OpenTelemetry; OmniRoute declara gateway local; Ollama expõe API local parcial e vLLM serving OpenAI-compatible com ressalvas. [28] [29] [30] [31] [32] | Contrato interno de provider/modelo com capabilities, custo, limites, streaming, idempotência e fallback explícito. Serving de modelo não substitui sandbox de código. | Transportes são documentados; compatibilidade semântica, custo e qualidade dos providers escolhidos precisam ser **testados**. |
| **Observabilidade e auditoria** | Dify oferece logs com latência, tokens, iterações e trace; LiteLLM documenta spans OTel e `traceparent`; Buzz documenta eventos assinados e hash-chain; OpenClaw Office mostra uma projeção de timeline. [28] [29] [33] [34] | Ledger append-only redigido em P06, `run_id`/`attempt_id`/`trace_id`, timeline derivada e export assinado opcional. Hash-chain é evidência de adulteração, não resistência a quem escreve no storage. | O padrão de telemetria é comprovado; redaction, retenção, RBAC e replay seguro do alvo são **desconhecidos**. |
| **Portabilidade, export e mobile** | FlutterFlow documenta CLI, GitHub e ambientes separados; Lovable documenta exportação e Git sync; Builder.io documenta PRs; Bolt e Create documentam mobile/Expo; Create não comprova export completo ou API pública nas fontes consultadas. [20] [35] [36] [37] | `ExportBundle v1` com proveniência, lockfiles, `verification.json`, `.env.example` sem valores, checksums e capabilities. Mobile deve ser capability opcional. | Portabilidade de código e mobile são capacidades documentadas nos produtos; paridade de exportação, backend, signing e self-hosting do alvo são **desconhecidos**. |

## 3. Padrões que valem adaptar

### 3.1 Um contrato de tool, do pedido à evidência

O alvo deve tratar cada operação como uma transação governada: intenção, preflight, execução, resultado, verificação e evidência. O evento deve conter `run_id`, `attempt_id`, `lease_id`, versão da ferramenta, input e output redigidos, hash do `PatchSet`, decisão de política, motivo, timestamps, custo e `exit_status`. O mesmo contrato deve ser usado para leitura, escrita, shell, MCP, provider, deploy e subagente. Isso evita que uma superfície nova crie um bypass que não existe na superfície antiga.

A inspiração vem da combinação de hooks de Cursor, Windsurf e Claude Code, da ACI do SWE-agent e da separação de ACP/MCP documentada pelo Buzz. A adaptação deve ser própria e testada; não se deve copiar schemas, prompts, SDKs ou código.

### 3.2 Permissão em camadas, não instrução no prompt

Rules, `AGENTS.md`, Memories, Workflows, Skills, papéis e checkpoints textuais são contexto. Eles podem orientar o agente, mas não constituem fronteira de segurança. A decisão efetiva deve ser calculada no backend como interseção de **policy**, **capability**, **lease**, **workspace** e **budget**. A precedência recomendada é `deny > ask > allow`. Operações destrutivas, externas ou de produção devem exigir `ask` ou `deny` por default.

A aprovação precisa ser um evento durável vinculado ao digest do artefato. Se o `PatchSet`, workspace, policy ou lease mudar, a aprovação expira. O cliente pode mostrar um card compreensível; o executor deve revalidar a decisão fora do contexto do modelo.

### 3.3 Ambiente reprodutível e sandbox explicitamente limitado

Cada run deve anexar um manifesto com imagem ou Dockerfile, instalação idempotente, comando de início, healthcheck, limites de CPU e memória, timeout, allowlist de egress, versão do provider e referências de secrets. O snapshot nunca deve carregar `.env` ou valores de credenciais. A fonte de verdade do estado continua sendo o journal local em P06; um `sandbox_id` externo é uma referência reconciliada, não o estado implícito do run.

E2B demonstra a utilidade de pause/resume, snapshots e fork. Ollama e vLLM demonstram serving de modelos, não isolamento de código. OpenHands alerta que execução no host sem sandbox entrega filesystem, ambiente e rede completos. O open-lovable deve escolher e testar suas próprias garantias.

### 3.4 PatchSet, checkpoint e promoção como unidade de revisão

A unidade de mudança deve carregar revisão-base, arquivos afetados, diff, dependências, comandos de teste, pedidos de capability, evidências e reversão. O checkpoint precisa ocorrer antes do efeito e no começo e fim de cada tentativa. A restauração deve distinguir `restore-files` de `restore-run`, exigir confirmação para efeitos destrutivos e preferir um `PatchSet` compensatório a sobrescrever o trabalho humano.

O fluxo recomendado é `generated/<run_id>` → `review/<run_id>` → `main`. A branch ou referência gerada deve ser somente leitura no produto. Produção recebe apenas release imutável depois de P15 e aprovação. Migrações de dados e efeitos externos continuam sujeitos a limites próprios; rollback de código não é rollback universal.

### 3.5 Contexto selecionado e citável

Um repo map com orçamento deve selecionar símbolos, relações e comandos relevantes e registrar os trechos usados. O índice deve invalidar por hash, respeitar ignore e redaction e apontar caminhos e linhas. A medição deve comparar contexto completo, mapa e mapa com citações em tarefas representativas. O mapa reduz tokens, mas um índice incompleto pode induzir erro; por isso a seleção precisa ser parte da evidência do run.

Rules, AGENTS, Skills e Workflows devem ter diretórios, schema, escopo, precedência, origem e lint. A configuração deve detectar segredo, conflito e tentativa de desabilitar policy. Workflow manual é comando explícito. Skill dinâmica é não confiável até passar por policy.

### 3.6 Repair limitado por evidência

O loop deve ser uma máquina de estados `edit → verify → classify → repair → verify`. P18 só deve iniciar com failing test, finding, log ou evidência visual associado ao candidato. Cada reparo produz um `PatchSet` filho e preserva o pai. Há limites duros para tentativas, tokens, tempo, diff e escopo. Se o teste for inconfiável ou o resultado piorar, o run para e solicita intervenção.

Essa adaptação aproveita o auto-fix documentado por Replit, v0 e Builder.io, sem aceitar loops autônomos ilimitados ou downgrade de testes.

### 3.7 Orquestração como IR, não como novo scheduler

O padrão GraphFlow/Flows é útil para sequencial, fan-out, fan-in, condição e loop. A implementação recomendada é um pequeno IR versionado que P19 representa e P12 executa. Cada nó declara inputs, outputs, capabilities, pré-condições, pós-condições, budget, timeout, retry e idempotency key. Cada subtask usa workspace e lease próprios. O merge é um `PatchSet` verificável, nunca uma escrita concorrente direta no workspace compartilhado.

A aprovação deve sobreviver ao reinício como evento externo. A documentação do AutoGen alerta que uma interação humana bloqueante pode deixar o time em estado que não pode ser salvo ou retomado. Esse é precisamente o motivo para não deixar aprovação dentro do loop do agente.

### 3.8 Provider-neutral, mas capability-aware

O contrato de modelo deve registrar provider efetivo, modelo ou digest, endpoint lógico, contexto, ferramentas, JSON estruturado, vision, embeddings, reasoning, streaming, limites e preço versionado. Ollama e vLLM usam interfaces compatíveis em parte, mas não equivalentes. Uma rota de fallback precisa revalidar P13, P15 e a capability matrix. Nunca esconder uma troca de provider na timeline.

Ollama deve ficar localhost-only por padrão quando possível, com cloud opt-out explícito. vLLM deve ficar atrás de proxy e firewall; `--api-key` sozinho não protege todas as rotas documentadas. O gateway não é sandbox.

## 4. Matriz capacidade declarada, testada e desconhecida

A coluna **testada** abaixo significa testada nesta pesquisa no ambiente do open-lovable. Como a pesquisa foi documental, nenhuma integração concorrente recebeu teste operacional aqui. Onde há implementação oficial observável, isso é indicado como comprovada documentalmente, mas não como teste do alvo.

| Capacidade | Declarada/documentada pelos concorrentes | Testada no open-lovable nesta pesquisa | Desconhecida ou condição de aceite |
|---|---|---|---|
| Plan revisável e retomável | Replit, v0, Devin e CrewAI documentam planejamento e estado. [2] [3] [4] [5] | **Não** | Divergência entre plano persistido e filesystem; aceitar somente após teste de crash, retry e replay idempotente. |
| Hooks e deny/ask/allow | Cursor, Windsurf, Claude Code e Marblism documentam hooks ou approval levels. [9] [10] [11] [12] | **Não** | Enforcement backend, precedência completa, TTL e bypass por adapter. |
| Sandbox e workspace isolado | Cursor, E2B e v0 documentam isolamento; OpenHands explicita o risco sem sandbox. [13] [14] [15] [16] | **Não** | Escape de filesystem, rede e secrets; paridade Vercel/E2B/Docker/Kubernetes. |
| Checkpoint e restore | Roo, Devin e FlutterFlow documentam checkpoints, revert ou branch de geração. [17] [18] [20] | **Não** | Restauração concorrente sem perda de edição humana e sem retenção de secrets. |
| PatchSet/Git/PR portátil | Lovable, Builder.io, v0 e FlutterFlow documentam Git, branches ou PRs. [19] [20] [35] [36] | **Não** | Round-trip Git/ZIP, binários, conflitos e migração entre providers. |
| Repo map e contexto ranqueado | Aider e Devin documentam repo map ou DeepWiki. [7] [21] | **Não** | Recall, frescor, redaction e ganho mensurável contra contexto completo. |
| Verificação e security scan | Replit, Lovable, Bolt e FlutterFlow documentam scans, gates ou testes. [2] [23] [24] [37] | **Não** | Falsos negativos, cobertura de autorização/injeção e confiabilidade dos testes. |
| Repair automático bounded | v0, Replit e Builder.io documentam correção assistida. [2] [3] [24] | **Não** | Contenção de escopo, limite de tentativas, preservação do pai e ausência de regressão. |
| Fan-out/fan-in e múltiplos agentes | AutoGen, CrewAI, MetaGPT e Cline documentam grafos, papéis ou worktrees. [25] [26] [27] | **Não** | Corridas em arquivos, determinismo, custo e segurança de agentes remotos. |
| Gateway, routing e budgets | Dify, LiteLLM e OmniRoute documentam administração, routing, limites ou fallback. [28] [29] [30] | **Não** | Idempotência de retry, qualidade por modelo, custos reais e falhas parciais. |
| Serving local Ollama/vLLM | APIs e limitações são documentadas oficialmente. [31] [32] | **Não** | Tool calling, structured output, contexto, GPU, latência e qualidade nos modelos escolhidos. |
| Trace, log e replay | Dify, LiteLLM, Buzz, SWE-agent e OpenClaw Office documentam logs, trajetórias ou projeções. [6] [28] [29] [33] [34] | **Não** | Redaction, RBAC, retenção, replay sem efeitos e resistência a adulteração do storage. |
| ExportBundle e build reproduzível | FlutterFlow documenta CLI/Git e Databutton histórico documenta start/build/deploy. [35] [38] | **Não** | Segredos, SBOM, lockfiles, dependências nativas e portabilidade real fora do fornecedor. |
| Mobile/Expo | Bolt, Replit e Create/Anything documentam fluxos mobile ou Expo. [2] [36] [37] | **Não** | Signing, permissões nativas, dispositivo real, backend e publicação. |
| Interoperabilidade MCP/ACP/ANP | Cline, v0, Bolt, Buzz e AgentConnect documentam integrações ou protocolos. [8] [25] [33] [39] | **Não** | Identidade, revogação, replay, schema, supply chain e compatibilidade entre peers. |

**Critério recomendado de teste:** cada capability só muda de desconhecida para testada após fixture determinística, evidência P15, ambiente e versão registrados, teste negativo quando aplicável e conformance report. Declaração do fornecedor permanece declaração, mesmo quando o teste local passa em um caso.

## 5. Recomendações priorizadas e mapeadas ao backlog

A prioridade expressa risco e dependência, não tamanho comercial da oportunidade. As ações abaixo **não replanejam** o backlog; são incrementos dentro de seus pacotes. Um pacote P51+ só deve ser aberto quando o contrato não couber razoavelmente em P06, P12–P19.

### P0 — bloquear riscos de segurança, perda de evidência e publicação indevida

| ID | Recomendação | Mapeamento | Esforço e aceite mínimo |
|---|---|---|---|
| **P0.1** | **Preflight/postflight uniforme.** Definir evento versionado para cada tool e `PatchSet`, aplicar `deny > ask > allow`, separar avaliação de enforcement e falhar fechadamente em shell, escrita, MCP, deploy e subagentes de alto impacto. | P13 + P15 + P16–P17; complementar P51-policy-evaluator somente se não houver dono. | Médio, 3–6 dias. Aceite: matriz de casos, replay de decisão, teste de timeout e prova de que nenhum adapter executa sem decisão. |
| **P0.2** | **Aprovação durável por digest.** Persistir `ApprovalRequested`, `Approved`, `Denied`, `Expired` e `Revoked`, vinculados a run, node, actor, policy version, lease e hash do artefato. Invalidar quando qualquer um mudar. | P06 + P12 + P13 + P15; UX em P10/P11 apenas na borda. | Médio. Aceite: aprovação sobre artefato alterado é rejeitada; reinício não perde a aprovação válida; aprovação não autoriza outro workspace. |
| **P0.3** | **Workspace e capability profile com default-deny.** Declarar filesystem, rede, processos, CPU, memória, tempo e secrets por tool; montar apenas o projeto necessário; usar lease renovável e testar escape. | P12 + P13 + P16–P17; P51-runtime-adapters se necessário. | Alto. Aceite: testes de leitura fora do root, egress não permitido, secret ausente no snapshot e kill no lease expiry. |
| **P0.4** | **Gate preview→produção.** P15 verifica exatamente o artefato candidato; só então P13 autoriza release imutável com hash, comandos, dependências e env-manifest sem segredos. | P15 + P18 + P19 + P13. | Médio. Aceite: preview não altera produção; crítico bloqueia; promoção exige aprovação; rollback aponta para hash anterior. |
| **P0.5** | **Ledger redigido e append-only.** Persistir eventos de run, attempt, lease, policy, tool, patch, verificação, repair e custo. Separar metadata de conteúdo, aplicar redaction antes de P06/telemetria/export e configurar TTL. | P06 + P12 + P13 + P15 + P19; P51-observability somente se necessário. | Médio-alto. Aceite: nenhum token ou `.env` em eventos; export JSONL redigido; access log e apagamento verificável. |

### P1 — aumentar confiabilidade, repetibilidade e produtividade

| ID | Recomendação | Mapeamento | Esforço e aceite mínimo |
|---|---|---|---|
| **P1.1** | **Ambientes reprodutíveis e cacheados.** Manifestar imagem, install, start, healthcheck, limites, allowlist de egress e fingerprint por run. | P12 + P15; P51-environment-profile se o contrato não couber. | Médio-alto, 1–2 semanas. Aceite: reconstrução a partir do manifesto, cache sem segredo e diagnóstico de dependência ausente. |
| **P1.2** | **Checkpoint seguro antes de efeitos.** Snapshot incremental no início/fim da tentativa e antes de cada `PatchSet`, com manifest, hash, exclusões e origem. Exigir confirmação de restore destrutivo. | P06 + P16–P17 + P18. | Médio, cerca de 1 semana. Aceite: comparar, restaurar e executar garbage collection sem sobrescrever mudança humana silenciosamente. |
| **P1.3** | **ACI de edição verificável.** Versionar `read_file(range)`, `search_paths`, `apply_patch(dry_run)` e `run_command`; lint e normalização de observações antes de materializar o patch. | P16–P17 + P15 + P18. | Médio. Aceite: edição sintaticamente inválida é recusada com razão e o repair recebe erro compacto reproduzível. |
| **P1.4** | **Repair bounded e baseado em evidência.** Implementar `edit→verify→classify→repair→verify`, limite de tentativas, tokens, tempo e diff, `PatchSet` filho e parada se o teste não for confiável. | P18 + P15 + P12. | Médio. Aceite: preservar pai, rerodar verificação e impedir loop, downgrade de teste e expansão de escopo sem approval. |
| **P1.5** | **Índice de contexto com frescor e citações.** Indexar arquivos, símbolos, dependências, testes e comandos com orçamento e redaction; invalidar por hash e registrar trechos selecionados. | P10/P11 + P06; P51-repo-context se necessário. | Médio-alto, 1–2 semanas. Aceite: benchmark de recall/custo e prova de exclusão de paths proibidos. |
| **P1.6** | **Leases conscientes de caminhos e paralelismo seguro.** Workspace por run/subtask, base revision pinada, DAG, detecção de sobreposição, conflito antes do merge e auto-merge desabilitado. | P12 + P19 + P16–P17; P51-parallel-runs se necessário. | Alto, 2–3 semanas. Aceite: teste de corrida, colisão detectada e merge apenas após P15. |
| **P1.7** | **Contrato de provider e ledger de budget.** Registrar modelo/provider, capabilities, tokens, custo estimado/real, cooldown, retries e fallback. Fallback requer checkpoint e nova verificação. | P10/P11 + P12 + P13 + P15; P51-model-routing se necessário. | Médio. Aceite: troca visível na timeline, hard stop de custo e falha explícita para capability ausente. |
| **P1.8** | **Manifesto de evidência consumível pela UX.** Para cada resultado, registrar produtor, tipo, hash, comando, ambiente, duração, status, redaction e TTL. | P15 + P06 + P18. | Médio, cerca de 1 semana. Aceite: aprovador acessa diff, testes, logs e screenshot redigidos vinculados ao candidato. |

### P2 — extensões de portabilidade e escala após os invariantes

| ID | Recomendação | Mapeamento | Esforço e condição |
|---|---|---|---|
| **P2.1** | **Orchestration IR tipado.** Nodes, edges, join, loop bound, retry, timeout e idempotency key compilados para o runtime existente. | P19 + P12 + P15; novo P51-orchestration-IR se necessário. | Médio-alto. Só iniciar após aprovação durável e leases confiáveis. |
| **P2.2** | **Timeline e OpenTelemetry opt-in.** Propagar `traceparent`, correlacionar provider, tool, approval, patch e repair; capturar conteúdo apenas por política explícita. | P12 + P15 + P06; P51-observability. | Médio. Depende de redaction, retenção e RBAC P0.5. |
| **P2.3** | **ExportBundle e ponte Git/PR.** Incluir base, árvore, PatchSet, lockfiles, comandos, `verification.json`, `.env.example`, checksums, SBOM opcional e capabilities. | P06 + P15 + P16–P17 + P19; P51-export apenas se necessário. | Médio. Liberar apenas após P15; não prometer self-hosting de backend não exportado. |
| **P2.4** | **Adapters locais e de protocolo.** Ollama/vLLM, MCP/ACP e eventualmente UHP/ANP atrás de gateway, com conformance tests, escopo e revogação. | P12 + P13 + P15 + P16–P17; P51+ por adapter. | Alto. Habilitar apenas depois de matriz cross-provider e threat model. |
| **P2.5** | **Capability mobile/Expo.** Manifestar dispositivo, permissões, secrets, build e artefato; começar por preview e validação, não submissão automática. | P51-mobile-capability ou pacote novo. | Alto. É expansão opcional e não deve contaminar o núcleo web. |

## 6. Quick wins versus mudanças arquiteturais

| Tipo | Entregas | Benefício | Dependências e cautela |
|---|---|---|---|
| **Quick win — alguns dias** | Schema de evento, precedência de policy documentada, `tool_name/version`, decisão e motivo; redaction de `.env`, tokens e headers; `verification.json`; approval card com diff e custo; classificação `proven/declared/unknown`. | Corrige ambiguidade, melhora auditoria e torna claims visíveis sem trocar o runtime. | Exige que o executor revalide no backend; não basta adicionar campos na UI. |
| **Quick win — um ciclo** | Capability matrix por provider; orçamento estimado versus real; `PatchSet` com `base_revision`; checkpoint antes do repair; regras de Rules/AGENTS/Workflows com escopo e lint. | Reduz custo surpresa, conflitos e instruções não governadas. | Índice e budget precisam de testes de frescor e corrida. |
| **Mudança arquitetural — 1–2 semanas** | Journal append-only em P06, approval events, manifest de evidência, ambiente versionado, gateway de segurança, restore não destrutivo. | Estabelece fonte de verdade e enforcement independente do agente. | Redaction, retenção, migração e compatibilidade retroativa são riscos de implementação. |
| **Mudança arquitetural — 2–3 semanas** | Workspace por run, leases de caminhos, DAG/IR, fan-out/fan-in, merge verificado e garbage collection. | Permite paralelismo durável sem corrida em arquivos. | Não iniciar antes de P0; auto-commit, auto-PR e auto-merge permanecem opt-in e aprovados. |
| **Mudança arquitetural — posterior** | ExportBundle reproduzível, OpenTelemetry com RBAC, adapters Ollama/vLLM/MCP/ACP/UHP/ANP, mobile/Expo. | Portabilidade, operação local e extensibilidade. | São superfícies de integração. Devem ser adicionadas como adapters, não como fonte de autoridade ou novo scheduler. |

## 7. Riscos, licenças e o que não copiar

### 7.1 Riscos técnicos e operacionais

**Prompt injection e exfiltração.** A própria documentação do Cursor alerta que terminal com internet aumenta o risco de exfiltração por prompt injection. Issues, PRs, páginas, Rules, Skills, MCP e conteúdo recebido por webhook devem ser considerados entrada não confiável. Egress, secrets e ferramentas precisam de policy no executor.

**Restauração e concorrência.** Checkpoint ou revert pode apagar trabalho humano. Duas sessões podem editar o mesmo arquivo e colidir. O alvo deve pinçar revisão-base, adquirir lease antes da mutação e materializar compensação auditada em vez de apagar silenciosamente.

**Logs e artefatos sensíveis.** Transcript, screenshot, diff, stdout, headers, URLs de preview e tool outputs podem conter código proprietário, PII, tokens, cookies e dados de produção. Redaction deve acontecer antes de persistir, exportar ou enviar a OTel. Raciocínio privado bruto não é requisito de auditoria; guardar ação, observação, resultado, hashes e razão resumida.

**Fallback e custo.** Retry de operação não idempotente pode duplicar efeitos. Trocar modelo no meio do run pode alterar contexto, tool calling, qualidade, preço ou residência de dados. O budget deve ser reservado antes da chamada e liberado ou encerrado no lease expiry.

**Falsa sensação de segurança.** Scan de segurança, teste verde, screenshot ou claim do fornecedor não provam ausência de vulnerabilidade. P15 deve declarar o que foi testado, em qual ambiente e com quais limitações.

**Gateway não é sandbox.** LiteLLM, OmniRoute, Ollama, vLLM e HarnessRouter podem transportar ou executar tarefas, mas não devem ser considerados limite de confiança. vLLM documenta rotas que não ficam protegidas apenas por `--api-key`; Ollama pode ser exposto por configuração de host; OpenHands alerta sobre acesso completo ao host sem sandbox.

### 7.2 Licenças e supply chain

O repositório alvo é apresentado como MIT nas fontes consultadas. Isso não autoriza copiar partes de concorrentes sem auditoria: licença do projeto, dependências, prompts, modelos, assets, marcas e termos de serviço são superfícies distintas.

Dify declara uma licença própria baseada em Apache 2.0 com condições adicionais. Tel-Agent declara AGPL-3.0. Dyad separa código Apache-2.0 de `src/pro` sob FSL-1.1/Apache-2.0. Esses projetos não devem ser incorporados casualmente ao núcleo. Roo Code informa encerramento da extensão e Void informa depreciação; ambos são referências históricas, não dependências. AutoGen está em maintenance mode e recomenda o sucessor Microsoft Agent Framework. O repositório `hello-databutton` está arquivado, enquanto `databutton.com` direciona para Riff; continuidade do builder antigo não deve ser presumida.

Antes de adicionar qualquer adapter, registrar licença, versão, transitive dependencies, origem dos artefatos, permissões de rede e política de atualização. Preferir protocolo documentado ou adapter mínimo. Não copiar código, schemas proprietários, UI, prompts, nomes de estados, hooks, SDKs, shadow Git, router, identidade Nostr, scripts, templates ou implementação de sandbox.

### 7.3 O que explicitamente não copiar

1. Não adotar auto-approve, bypass de permissões, auto-commit, auto-PR, auto-merge, rede irrestrita ou execução local sem sandbox como defaults.
2. Não tratar Rules, AGENTS, Memories, Workflows, Skills, papéis ou checkpoints de prompt como fronteira de segurança.
3. Não copiar implementação proprietária de Cursor, Devin, Replit, Bolt, v0, Lovable.dev, Builder.io, Create/Anything, FlutterFlow ou Marblism.
4. Não usar Roo Code ou Void como dependências de disponibilidade; validar qualquer fork separadamente.
5. Não assumir portabilidade ampla a partir de uma API compatível, de um export ZIP ou de uma promessa de mobile. Auth, storage, realtime, edge functions, signing e dados precisam de equivalentes próprios.
6. Não importar OpenHands em modo host irrestrito, o modo ofensivo EnIGMA do SWE-agent, nem qualquer agente remoto com acesso direto a storage, leases ou produção.
7. Não importar frameworks de orquestração como novo scheduler central. Adaptar padrões em um IR sobre P19/P12.
8. Não usar Dify, LiteLLM, HarnessRouter ou OmniRoute para substituir policy, sandbox, leases, verificação, repair ou `PatchSet`.
9. Não tratar capacidades anunciadas por AgentConnect, OpenClaw, OpenDesign, Lemonade, Tel-Agent ou Marblism como prova de produção, compliance, isolamento ou interoperabilidade.
10. Não expor transcript, screenshot, diff, logs ou URLs de artefato por padrão. Aplicar RBAC, redaction, retenção e publicação explícita.

## 8. Sequência de implementação sem replanejar o backlog

A sequência abaixo é uma ordem de dependência dentro do backlog existente. Ela não cria um segundo plano de produto.

**Fase 1 — contratos e segurança mínima.** Em P06 e P13, definir envelope de evento, capability profile, policy decision e redaction. Em P16–P17, exigir schema de tool e `PatchSet`. Em P15, definir digest de candidato e manifest de evidência. Criar fixtures de deny, ask, allow, timeout, segredo e path proibido.

**Fase 2 — aprovação e promoção.** Em P12, vincular aprovação a lease e workspace. Em P13, aplicar precedência e revalidação no executor. Em P15, bloquear crítico. Em P19, representar aprovação e promoção como etapas do plano. Em P18, exigir falha observável e preservar o candidato pai.

**Fase 3 — ambiente e checkpoints.** Em P12, criar workspace por run e perfil de ambiente. Em P06, persistir checkpoint e manifest. Em P16–P17, gerar `base_revision`, diff e hashes. Executar testes de crash, restore, lease expiry e ausência de secrets no snapshot.

**Fase 4 — ACI, contexto e repair.** Em P10/P11, confirmar ownership e implementar repo map, contexto citado e capability matrix. Em P16–P17, adicionar dry-run, lint e feedback compacto. Em P18, formalizar estados, budgets e limite de tentativas. Medir recall, custo e regressão em tarefas representativas.

**Fase 5 — paralelismo controlado.** Em P19, representar DAG e dependências. Em P12, leases de caminho, workspaces efêmeros e fencing token. Em P16–P17, merge como novo `PatchSet`. Só depois de testar corrida habilitar fan-out. Auto-merge continua desativado por default.

**Fase 6 — provider e observabilidade.** Em P10/P11/P12, adicionar contrato de provider, health, tokens e custo. Em P13, policy de residência e offload. Em P15, fixtures cross-provider para tool calling, structured output, streaming e cancelamento. Em P06, timeline e OTel opt-in com redaction.

**Fase 7 — portabilidade e extensões.** Em P06/P15/P16–P17/P19, emitir `ExportBundle v1` e ponte Git/PR. Em P51+, adicionar adapters MCP/ACP/UHP/ANP, mobile/Expo ou serving local apenas quando o core passar os gates. Cada adapter deve ter capability manifest, threat model, conformance tests e fallback explícito.

Em todas as fases, a fonte de verdade permanece P06 para evidência, P12 para lease e runtime, P13 para policy, P15 para verificação, P16–P17 para tools e `PatchSet`, P18 para repair e P19 para plano. Se um requisito não tiver dono claro, abrir um incremento P51+ pequeno e documentar o contrato; não duplicar o sistema.

## 9. Critérios de aceite transversais

Uma melhoria só deve ser considerada pronta quando consegue responder, para cada run: qual era a revisão-base; qual workspace e ambiente foram usados; qual actor solicitou; qual policy permitiu, pediu ou negou; qual tool e provider efetivos foram chamados; qual foi o custo e o limite restante; qual `PatchSet` foi produzido; quais testes e evidências passaram; qual lease estava ativo; quais secrets foram referenciados sem serem persistidos; e qual promoção foi autorizada.

Também deve ser possível falhar com segurança: cancelar durante streaming, tool, repair e apply; recuperar de worker morto; expirar lease; negar rede; rejeitar patch inválido; impedir aprovação de digest diferente; redigir output sensível; e mostrar ao operador o motivo da parada. **Nenhuma dessas propriedades é presumida pela pesquisa comparativa; todas exigem testes próprios.**

## Referências

[1]: https://github.com/LMPrado-DZ23/open-lovable "Repositório oficial open-lovable"
[2]: https://docs.replit.com/features/agent/overview "Replit Agent overview"
[3]: https://v0.dev/docs/agentic-features "v0 agentic features"
[4]: https://docs.devin.ai/desktop/cascade/cascade "Devin Cascade"
[5]: https://docs.crewai.com/en/concepts/flows "CrewAI Flows"
[6]: https://swe-agent.com/latest/background/aci/ "SWE-agent agent-computer interface"
[7]: https://aider.chat/docs/repomap.html "Aider repository map"
[8]: https://docs.cline.bot/cline-overview "Cline overview"
[9]: https://cursor.com/docs/hooks.md "Cursor hooks"
[10]: https://docs.windsurf.com/windsurf/cascade/hooks "Windsurf Cascade hooks"
[11]: https://code.claude.com/docs/en/hooks "Claude Code hooks"
[12]: https://code.claude.com/docs/en/permissions "Claude Code permissions"
[13]: https://cursor.com/docs/cloud-agent "Cursor Cloud Agent"
[14]: https://docs.e2b.dev/ "E2B documentation"
[15]: https://v0.dev/docs/sandbox "v0 sandbox"
[16]: https://github.com/OpenHands/OpenHands/blob/main/docs/SELF_HOSTING.md "OpenHands self-hosting security"
[17]: https://roocodeinc.github.io/Roo-Code/features/checkpoints/ "Roo Code checkpoints"
[18]: https://docs.devin.ai/work-with-devin/stacked-prs "Devin stacked PRs"
[19]: https://docs.lovable.dev/features/security "Lovable security"
[20]: https://docs.flutterflow.io/exporting/push-to-github/ "FlutterFlow GitHub export"
[21]: https://docs.devin.ai/work-with-devin/deepwiki "Devin DeepWiki"
[22]: https://docs.windsurf.com/windsurf/cascade/workflows "Windsurf workflows"
[23]: https://docs.replit.com/features/security/project-security-center "Replit Project Security Center"
[24]: https://www.builder.io/c/docs/get-started-fusion "Builder.io Fusion"
[25]: https://github.com/cline/kanban "Cline Kanban"
[26]: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html "AutoGen GraphFlow"
[27]: https://docs.deepwisdom.ai/main/en/guide/tutorials/multi_agent_101.html "MetaGPT multi-agent tutorial"
[28]: https://docs.dify.ai/en/cloud/use-dify/monitor/logs "Dify run logs"
[29]: https://docs.litellm.ai/docs/routing "LiteLLM routing"
[30]: https://github.com/diegosouzapw/OmniRoute/wiki/Architecture "OmniRoute architecture"
[31]: https://docs.ollama.com/api/openai-compatibility "Ollama OpenAI compatibility"
[32]: https://docs.vllm.ai/en/stable/usage/security.html "vLLM security"
[33]: https://github.com/block/buzz/blob/main/ARCHITECTURE.md "Buzz architecture and event log"
[34]: https://github.com/wickedapp/openclaw-office "OpenClaw Office"
[35]: https://docs.flutterflow.io/flutterflow-cli/ "FlutterFlow CLI"
[36]: https://docs.lovable.dev/integrations/github "Lovable GitHub integration"
[37]: https://www.create.xyz/docs/apps/mobile "Create/Anything mobile apps"
[38]: https://github.com/databutton/hello-databutton "Databutton hello project"
[39]: https://github.com/agent-network-protocol/AgentConnect "AgentConnect SDK"
[40]: https://docs.litellm.ai/docs/observability/opentelemetry_integration "LiteLLM OpenTelemetry"
[41]: https://mini-swe-agent.com/latest/advanced/global_configuration/ "mini-SWE-agent global limits"
[42]: https://github.com/voideditor/void "Void repository and deprecation status"
[43]: https://github.com/RooCodeInc/Roo-Code "Roo Code repository and closure status"
[44]: https://docs.flutterflow.io/testing/dev-environments/ "FlutterFlow development environments"
[45]: https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership "Lovable ownership and hosting"
[46]: https://github.com/HarnessRouter/harnessrouter/blob/main/protocol/README.md "HarnessRouter UHP draft protocol"
[47]: https://github.com/lemonade-sdk/lemonade "Lemonade local model server"
[48]: https://github.com/dyad-sh/dyad "Dyad repository and licensing"
[49]: https://github.com/Dpro-at/Tel-Agent "Tel-Agent repository and license"
[50]: https://github.com/nexu-io/open-design/blob/main/PRIVACY.md "OpenDesign privacy policy"
[51]: https://docs.openclaw.ai/gateway/security "OpenClaw gateway security"
[52]: https://github.com/renatoasse/opensquad/blob/master/SECURITY.md "OpenSquad security notes"
[53]: https://docs.devin.ai/api-reference/overview "Devin API and RBAC"
[54]: https://docs.e2b.dev/llms.txt "E2B lifecycle and persistence index"
[55]: https://docs.vllm.ai/en/stable/cli/serve/ "vLLM serve options"
[56]: https://docs.litellm.ai/docs/proxy/virtual_keys "LiteLLM virtual keys and budgets"
[57]: https://www.marblism.com/news/153784-your-ai-employees-now-connect-to-thousands-of-tools "Marblism connected tools and approvals"
[58]: https://support.bolt.new/get-started/intro-bolt "Bolt.new overview"
[59]: https://docs.openhands.dev/sdk "OpenHands SDK"
[60]: https://docs.cursor.com/cloud-agent/security-network.md "Cursor Cloud Agent network security"
[61]: https://docs.cline.bot/cline-sdk/overview "Cline SDK"
[62]: https://docs.lovable.dev/features/code-mode "Lovable code mode"
[63]: https://docs.builder.io/c/docs/projects-github "Builder.io GitHub projects"
[64]: https://github.com/langgenius/dify "Dify repository and license"
[65]: https://github.com/microsoft/autogen "AutoGen repository and maintenance status"
[66]: https://docs.ollama.com/faq "Ollama FAQ, local binding and cloud opt-out"
[67]: https://docs.vllm.ai/en/stable/ "vLLM serving documentation"
[68]: https://docs.openhands.dev/openhands/usage/agent-canvas/prebuilt-automations "OpenHands automations"
[69]: https://www.marblism.com/ai-employees/walter "Marblism Walter"
[70]: https://databutton.com/ "Databutton current destination"
[71]: https://riff.ai/ "Riff current product"
[72]: https://github.com/stackblitz/bolt.new "Bolt.new repository"
[73]: https://docs.replit.com/build/publish-your-app "Replit publishing"
[74]: https://v0.dev/docs/deployments "v0 deployments"
[75]: https://docs.swe-agent.com/latest/usage/trajectories/ "SWE-agent trajectories"
[76]: https://github.com/AKKI0511/AgentConnect "AKKI0511 AgentConnect"
[77]: https://github.com/openclaw/openclaw "OpenClaw repository"
[78]: https://lemonade-server.ai/ "Lemonade server"
[79]: https://www.dyad.sh/docs/getting-started/quickstart "Dyad quickstart"
[80]: https://docs.windsurf.com/windsurf/cascade/memories "Windsurf Cascade memories"
[81]: https://docs.litellm.ai/docs/simple_proxy "LiteLLM proxy"
[82]: https://docs.devin.ai/work-with-devin/stacked-prs "Devin stacked pull requests"
[83]: https://docs.flutterflow.io/testing/automated-tests "FlutterFlow automated tests"
[84]: https://support.bolt.new/cloud/hosting/publish "Bolt publish"
[85]: https://docs.v0.dev/docs/agentic-features "v0 agent features"
[86]: https://github.com/e2b-dev/E2B "E2B repository"
[87]: https://github.com/e2b-dev/infra/blob/main/self-host.md "E2B self-host guide"
[88]: https://github.com/vllm-project/vllm "vLLM repository"
[89]: https://github.com/ollama/ollama "Ollama repository"
[90]: https://github.com/builderio/builder "Builder.io repository"
[91]: https://www.marblism.com/pricing "Marblism pricing"
[92]: https://github.com/agent-network-protocol/AgentNetworkProtocol "Agent Network Protocol"
[93]: https://github.com/wickedapp/openclaw-office-notify-plugin "OpenClaw Office notification plugin"
[94]: https://github.com/block/buzz/blob/main/SECURITY.md "Buzz security"
[95]: https://github.com/OpenHands/software-agent-sdk "OpenHands Software Agent SDK"
[96]: https://docs.devin.ai/integrations/gh "Devin GitHub integration"
[97]: https://docs.litellm.ai/docs/proxy/virtual_keys "LiteLLM budgets and virtual keys"
[98]: https://docs.ollama.com/api/introduction "Ollama API introduction"
[99]: https://docs.vllm.ai/en/stable/cli/serve/ "vLLM server CLI"
[100]: https://docs.cline.bot/cline-overview "Cline product overview"
