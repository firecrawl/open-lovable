import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextResponse } from 'next/server';
import { SandboxFactory } from '@/lib/sandbox/factory';
// SandboxProvider type is used through SandboxFactory
import type { SandboxState } from '@/types/sandbox';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

// Store active sandbox globally
declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}

export async function POST(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  let createdSandboxId: string | undefined;
  let provider: ReturnType<typeof SandboxFactory.create> | undefined;
  try {
    console.log('[create-ai-sandbox-v2] Creating sandbox...');
    
    // A new project/tab is additive. Existing sandboxes remain addressable by ID.
    // The manager, rather than process-global state, is the source of truth.

    // Create new sandbox using factory
    provider = SandboxFactory.create();
    const sandboxInfo = await provider.createSandbox();
    createdSandboxId = sandboxInfo.sandboxId;
    
    console.log('[create-ai-sandbox-v2] Setting up Vite React app...');
    await provider.setupViteApp();
    
    // Register with sandbox manager
    await sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);
    
    // Also store in legacy global state for backward compatibility
    global.activeSandboxProvider = provider;
    global.sandboxData = {
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url
    };
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId: sandboxInfo.sandboxId
      },
      sandbox: provider, // Store the provider instead of raw sandbox
      sandboxData: {
        sandboxId: sandboxInfo.sandboxId,
        url: sandboxInfo.url
      }
    };
    
    console.log('[create-ai-sandbox-v2] Sandbox ready at:', sandboxInfo.url);
    
    return NextResponse.json({
      success: true,
      sandboxId: sandboxInfo.sandboxId,
      url: sandboxInfo.url,
      provider: sandboxInfo.provider,
      message: 'Sandbox created and Vite React app initialized'
    });

  } catch (error) {
    console.error('[create-ai-sandbox-v2] Error:', error);
    
    // Clean up only the sandbox this request created. The previously active
    // sandbox is still healthy and must not be torn down by a failed create.
    const registered = provider !== undefined && sandboxManager.tracks(provider);
    if (createdSandboxId) await sandboxManager.terminateSandbox(createdSandboxId);
    if (provider && !registered && provider !== global.activeSandboxProvider) {
      try {
        await provider.terminate();
      } catch (e) {
        console.error('Failed to terminate sandbox on error:', e);
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to create sandbox' },
      { status: 500 }
    );
  }
}
