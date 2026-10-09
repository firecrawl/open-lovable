# Mian AI - E2B Sandbox

This project is configured to use E2B sandboxes for code execution.

## Setup

1. Get your E2B API key from [https://e2b.dev](https://e2b.dev)
2. Get your Firecrawl API key from [https://firecrawl.dev](https://firecrawl.dev)
3. Copy `.env.example` to `.env` and add your API keys
4. Run `npm install` to install dependencies
5. Run `npm run dev` to start the development server

## E2B Features

- Full-featured development sandboxes
- 15-minute default timeout (configurable)
- Persistent file system during session
- Support for complex package installations
- Built-in Python runtime for code execution

## Configuration

You can adjust E2B settings in `config/app.config.ts`:

- `timeoutMinutes`: Sandbox session timeout (default: 15)
- `vitePort`: Development server port (default: 5173)
- `viteStartupDelay`: Time to wait for Vite to start (default: 7000ms)

## Troubleshooting

If you encounter issues:

1. Verify your E2B API key is valid
2. Check the console for detailed error messages
3. Ensure you have a stable internet connection
4. Try refreshing the page and creating a new sandbox

For more help, visit the [E2B documentation](https://docs.e2b.dev).