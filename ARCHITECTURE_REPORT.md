# Open Lovable Architecture Report

This report provides a detailed technical analysis of the Open Lovable codebase, covering the frontend, backend, AI implementation, sandbox systems, and project generation pipelines.

## 1. Project Structure Tree

```text
open-lovable/
├── app/                      # Next.js App Router
│   ├── api/                  # Backend API routes (Stateful API)
│   │   ├── analyze-edit-intent/
│   │   ├── apply-ai-code-stream/
│   │   ├── create-ai-sandbox-v2/
│   │   ├── generate-ai-code-stream/
│   │   ├── scrape-url-enhanced/
│   │   └── ...
│   ├── builder/              # Builder interface
│   ├── generation/           # Main generation & preview interface
│   └── page.tsx              # Landing page (Search & Scrape)
├── components/               # React components (Shadcn + Shared)
├── config/                   # Centralized application configuration
├── lib/                      # Core business logic & abstractions
│   ├── ai/                   # AI provider management
│   ├── sandbox/              # Sandbox providers (Vercel, E2B)
│   ├── context-selector.ts   # Context building for AI
│   ├── file-parser.ts        # Code analysis & manifest generation
│   ├── morph-fast-apply.ts   # Incremental code updates
│   └── ...
├── packages/                 # Internal packages (CLI templates)
├── types/                    # TypeScript type definitions
├── public/                   # Static assets
└── styles/                   # CSS and Design System
```

## 2. Architecture Overview

### Frontend Architecture
- **Framework:** Next.js 15.4 (React 19, Turbopack).
- **State Management:**
  - **Client-side:** React `useState`, `useEffect`, and `sessionStorage` for persisting user preferences (URL, Model, Style) across navigation.
  - **Shared State:** `jotai` for atomic state (e.g., sheets).
- **UI System:** Tailwind CSS with `shadcn/ui` components. Animations are handled via `framer-motion` and `lucide-react` icons.
- **Preview System:** The frontend communicates with a provisioned sandbox via an `iframe`, pointing to the sandbox's public URL (Vite dev server).

### Backend Architecture
- **Framework:** Next.js API Routes (Serverless-ready, but currently stateful).
- **Statefulness:** The backend uses `declare global` to maintain in-memory state for `sandboxState`, `conversationState`, and `activeSandboxProvider`. This allows the API to maintain a "warm" connection to the sandbox and keep a local file cache without an external database.
- **Database:** None. The system currently relies on in-memory global variables and browser `sessionStorage`.

---

## 3. AI Implementation

### Provider Architecture
The system uses the **Vercel AI SDK** to provide a unified interface for multiple LLM providers.
- **Manager:** `lib/ai/provider-manager.ts` abstracts the selection of models.
- **Supported Providers:** OpenAI, Anthropic, Google (Gemini), and Groq.
- **AI Gateway:** Supports Vercel AI Gateway via `AI_GATEWAY_API_KEY` for unified monitoring and caching.

### Generation Pipeline
The AI logic resides primarily in `app/api/generate-ai-code-stream/route.ts`:
1. **Context Assembly:** Gathers the current file manifest, recent conversation history, and search results for targeted edits.
2. **System Prompting:** Highly specialized prompts enforce "Surgical Edits," code completeness, and strict Tailwind CSS usage.
3. **Streaming:** AI responses are streamed to the frontend in real-time, using XML-like tags (`<file>`, `<package>`, `<edit>`) to denote different actions.

### Agentic Search & Incremental Updates
- **Edit Intent Analysis:** `lib/edit-intent-analyzer.ts` determines if a request is a style change, feature addition, or bug fix.
- **File Search Executor:** `lib/file-search-executor.ts` performs a targeted search within the codebase to find the exact line numbers for requested changes.
- **Morph Fast Apply:** `lib/morph-fast-apply.ts` integrates with Morph LLM to perform high-speed, targeted code merges instead of regenerating entire files.

---

## 4. Sandbox Architecture

Open Lovable abstracts sandbox execution through a provider pattern, allowing it to support multiple backend environments. The provider is selected via the `SANDBOX_PROVIDER` environment variable.

### Provider Comparison

| Feature | Vercel Sandbox (Default) | E2B Sandbox |
| :--- | :--- | :--- |
| **SDK** | `@vercel/sandbox` | `@e2b/code-interpreter` |
| **Runtime** | Node.js 22 | Secure Micro-VM (Customizable) |
| **File Sync** | `writeFiles` (Batch API) | Python `runCode` or `files.write` |
| **Command Exec** | Native Shell via SDK | Python `subprocess` via `runCode` |
| **Networking** | `.vercel.run` public domains | `.e2b.dev` / `.e2b.app` hostnames |
| **Architecture** | Web-optimized serverless sandbox | General purpose code execution VM |
| **Complexity** | Lower (Optimized for Vite/Web) | Higher (Full VM control) |
| **Cost Implications** | Typically lower per-session cost for web-only | Higher overhead due to full VM lifecycle |

