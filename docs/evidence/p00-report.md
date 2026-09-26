# P00 - baseline reproduzida em 23/09/2026

## Escopo e identidade

Fonte verificada: `5066bdd77aee4dd56d07be03bc5bc57b2a1c3977`.
Main observada: `69bd93bae7a9c97ef989eb70aabe6797fb3dac89`.
Trabalho separado em `chore/p00-baseline-20260923`, derivado da branch de correcoes.
O checkout original estava limpo. Nao foi executado stash, reset, clean, merge, migration ou deploy.
O pacote segue V2 + emenda V2.1. P00 nao admite dependencias externas novas nem encerra P01/P02/P03/P50.

## Reexecucao da fonte sem alteracoes

Windows 11 x64; Node 24.16.0; npm 11.13.0; Python 3.14.5 para captura.
Execucao original: 18:01:20 a 18:10:44 UTC. `package-lock.json` preservado.
O gerenciador correto e npm: nao trocar por pnpm nem criar outro lockfile.
Ambiente de subprocessos por allowlist, dados temporarios privados e sem copiar .env ou credenciais de usuario.

| Gate | Resultado |
|---|---|
| npm ci --ignore-scripts | exit 0, instalacao limpa |
| npm run lint | exit 0 |
| npm run typecheck | exit 0 |
| npm test no baseline original | 80 passaram, 0 falharam, 0 ignorados |
| npm run build | exit 0, build de producao Next |
| npm run test:e2e | 20 passaram, sem retries |
| npm run security:audit | exit 0; 0 advisories retornados nessa consulta |
| git diff --check | exit 0; arquivos rastreados intactos ao final da rodada original |

`docs/evidence/baseline.json` contem comandos, tempos, codigos, versoes e hashes SHA-256 de stdout/stderr.
Logs integrais privados permanecem em `.audit/p00-original/` no worktree de P00.
Hashes detectam alteracoes; NAO sao assinatura digital, atestado de autoria ou certificado de seguranca.
CI historica do mesmo head: run 35881841199, success. A reexecucao acima e nova; a CI historica nao foi rerodada.

## P00-B: impedir falso positivo

O novo verificador exige todos os gates, exit code zero, termino normal e dois logs integros por comando.
Flag allPassed, texto PASS e exit code do shell externo nao substituem o codigo do comando avaliado.
Um PowerShell real saiu 0 apos um filho Node sair 7; o verificador recusou o manifesto e saiu 1.
O teste adicional cobre gate ausente/duplicado, timeout, codigo desconhecido, SHA diferente, log adulterado e path fora da evidencia.
Oito testes de infraestrutura ficam em `tests/roadmap/p00.test.mjs` e entram em `npm test` via `test:roadmap`.
Eles nao sao novas funcionalidades nem homologacao do produto.

## Problemas reproduzidos - promocao ainda bloqueada

1. **P01 / credenciais:** mudar baseURL preserva a chave antiga quando o campo vem vazio. Reproduzido em SQLite em memoria com chave sintetica, sem rede. O teste atual de credenciais inclusive exige essa conservacao entre portas distintas; P01 deve fortalecer seu contrato, nao esconder a falha.
2. **P02 / imagem:** PNG decodificavel contendo um padrao sintetico nos bytes base64 passa na normalizacao mas retorna HTTP 400 no upload, por scanner textual aplicado ao campo binario. Reproduzido sem chave real e sem modelo externo.
3. **P02 / macOS:** ambiente nao disponivel nesta rodada; nao generalizar testes Windows/Linux para macOS.
4. **Logging legado:** conteudo sintetico de prompt aparece integralmente no stdout; reduzir payloads em P02/P07 sem apagar evidencias de erro.

Triage completa e limites em `p00-triage.json`. As duas falhas locais nao sao BLOCKED_BY_EXTERNAL_DEPENDENCY.
Timeout antigo, JSON de busca/screenshot e log Vite ja tem mudancas anteriores; testes atuais pertinentes passaram. Nao aplicar cegamente patches da revisao antiga.

## Avisos preservados

npm: node-domexception@1.0.0 e glob@10.5.0 depreciados; auditoria sem advisories nao elimina esse aviso.
Build: cache inicialmente ausente e aviso da opcao experimental middlewareClientMaxBodySize.
Browser: log de comando invalido e esperado no teste negativo; nao foi suprimido para aparentar sucesso.

## Configuracao e limites

Desenvolvimento local para os fluxos de dados nao exigiu credenciais reais. Producao requer OPEN_LOVABLE_APP_ORIGIN e OPEN_LOVABLE_PASSWORD conforme SECURITY.md; usuario, diretorio de dados e chave mestra seguem a configuracao documentada.
Nenhum provider/modelo, Firecrawl, E2B/Vercel ou destino de producao foi homologado neste P00. Fixtures HTTP/SSE exercitam contratos, nao qualidade de IA real.
As mudancas deste pacote sao somente ferramenta de verificacao, teste, script npm e evidencias. Arquivos de aplicacao permanecem iguais ao baseline.

## Reproducao

Rodar os comandos da tabela em checkout limpo e com dados de teste. Nao copiar .env nem modificar servidores existentes.
Para conferir os logs desta rodada no worktree original de P00:

```text
npm run verify:baseline -- docs/evidence/baseline.json . 5066bdd77aee4dd56d07be03bc5bc57b2a1c3977
npm run test:roadmap
```

Um clone sem os logs privados reprovara a primeira verificacao por evidencia ausente, como esperado. O manifesto nao fabrica arquivos.
O teste de roadmap usa somente dados temporarios, processos locais e arquivos sinteticos; pode ser executado em CI sem credenciais cloud.

## Estado

Baseline original reproduzida; problemas triados. Reteste local da ferramenta concluido: check (80 testes existentes + 8 do verificador e build), 20 E2E, audit e verificacao dos hashes passaram entre 18:12:57 e 18:17:10 UTC. CI/revisao do novo commit precisam ser conferidas separadamente.
Fase Zero e produto nao estao encerrados. Proximo incremento: corrigir P01/P02, realizar admissao pertinente em P50 e recuperar uma copia de teste em P03.

## Ajuste do ambiente de verificacao

A allowlist inicial omitiu SystemDrive. Componentes Windows geraram seis arquivos de cache em uma pasta literal %SystemDrive% dentro do worktree. A checagem de arquivos inesperados impediu o commit. Esses artefatos gerados foram movidos, sem apagar, para .audit/p00-environment-quarantine; nenhum foi adicionado ao Git. Preservadas as variaveis nativas disponiveis, repetimos os 20 E2E e oito testes do verificador: todos passaram e a pasta nao foi recriada. Resultado em p00-environment-retest.json. Trata-se de ajuste da captura/ambiente de teste, nao de correcao do aplicativo.

Inspecao visual desta rodada: captura do workspace com codigo/revisao salva, sem overlay ou tela vazia; a suite manteve os cenarios desktop/tablet/mobile.
