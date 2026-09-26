# Open Lovable

Chat with AI to build React apps instantly. An example app made by the [Firecrawl](https://firecrawl.dev/?ref=open-lovable-github) team. For a complete cloud solution, check out [Lovable.dev](https://lovable.dev/) ❤️.

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Open Lovable Demo" width="100%"/>

## Projetos salvos e conexões de IA

A área `/projects` acrescenta projetos persistentes em SQLite, importação ZIP, edição de código, propostas de IA revisáveis, prévia React e restauração de versões. `/settings/ai` permite cadastrar e editar conexões com chaves cifradas no servidor. O construtor cloud anterior continua disponível separadamente.

Para experimentar as alterações deste PR, use a branch `fix/security-foundation-20260922`; a `main` não recebe mudanças automaticamente. Leia [o guia de projetos persistentes](docs/durable-projects.md), incluindo os limites de preview, exportação e backup. Esta é uma instalação de operador único, não uma plataforma multiusuário homologada.

A área persistente não exige Firecrawl/E2B/Vercel para importar, editar, compilar e exportar arquivos. Para gerar com IA, configure um provedor real. As instruções cloud abaixo continuam aplicáveis ao fluxo anterior por URL.

## Setup

1. **Clone & Install**
```bash
git clone https://github.com/LMPrado-DZ23/open-lovable.git
cd open-lovable
npm ci --ignore-scripts
```

2. **Add `.env.local`**

```env
# =================================================================
# REQUIRED
# =================================================================
FIRECRAWL_API_KEY=your_firecrawl_api_key    # https://firecrawl.dev

# =================================================================
# AI PROVIDER - Choose your LLM
# =================================================================
GEMINI_API_KEY=your_gemini_api_key        # https://aistudio.google.com/app/apikey
ANTHROPIC_API_KEY=your_anthropic_api_key  # https://console.anthropic.com
OPENAI_API_KEY=your_openai_api_key        # https://platform.openai.com
GROQ_API_KEY=your_groq_api_key            # https://console.groq.com

# =================================================================
# FAST APPLY (Optional - for faster edits)
# =================================================================
MORPH_API_KEY=your_morphllm_api_key    # https://morphllm.com/dashboard

# =================================================================
# SANDBOX PROVIDER - Choose ONE: Vercel (default) or E2B
# =================================================================
SANDBOX_PROVIDER=vercel  # or 'e2b'

# Option 1: Vercel Sandbox (default)
# Choose one authentication method:

# Method A: OIDC Token (recommended for development)
# Run `vercel link` then `vercel env pull` to get VERCEL_OIDC_TOKEN automatically
VERCEL_OIDC_TOKEN=auto_generated_by_vercel_env_pull

# Method B: Personal Access Token (for production or when OIDC unavailable)
# VERCEL_TEAM_ID=team_xxxxxxxxx      # Your Vercel team ID 
# VERCEL_PROJECT_ID=prj_xxxxxxxxx    # Your Vercel project ID
# VERCEL_TOKEN=vercel_xxxxxxxxxxxx   # Personal access token from Vercel dashboard

# Option 2: E2B Sandbox
# E2B_API_KEY=your_e2b_api_key      # https://e2b.dev
```

3. **Run**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## License

MIT

## Security foundation (single operator)

Use Node.js 22.18+ or 24 and npm. `package-lock.json` is the supported lockfile;
old Bun/pnpm lockfiles were removed because they selected stale dependencies.
Read [SECURITY.md](SECURITY.md) before deployment. Development binds to loopback.
Production is fail-closed until `OPEN_LOVABLE_APP_ORIGIN` and a strong
`OPEN_LOVABLE_PASSWORD` are configured. The browser shows an HTTP Basic login;
`OPEN_LOVABLE_USERNAME` defaults to `admin`. Public access requires HTTPS.

```bash
npm run lint
npm run typecheck
npm test
npm run security:audit
npm run build
npx --no-install playwright install chromium
npm run test:e2e
```

The tests do not consume AI/scraping/sandbox credits. Browser smoke uses a separate,
loopback-only server and test-only credentials. Live integrations must be verified
separately. This is not a multi-tenant release: the legacy cloud builder still shares runtime state. Durable project APIs keep independent files, conversations, versions and proposals per project.
The implementation plan is in `docs/security-foundation-plan.md`.

## Selective Classe A+ integration

The optional model gateway, shared model selectors and `/settings/ai` diagnostics connect this builder to Ollama / Classe A+ without merging the products. Generation, edit planning and completion resolve an explicit model; failed requests never switch to an unrelated provider.

See [configuration and boundaries](docs/classe-a-plus-integration.md) and [source attribution](THIRD_PARTY_NOTICES.md). API keys remain server-side. Credential-shaped content in ordinary source files is checked before outbound AI and export. A successful model probe does not certify generated-app correctness.

Durable project revisions and encrypted connection settings are now implemented in `/projects` and `/settings/ai`. Multi-user tenancy, a full mission runtime, arbitrary backend execution and live-provider qualification remain separate work. No production deployment is implied by a passing build.

## Visual references and Plan mode

The durable workspace now accepts PNG/JPEG/WebP references and sends explicitly selected images as actual multimodal input to the chosen provider. Plan mode stores a plan without modifying application files. Both use the existing project isolation, run idempotency and revision approvals.

Read [visual-reference usage and limits](docs/visual-references.md) and the [independent functional parity map](docs/lovable-functional-parity.md). These changes do not claim full Lovable parity or real-provider visual quality certification.


### F00 stabilization increment

Connection edits no longer silently retain a saved key when the endpoint changes. Re-enter the key for the new destination or explicitly clear it. Raster uploads and provider image parts are validated separately from textual secret checks.

See `docs/evidence/f00-scope.md` for the exact delivery scope and the still-open recovery work; `docs/admission/README.md` documents optional third-party code admission. These changes do not make the application multi-tenant or production-certified.


## Verified individual recovery

The operator-only `npm run recovery -- create|verify|restore ...` workflow is documented in [docs/recovery-guide.md](docs/recovery-guide.md). It uses the original key and a consistent SQLite snapshot, verifies schema/content/connection integrity, and never overwrites an existing restore destination. It does not switch production configuration, schedule off-host backups or cover application backends. See the guide for limits and interrupted-operation handling.

## Contas e equipes (opt-in)

O modo de contas adiciona login, recuperacao, workspaces, membros e convites vinculados a e-mail, sem compartilhar a senha do operador. Consulte [docs/identity-guide.md](docs/identity-guide.md) antes de ativar. O perfil individual permanece o padrao; nao houve mudanca automatica de banco ou publicacao. O registro em [docs/execution-ledger.md](docs/execution-ledger.md) distingue implementacao, testes locais e homologacao externa.