### Sandbox Execution Flow
1.  **Provisioning:** `SandboxFactory` creates the provider. `createSandbox()` initializes the remote environment.
2.  **Scaffolding:** `setupViteApp()` creates the base project (`package.json`, `vite.config.js`, `App.jsx`, etc.) and performs an initial `npm install`.
3.  **File Synchronization:** `writeFile()` and `readFile()` methods manage the source code. The backend maintains an in-memory `fileCache` to avoid redundant network roundtrips to the sandbox.
4.  **Dev Server:** Both providers start a Vite dev server in the background using `npm run dev`.
5.  **Live Preview:** The frontend `AISandboxPage` renders an `iframe` pointing to the URL provided by `getSandboxUrl()`.

### Hot Module Replacement (HMR)
- **Vercel:** Optimized for HMR with `clientPort: 443` and `protocol: 'wss'` in `vite.config.js`.
- **E2B:** Uses standard Vite HMR, though `hmr: false` is sometimes used in the default config for stability in certain environments.

---

## 5. Project Generation Flow

### 1. Prompt-to-Project
Direct generation based on user description. AI generates a full React + Tailwind project from scratch.

### 2. Website Clone (Scrape)
- **Tool:** Firecrawl (`app/api/scrape-url-enhanced/route.ts`).
- **Flow:** URL -> Firecrawl (Markdown + Screenshot) -> AI Context -> React Recreation.
- **Optimization:** Uses Firecrawl's `maxAge` caching for significantly faster scraping.

### 3. Brand Extension
- **Tool:** Firecrawl Branding API (`app/api/extract-brand-styles/route.ts`).
- **Flow:** URL -> Style Extraction (Colors, Typography, Personality) -> AI System Prompt -> New Component Generation (following brand guidelines).

---

## 6. Deployment & Export
- **Live Preview:** Immediate deployment to a sandbox with Hot Module Replacement (HMR).
- **Export:** `app/api/create-zip/route.ts` executes a `zip` command inside the sandbox environment, base64 encodes the result, and sends a data URL to the frontend for download.

---

## 7. Responsible Files Mapping

### Files responsible for AI generation
- `app/api/generate-ai-code-stream/route.ts`: Core logic for prompting and streaming code from LLMs.
- `app/api/apply-ai-code-stream/route.ts`: Logic for parsing LLM output and executing file/command updates.
- `lib/morph-fast-apply.ts`: Specialized logic for high-speed incremental updates using Morph LLM.
- `lib/edit-intent-analyzer.ts`: Analyzes user prompts to categorize the type of edit required.

### Files responsible for model providers
- `lib/ai/provider-manager.ts`: The central factory for resolving model IDs to specific Vercel AI SDK provider clients.
- `app/api/generate-ai-code-stream/route.ts`: Initializes provider clients (OpenAI, Anthropic, Google, Groq) based on environment variables.

### Files responsible for project preview
- `components/SandboxPreview.tsx`: The UI component that renders the sandbox in an iframe.
- `app/generation/page.tsx`: Orchestrates the transition from generation to preview and handles the sandbox lifecycle.
- `lib/sandbox/providers/vercel-provider.ts`: Manages the Vercel-specific preview environment.
- `lib/sandbox/providers/e2b-provider.ts`: Manages the E2B-specific preview environment.

---

## 8. Authentication & Environment Variables

The application relies on Environment Variables for all authentication:
- **AI Providers:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`.
- **Sandbox (Vercel):** `VERCEL_OIDC_TOKEN` (auto) or `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`.
- **Sandbox (E2B):** `E2B_API_KEY`.
- **Scraping:** `FIRECRAWL_API_KEY`.
- **Fast Apply:** `MORPH_API_KEY`.

---

## 9. Extension Points

1.  **New Sandbox Providers:** Implement the `SandboxProvider` abstract class in `lib/sandbox/types.ts` and add it to the `SandboxFactory`.
2.  **Custom Deployment:** Extend `app/api/create-zip` or add a new route to interface with Vercel/Netlify/GitHub APIs for direct deployment.
3.  **Enhanced Model Support:** Update `appConfig.ai.availableModels` and `getProviderForModel` in `provider-manager.ts`.
4.  **Persistent Storage:** Replace the global in-memory state in `apply-ai-code-stream` and `generate-ai-code-stream` with a Redis or PostgreSQL store for better scalability.
