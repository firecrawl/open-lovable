import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';
import type { SandboxState } from '@/types/sandbox';
import { appConfig } from '@/config/app.config';

// Store active sandbox globally
declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
  var sandboxCreationInProgress: boolean;
  var sandboxCreationPromise: Promise<any> | null;
}

export async function POST(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  // Check if sandbox creation is already in progress
  if (global.sandboxCreationInProgress && global.sandboxCreationPromise) {
    console.log('[create-ai-sandbox] Sandbox creation already in progress, waiting for existing creation...');
    try {
      const existingResult = await global.sandboxCreationPromise;
      console.log('[create-ai-sandbox] Returning existing sandbox creation result');
      return NextResponse.json(existingResult);
    } catch (error) {
      console.error('[create-ai-sandbox] Existing sandbox creation failed:', error);
      // Continue with new creation if the existing one failed
    }
  }

  // Check if we already have an active sandbox
  if (global.activeSandbox && global.sandboxData) {
    console.log('[create-ai-sandbox] Returning existing active sandbox');
    return NextResponse.json({
      success: true,
      sandboxId: global.sandboxData.sandboxId,
      url: global.sandboxData.url
    });
  }

  // Set the creation flag
  global.sandboxCreationInProgress = true;
  
  // Create the promise that other requests can await
  global.sandboxCreationPromise = createSandboxInternal();
  
  try {
    const result = await global.sandboxCreationPromise;
    return NextResponse.json(result);
  } catch (error) {
    console.error('[create-ai-sandbox] Sandbox creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create sandbox' },
      { status: 500 }
    );
  } finally {
    global.sandboxCreationInProgress = false;
    global.sandboxCreationPromise = null;
  }
}

