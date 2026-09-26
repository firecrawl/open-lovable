import { ClientInputError, readJsonObject, validatePackages, publicErrorMessage } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
  var sandboxData: any;
}

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const { packages: rawPackages } = await readJsonObject(request);
    const packages = validatePackages(rawPackages);
    // sandboxId not used - using global sandbox
    
    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Packages array is required' 
      }, { status: 400 });
    }
    
    // Validate and deduplicate package names
    const validPackages = [...new Set(packages)]
      .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '')
      .map(pkg => pkg.trim());
    
    if (validPackages.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid package names provided'
      }, { status: 400 });
    }
    
    // Log if duplicates were found
    if (packages.length !== validPackages.length) {
      console.log(`[install-packages] Cleaned packages: removed ${packages.length - validPackages.length} invalid/duplicate entries`);
      console.log(`[install-packages] Original:`, packages);
      console.log(`[install-packages] Cleaned:`, validPackages);
    }
    
    // Get active sandbox provider
    const provider = global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox provider available' 
      }, { status: 400 });
    }
    
    console.log('[install-packages] Installing packages:', validPackages);
    
    // Create a response stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };
    
    // Start installation in background
    (async (providerInstance) => {
      try {
        await sendProgress({ 
          type: 'start', 
          message: `Installing ${validPackages.length} package${validPackages.length > 1 ? 's' : ''}...`,
          packages: validPackages 
        });
        
        // Stop any existing development server first
        await sendProgress({ type: 'status', message: 'Stopping development server...' });
        
        try {
          // Try to kill any running dev server processes
          await providerInstance.runCommand('pkill -f vite');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit
        } catch (killError) {
          // It's OK if no process is found
          console.debug('[install-packages] No existing dev server found:', killError);
        }
        
        // Check which packages are already installed
        await sendProgress({ 
          type: 'status', 
          message: 'Checking installed packages...' 
        });
        
        let packagesToInstall = validPackages;
        
        try {
          // Read package.json to check existing dependencies
          let packageJsonContent = '';
          try {
            packageJsonContent = await providerInstance.readFile('package.json');
          } catch (error) {
            console.log('[install-packages] Error reading package.json:', error);
          }
          if (packageJsonContent) {
            const packageJson = JSON.parse(packageJsonContent);
            
            const dependencies = packageJson.dependencies || {};
            const devDependencies = packageJson.devDependencies || {};
            const allDeps = { ...dependencies, ...devDependencies };
            
            const alreadyInstalled = [];
            const needInstall = [];
            
            for (const pkg of validPackages) {
              // Handle scoped packages
              const versionStart = pkg.indexOf('@', 1);
              const pkgName = versionStart < 0 ? pkg : pkg.slice(0, versionStart);
              
              // Explicit versions/tags must be resolved by npm, even if another version is present.
              if (allDeps[pkgName] && versionStart < 0) {
                alreadyInstalled.push(pkgName);
              } else {
                needInstall.push(pkg);
              }
            }
            
            packagesToInstall = needInstall;
            
            if (alreadyInstalled.length > 0) {
              await sendProgress({ 
                type: 'info', 
                message: `Already installed: ${alreadyInstalled.join(', ')}` 
              });
            }
          }
        } catch (error) {
          console.error('[install-packages] Error checking existing packages:', error);
          // If we can't check, just try to install all packages
          packagesToInstall = validPackages;
        }
        
        if (packagesToInstall.length === 0) {
          await sendProgress({ 
            type: 'success', 
            message: 'All packages are already installed',
            installedPackages: [],
            alreadyInstalled: validPackages
          });
          
          // Restart dev server
          await sendProgress({ type: 'status', message: 'Restarting development server...' });
          
          await providerInstance.restartViteServer();
          
          await sendProgress({ 
            type: 'complete', 
            message: 'Dev server restarted!',
            installedPackages: []
          });
          
          return;
        }
        
        // Install only packages that aren't already installed
        await sendProgress({ 
          type: 'info', 
          message: `Installing ${packagesToInstall.length} new package(s): ${packagesToInstall.join(', ')}`
        });
        
        // Install packages using provider method
        const installResult = await providerInstance.installPackages(packagesToInstall);
        
        // Get install output - ensure stdout/stderr are strings
        const stdout = String(installResult.stdout || '');
        const stderr = String(installResult.stderr || '');
        
        if (stdout) {
          const lines = stdout.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.includes('npm WARN')) {
              await sendProgress({ type: 'warning', message: line });
            } else if (line.trim()) {
              await sendProgress({ type: 'output', message: line });
            }
          }
        }
        
        if (stderr) {
          const errorLines = stderr.split('\n').filter(line => line.trim());
          for (const line of errorLines) {
            if (line.includes('ERESOLVE')) {
              await sendProgress({ 
                type: 'warning', 
                message: `Dependency conflict: ${line}`
              });
            } else if (line.trim()) {
              await sendProgress({ type: 'error', message: line });
            }
          }
        }
        
        if (installResult.exitCode === 0) {
          await sendProgress({ 
            type: 'success', 
            message: `Successfully installed: ${packagesToInstall.join(', ')}`,
            installedPackages: packagesToInstall
          });
        } else {
          await sendProgress({ 
            type: 'error', 
            message: 'Package installation failed' 
          });
        }
        
        // Restart development server
        await sendProgress({ type: 'status', message: 'Restarting development server...' });
        
        try {
          await providerInstance.restartViteServer();
          
          // Wait a bit for the server to start
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          await sendProgress({ 
            type: 'complete', 
            success: installResult.exitCode === 0,
            message: installResult.exitCode === 0 ? 'Packages installed and dev server restarted' : 'Package installation failed; dev server restart attempted',
            failedPackages: installResult.exitCode === 0 ? [] : packagesToInstall,
            installedPackages: installResult.exitCode === 0 ? packagesToInstall : []
          });
        } catch (error) {
          await sendProgress({ 
            type: 'error', 
            message: `Failed to restart dev server: ${(error as Error).message}` 
          });
        }
        
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage && errorMessage !== 'undefined') {
          await sendProgress({ 
            type: 'error', 
            message: errorMessage
          });
        }
      } finally {
        await writer.close();
      }
    })(provider);
    
    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('[install-packages] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}