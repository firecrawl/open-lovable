# Contas, sessoes e workspaces (P05)

## Perfil e fronteira de operacao

O perfil padrao continua `individual`. Para contas independentes, configure `OPEN_LOVABLE_AUTH_MODE=supabase` em uma instalacao separada e autorizada. A interface permanece Next.js; as senhas sao verificadas pelo Supabase Auth configurado e nao armazenadas pelo Studio.

Este incremento utiliza SQLite em um unico processo/host de controle para identidade, projetos, permissoes e conexoes. O schema/importador PostgreSQL foi preparado para preservar as novas tabelas, mas nao liga automaticamente todos esses servicos a PostgreSQL. Nao apontar replicas independentes para copias diferentes do SQLite nem presumir uma ativacao hospedada completa. A mudanca de backend e uma entrega separada.

No perfil de contas, os endpoints legados de comandos e sandbox global nao ficam acessiveis. O perfil individual preserva esses recursos. O backend das aplicacoes geradas tambem continua separado do banco administrativo deste construtor.

## Configuracao pelo operador

As variaveis abaixo pertencem ao servidor, nunca ao codigo gerado ou a variaveis NEXT_PUBLIC:

| Variavel | Finalidade |
|---|---|
| OPEN_LOVABLE_AUTH_MODE | `supabase` para contas; `individual` para o modo anterior. Valores desconhecidos falham. |
| OPEN_LOVABLE_APP_ORIGIN | Origem HTTPS exata do Studio, sem caminho/credenciais. HTTP somente para loopback local. |
| OPEN_LOVABLE_SUPABASE_URL | Origem do projeto Supabase de controle autorizado; sem `/auth/v1` no valor. |
| OPEN_LOVABLE_SUPABASE_PUBLISHABLE_KEY | Chave publishable ou anon desse projeto. `service_role` e chaves secretas sao recusadas. |
| OPEN_LOVABLE_SIGNUP_ENABLED | `1` habilita solicitar cadastro. Nao substitui a configuracao/confirmacao do provedor. |
| OPEN_LOVABLE_DATA_DIR | Diretorio privado persistente; fazer backup consistente antes de atualizar uma instalacao existente. |
| OPEN_LOVABLE_MASTER_KEY | Opcional, 32 bytes em base64; ou conservar `credentials.key` no diretorio privado. Nunca trocar sem migracao das credenciais. |

Use um projeto de autenticacao separado dos backends dos aplicativos gerados. Nao use automaticamente um projeto gerenciado por outro construtor, uma credencial encontrada no PC ou um banco de producao.

As flags `OPEN_LOVABLE_AUTH_ALLOW_LOOPBACK` e `OPEN_LOVABLE_ACCOUNT_ALLOW_LOOPBACK_PROVIDERS` existem somente para ambientes locais explicitamente autorizados e ainda exigem a origem do Studio em loopback. Nao habilita-las em hospedagem publica. No perfil de contas, conexoes de modelos sao exclusivas de cada workspace; as chaves globais de LLM do operador nao sao herdadas.

## Confirmacao e recuperacao de e-mail

Configure Site URL e redirect allowlist no Supabase com a origem exata da instalacao. Configure SMTP e seus limites antes de prometer entrega real. O servidor nao apresenta uma solicitacao aceita como prova de e-mail entregue.

O aplicativo recebe um `token_hash`, exige um clique explicito e o troca pelo servidor. O link recomendado usa fragmento para que o desafio nao apareca nos logs de URL:

```html
<!-- Confirm signup -->
<a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=email">Confirmar conta</a>
<!-- Reset password -->
<a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=recovery">Recuperar conta</a>
```

O endpoint tambem reconhece o formato query documentado pelo provedor, mas fragmento e preferivel para minimizar exposicao nos logs. Nao usar redirecionamento arbitrario fornecido pelo cliente. A aplicacao remove o desafio do endereco apos le-lo; abrir a pagina por si so nao consome o codigo. Um novo carregamento exige o link original. Desabilitar rastreamento/regravacao de links no provedor de e-mail e verificar o fluxo real.

