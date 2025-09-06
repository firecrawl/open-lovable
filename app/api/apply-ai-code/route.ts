import { NextRequest, NextResponse } from 'next/server';
import type { SandboxState } from '@/types/sandbox';
import type { ConversationState } from '@/types/conversation';
declare global {
  var conversationState: ConversationState | null;
}
interface ParsedResponse {
  explanation: string;
  template: string;
  files: Array<{ path: string; content: string }>;
  packages: string[];
  commands: string[];
  structure: string | null;
}
function parseAIResponse(response: string): ParsedResponse {
  const sections = {
    files: [] as Array<{ path: string; content: string }>,
    commands: [] as string[],
    packages: [] as string[],
    structure: null as string | null,
    explanation: '',
    template: ''
  };
  // Parse file sections - handle duplicates and prefer complete versions
  const fileMap = new Map<string, { content: string; isComplete: boolean }>();
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    const hasClosingTag = response.substring(match.index, match.index + match[0].length).includes('</file>');
    // Check if this file already exists in our map
    const existing = fileMap.get(filePath);
    // Decide whether to keep this version
    let shouldReplace = false;
    if (!existing) {
      shouldReplace = true; // First occurrence
    } else if (!existing.isComplete && hasClosingTag) {
      shouldReplace = true; // Replace incomplete with complete
      console.log(`[parseAIResponse] Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Replace with longer complete version
      console.log(`[parseAIResponse] Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Both incomplete, keep longer one
    }
    if (shouldReplace) {
      // Additional validation: reject obviously broken content
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        console.warn(`[parseAIResponse] Warning: ${filePath} contains ellipsis, may be truncated`);
        // Still use it if it's the only version we have
        if (!existing) {
          fileMap.set(filePath, { content, isComplete: hasClosingTag });
        }
      } else {
        fileMap.set(filePath, { content, isComplete: hasClosingTag });
      }
    }
  }
  // Convert map to array for sections.files
  for (const [path, { content, isComplete }] of fileMap.entries()) {
    if (!isComplete) {
      console.log(`[parseAIResponse] Warning: File ${path} appears to be truncated (no closing tag)`);
    }
    sections.files.push({
      path,
      content
    });
  }
  // Parse commands
  const cmdRegex = /<command>(.*?)<\/command>/g;
  while ((match = cmdRegex.exec(response)) !== null) {
    sections.commands.push(match[1].trim());
  }
  // Parse packages - support both <package> and <packages> tags
  const pkgRegex = /<package>(.*?)<\/package>/g;
  while ((match = pkgRegex.exec(response)) !== null) {
    sections.packages.push(match[1].trim());
  }
  // Also parse <packages> tag with multiple packages
  const packagesRegex = /<packages>([\s\S]*?)<\/packages>/;
  const packagesMatch = response.match(packagesRegex);
  if (packagesMatch) {
    const packagesContent = packagesMatch[1].trim();
    // Split by newlines or commas
    const packagesList = packagesContent.split(/[\n,]+/)
      .map(pkg => pkg.trim())
      .filter(pkg => pkg.length > 0);
    sections.packages.push(...packagesList);
  }
  // Parse structure
  const structureMatch = /<structure>([\s\S]*?)<\/structure>/;
  const structResult = response.match(structureMatch);
  if (structResult) {
    sections.structure = structResult[1].trim();
  }
  // Parse explanation
  const explanationMatch = /<explanation>([\s\S]*?)<\/explanation>/;
  const explResult = response.match(explanationMatch);
  if (explResult) {
    sections.explanation = explResult[1].trim();
  }
  // Parse template
  const templateMatch = /<template>(.*?)<\/template>/;
  const templResult = response.match(templateMatch);
  if (templResult) {
    sections.template = templResult[1].trim();
  }
  return sections;
}
declare global {
  var activeSandbox: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
}
export async function POST(request: NextRequest) {
  try {
    const { response, isEdit = false, packages = [] } = await request.json();
    if (!response) {
      return NextResponse.json({
        error: 'response is required'
      }, { status: 400 });
    }
    // Parse the AI response
    const parsed = parseAIResponse(response);
    // Initialize existingFiles if not already
    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    }
    // If no active sandbox, just return parsed results
    if (!global.activeSandbox) {
      return NextResponse.json({
        success: true,
        results: {
          filesCreated: parsed.files.map(f => f.path),
          packagesInstalled: parsed.packages,
          commandsExecuted: parsed.commands,
          errors: []
        },
        explanation: parsed.explanation,
        structure: parsed.structure,
        parsedFiles: parsed.files,
        message: `Parsed ${parsed.files.length} files successfully. Create a sandbox to apply them.`
      });
    }
    // Apply to active sandbox
    console.log('[apply-ai-code] Applying code to sandbox...');
    console.log('[apply-ai-code] Is edit mode:', isEdit);
    console.log('[apply-ai-code] Files to write:', parsed.files.map(f => f.path));
    console.log('[apply-ai-code] Existing files:', Array.from(global.existingFiles));
    const results = {
      filesCreated: [] as string[],
      filesUpdated: [] as string[],
      packagesInstalled: [] as string[],
      packagesAlreadyInstalled: [] as string[],
      packagesFailed: [] as string[],
      commandsExecuted: [] as string[],
      errors: [] as string[]
    };
    // Combine packages from tool calls and parsed XML tags
    const allPackages = [...packages.filter((pkg: any) => pkg && typeof pkg === 'string'), ...parsed.packages];
    const uniquePackages = [...new Set(allPackages)]; // Remove duplicates
    if (uniquePackages.length > 0) {
      console.log('[apply-ai-code] Installing packages from XML tags and tool calls:', uniquePackages);
      try {
        const installResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/install-packages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packages: uniquePackages })
        });
        if (installResponse.ok) {
          const installResult = await installResponse.json();
          console.log('[apply-ai-code] Package installation result:', installResult);
          if (installResult.installed && installResult.installed.length > 0) {
            results.packagesInstalled = installResult.installed;
          }
          if (installResult.failed && installResult.failed.length > 0) {
            results.packagesFailed = installResult.failed;
          }
        }
      } catch (error) {
        console.error('[apply-ai-code] Error installing packages:', error);
      }
    } else {
      // Fallback to detecting packages from code
      console.log('[apply-ai-code] No packages provided, detecting from generated code...');
      console.log('[apply-ai-code] Number of files to scan:', parsed.files.length);
      // Filter out config files first
      const configFiles = ['tailwind.config.js', 'vite.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.js'];
      const filteredFilesForDetection = parsed.files.filter(file => {
        const fileName = file.path.split('/').pop() || '';
        return !configFiles.includes(fileName);
      });
      // Build files object for package detection
      const filesForPackageDetection: Record<string, string> = {};
      for (const file of filteredFilesForDetection) {
        filesForPackageDetection[file.path] = file.content;
        // Log if heroicons is found
        if (file.content.includes('heroicons')) {
          console.log(`[apply-ai-code] Found heroicons import in ${file.path}`);
        }
      }
      try {
        console.log('[apply-ai-code] Calling detect-and-install-packages...');
        const packageResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/detect-and-install-packages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: filesForPackageDetection })
        });
        console.log('[apply-ai-code] Package detection response status:', packageResponse.status);
        if (packageResponse.ok) {
          const packageResult = await packageResponse.json();
          console.log('[apply-ai-code] Package installation result:', JSON.stringify(packageResult, null, 2));
          if (packageResult.packagesInstalled && packageResult.packagesInstalled.length > 0) {
            results.packagesInstalled = packageResult.packagesInstalled;
            console.log(`[apply-ai-code] Installed packages: ${packageResult.packagesInstalled.join(', ')}`);
          }
          if (packageResult.packagesAlreadyInstalled && packageResult.packagesAlreadyInstalled.length > 0) {
            results.packagesAlreadyInstalled = packageResult.packagesAlreadyInstalled;
            console.log(`[apply-ai-code] Already installed: ${packageResult.packagesAlreadyInstalled.join(', ')}`);
          }
          if (packageResult.packagesFailed && packageResult.packagesFailed.length > 0) {
            results.packagesFailed = packageResult.packagesFailed;
            console.error(`[apply-ai-code] Failed to install packages: ${packageResult.packagesFailed.join(', ')}`);
            results.errors.push(`Failed to install packages: ${packageResult.packagesFailed.join(', ')}`);
          }
          // Force Vite restart after package installation
          if (results.packagesInstalled.length > 0) {
            console.log('[apply-ai-code] Packages were installed, forcing Vite restart...');
            try {
              // Call the restart-vite endpoint
              const restartResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/restart-vite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              if (restartResponse.ok) {
                const restartResult = await restartResponse.json();
                console.log('[apply-ai-code] Vite restart result:', restartResult.message);
              } else {
                console.error('[apply-ai-code] Failed to restart Vite:', await restartResponse.text());
              }
            } catch (e) {
              console.error('[apply-ai-code] Error calling restart-vite:', e);
            }
            // Additional delay to ensure files can be written after restart
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.error('[apply-ai-code] Package detection/installation failed:', await packageResponse.text());
        }
      } catch (error) {
        console.error('[apply-ai-code] Error detecting/installing packages:', error);
        // Continue with file writing even if package installation fails
      }
    }
    // Filter out config files that shouldn't be created
    const configFiles = ['tailwind.config.js', 'vite.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.js'];
    const filteredFiles = parsed.files.filter(file => {
      const fileName = file.path.split('/').pop() || '';
      if (configFiles.includes(fileName)) {
        console.warn(`[apply-ai-code] Skipping config file: ${file.path} - already exists in template`);
        return false;
      }
      return true;
    });
    // Create or update files AFTER package installation
    for (const file of filteredFiles) {
      try {
        // Normalize the file path
        let normalizedPath = file.path;
        // Remove leading slash if present
        if (normalizedPath.startsWith('/')) {
          normalizedPath = normalizedPath.substring(1);
        }
        // Ensure src/ prefix for component files
        if (!normalizedPath.startsWith('src/') &&
          !normalizedPath.startsWith('public/') &&
          normalizedPath !== 'index.html' &&
          normalizedPath !== 'package.json' &&
          normalizedPath !== 'vite.config.js' &&
          normalizedPath !== 'tailwind.config.js' &&
          normalizedPath !== 'postcss.config.js') {
          normalizedPath = 'src/' + normalizedPath;
        }
        const fullPath = `/home/user/app/${normalizedPath}`;
        const isUpdate = global.existingFiles.has(normalizedPath);
        let fileContent = file.content;
        // Removed automatic CSS import manipulation to preserve original formatting and avoid unnecessary whitespace changes
        console.log(`[apply-ai-code] Writing file using E2B files API: ${fullPath}`);
        try {
          // Use the correct E2B API - sandbox.files.write()
          await global.activeSandbox.files.write(fullPath, fileContent);
          console.log(`[apply-ai-code] Successfully wrote file: ${fullPath}`);
          // Update file cache
          if (global.sandboxState?.fileCache) {
            global.sandboxState.fileCache.files[normalizedPath] = {
              content: fileContent,
              lastModified: Date.now()
            };
            console.log(`[apply-ai-code] Updated file cache for: ${normalizedPath}`);
          }
        } catch (writeError) {
          console.error(`[apply-ai-code] E2B file write error:`, writeError);
          throw writeError;
        }
        if (isUpdate) {
          results.filesUpdated.push(normalizedPath);
        } else {
          results.filesCreated.push(normalizedPath);
          global.existingFiles.add(normalizedPath);
        }
      } catch (error) {
        results.errors.push(`Failed to create ${file.path}: ${(error as Error).message}`);
      }
    }
    // Only create App.jsx if it's not an edit and doesn't exist
    const appFileInParsed = parsed.files.some(f => {
      const normalized = f.path.replace(/^\//, '').replace(/^src\//, '');
      return normalized === 'App.jsx' || normalized === 'App.tsx';
    });
    const appFileExists = global.existingFiles.has('src/App.jsx') ||
      global.existingFiles.has('src/App.tsx') ||
      global.existingFiles.has('App.jsx') ||
      global.existingFiles.has('App.tsx');
    if (!isEdit && !appFileInParsed && !appFileExists && parsed.files.length > 0) {
      // Find all component files
      const componentFiles = parsed.files.filter(f =>
        (f.path.endsWith('.jsx') || f.path.endsWith('.tsx')) &&
        f.path.includes('component')
      );
      // Generate imports for components
      const imports = componentFiles
        .filter(f => !f.path.includes('App.') && !f.path.includes('main.') && !f.path.includes('index.'))
        .map(f => {
          const pathParts = f.path.split('/');
          const fileName = pathParts[pathParts.length - 1];
          const componentName = fileName.replace(/\.(jsx|tsx)$/, '');
          // Fix import path - components are in src/components/
          const importPath = f.path.startsWith('src/')
            ? f.path.replace('src/', './').replace(/\.(jsx|tsx)$/, '')
            : './' + f.path.replace(/\.(jsx|tsx)$/, '');
          return `import ${componentName} from '${importPath}';`;
        })
        .join('\n');
      // Find the main component
      const mainComponent = componentFiles.find(f => {
        const name = f.path.toLowerCase();
        return name.includes('header') ||
          name.includes('hero') ||
          name.includes('layout') ||
          name.includes('main') ||
          name.includes('home');
      }) || componentFiles[0];
      const mainComponentName = mainComponent
        ? mainComponent.path.split('/').pop()?.replace(/\.(jsx|tsx)$/, '')
        : null;
      // Create App.jsx with better structure
      const appContent = `import React from 'react';\n${imports}\n\nfunction App() {\n  return (\n    <div className="min-h-screen bg-gray-900 text-white p-8">\n      ${mainComponentName ? `<${mainComponentName} />` : '<div className="text-center">\n        <h1 className="text-4xl font-bold mb-4">Welcome to your React App</h1>\n        <p className="text-gray-400">Your components have been created but need to be added here.</p>\n      </div>'}\n      {/* Generated components: ${componentFiles.map(f => f.path).join(', ')} */}\n    </div>\n  );\n}\n\nexport default App;`;
      try {
        await global.activeSandbox.runCode(`
file_path = "/home/user/app/src/App.jsx"
file_content = """${appContent.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""
with open(file_path, 'w') as f:
    f.write(file_content)
print(f"Auto-generated: {file_path}")
        `);
        results.filesCreated.push('src/App.jsx (auto-generated)');
      } catch (error) {
        results.errors.push(`Failed to create App.jsx: ${(error as Error).message}`);
      }
      // Don't auto-generate App.css - we're using Tailwind CSS
      // Only create index.css if it doesn't exist
      const indexCssInParsed = parsed.files.some(f => {
        const normalized = f.path.replace(/^\//, '').replace(/^src\//, '');
        return normalized === 'index.css' || f.path === 'src/index.css';
      });
      const indexCssExists = global.existingFiles.has('src/index.css') ||
        global.existingFiles.has('index.css');
      if (!isEdit && !indexCssInParsed && !indexCssExists) {
        try {
          await global.activeSandbox.runCode(`
file_path = "/home/user/app/src/index.css"
file_content = """@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;\n  line-height: 1.5;\n  font-weight: 400;\n  color-scheme: dark;\n  \n  color: rgba(255, 255, 255, 0.87);\n  background-color: #0a0a0a;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  min-width: 320px;\n  min-height: 100vh;\n}"""
with open(file_path, 'w') as f:
    f.write(file_content)
print(f"Auto-generated: {file_path}")
          `);
          results.filesCreated.push('src/index.css (with Tailwind)');
        } catch (error) {
          results.errors.push('Failed to create index.css with Tailwind');
        }
      }
    }
    // Execute commands
    for (const cmd of parsed.commands) {
      try {
        await global.activeSandbox.runCode(`
import subprocess
os.chdir('/home/user/app')
result = subprocess.run(${JSON.stringify(cmd.split(' '))}, capture_output=True, text=True)
print(f"Executed: ${cmd}")
print(result.stdout)
if result.stderr:
    print(f"Errors: {result.stderr}")
        `);
        results.commandsExecuted.push(cmd);
      } catch (error) {
        results.errors.push(`Failed to execute ${cmd}: ${(error as Error).message}`);
      }
    }
    // Check for missing imports in App.jsx
    const missingImports: string[] = [];
    const appFile = parsed.files.find(f =>
      f.path === 'src/App.jsx' || f.path === 'App.jsx'
    );
    if (appFile) {
      // Extract imports from App.jsx
      const importRegex = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      const imports: string[] = [];
      while ((match = importRegex.exec(appFile.content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          imports.push(importPath);
        }
      }
      // Check if all imported files exist
      for (const imp of imports) {
        // Skip CSS imports for this check
        if (imp.endsWith('.css')) continue;
        // Convert import path to expected file paths
        const basePath = imp.replace('./', 'src/');
        const possiblePaths = [
          basePath + '.jsx',
          basePath + '.js',
          basePath + '/index.jsx',
          basePath + '/index.js'
        ];
        const fileExists = parsed.files.some(f =>
          possiblePaths.some(path => f.path === path)
        );
        if (!fileExists) {
          missingImports.push(imp);
        }
      }
    }
    // Prepare response
    const responseData: any = {
      success: true,
      results,
      explanation: parsed.explanation,
      structure: parsed.structure,
      message: `Applied ${results.filesCreated.length} files successfully`
    };
    // Handle missing imports automatically
    if (missingImports.length > 0) {
      console.warn('[apply-ai-code] Missing imports detected:', missingImports);
      // Automatically generate missing components
      try {
        console.log('[apply-ai-code] Auto-generating missing components...');
        const autoCompleteResponse = await fetch(
          `${request.nextUrl.origin}/api/auto-complete-components`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              missingImports,
              model: 'claude-sonnet-4-20250514'
            })
          }
        );
        const autoCompleteData = await autoCompleteResponse.json();
        if (autoCompleteData.success) {
          responseData.autoCompleted = true;
          responseData.autoCompletedComponents = autoCompleteData.components;
          responseData.message = `Applied ${results.filesCreated.length} files + auto-generated ${autoCompleteData.files} missing components`;
          // Add auto-completed files to results
          results.filesCreated.push(...autoCompleteData.components);
        } else {
          // If auto-complete fails, still warn the user
          responseData.warning = `Missing ${missingImports.length} imported components: ${missingImports.join(', ')}`;
          responseData.missingImports = missingImports;
        }
      } catch (error) {
        console.error('[apply-ai-code] Auto-complete failed:', error);
        responseData.warning = `Missing ${missingImports.length} imported components: ${missingImports.join(', ')}`;
        responseData.missingImports = missingImports;
      }
    }
    // Track applied files in conversation state
    if (global.conversationState && results.filesCreated.length > 0) {
      // Update the last message metadata with edited files
      const messages = global.conversationState.context.messages;
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'user') {
          lastMessage.metadata = {
            ...lastMessage.metadata,
            editedFiles: results.filesCreated
          };
        }
      }
      // Track applied code in project evolution
      if (global.conversationState.context.projectEvolution) {
        global.conversationState.context.projectEvolution.majorChanges.push({
          timestamp: Date.now(),
          description: parsed.explanation || 'Code applied',
          filesAffected: results.filesCreated
        });
      }
      // Update last updated timestamp
      global.conversationState.lastUpdated = Date.now();
      console.log('[apply-ai-code] Updated conversation state with applied files:', results.filesCreated);
    }
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Apply AI code error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse AI code' },
      { status: 500 }
    );
  }
}
