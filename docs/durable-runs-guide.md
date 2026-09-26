# Execucao duravel do Studio ? P07/P08/P09, perfil individual e contas em um host

## O que muda para quem usa

A area /projects admite o pedido pela API v1. HTTP 202 confirma que o pedido esta salvo, nao que a aplicacao foi concluida. A aba pode ser fechada depois dessa confirmacao: o processo worker continua independentemente do navegador. Cancelar e aprovar sao comandos explicitos, verificados no servidor.

Na aba Execucoes, selecione um pedido para consultar sua linha do tempo, modelo, estado e consumo reportado. Informacao ausente de uso nao significa custo zero. Baixar registro gera um JSON autorizado e auditado com metadados e eventos, sem copiar prompts, fontes, credenciais ou sessoes. Ha limite de dez exportacoes por pedido.

## Inicializacao

- Desenvolvimento: npm run dev (web + worker). Opcoes --hostname e --port sao passadas depois de --.
- Producao local/homologacao: npm run build, depois npm start. Isso nao publica nada na internet nem constitui homologacao de producao.
- Processos separados sob um supervisor externo: npm run start:web e npm run worker, com a mesma configuracao/diretorio privado. Somente um worker adquire a lease SQLite.
- npm run dev:web e deliberadamente apenas a interface. Sem worker, pedidos ficam na fila e o registro mostra que o executor nao esta respondendo. Nao reenviar o pedido para tentar iniciar um worker.

O supervisor inicia o worker antes do servidor e encerra apenas seus dois processos filhos se algum falha. Nao encerra outros Node, servidores ou servicos do computador. Variaveis explicitas de processo prevalecem sobre os arquivos .env locais convencionais, iguais para web e worker. Segredos nunca sao impressos no diagnostico.

Apos uma queda sem encerramento gracioso, a inicializacao aguarda ate 22 segundos pela expiracao da lease anterior. Uma lease de worker ativo nao e tomada. O supervisor aguarda ate 35 segundos pelo inicio do worker; encerrar durante a espera nao revoga a lease de outro processo.

## Fluxo e limites

Admissao congela o snapshot, referencias, imagens, historico relevante, modelo e autorizacao. Uma chave idempotente identifica o comando e nao dispara inferencia repetida em reconexao. Mudanca de credencial, destino, papel, sessao, perfil ou politica de rede exige nova autorizacao; nao ha fallback de modelo silencioso.

Fila local: ate vinte pedidos aguardando/executando por workspace, um worker por instalacao, um pedido ativo por projeto e deadline de dez minutos. Contexto textual de ate 2 MiB e imagens selecionadas de ate 6 MiB. O escopo atual mantem os limites da previa React. Nao executa scripts npm ou shell de um projeto gerado no host de controle.

O worker salva a intencao antes de chamar o modelo. Uma resposta completa e persistida antes da compilacao. O codigo aprovado so muda por aceitacao de proposta e CAS da revisao. Compilar nao equivale a testar fluxos de negocio; o registro informa applicationTested=false.

## Interrupcao e recuperacao

- Queda antes da chamada ao modelo: pode voltar a fila dentro do prazo.
- Queda depois de uma resposta completa persistida: retoma validacao sem outra inferencia.
- Queda durante a chamada, sem resposta persistida: INTERRUPTED / MODEL_OUTCOME_UNCERTAIN. Conferir o provedor e autorizar explicitamente novo pedido. Nao ha garantia universal de exactly-once de efeitos externos.
- Cancelamento explicito: impede consolidacao tardia, mas nao desfaz tokens/custos ja consumidos.
- Perda da lease: o worker antigo nao pode publicar nem mesmo um diagnostico tardio como estado atual.
- Registro de entrada corrompido: falha de integridade isolada naquela tarefa, sem derrubar a fila de outros projetos.
- Encerramento gracioso: recoloca apenas trabalho seguro na fila; chamadas incertas permanecem interrompidas.
- Restaurar/importar banco: preserva o inventario e invalida sessoes, convites e tarefas pendentes no novo destino. Nunca reativa automaticamente inferencia paga de um backup. Resultados que ja eram incertos antes da copia mantem MODEL_OUTCOME_UNCERTAIN; apenas tarefas que ainda estavam pendentes recebem RECOVERY_REVIEW_REQUIRED.

## APIs e compatibilidade

POST /api/v1/runs, GET /api/v1/runs?projectId=..., GET /api/v1/runs/{id}, GET /api/v1/runs/{id}/events, POST /cancel, POST /accept e POST /export. SSE usa cursor por execucao e Last-Event-ID; 404 nao distingue IDs estrangeiros/inexistentes no conteudo retornado.

A API antiga /api/projects e mantida. Cancelamento/aceitacao de pedidos gerenciados usam o mesmo journal. Geracoes antigas request-bound continuam identificadas como compatibilidade, sem alegar que seu disconnect ganhou nova semantica automaticamente. A interface principal agora utiliza a admissao v1.

## Evidencias e alcance

Os testes incluem transporte HTTP sintetico, browser real, kill de processos filhos isolados, expiracao real da lease e retomada por outro processo. Servidores de teste nao certificam qualidade de um modelo nem servicos cloud do operador. PostgreSQL deve passar na CI com migrations, importacao e RLS reais; nao afirmar resultado antes de ler o job do SHA correspondente.

SQLite migrations 6/7 e PostgreSQL migrations 3/4 sao aditivas na sequencia; o alargamento do CHECK de runs reconstrui somente essa tabela dentro do protocolo de migration, verifica relacionamentos e restaura foreign_keys antes de servir requests. Historicos SQL anteriores nao foram reescritos. Journal e entrada admitida sao imutaveis por triggers; administracao/retencao futuras exigem politica explicita.

## Ainda separado

Fila distribuida PostgreSQL, HITL generico, ferramentas/autocorrecao, backend dos apps, inspector, Git sync, publicacao e operacao comercial nao estao completos neste incremento. O adapter de projetos PostgreSQL e os schemas/importadores nao significam cutover do controle completo. O alerta upstream de requests abortados no Next permanece registrado, sem captura global para ocultar excecoes.
