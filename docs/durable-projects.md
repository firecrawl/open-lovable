# Projetos persistentes — guia de uso e limites

## Duas áreas, sem perda do construtor existente

- `/projects`: área de projetos salvos, revisões, propostas de IA, importação ZIP, código e referências.
- `/generation`: construtor cloud anterior, que continua disponível. Suas sandboxes e conversas globais ainda são de uso individual e não foram convertidas automaticamente em projetos persistentes.

Não existe migração silenciosa entre as áreas. Exporte o ZIP do construtor cloud e importe-o em um projeto salvo para preservar os arquivos disponíveis naquele momento.

## Começar

Use Node 22.18 ou superior (Node 24 foi usado na verificação local), instale com `npm ci --ignore-scripts` e execute `npm run dev`. A aplicação vincula o servidor de desenvolvimento a `127.0.0.1`.

Abra `http://127.0.0.1:3000/projects`. Crie um projeto, dê um nome e selecione um modelo. Em `http://127.0.0.1:3000/settings/ai`, cadastre ou edite a conexão. Configurações definidas por variáveis de ambiente têm prioridade e não são sobrescritas pelo formulário.

Importação, edição manual, histórico e preview não exigem Firecrawl nem uma conta de sandbox cloud. Geração por IA exige um modelo configurado e alcançável. Um endpoint local pode encaminhar a chamada à nuvem; ele não é garantia de inferência privada ou gratuita.

## Jornada de trabalho

1. Importe um ZIP ou descreva a aplicação para a IA. O consentimento de geração inclui envio do contexto do projeto e consumo de tokens.
2. A IA gera uma proposta sobre a revisão atual. A plataforma verifica estrutura, conteúdo e compilação antes de disponibilizá-la para aprovação.
3. Confira as abas Prévia e Alterações. Compilar não comprova que todos os fluxos funcionam.
4. Aprove para criar uma nova revisão, ou descarte sem sobrescrever a revisão salva.
5. Na aba Código, salvar um arquivo também cria uma revisão. Um conflito com outra aba retorna erro explícito: recarregue antes de conciliar as mudanças.
6. Reabra o projeto pela lista a qualquer momento. Restaurar uma revisão cria outra versão e preserva o histórico anterior.
7. Baixar ZIP exporta os arquivos-fonte e assets salvos, não um deploy nem um instalador. Projetos importados conservam seus próprios scripts; arquivos gerados que não incluem um scaffold completo exigem esse preparo antes de executar fora da prévia.

Os testes de navegação exercitam essa jornada com uma aplicação de contador real e um servidor de modelo de teste; o servidor de teste não é um fallback do produto.

## Persistência e backup

O diretório padrão é `.open-lovable` dentro da pasta pessoal do usuário que executa o servidor. `OPEN_LOVABLE_DATA_DIR` permite escolher outro diretório privado, fora do checkout. A aplicação rejeita diretórios dentro do repositório e componentes que sejam symlinks ou junctions.

`state.sqlite3` armazena projetos, revisões, referências, conversas, execuções e configurações cifradas. SQLite usa WAL, transações e controle de versão para evitar sobrescritas concorrentes. Migrações são numeradas em `lib/projects/schema.ts`; não remova tabelas ou reduza `user_version` manualmente.

As chaves dos provedores são cifradas com AES-256-GCM. A chave mestra vem de `OPEN_LOVABLE_MASTER_KEY` (32 bytes codificados em base64) ou do arquivo privado `credentials.key`. Perder a chave mestra impede ler as credenciais existentes; a aplicação falha explicitamente, sem apagar ou substituir a configuração.

Para um backup manual consistente, encerre o processo do servidor, copie o diretório privado completo para armazenamento protegido e conserve a chave mestra separadamente quando ela vier do ambiente. Não copie apenas o arquivo principal de um SQLite em uso: pode haver dados no WAL. Para validar uma restauração, use uma cópia isolada, a mesma chave mestra e `OPEN_LOVABLE_DATA_DIR` apontando para ela. Nunca restaure sobre dados ativos sem backup e autorização.

O diretório de dados deve ficar em volume persistente. Discos efêmeros de funções serverless não satisfazem essa arquitetura. O teste de recuperação abre o banco em um processo Node, encerra esse processo e verifica arquivos, versões e mensagens a partir de outro processo.

## Preview e referências

O preview compila React/JSX/TSX com uma configuração da plataforma. Não executa `npm install`, scripts de `package.json`, configurações Vite/Tailwind do projeto nem código de aplicação no servidor. As bibliotecas permitidas ficam declaradas em `lib/projects/preview.ts`; dependências fora dessa lista produzem erro explícito, não uma instalação silenciosa.

O JavaScript resultante roda em um iframe sem `allow-same-origin`, com CSP restritiva e sem cookies da aplicação. Isso não é uma máquina virtual de código hostil: navegação interna do iframe, consumo de CPU e características do navegador ainda exigem revisão antes de disponibilizar o produto a usuários não confiáveis. Mensagens de renderização do iframe são informativas, não um certificado de teste funcional.

Referências textuais são persistidas com hash e origem. Esta entrega aceita TXT, MD, JSON e CSV; PDF/DOCX/OCR, busca semântica e delegação MCP não estão implementados nesta área.

## Limites explícitos

ZIP: até 12 MiB comprimidos, 300 arquivos aceitos, 2 MiB por entrada e 8 MiB no total descomprimido. Arquivos de texto individuais ficam limitados a 1 MiB. A importação não extrai arquivos para o filesystem do servidor. Credenciais e diretórios de dependências/build são excluídos e informados, ou bloqueados pela validação de conteúdo.

Uma execução ativa por projeto. A proposta nunca substitui a revisão salva automaticamente. Desconexão/cancelamento interrompe a geração; após perda do processo, a lease expira e a execução aparece como interrompida. Repetir uma geração exige nova ação explícita, para não duplicar consumo de tokens. Não há worker distribuído nem retomada automática de uma chamada de modelo.

A identidade HTTP continua sendo de operador único. O armazenamento verifica proprietário e projeto, mas isso NÃO implementa login multiusuário, tenancy comercial, RBAC empresarial ou autorização de clientes diferentes. Não publique esta instalação como SaaS multitenant.
