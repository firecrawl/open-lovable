import { ClientInputError, readJsonObject, validateCommand, publicErrorMessage } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';
import { SandboxProvider } from '@/lib/sandbox/types';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

// Get active sandbox provider from global state
declare global {
  var activeSandboxProvider: any;
}

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const { command: rawCommand } = await readJsonObject(request);
    const command = validateCommand(rawCommand);
    
    if (!command) {
      return NextResponse.json({ 
        success: false, 
        error: 'Command is required' 
      }, { status: 400 });
    }
    
    // Get provider from sandbox manager or global state
    const provider = sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[run-command] Executing authorized sandbox command');
    
    const result = await provider.runCommand(command);
    
    return NextResponse.json({
      success: result.success,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode,
      message: result.success ? 'Command executed successfully' : 'Command failed'
    });
    
  } catch (error) {
    console.error('[run-command-v2] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}