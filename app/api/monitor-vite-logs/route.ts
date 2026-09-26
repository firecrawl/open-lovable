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
    
    console.log('[monitor-vite-logs] Checking Vite process logs...');
    
    const errors: any[] = [];
    
    // Check if there's an error file from previous runs
    try {
      const catResult = await global.activeSandbox.runCommand({
        cmd: 'cat',
        args: ['/tmp/vite-errors.json']
      });
      
      if (catResult.exitCode === 0) {
        const errorFileContent = await catResult.stdout();
        const data = JSON.parse(errorFileContent);
        errors.push(...(data.errors || []));
      }
    } catch {
      // No error file exists, that's OK
    }
    
    // Look for any Vite-related log files that might contain errors
    try {
      const findResult = await global.activeSandbox.runCommand({
        cmd: 'find',
        args: ['/tmp', '-name', '*vite*', '-type', 'f']
      });
      
      if (findResult.exitCode === 0) {
        const logFiles = (await findResult.stdout()).split('\n').filter((f: string) => f.trim());
        
        for (const logFile of logFiles.slice(0, 3)) {
          try {
            const grepResult = await global.activeSandbox.runCommand({
              cmd: 'grep',
              args: ['-i', 'failed to resolve import', logFile]
            });
            
            if (grepResult.exitCode === 0) {
              const errorLines = (await grepResult.stdout()).split('\n').filter((line: string) => line.trim());
              
              for (const line of errorLines) {
                // Extract package name from error line
                const importMatch = line.match(/"([^"]+)"/);
                if (importMatch) {
                  const importPath = importMatch[1];
                  
                  // Skip relative imports
                  if (!importPath.startsWith('.')) {
                    // Extract base package name
                    let packageName;
                    if (importPath.startsWith('@')) {
                      const parts = importPath.split('/');
                      packageName = parts.length >= 2 ? parts.slice(0, 2).join('/') : importPath;
                    } else {
                      packageName = importPath.split('/')[0];
                    }
                    
                    const errorObj = {
                      type: "npm-missing",
                      package: packageName,
                      message: `Failed to resolve import "${importPath}"`,
                      file: "Unknown"
                    };
                    
                    // Avoid duplicates
                    if (!errors.some(e => e.package === errorObj.package)) {
                      errors.push(errorObj);
                    }
                  }
                }
              }
            }
          } catch {
            // Skip if grep fails
          }
        }
      }
    } catch {
      // No log files found, that's OK
    }
    
    // Deduplicate errors by package name
    const uniqueErrors: any[] = [];
    const seenPackages = new Set<string>();
    
    for (const error of errors) {
      if (error.package && !seenPackages.has(error.package)) {
        seenPackages.add(error.package);
        uniqueErrors.push(error);
      }
    }
    
    return NextResponse.json({
      success: true,
      hasErrors: uniqueErrors.length > 0,
      errors: uniqueErrors
    });
    
  } catch (error) {
    console.error('[monitor-vite-logs] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: publicErrorMessage(error)
    }, { status: 500 });
  }
}