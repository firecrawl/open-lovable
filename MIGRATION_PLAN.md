# Migration Plan: Open Lovable to Mian AI

This document outlines the roadmap and technical requirements for migrating Open Lovable to **Mian AI**, with a primary focus on unifying AI delivery through **OpenRouter** and establishing a robust provider abstraction layer.

## A. Files that must change

| File | Change Description |
| :--- | :--- |
| `config/app.config.ts` | Update `ai` section: Set `defaultModel` to `qwen/qwen3-coder`, add `deepseek/deepseek-chat`, and reorganize `availableModels`. |
| `lib/ai/provider-manager.ts` | Complete rewrite to remove hardcoded `openai/`, `anthropic/` etc. logic. Implement a unified factory that defaults to OpenRouter. |
| `app/api/generate-ai-code-stream/route.ts` | Remove individual provider initializations (Groq, Anthropic, etc.). Use the abstracted `providerManager.getClient()`. |
| `app/api/analyze-edit-intent/route.ts` | Same as above: remove hardcoded provider logic and use the abstraction layer. |
| `.env.example` | Add `OPENROUTER_API_KEY` and deprecate individual provider keys for the initial phase. |
| `app/page.tsx` | Update branding from "Open Lovable" to "Mian AI". |
| `components/shared/header/BrandKit/BrandKit.tsx` | Update logo and brand text. |

## B. Files that should not change

- `lib/sandbox/**/*`: The sandbox execution and preview logic is provider-agnostic.
- `app/api/create-ai-sandbox-v2/route.ts`: Sandbox provisioning remains the same.
- `lib/file-search-executor.ts`: Search logic is independent of the LLM used.
- `app/api/scrape-url-enhanced/route.ts`: Firecrawl integration remains unchanged.

## C. New files to create

| File | Purpose |
| :--- | :--- |
| `lib/ai/providers/base.ts` | Abstract class or interface defining the standard interface for an AI provider wrapper. |
| `lib/ai/providers/openrouter-provider.ts` | Implementation of the base provider specifically for OpenRouter (configuring the Vercel AI SDK OpenAI client with OpenRouter's base URL). |
| `lib/ai/providers/registry.ts` | A registry that maps provider names to their implementation classes. |

## D. Implementation Roadmap

### Phase 1: Foundation (1-2 Days)
1.  **Define Abstraction:** Create `lib/ai/providers/base.ts` and `lib/ai/types.ts`.
2.  **Centralize Config:** Move model-to-provider mappings and model metadata into `config/app.config.ts`.
3.  **Implement OpenRouter Wrapper:** Create `openrouter-provider.ts` using the Vercel AI SDK.

### Phase 2: Refactor (1-2 Days)
1.  **Update Provider Manager:** Refactor `lib/ai/provider-manager.ts` to use the new registry and base provider pattern.
2.  **Clean up API Routes:** Remove all hardcoded provider logic from `generate-ai-code-stream` and `analyze-edit-intent`.
3.  **Environment Setup:** Update backend to prioritize `OPENROUTER_API_KEY`.

### Phase 3: Brand & UI (1 Day)
1.  **Frontend Refresh:** Update all instances of "Open Lovable" to "Mian AI".
2.  **Model Selection:** Ensure the model selector in the UI correctly pulls from the new centralized config.

## E. Risk Assessment

- **Prompt Sensitivity:** Qwen and DeepSeek might react differently to the current "Surgical Edit" prompts compared to GPT-4o or Claude 3.5. **Mitigation:** Perform a "prompt audit" and adjust the system prompts in `route.ts` if output format (XML tags) becomes inconsistent.
- **OpenRouter Latency:** Aggregated providers can sometimes introduce overhead. **Mitigation:** Implement robust retry logic within the new provider abstraction.
- **Breaking Streaming:** Ensure that switching base URLs doesn't break the SSE (Server-Sent Events) headers or chunking.

## F. Testing Strategy

1.  **Mock Provider Testing:** Create a test suite for `provider-manager` that ensures the correct provider is resolved for both OpenRouter and future fallback providers.
2.  **Generation Smoke Tests:** Run the full "Prompt-to-Project" flow using `qwen/qwen3-coder` to verify that the XML tag parsing (`<file>`, etc.) remains intact.
3.  **Regression Testing:** Verify that "Website Clone" and "Brand Extension" still work, as these rely on specific prompt context construction.

## G. Estimated Effort

- **Total Effort:** 4-5 Development Days.
- **Staffing:** 1 Senior Full-stack Engineer.
