import { createProviderFetch } from '@/lib/ai/provider-transport';
// Using direct fetch to Morph's OpenAI-compatible API to avoid SDK type issues

export interface MorphEditBlock {
  targetFile: string;
  instructions: string;
  update: string;
}

export interface MorphApplyResult {
  success: boolean;
  normalizedPath?: string;
  mergedCode?: string;
  error?: string;
}

// Normalize project-relative paths to sandbox layout
export function normalizeProjectPath(inputPath: string): { normalizedPath: string; fullPath: string } {
  let normalizedPath = inputPath.trim();
  if (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.slice(1);

  const configFiles = new Set([
    'tailwind.config.js',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'postcss.config.js'
  ]);

  const fileName = normalizedPath.split('/').pop() || '';
  if (!normalizedPath.startsWith('src/') &&
      !normalizedPath.startsWith('public/') &&
      normalizedPath !== 'index.html' &&
      !configFiles.has(fileName)) {
    normalizedPath = 'src/' + normalizedPath;
  }

  const fullPath = `/home/user/app/${normalizedPath}`;
  return { normalizedPath, fullPath };
}

async function morphChatCompletionsCreate(payload: any) {
  if (!process.env.MORPH_API_KEY) throw new Error('MORPH_API_KEY is not set');
  const res = await createProviderFetch('https://api.morphllm.com/v1')('https://api.morphllm.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MORPH_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Morph API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Parse <edit> blocks from LLM output
export function parseMorphEdits(text: string): MorphEditBlock[] {
  const edits: MorphEditBlock[] = [];
  const editRegex = /<edit\s+target_file="([^"]+)">([\s\S]*?)<\/edit>/g;
  let match: RegExpExecArray | null;
  while ((match = editRegex.exec(text)) !== null) {
    const targetFile = match[1].trim();
    const inner = match[2];
    const instrMatch = inner.match(/<instructions>([\s\S]*?)<\/instructions>/);
    const updateMatch = inner.match(/<update>([\s\S]*?)<\/update>/);
    const instructions = instrMatch ? instrMatch[1].trim() : '';
    const update = updateMatch ? updateMatch[1].trim() : '';
    if (targetFile && update) {
      edits.push({ targetFile, instructions, update });
    }
  }
  return edits;
}

// Read a file from sandbox: prefers cache, then sandbox.files, then commands.run("cat ...")
async function readFileFromSandbox(sandbox: any, normalizedPath: string, fullPath: string): Promise<string> {
  // Try backend cache first
  if ((global as any).sandboxState?.fileCache?.files?.[normalizedPath]?.content) {
    return (global as any).sandboxState.fileCache.files[normalizedPath].content as string;
  }

  // Try E2B files API
  if (sandbox?.files?.read) {
    return await sandbox.files.read(fullPath);
  }

  // Try provider runCommand (preferred for provider pattern)
  if (typeof sandbox?.runCommand === 'function') {
    try {
      const res = await sandbox.runCommand(`cat ${normalizedPath}`);
      if (res && typeof res.stdout === 'string') {
        return res.stdout as string;
      }
    } catch {}
    // fallback to absolute path
    try {
      const resAbs = await sandbox.runCommand(`cat ${fullPath}`);
      if (resAbs && typeof resAbs.stdout === 'string') {
        return resAbs.stdout as string;
      }
    } catch {}
  }

  // Try shell cat via commands.run
  if (sandbox?.commands?.run) {
    const result = await sandbox.commands.run(`cat ${fullPath}`, { cwd: '/home/user/app', timeout: 30 });
    if (result?.exitCode === 0 && typeof result?.stdout === 'string') {
      return result.stdout as string;
    }
  }

  throw new Error(`Unable to read file: ${normalizedPath}`);
}

// Write a file to sandbox and update cache
async function writeFileToSandbox(sandbox: any, normalizedPath: string, fullPath: string, content: string): Promise<void> {
  // Provider pattern (writeFile)
  if (typeof sandbox?.writeFile === 'function') {
    await sandbox.writeFile(normalizedPath, content);
    return;
  }

  // Provider pattern (runCommand redirect)
  if (typeof sandbox?.runCommand === 'function') {
    // Ensure directory exists
    const dir = normalizedPath.includes('/') ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) : '';
    if (dir) {
      try { await sandbox.runCommand(`mkdir -p ${dir}`); } catch {}
    }
    // Write via heredoc with proper escaping
    const heredoc = `bash -lc 'cat > ${normalizedPath} <<\"EOF\"\n${content.replace(/\\/g, '\\\\').replace(/\n/g, '\n').replace(/\$/g, '\$')}\nEOF'`;
    const result = await sandbox.runCommand(heredoc);
    if (result?.stdout || result?.stderr) {
      // no-op
    }
    return;
  }

  // Prefer E2B files API
  if (sandbox?.files?.write) {
    await sandbox.files.write(fullPath, content);
  } else if (sandbox?.runCode) {
    // Use Python to write safely
    const escaped = content
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\"\"\"');
    await sandbox.runCode(`
import os
os.makedirs(os.path.dirname("${fullPath}"), exist_ok=True)
with open("${fullPath}", 'w') as f:
    f.write("""${escaped}""")
print("WROTE:${fullPath}")
    `);
  } else if (sandbox?.commands?.run) {
    // Shell redirection (fallback)
    // Note: beware of special chars; this is a last-resort path
    const result = await sandbox.commands.run(`bash -lc 'mkdir -p "$(dirname "${fullPath}")" && cat > "${fullPath}" << \EOF\n${content}\nEOF'`, { cwd: '/home/user/app', timeout: 60 });
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write file via shell: ${normalizedPath}`);
    }
  } else {
    throw new Error('No available method to write files to sandbox');
  }

  // Update backend cache if available
  if ((global as any).sandboxState?.fileCache) {
    (global as any).sandboxState.fileCache.files[normalizedPath] = {
      content,
      lastModified: Date.now()
    };
  }
  if ((global as any).existingFiles) {
    (global as any).existingFiles.add(normalizedPath);
  }
}

export async function applyMorphEditToFile(params: {
  sandbox: any;
  targetPath: string;
  instructions: string;
  updateSnippet: string;
}): Promise<MorphApplyResult> {
  try {
    if (!process.env.MORPH_API_KEY) {
      return { success: false, error: 'MORPH_API_KEY not set' };
    }

    const { normalizedPath, fullPath } = normalizeProjectPath(params.targetPath);

    // Read original code (existence validation happens here)
    const initialCode = await readFileFromSandbox(params.sandbox, normalizedPath, fullPath);

    const resp = await morphChatCompletionsCreate({
      model: 'morph-v3-large',
      messages: [
        {
          role: 'user',
          content: `<instruction>${params.instructions || ''}</instruction>\n<code>${initialCode}</code>\n<update>${params.updateSnippet}</update>`
        }
      ]
    });

    const mergedCode = (resp as any)?.choices?.[0]?.message?.content || '';
    if (!mergedCode) {
      return { success: false, error: 'Morph returned empty content', normalizedPath };
    }

    await writeFileToSandbox(params.sandbox, normalizedPath, fullPath, mergedCode);

    return { success: true, normalizedPath, mergedCode };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}