A recuperacao cria uma sessao restrita de 15 minutos. Ela pode atualizar a senha, mas nao ler projetos. Apos atualizar, todas as sessoes locais do ator sao revogadas e e exigido novo login. Respostas de cadastro/recuperacao nao informam se um endereco ja existe.

## Sessoes e revogacao

O navegador recebe somente um identificador opaco em cookie HttpOnly/SameSite=Lax, Secure e prefixo `__Host-` sob HTTPS. Nao ha access/refresh token em localStorage. No banco, o cookie e representado por hash; os tokens upstream ficam cifrados e vinculados a sessao, ator e emissor.

Sessoes normais: 12 horas absolutas, duas horas de inatividade, ate dez sessoes locais por ator. Requests revalidam a sessao e a identidade pelo provedor. Mudanca do endpoint/chave publica/origem invalida a sessao associada, sem criar outro proprietario para o mesmo subject verificado.

Logout invalida a sessao local mesmo se o provedor nao responder; a resposta distingue revogacao upstream confirmada de indisponibilidade. Revogacao local e de membership nao depende de o JWT remoto expirar. Logout feito exclusivamente em outro aplicativo/provedor pode permanecer valido ate expirar o access token; nao ha promessa de invalidacao remota instantanea global.

## Membros, convites e conexoes

Owner/admin gerenciam membros; somente owner concede admin. Nenhuma operacao permite ao proprio membro se promover, alterar/remover o owner ou usar campos de papel enviados pelo cliente como autoridade. Edicoes usam versao para impedir sobrescritas concorrentes.

Convites sao vinculados ao e-mail verificado, expiram em 24 horas e sao consumidos uma unica vez. Este fluxo **cria um link e nao envia e-mail automaticamente**. A interface deixa isso explicito. O administrador compartilha o link com o destinatario autorizado. Revogar ou reemitir um convite invalida o anterior; a autoridade do emissor e revalidada na aceitacao.

Editor pode criar/editar e gerar propostas; viewer somente le. Billing nao recebe acesso ao codigo por padrao. Conexoes de LLM exigem owner/admin e nunca devolvem a chave salva. Mudanca de destino continua exigindo reentrada ou remocao explicita da chave.

## Backup, restauracao e importacao

O verificador de backup autentica tambem todas as sessoes cifradas. Uma chave capaz de cifrar um novo arquivo, mas incapaz de ler os dados existentes, e recusada.

Restauracao/importacao conferem a copia original e depois invalidam cookies e convites pendentes no destino novo. Isso impede que recuperar uma copia antiga ressuscite uma capacidade ja revogada/consumida. Nao mudam a origem. Relatorios de importacao distinguem inventario original verificado e contagem de capacidades invalidadas; a ativacao continua `NOT_PERFORMED`. O relatorio de restauracao distingue o digest do backup original do digest da base resultante.

## Verificacao e limites

Testes locais utilizam identidades e credenciais sinteticas e um servico HTTP de contrato explicitamente loopback. Testes de navegador exercitam duas contas, workspace compartilhado, convite, mudanca de papel, revogacao e logout. A homologacao de Supabase/SMTP real, limites da hospedagem, MFA/SSO e operacao distribuida permanecem separadas; nao confundir testes de transporte com servico externo homologado.

Referencias primarias: Supabase Auth sessions, signout, email templates e tutorial Next.js; URLs em https://supabase.com/docs/guides/auth/sessions, https://supabase.com/docs/guides/auth/signout, https://supabase.com/docs/guides/auth/auth-email-templates e https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs. Consultadas em 23/09/2026. Sao documentacao, nao evidencia de integracao real desta instalacao.

## Teste de protocolo com o servidor upstream

`npm run test:auth-server` exige um servidor descartavel explicitamente autorizado em loopback. A CI inicia a imagem fixada de Supabase Auth, seu proprio PostgreSQL e uma chave efemera exclusiva. O relay de teste apenas adapta o prefixo `/auth/v1`; senhas, JWTs, refresh e desafios OTP sao processados pelo software upstream real. E-mail/SMTP e a conta cloud do operador nao sao simulados como homologados. O resultado deste job deve ser conferido no commit entregue.
