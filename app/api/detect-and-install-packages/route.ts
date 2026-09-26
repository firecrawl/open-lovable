import { ClientInputError, readJsonObject, validatePackages, publicErrorMessage } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
}

export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const { files } = await readJsonObject(request);
    
    if (!files || typeof files !== 'object') {
      return NextResponse.json({ 
        success: false, 
        error: 'Files object is required' 
      }, { status: 400 });
    }

    if (!global.activeSandbox) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 404 });
    }

    console.log('[detect-and-install-packages] Processing files:', Object.keys(files));

    // Extract all import statements from the files
    const imports = new Set<string>();
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*(?:from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

    for (const [filePath, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue;
      
      // Skip non-JS/JSX/TS/TSX files
      if (!filePath.match(/\.(jsx?|tsx?)$/)) continue;

      // Find ES6 imports
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.add(match[1]);
      }

      // Find CommonJS requires
      while ((match = requireRegex.exec(content)) !== null) {
        imports.add(match[1]);
      }
    }

    console.log('[detect-and-install-packages] Found imports:', Array.from(imports));
    
    // Log specific heroicons imports
    const heroiconImports = Array.from(imports).filter(imp => imp.includes('heroicons'));
    if (heroiconImports.length > 0) {
      console.log('[detect-and-install-packages] Heroicon imports:', heroiconImports);
    }

    // Filter out relative imports and built-in modules
    const packages = Array.from(imports).filter(imp => {
      // Skip relative imports
      if (imp.startsWith('.') || imp.startsWith('/')) return false;
      
      // Skip built-in Node modules
      const builtins = ['fs', 'path', 'http', 'https', 'crypto', 'stream', 'util', 'os', 'url', 'querystring', 'child_process'];
      if (builtins.includes(imp)) return false;
      
      return true;
    });

    // Extract just the package names (without subpaths)
    const packageNames = packages.map(pkg => {
      if (pkg.startsWith('@')) {
        // Scoped package: @scope/package or @scope/package/subpath
        const parts = pkg.split('/');
        return parts.slice(0, 2).join('/');
      } else {
        // Regular package: package or package/subpath
        return pkg.split('/')[0];
      }
    });

    // Remove duplicates and anything that is not a plain npm registry name.
    // Import specifiers come from generated code and must never become npm flags.
    const uniquePackages = [...new Set(packageNames)].filter(name => {
      try {
        validatePackages([name]);
        return true;
      } catch {
        return false;
      }
    });

    console.log('[detect-and-install-packages] Packages to install:', uniquePackages);

    if (uniquePackages.length === 0) {
      return NextResponse.json({
        success: true,
        packagesInstalled: [],
        message: 'No new packages to install'
      });
    }

    // Check which packages are already installed
    const installed: string[] = [];
    const missing: string[] = [];
    
    for (const packageName of uniquePackages) {
      try {
        const checkResult = await global.activeSandbox.runCommand({
          cmd: 'test',
          args: ['-d', `node_modules/${packageName}`]
        });
        
        if (checkResult.exitCode === 0) {
          installed.push(packageName);
        } else {
          missing.push(packageName);
        }
      } catch (checkError) {
        // If test command fails, assume package is missing
        console.debug(`Package check failed for ${packageName}:`, checkError);
        missing.push(packageName);
      }
    }

    console.log('[detect-and-install-packages] Package status:', { installed, missing });

    if (missing.length === 0) {
      return NextResponse.json({
        success: true,
        packagesInstalled: [],
        packagesAlreadyInstalled: installed,
        message: 'All packages already installed'
      });
    }

    // Install missing packages
    console.log('[detect-and-install-packages] Installing packages:', missing);
    
    const installResult = await global.activeSandbox.runCommand({
      cmd: 'npm',
      args: ['install', '--save', '--', ...missing]
    });

    const stdout = await installResult.stdout();
    const stderr = await installResult.stderr();
    
    console.log('[detect-and-install-packages] Install stdout:', stdout);
    if (stderr) {
      console.log('[detect-and-install-packages] Install stderr:', stderr);
    }

    // Verify installation
    const finalInstalled: string[] = [];
    const failed: string[] = [];

    for (const packageName of missing) {
      try {
        const verifyResult = await global.activeSandbox.runCommand({
          cmd: 'test',
          args: ['-d', `node_modules/${packageName}`]
        });
        
        if (verifyResult.exitCode === 0) {
          finalInstalled.push(packageName);
          console.log(`✓ Verified installation of ${packageName}`);
        } else {
          failed.push(packageName);
          console.log(`✗ Failed to verify installation of ${packageName}`);
        }
      } catch (error) {
        failed.push(packageName);
        console.log(`✗ Error verifying ${packageName}:`, error);
      }
    }

    if (failed.length > 0) {
      console.error('[detect-and-install-packages] Failed to install:', failed);
    }

    return NextResponse.json({
      success: true,
      packagesInstalled: finalInstalled,
      packagesFailed: failed,
      packagesAlreadyInstalled: installed,
      message: `Installed ${finalInstalled.length} packages`,
      logs: stdout
    });

  } catch (error) {
    console.error('[detect-and-install-packages] Error:', error);
    return NextResponse.json({
      success: false,
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}