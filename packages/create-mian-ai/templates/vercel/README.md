# Mian AI - Vercel Sandbox

This project is configured to use Vercel Sandboxes for code execution.

## Setup

1. Configure Vercel authentication (see below)
2. Get your Firecrawl API key from [https://firecrawl.dev](https://firecrawl.dev)
3. Copy `.env.example` to `.env` and add your credentials
4. Run `npm install` to install dependencies
5. Run `npm run dev` to start the development server

## Vercel Authentication

### Option 1: OIDC Token (Automatic for Vercel deployments)
When running in a Vercel environment, authentication happens automatically via OIDC tokens. No configuration needed!

### Option 2: Personal Access Token (For local development)
1. Create a Personal Access Token in your [Vercel account settings](https://vercel.com/account/tokens)
2. Get your Team ID from your [team settings](https://vercel.com/teams)
3. Create a project and get the Project ID
4. Add these to your `.env` file:
   - `VERCEL_TOKEN`
   - `VERCEL_TEAM_ID`
   - `VERCEL_PROJECT_ID`

## Vercel Sandbox Features

- Lightweight ephemeral Linux VMs
- Powered by Firecracker MicroVMs
- 5-minute default timeout (max 45 minutes)
- 8 vCPUs maximum
- Root access for package installation
- Node 22 runtime included

## Configuration

You can adjust Vercel settings in `config/app.config.ts`:

- `maxDuration`: Sandbox session timeout (default: 5 minutes)
- Authentication method (OIDC or PAT)

## Troubleshooting

If you encounter issues:

1. Verify your authentication credentials
2. Check if you're using the correct authentication method
3. Ensure your Vercel account has sandbox access
4. Check the console for detailed error messages

For more help, visit the [Vercel Sandbox documentation](https://vercel.com/docs/vercel-sandbox).