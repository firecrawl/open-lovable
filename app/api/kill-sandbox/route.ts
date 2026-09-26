import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

export async function POST(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    console.log('[kill-sandbox] Stopping active sandbox...');

    let sandboxKilled = false;

    // Stop existing sandbox if any
    // Providers tracked by the manager are terminated exactly once below.
    if (global.activeSandboxProvider) {
      if (!sandboxManager.tracks(global.activeSandboxProvider)) {
        try {
          await global.activeSandboxProvider.terminate();
          sandboxKilled = true;
          console.log('[kill-sandbox] Sandbox stopped successfully');
        } catch (e) {
          console.error('[kill-sandbox] Failed to stop sandbox:', e);
        }
      }
      global.activeSandboxProvider = null;
      global.sandboxData = null;
    }

    // The manager is consulted before the legacy global by the other sandbox
    // routes; leaving its entries behind would hand them a dead provider.
    if (sandboxManager.size > 0) {
      await sandboxManager.terminateAll();
      sandboxKilled = true;
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    }
    
    return NextResponse.json({
      success: true,
      sandboxKilled,
      message: 'Sandbox cleaned up successfully'
    });
    
  } catch (error) {
    console.error('[kill-sandbox] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to stop sandbox'
      },
      { status: 500 }
    );
  }
}