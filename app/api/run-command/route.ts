import { ClientInputError, readJsonObject, validateCommand, publicErrorMessage } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';

// Get active sandbox from global state (in production, use a proper state management solution)
declare global {
  var activeSandbox: any;
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
    
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[run-command] Executing authorized sandbox command');
    
    // Parse command and arguments
    const cmd = 'sh';
    const args = ['-c', command];
    
    // Execute command using Vercel Sandbox
    const result = await global.activeSandbox.runCommand({
      cmd,
      args
    });
    
    // Get output streams
    const stdout = await result.stdout();
    const stderr = await result.stderr();
    
    const output = [
      stdout ? `STDOUT:\n${stdout}` : '',
      stderr ? `\nSTDERR:\n${stderr}` : '',
      `\nExit code: ${result.exitCode}`
    ].filter(Boolean).join('');
    
    return NextResponse.json({
      success: result.exitCode === 0,
      output,
      exitCode: result.exitCode,
      message: result.exitCode === 0 ? 'Command executed successfully' : 'Command completed with non-zero exit code'
    });
    
  } catch (error) {
    console.error('[run-command] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}