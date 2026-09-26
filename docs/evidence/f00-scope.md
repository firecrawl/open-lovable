# F00 - entrega de correcoes e limite de recuperacao

Base de produto/P00: fc9b9152b2f82a33f3c24d5efc76207c869b55dc. Branch proposta: fix/f00-security-recovery-20260923.

Este incremento trata P01/P02 e a infraestrutura de admissao P50. Nao encerra P03 nem a Fase Zero inteira. A validacao final do commit deve ser registrada separadamente, com SHA e comandos do ambiente limpo.

## Mudancas verificadas em testes focais

Credenciais sao vinculadas ao destino canonicalizado (adapter/operador ja escopados pelo cofre). Chave vazia so conserva a anterior no mesmo endpoint. Alteracao de host, porta, protocolo ou caminho da API exige chave informada explicitamente ou limpeza. Erro preserva o estado anterior; nao ha teste com chave real enviada a outro host.

Upload e chamadas multimodais separam metadados/texto de rasters decodificados. A validacao de bytes, pixels, dimensoes, MIME e quantidade permanece. O transporte suporta as partes inline de imagens de OpenAI Chat/Responses, Anthropic e Gemini, com contratos HTTP sinteticos. Nao e homologacao de provedores reais. Normalizacao de imagens nao reconhece dados pessoais/segredos visiveis nos pixels.

Alias de filesystem macOS e limitado aos pares de sistema root-owned conhecidos. Outros links continuam recusados. Dados permanecem fora do checkout. Isso nao protege contra administrador malicioso do sistema ou todas as corridas de filesystem; ACLs e isolamento continuam essenciais.

A recusa de um banco com schema futuro agora acontece antes de alterar journal_mode. Fonte e prompts deixam de ser despejados nos logs dos fluxos tratados. Avisos e falhas nao foram substituidos por sucesso.

## Recuperacao ainda nao entregue

O prototipo local de backup/restore nao pertence ao commit de entrega. Um teste mostrou que a criacao aceita uma chave diferente da usada nas conexoes cifradas, produzindo um bundle que nao garante recuperacao dessas conexoes. A gravacao da correcao foi bloqueada pela ferramenta. O teste permanece falhando no trabalho local, sem apagar ou suavizar a assertion.

Arquivos preservados no worktree open-lovable-p00-20260923: lib/projects/recovery.ts, scripts/recovery.ts, tests/backup-roundtrip.test.ts e tests/recovery-cli.test.ts. Logs em .audit/f00/red-backup-key.*. Nao usar esse prototipo para backup de dados reais; manter o procedimento de backup consistente documentado anteriormente.

Separar esse trabalho pendente de um commit de correcoes independentes nao significa que toda a arvore local passou nos testes. A verificacao da entrega deve executar somente a arvore Git declarada, em checkout limpo, e relatar que o P03 ainda esta aberto. Nenhum teste antigo foi removido.
