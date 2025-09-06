import { NextRequest, NextResponse } from 'next/server';
import { Sandbox } from '@e2b/code-interpreter';
import type { SandboxState } from '@/types/sandbox';
import type { ConversationState } from '@/types/conversation';
declare global {
  var conversationState: ConversationState | null;
  var activeSandbox: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
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
  // Function to extract packages from import statements
  function extractPackagesFromCode(content: string): string[] {
    const packages: string[] = [];
    // Match ES6 imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
      const importPath = importMatch[1];
      // Skip relative imports and built-in React
      if (!importPath.startsWith('.') && !importPath.startsWith('/') &&
        importPath !== 'react' && importPath !== 'react-dom' &&
        !importPath.startsWith('@/')) {
        // Extract package name (handle scoped packages like @heroicons/react)
        const packageName = importPath.startsWith('@')
          ? importPath.split('/').slice(0, 2).join('/')
          : importPath.split('/')[0];
        if (!packages.includes(packageName)) {
          packages.push(packageName);
          // Log important packages for debugging
          if (packageName === 'react-router-dom' || packageName.includes('router') || packageName.includes('icon')) {
            console.log(`[apply-ai-code-stream] Detected package from imports: ${packageName}`);
          }
        }
      }
    }
    return packages;
  }
  // Parse file sections - handle duplicates and prefer complete versions
  const fileMap = new Map<string, { content: string; isComplete: boolean }>();
  // First pass: Find all file declarations
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
      console.log(`[apply-ai-code-stream] Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Replace with longer complete version
      console.log(`[apply-ai-code-stream] Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true; // Both incomplete, keep longer one
    }
    if (shouldReplace) {
      // Additional validation: reject obviously broken content
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        console.warn(`[apply-ai-code-stream] Warning: ${filePath} contains ellipsis, may be truncated`);
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
      console.log(`[apply-ai-code-stream] Warning: File ${path} appears to be truncated (no closing tag)`);
    }
    sections.files.push({
      path,
      content
    });
    // Extract packages from file content
    const filePackages = extractPackagesFromCode(content);
    for (const pkg of filePackages) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        console.log(`[apply-ai-code-stream] 📦 Package detected from imports: ${pkg}`);
      }
    }
  }
  // Also parse markdown code blocks with file paths
  const markdownFileRegex = /```(?:file )?path="([^"]+)"\n([\s\S]*?)```/g;
  while ((match = markdownFileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    sections.files.push({
      path: filePath,
      content: content
    });
    // Extract packages from file content
    const filePackages = extractPackagesFromCode(content);
    for (const pkg of filePackages) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        console.log(`[apply-ai-code-stream] 📦 Package detected from imports: ${pkg}`);
      }
    }
  }
  // Parse plain text format like "Generated Files: Header.jsx, index.css"
  const generatedFilesMatch = response.match(/Generated Files?:\s*([^\n]+)/i);
  if (generatedFilesMatch) {
    // Split by comma first, then trim whitespace, to preserve filenames with dots
    const filesList = generatedFilesMatch[1]
      .split(',')
      .map(f => f.trim())
      .filter(f => f.endsWith('.jsx') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css') || f.endsWith('.json') || f.endsWith('.html'));
    console.log(`[apply-ai-code-stream] Detected generated files from plain text: ${filesList.join(', ')}`);
    // Try to extract the actual file content if it follows
    for (const fileName of filesList) {
      // Look for the file content after the file name
      const fileContentRegex = new RegExp(`${fileName}[\\s\\S]*?(?:import[\\s\\S]+?)(?=Generated Files:|Applying code|$)`, 'i');
      const fileContentMatch = response.match(fileContentRegex);
      if (fileContentMatch) {
        // Extract just the code part (starting from import statements)
        const codeMatch = fileContentMatch[0].match(/^(import[\s\S]+)$/m);
        if (codeMatch) {
          const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;
          sections.files.push({
            path: filePath,
            content: codeMatch[1].trim()
          });
          console.log(`[apply-ai-code-stream] Extracted content for ${filePath}`);
          // Extract packages from this file
          const filePackages = extractPackagesFromCode(codeMatch[1]);
          for (const pkg of filePackages) {
            if (!sections.packages.includes(pkg)) {
              sections.packages.push(pkg);
              console.log(`[apply-ai-code-stream] Package detected from imports: ${pkg}`);
            }
          }
        }
      }
    }
  }
  // Also try to parse if the response contains raw JSX/JS code blocks
  const codeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const content = match[1].trim();
    // Try to detect the file name from comments or context
    const fileNameMatch = content.match(/\/\/\s*(?:File:|Component:)\s*([^\n]+)/);
    if (fileNameMatch) {
      const fileName = fileNameMatch[1].trim();
      const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;
      // Don't add duplicate files
      if (!sections.files.some(f => f.path === filePath)) {
        sections.files.push({
          path: filePath,
          content: content
        });
        // Extract packages
        const filePackages = extractPackagesFromCode(content);
        for (const pkg of filePackages) {
          if (!sections.packages.includes(pkg)) {
            sections.packages.push(pkg);
          }
        }
      }
    }
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
export async function POST(request: NextRequest) {
  try {
    const { response, isEdit = false, packages = [], sandboxId } = await request.json();
    if (!response) {
      return NextResponse.json({
        error: 'response is required'
      }, { status: 400 });
    }
    // Debug log the response
    console.log('[apply-ai-code-stream] Received response to parse:');
    console.log('[apply-ai-code-stream] Response length:', response.length);
    console.log('[apply-ai-code-stream] Response preview:', response.substring(0, 500));
    console.log('[apply-ai-code-stream] isEdit:', isEdit);
    console.log('[apply-ai-code-stream] packages:', packages);
    // Parse the AI response
    const parsed = parseAIResponse(response);
    // Log what was parsed
    console.log('[apply-ai-code-stream] Parsed result:');
    console.log('[apply-ai-code-stream] Files found:', parsed.files.length);
    if (parsed.files.length > 0) {
      parsed.files.forEach(f => {
        console.log(`[apply-ai-code-stream] - ${f.path} (${f.content.length} chars)`);
      });
    }
    console.log('[apply-ai-code-stream] Packages found:', parsed.packages);
    // Initialize existingFiles if not already
    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    }
    // First, always check the global state for active sandbox
    let sandbox = global.activeSandbox;
    // If we don't have a sandbox in this instance but we have a sandboxId,
    // reconnect to the existing sandbox
    if (!sandbox && sandboxId) {
      console.log(`[apply-ai-code-stream] Sandbox ${sandboxId} not in this instance, attempting reconnect...`);
      try {
        // Reconnect to the existing sandbox using E2B's connect method
        sandbox = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
        console.log(`[apply-ai-code-stream] Successfully reconnected to sandbox ${sandboxId}`);
        // Store the reconnected sandbox globally for this instance
        global.activeSandbox = sandbox;
        // Update sandbox data if needed
        if (!global.sandboxData) {
          const host = (sandbox as any).getHost(5173);
          global.sandboxData = {
            sandboxId,
            url: `https://${host}`
          };
        }
        // Initialize existingFiles if not already
        if (!global.existingFiles) {
          global.existingFiles = new Set<string>();
        }
      } catch (reconnectError) {
        console.error(`[apply-ai-code-stream] Failed to reconnect to sandbox ${sandboxId}:`, reconnectError);
        // If reconnection fails, we'll still try to return a meaningful response
        return NextResponse.json({
          success: false,
          error: `Failed to reconnect to sandbox ${sandboxId}. The sandbox may have expired or been terminated.`,
          results: {
            filesCreated: [],
            packagesInstalled: [],
            commandsExecuted: [],
            errors: [`Sandbox reconnection failed: ${(reconnectError as Error).message}`]
          },
          explanation: parsed.explanation,
          structure: parsed.structure,
          parsedFiles: parsed.files,
          message: `Parsed ${parsed.files.length} files but couldn't apply them - sandbox reconnection failed.`
        });
      }
    }
    // If no sandbox at all and no sandboxId provided, return an error
    if (!sandbox && !sandboxId) {
      console.log('[apply-ai-code-stream] No sandbox available and no sandboxId provided');
      return NextResponse.json({
        success: false,
        error: 'No active sandbox found. Please create a sandbox first.',
        results: {
          filesCreated: [],
          packagesInstalled: [],
          commandsExecuted: [],
          errors: ['No sandbox available']
        },
        explanation: parsed.explanation,
        structure: parsed.structure,
        parsedFiles: parsed.files,
        message: `Parsed ${parsed.files.length} files but no sandbox available to apply them.`
      });
    }
    // Create a response stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };
    // Start processing in background (pass sandbox and request to the async function)
    (async (sandboxInstance, req) => {
      const results = {
        filesCreated: [] as string[],
        filesUpdated: [] as string[],
        packagesInstalled: [] as string[],
        packagesAlreadyInstalled: [] as string[],
        packagesFailed: [] as string[],
        commandsExecuted: [] as string[],
        errors: [] as string[]
      };
      try {
        await sendProgress({
          type: 'start',
          message: 'Starting code application...',
          totalSteps: 3
        });
        // Step 1: Install packages
        const packagesArray = Array.isArray(packages) ? packages : [];
        const parsedPackages = Array.isArray(parsed.packages) ? parsed.packages : [];
        // Combine and deduplicate packages
        const allPackages = [...packagesArray.filter(pkg => pkg && typeof pkg === 'string'), ...parsedPackages];
        // Use Set to remove duplicates, then filter out pre-installed packages
        const uniquePackages = [...new Set(allPackages)]
          .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '') // Remove empty strings
          .filter(pkg => pkg !== 'react' && pkg !== 'react-dom'); // Filter pre-installed
        // Log if we found duplicates
        if (allPackages.length !== uniquePackages.length) {
          console.log(`[apply-ai-code-stream] Removed ${allPackages.length - uniquePackages.length} duplicate packages`);
          console.log(`[apply-ai-code-stream] Original packages:`, allPackages);
          console.log(`[apply-ai-code-stream] Deduplicated packages:`, uniquePackages);
        }
        if (uniquePackages.length > 0) {
          await sendProgress({
            type: 'step',
            step: 1,
            message: `Installing ${uniquePackages.length} packages...`,
            packages: uniquePackages
          });
          // Use streaming package installation
          try {
            // Construct the API URL properly for both dev and production
            const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
            const host = req.headers.get('host') || 'localhost:3000';
            const apiUrl = `${protocol}://${host}/api/install-packages`;
            const installResponse = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                packages: uniquePackages,
                sandboxId: sandboxId || (sandboxInstance as any).sandboxId
              })
            });
            if (installResponse.ok && installResponse.body) {
              const reader = installResponse.body.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                if (!chunk) continue;
                const lines = chunk.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      // Forward package installation progress
                      await sendProgress({
                        type: 'package-progress',
                        ...data
                      });
                      // Track results
                      if (data.type === 'success' && data.installedPackages) {
                        results.packagesInstalled = data.installedPackages;
                      }
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('[apply-ai-code-stream] Error installing packages:', error);
            await sendProgress({
              type: 'warning',
              message: `Package installation skipped (${(error as Error).message}). Continuing with file creation...`
            });
            results.errors.push(`Package installation failed: ${(error as Error).message}`);
          }
        } else {
          await sendProgress({
            type: 'step',
            step: 1,
            message: 'No additional packages to install, skipping...'
          });
        }
        // Step 2: Create/update files
        const filesArray = Array.isArray(parsed.files) ? parsed.files : [];
        await sendProgress({
          type: 'step',
          step: 2,
          message: `Creating ${filesArray.length} files...`
        });
        // Filter out config files that shouldn't be created
        const configFiles = ['tailwind.config.js', 'vite.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.js'];
        const filteredFiles = filesArray.filter(file => {
          if (!file || typeof file !== 'object') return false;
          const fileName = (file.path || '').split('/').pop() || '';
          return !configFiles.includes(fileName);
        });
        for (const [index, file] of filteredFiles.entries()) {
          try {
            // Send progress for each file
            await sendProgress({
              type: 'file-progress',
              current: index + 1,
              total: filteredFiles.length,
              fileName: file.path,
              action: 'creating'
            });
            // Normalize the file path
            let normalizedPath = file.path;
            if (normalizedPath.startsWith('/')) {
              normalizedPath = normalizedPath.substring(1);
            }
            if (!normalizedPath.startsWith('src/') &&
              !normalizedPath.startsWith('public/') &&
              normalizedPath !== 'index.html' &&
              !configFiles.includes(normalizedPath.split('/').pop() || '')) {
              normalizedPath = 'src/' + normalizedPath;
            }
            const fullPath = `/home/user/app/${normalizedPath}`;
            const isUpdate = global.existingFiles.has(normalizedPath);
            let fileContent = file.content;
// Removed automatic CSS import manipulation to maintain original file content and reduce unnecessary line changes            // Write the file using Python (code-interpreter SDK)
            const escapedContent = fileContent
              .replace(/\\/g, '\\\\')
              .replace(/"""/g, '\\"\\"\\"')
              .replace(/\$/g, '\\$');
            await sandboxInstance.runCode(`
import os
os.makedirs(os.path.dirname("${fullPath}"), exist_ok=True)
with open("${fullPath}", 'w') as f:
    f.write("""${escapedContent}""")
print(f"File written: ${fullPath}")
            `);
            // Update file cache
            if (global.sandboxState?.fileCache) {
              global.sandboxState.fileCache.files[normalizedPath] = {
                content: fileContent,
                lastModified: Date.now()
              };
            }
            if (isUpdate) {
              if (results.filesUpdated) results.filesUpdated.push(normalizedPath);
            } else {
              if (results.filesCreated) results.filesCreated.push(normalizedPath);
              if (global.existingFiles) global.existingFiles.add(normalizedPath);
            }
            await sendProgress({
              type: 'file-complete',
              fileName: normalizedPath,
              action: isUpdate ? 'updated' : 'created'
            });
          } catch (error) {
            if (results.errors) {
              results.errors.push(`Failed to create ${file.path}: ${(error as Error).message}`);
            }
            await sendProgress({
              type: 'file-error',
              fileName: file.path,
              error: (error as Error).message
            });
          }
        }
        // Step 3: Execute commands
        const commandsArray = Array.isArray(parsed.commands) ? parsed.commands : [];
        if (commandsArray.length > 0) {
          await sendProgress({
            type: 'step',
            step: 3,
            message: `Executing ${commandsArray.length} commands...`
          });
          for (const [index, cmd] of commandsArray.entries()) {
            try {
              await sendProgress({
                type: 'command-progress',
                current: index + 1,
                total: parsed.commands.length,
                command: cmd,
                action: 'executing'
              });
              // Use E2B commands.run() for cleaner execution
              const result = await sandboxInstance.commands.run(cmd, {
                cwd: '/home/user/app',
                timeout: 60,
                on_stdout: async (data: string) => {
                  await sendProgress({
                    type: 'command-output',
                    command: cmd,
                    output: data,
                    stream: 'stdout'
                  });
                },
                on_stderr: async (data: string) => {
                  await sendProgress({
                    type: 'command-output',
                    command: cmd,
                    output: data,
                    stream: 'stderr'
                  });
                }
              });
              if (results.commandsExecuted) {
                results.commandsExecuted.push(cmd);
              }
              await sendProgress({
                type: 'command-complete',
                command: cmd,
                exitCode: result.exitCode,
                success: result.exitCode === 0
              });
            } catch (error) {
              if (results.errors) {
                results.errors.push(`Failed to execute ${cmd}: ${(error as Error).message}`);
              }
              await sendProgress({
                type: 'command-error',
                command: cmd,
                error: (error as Error).message
              });
            }
          }
        }
        // Send final results
        await sendProgress({
          type: 'complete',
          results,
          explanation: parsed.explanation,
          structure: parsed.structure,
          message: `Successfully applied ${results.filesCreated.length} files`
        });
        // Track applied files in conversation state
        if (global.conversationState && results.filesCreated.length > 0) {
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
              filesAffected: results.filesCreated || []
            });
          }
          global.conversationState.lastUpdated = Date.now();
        }
      } catch (error) {
        await sendProgress({
          type: 'error',
          error: (error as Error).message
        });
      } finally {
        await writer.close();
      }
    })(sandbox, request);
    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Apply AI code stream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse AI code' },
      { status: 500 }
    );
  }
}
