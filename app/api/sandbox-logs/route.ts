import { publicErrorMessage } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
}

export async function GET(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[sandbox-logs] Fetching Vite dev server logs...');
    
    // Check if Vite processes are running
    const psResult = await global.activeSandbox.runCommand({
      cmd: 'ps',
      args: ['aux']
    });
    
    let viteRunning = false;
    const logContent: string[] = [];
    
    if (psResult.exitCode === 0) {
      const psOutput = await psResult.stdout();
      const viteProcesses = psOutput.split('\n').filter((line: string) => 
        line.toLowerCase().includes('vite') || 
        line.toLowerCase().includes('npm run dev')
      );
      
      viteRunning = viteProcesses.length > 0;
      
      if (viteRunning) {
        logContent.push("Vite is running");
        logContent.push(...viteProcesses.slice(0, 3)); // Show first 3 processes
      } else {
        logContent.push("Vite process not found");
      }
    }
    
    // Try to read any recent log files
    try {
      const findResult = await global.activeSandbox.runCommand({
        cmd: 'find',
        args: ['/tmp', '-name', '*vite*', '-name', '*.log', '-type', 'f']
      });
      
      if (findResult.exitCode === 0) {
        const logFiles = (await findResult.stdout()).split('\n').filter((f: string) => f.trim());
        
        for (const logFile of logFiles.slice(0, 2)) {
          try {
            const catResult = await global.activeSandbox.runCommand({
              cmd: 'tail',
              args: ['-n', '10', logFile]
            });
            
            if (catResult.exitCode === 0) {
              const logFileContent = await catResult.stdout();
              logContent.push(`--- ${logFile} ---`);
              logContent.push(logFileContent);
            }
          } catch {
            // Skip if can't read log file
          }
        }
      }
    } catch {
      // No log files found, that's OK
    }
    
    return NextResponse.json({
      success: true,
      hasErrors: false,
      logs: logContent,
      status: viteRunning ? 'running' : 'stopped'
    });
    
  } catch (error) {
    console.error('[sandbox-logs] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: publicErrorMessage(error)
    }, { status: 500 });
  }
}