async function createSandboxInternal() {
  let sandbox: any = null;

  try {
    console.log('[create-ai-sandbox] Creating Vercel sandbox...');
    
    // Kill existing sandbox if any
    if (global.activeSandbox) {
      console.log('[create-ai-sandbox] Stopping existing sandbox...');
      try {
        await global.activeSandbox.stop();
      } catch (e) {
        console.error('Failed to stop existing sandbox:', e);
      }
      global.activeSandbox = null;
      global.sandboxData = null;
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    } else {
      global.existingFiles = new Set<string>();
    }

    // Create Vercel sandbox with flexible authentication
    console.log(`[create-ai-sandbox] Creating Vercel sandbox with ${appConfig.vercelSandbox.timeoutMinutes} minute timeout...`);
    
    // Prepare sandbox configuration
    const sandboxConfig: any = {
      timeout: appConfig.vercelSandbox.timeoutMs,
      runtime: appConfig.vercelSandbox.runtime,
      ports: [appConfig.vercelSandbox.devPort]
    };
    
    // Add authentication parameters if using personal access token
    if (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID) {
      console.log('[create-ai-sandbox] Using personal access token authentication');
      sandboxConfig.teamId = process.env.VERCEL_TEAM_ID;
      sandboxConfig.projectId = process.env.VERCEL_PROJECT_ID;
      sandboxConfig.token = process.env.VERCEL_TOKEN;
    } else if (process.env.VERCEL_OIDC_TOKEN) {
      console.log('[create-ai-sandbox] Using OIDC token authentication');
    } else {
      console.log('[create-ai-sandbox] No authentication found - relying on default Vercel authentication');
    }
    
    sandbox = await Sandbox.create(sandboxConfig);
    
    const sandboxId = sandbox.sandboxId;
    console.log(`[create-ai-sandbox] Sandbox created: ${sandboxId}`);

    // Set up a basic Vite React app
    console.log('[create-ai-sandbox] Setting up Vite React app...');
    
    // First, change to the working directory
    await sandbox.runCommand('pwd');
    // workDir is defined in appConfig - not needed here
    
    // Get the sandbox URL using the correct Vercel Sandbox API
    const sandboxUrl = sandbox.domain(appConfig.vercelSandbox.devPort);
    
    // Extract the hostname from the sandbox URL for Vite config
    const sandboxHostname = new URL(sandboxUrl).hostname;
    console.log(`[create-ai-sandbox] Sandbox hostname: ${sandboxHostname}`);

    // Create the Vite config content with the proper hostname (using string concatenation)
    const viteConfigContent = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel Sandbox compatible Vite configuration
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.vercelSandbox.devPort},
    strictPort: true,
    hmr: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '` + sandboxHostname + `', // Allow the Vercel Sandbox domain
      '.vercel.run', // Allow all Vercel sandbox domains
      '.vercel-sandbox.dev' // Fallback pattern
    ]
  }
})`;

    // Create the project files (now we have the sandbox hostname)
    const projectFiles = [
      {
        path: 'package.json',
        content: Buffer.from(JSON.stringify({
          "name": "sandbox-app",
          "version": "1.0.0",
          "type": "module",
          "scripts": {
            "dev": "vite --host --port 3000",
            "build": "vite build",
            "preview": "vite preview"
          },
          "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0"
          },
          "devDependencies": {
            "@vitejs/plugin-react": "^4.0.0",
            "vite": "^4.3.9",
            "tailwindcss": "^3.3.0",
            "postcss": "^8.4.31",
            "autoprefixer": "^10.4.16"
          }
        }, null, 2))
      },
      {
        path: 'vite.config.js',
        content: Buffer.from(viteConfigContent)
      },
      {
        path: 'tailwind.config.js',
        content: Buffer.from(`/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`)
      },
      {
        path: 'postcss.config.js',
        content: Buffer.from(`export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`)
      },
      {
        path: 'index.html',
        content: Buffer.from(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`)
      },
      {
        path: 'src/main.jsx',
        content: Buffer.from(`import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`)
      },
      {
        path: 'src/App.jsx',
        content: Buffer.from(`function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          Sandbox Ready
        </h1>
        <p className="text-lg text-gray-400">
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`)
      },
      {
        path: 'src/index.css',
        content: Buffer.from(`@tailwind base;
@tailwind components;
@tailwind utilities;

/* Force Tailwind to load */
@layer base {
  :root {
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`)
      }
    ];

    // Create directory structure first
    await sandbox.runCommand({
      cmd: 'mkdir',
      args: ['-p', 'src']
    });
    
    // Write all files
    await sandbox.writeFiles(projectFiles);
    console.log('[create-ai-sandbox] ✓ Project files created');
    
    // Install dependencies
    console.log('[create-ai-sandbox] Installing dependencies...');
    const installResult = await sandbox.runCommand({
      cmd: 'npm',
      args: ['install', '--loglevel', 'info']
    });
    if (installResult.exitCode === 0) {
      console.log('[create-ai-sandbox] ✓ Dependencies installed successfully');
    } else {
      console.log('[create-ai-sandbox] ⚠ Warning: npm install had issues but continuing...');
    }
    
    // Start Vite dev server in detached mode
    console.log('[create-ai-sandbox] Starting Vite dev server...');
    const viteProcess = await sandbox.runCommand({
      cmd: 'npm',
      args: ['run', 'dev'],
      detached: true
    });
    
    console.log('[create-ai-sandbox] ✓ Vite dev server started');
    
    // Wait for Vite to be fully ready
    await new Promise(resolve => setTimeout(resolve, appConfig.vercelSandbox.devServerStartupDelay));

    // Store sandbox globally
    global.activeSandbox = sandbox;
    global.sandboxData = {
      sandboxId,
      url: sandboxUrl,
      viteProcess
    };
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId
      },
      sandbox,
      sandboxData: {
        sandboxId,
        url: sandboxUrl
      }
    };
    
    // Track initial files
    global.existingFiles.add('src/App.jsx');
    global.existingFiles.add('src/main.jsx');
    global.existingFiles.add('src/index.css');
    global.existingFiles.add('index.html');
    global.existingFiles.add('package.json');
    global.existingFiles.add('vite.config.js');
    global.existingFiles.add('tailwind.config.js');
    global.existingFiles.add('postcss.config.js');
    
    console.log('[create-ai-sandbox] Sandbox ready at:', sandboxUrl);
    
    const result = {
      success: true,
      sandboxId,
      url: sandboxUrl,
      message: 'Vercel sandbox created and Vite React app initialized'
    };
    
    // Store the result for reuse
    global.sandboxData = {
      ...global.sandboxData,
      ...result
    };
    
    return result;

  } catch (error) {
    console.error('[create-ai-sandbox] Error:', error);
    
    // Clean up on error
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (e) {
        console.error('Failed to stop sandbox on error:', e);
      }
    }
    
    // Clear global state on error
    global.activeSandbox = null;
    global.sandboxData = null;
    
    throw error; // Throw to be caught by the outer handler
  }
}