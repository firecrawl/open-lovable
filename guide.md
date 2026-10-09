# Deployment Guide: Mian AI on Vercel

This guide explains how to deploy **Mian AI** to Vercel and configure it to use **OpenRouter** as the unified AI provider.

## 1. Prerequisites
- A [Vercel](https://vercel.com/) account.
- An [OpenRouter](https://openrouter.ai/) account and API key.
- A [Firecrawl](https://firecrawl.dev/) API key (for web scraping features).

## 2. Environment Variables Configuration

To make Mian AI work correctly, you must set the following environment variables in your Vercel project dashboard (**Settings > Environment Variables**):

### Required for AI Generation
| Variable | Description |
| :--- | :--- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key. |

### Required for Web Scraping (Clone/Brand Extension)
| Variable | Description |
| :--- | :--- |
| `FIRECRAWL_API_KEY` | Your Firecrawl API key. |

### Sandbox Configuration (Choose One)
Mian AI requires a sandbox to execute code and show live previews.

#### Option A: Vercel Sandbox (Recommended)
You need to provide a Vercel Personal Access Token or OIDC configuration.
- `VERCEL_TOKEN`: Your Vercel Personal Access Token.
- `VERCEL_TEAM_ID`: Your Vercel Team ID.
- `VERCEL_PROJECT_ID`: Your Vercel Project ID.

#### Option B: E2B Sandbox
- `SANDBOX_PROVIDER`: Set to `e2b`.
- `E2B_API_KEY`: Your E2B API key.

## 3. Deployment Steps

1.  **Push to GitHub:** Push your Mian AI code to a GitHub repository.
2.  **Import to Vercel:** In the Vercel dashboard, click **"Add New" > "Project"** and import your repository.
3.  **Set Framework:** Vercel should automatically detect **Next.js**.
4.  **Add Environment Variables:** Expand the "Environment Variables" section and add the keys mentioned above.
5.  **Deploy:** Click **"Deploy"**.

## 4. Troubleshooting OpenRouter

Mian AI is configured to use OpenRouter by default. If generation fails:
- **Check Balance:** Ensure your OpenRouter account has sufficient credits (even for "free" models, some providers require a minimal balance).
- **Verify Model IDs:** Mian AI defaults to `qwen/qwen3-coder`. You can change this in `config/app.config.ts`.
- **Logs:** Check the Vercel **Function Logs** for any error messages returned by the OpenRouter API.

## 5. Deployment Readiness

The codebase is already optimized for Vercel:
- **Streaming:** API routes use `force-dynamic` to support Server-Sent Events (SSE).
- **Turbopack:** Supported for fast development builds.
- **Node.js Runtime:** Configured to use Node.js 22.
