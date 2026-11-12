import { Boxd, NotFoundError } from '@boxd-sh/sdk';
import { customAlphabet } from 'nanoid';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
// SandboxProviderConfig available through parent class
import { appConfig } from '@/config/app.config';

// Machine names allow lowercase letters, digits and hyphens
const nameSuffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

// Matches the Vite processes but not the shell running pkill itself
const VITE_PROCESS_PATTERN = "'[v]ite --host'";

export class BoxdProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set();
  private client: Boxd | null = null;
  private machineId: string | null = null;

  private getClient(): Boxd {
    if (!this.client) {
      const apiKey = this.config.boxd?.apiKey || process.env.BOXD_API_KEY;
      if (!apiKey && !process.env.BOXD_TOKEN) {
        throw new Error('boxd sandbox provider needs BOXD_API_KEY. Create one with `boxd auth keys create open-lovable`.');
      }
      this.client = new Boxd({
        apiKey,
        region: this.config.boxd?.region || process.env.BOXD_REGION || undefined
      });
    }
    return this.client;
  }

  private get workDir(): string {
    return appConfig.boxd.workingDirectory;
  }

  private fullPath(path: string): string {
    return path.startsWith('/') ? path : `${this.workDir}/${path}`;
  }

  private async exec(command: string | string[], cwd: string = this.workDir): Promise<CommandResult> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    const result = await this.getClient().machines.exec(this.machineId, {
      command,
      cwd,
      timeout: appConfig.boxd.commandTimeoutMs
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.exitCode === 0
    };
  }

  /**
   * Attempt to reconnect to an existing boxd machine.
   * Machines persist until terminate() deletes them, so a sandbox ID from an
   * earlier server process can be picked up again.
   */
  async reconnect(sandboxId: string): Promise<boolean> {
    try {
      const client = this.getClient();
      let machine = await client.machines.get(sandboxId);

      // Only pick up machines this app created
      if (machine.labels?.app !== 'open-lovable') {
        return false;
      }

      if (machine.status === 'stopped') {
        await client.machines.start(sandboxId);
      } else if (machine.status === 'hibernated') {
        await client.machines.wake(sandboxId);
      } else if (machine.status === 'suspended') {
        await client.machines.resume(sandboxId);
      }
      machine = await client.machines.waitUntilReady(sandboxId);

      // Give a machine in use a fresh lifetime
      if (appConfig.boxd.timeoutMinutes > 0) {
        await client.machines.setDeleteAfter(sandboxId, appConfig.boxd.timeoutMinutes * 60);
      }

      this.machineId = machine.id;
      this.sandbox = machine;
      this.sandboxInfo = {
        sandboxId: machine.id,
        url: machine.access.url,
        provider: 'boxd',
        createdAt: machine.createdAt || new Date()
      };

      // Start Vite again if it is not answering (after a stop or reboot)
      const probe = await this.exec(`curl -sf -o /dev/null http://localhost:${appConfig.boxd.vitePort}`, '/');
      if (!probe.success) {
        await this.restartViteServer();
      }

      return true;
    } catch (error) {
      if (!(error instanceof NotFoundError)) {
        console.error(`[BoxdProvider] Failed to reconnect to sandbox ${sandboxId}:`, error);
      }
      this.machineId = null;
      this.sandbox = null;
      this.sandboxInfo = null;
      return false;
    }
  }

  async createSandbox(): Promise<SandboxInfo> {
    try {

      // Delete existing machine if any
      if (this.machineId) {
        await this.terminate();
      }

      // Clear existing files tracking
      this.existingFiles.clear();

      const client = this.getClient();
      const namePrefix = process.env.BOXD_NAME_PREFIX || appConfig.boxd.namePrefix;

      // The sandbox runs AI-generated code, so the machine is isolated:
      // it has no credentials and cannot reach other machines in the org.
      const machine = await client.machines.create({
        name: `${namePrefix}${nameSuffix()}`,
        org: this.config.boxd?.org || process.env.BOXD_ORG || undefined,
        isolated: true,
        labels: { app: 'open-lovable' },
        // Deleted after this time even if terminate() never runs
        deleteAfter: appConfig.boxd.timeoutMinutes > 0 ? appConfig.boxd.timeoutMinutes * 60 : undefined
      });
      this.machineId = machine.id;
      this.sandbox = machine;

      await client.machines.waitUntilReady(machine.id);

      // The preview iframe loads the machine's public URL, so it serves Vite
      // and lets the browser through without a check page.
      await client.machines.proxies.setPort(machine.id, appConfig.boxd.vitePort);
      await client.machines.setBotProtection(machine.id, 'off');

      this.sandboxInfo = {
        sandboxId: machine.id,
        url: machine.access.url,
        provider: 'boxd',
        createdAt: machine.createdAt || new Date()
      };

      return this.sandboxInfo;

    } catch (error) {
      console.error('[BoxdProvider] Error creating sandbox:', error);
      // Do not leave a half set up machine behind
      await this.terminate();
      throw error;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    return this.execOrFail(command);
  }

  // Like exec(), but a failed call comes back as a failed result
  private async execOrFail(command: string | string[]): Promise<CommandResult> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    try {
      return await this.exec(command);
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error?.message || 'Command failed',
        exitCode: 1,
        success: false
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    // Missing parent directories are created
    await this.getClient().machines.fs.write(this.machineId, this.fullPath(path), content);

    this.existingFiles.add(path);
  }

  async readFile(path: string): Promise<string> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    const data = await this.getClient().machines.fs.read(this.machineId, this.fullPath(path));
    return new TextDecoder().decode(data);
  }

  async listFiles(directory: string = appConfig.boxd.workingDirectory): Promise<string[]> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    const result = await this.exec(
      `find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -not -path "*/dist/*" -not -path "*/build/*" | sed "s|^\\./||"`,
      directory
    );

    if (!result.success) {
      return [];
    }

    return result.stdout.split('\n').filter((line: string) => line.trim() !== '');
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    const args = ['npm', 'install'];
    if (appConfig.packages.useLegacyPeerDeps) {
      args.push('--legacy-peer-deps');
    }
    args.push(...packages);

    // Passed as argv, so package names are never parsed by a shell
    const result = await this.execOrFail(args);

    // Restart Vite if configured
    if (appConfig.packages.autoRestartVite && result.success) {
      await this.restartViteServer();
    }

    return result;
  }

  async setupViteApp(): Promise<void> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    const domain = (this.sandbox as any)?.access?.domain || 'boxd.sh';

    const packageJson = {
      name: "sandbox-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite --host",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.0.0",
        vite: "^4.3.9",
        tailwindcss: "^3.3.0",
        postcss: "^8.4.31",
        autoprefixer: "^10.4.16"
      }
    };

    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${appConfig.boxd.vitePort},
    strictPort: true,
    allowedHosts: [
      '.${domain}',  // The machine's public URL
      'localhost'
    ],
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    }
  }
})`;

    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

    const indexHtml = `<!DOCTYPE html>
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
</html>`;

    const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;

    const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`;

    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`;

    const files: Record<string, string> = {
      'package.json': JSON.stringify(packageJson, null, 2),
      'vite.config.js': viteConfig,
      'tailwind.config.js': tailwindConfig,
      'postcss.config.js': postcssConfig,
      'index.html': indexHtml,
      'src/main.jsx': mainJsx,
      'src/App.jsx': appJsx,
      'src/index.css': indexCss
    };

    for (const [path, content] of Object.entries(files)) {
      await this.writeFile(path, content);
    }

    // Install dependencies
    const installResult = await this.exec('npm install');
    if (!installResult.success) {
      console.warn('[BoxdProvider] npm install had issues:', installResult.stderr);
    }

    // Start Vite dev server
    await this.restartViteServer();
  }

  async restartViteServer(): Promise<void> {
    if (!this.machineId) {
      throw new Error('No active sandbox');
    }

    // Kill existing Vite process and wait until it is gone
    await this.exec(
      `pkill -f ${VITE_PROCESS_PATTERN}; for i in $(seq 1 20); do pgrep -f ${VITE_PROCESS_PATTERN} > /dev/null || exit 0; sleep 0.25; done; exit 0`,
      '/'
    );

    // Start Vite in background; it keeps running after the command returns
    await this.exec('nohup npm run dev > /tmp/vite.log 2>&1 &');

    // Wait for Vite to answer instead of sleeping a fixed time
    const port = appConfig.boxd.vitePort;
    const attempts = Math.ceil(appConfig.boxd.viteStartupTimeout / 500);
    const ready = await this.exec(
      `for i in $(seq 1 ${attempts}); do curl -sf -o /dev/null http://localhost:${port} && exit 0; sleep 0.5; done; exit 1`,
      '/'
    );
    if (!ready.success) {
      console.warn('[BoxdProvider] Vite did not answer in time, see /tmp/vite.log in the sandbox');
    }
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.machineId) {
      try {
        await this.getClient().machines.delete(this.machineId);
      } catch (e) {
        console.error('Failed to terminate sandbox:', e);
      }
      this.machineId = null;
      this.sandbox = null;
      this.sandboxInfo = null;
    }
  }

  isAlive(): boolean {
    return !!this.machineId;
  }
}
