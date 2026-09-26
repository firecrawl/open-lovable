import { assertNoSecrets, redactSecretText, SecretContentError } from './secret-content';

export class ClientInputError extends Error {
  constructor(message: string) { super(message); this.name = 'ClientInputError'; }
}

export async function readJsonObject(request: Request, maxBytes = 2 * 1024 * 1024, scanSecrets = true): Promise<Record<string, any>> {
  const reader = request.body?.getReader();
  if (!reader) throw new ClientInputError('A JSON request body is required');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ClientInputError('Request body exceeds the allowed size');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not an object');
    if (scanSecrets) assertNoSecrets(data);
    return data;
  } catch (error) {
    if (error instanceof SecretContentError) throw new ClientInputError(error.message);
    throw new ClientInputError('Request body must be a valid JSON object');
  }
}

export function validateCommand(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 16_384 || value.includes('\0')) {
    throw new ClientInputError('Command must be a nonempty string of at most 16384 characters');
  }
  return value.trim();
}

export function validatePackages(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new ClientInputError('Packages must be an array of at most 100 entries');
  const spec = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@(?:[~^]?[a-z0-9][a-z0-9.+_~-]*|\*))?$/i;
  const packages = value.map(item => {
    if (typeof item !== 'string' || item.length > 256 || !spec.test(item)) {
      throw new ClientInputError('Only npm registry package names with optional versions or tags are allowed');
    }
    return item;
  });
  return [...new Set(packages)];
}

export function quoteShellArgument(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function normalizeProjectPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\\:%\p{Cc}]/u.test(value)) {
    throw new ClientInputError('Invalid project file path');
  }
  const path = value.replace(/^\/(?:home\/user\/app|vercel\/sandbox|app)\//, '').replace(/^\.\//, '');
  const segments = path.split('/');
  if (segments.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git') ||
      path.startsWith('/') || !/^[a-z0-9_./ ()\[\]@+-]+$/i.test(path)) {
    throw new ClientInputError('File path must remain inside the project');
  }
  if (segments.some(part => /^\.env(?:\.|$)/i.test(part) && part !== '.env.example') ||
      segments.some(part => ['.npmrc', '.ssh', '.aws'].includes(part.toLowerCase()))) {
    throw new ClientInputError('Secret files cannot be overwritten by generated changes');
  }
  return path;
}

export function assertCompleteFileBlocks(response: unknown): asserts response is string {
  if (typeof response !== 'string' || !response.trim() || response.length > 2 * 1024 * 1024) {
    throw new ClientInputError('Generated response must be nonempty and within the size limit');
  }
  const openingCount = [...response.matchAll(/<file\s+path\s*=/g)].length;
  const completeOpeningCount = [...response.matchAll(/<file\s+path="[^"]*"\s*>/g)].length;
  if (openingCount !== completeOpeningCount) throw new ClientInputError('Incomplete generated file tag');
  let open = false;
  const tags = response.matchAll(/<file\s+path="[^"]*"\s*>|<\/file\s*>/g);
  for (const [tag] of tags) {
    if (tag.startsWith('</')) {
      if (!open) throw new ClientInputError('Unexpected closing file tag');
      open = false;
    } else {
      if (open) throw new ClientInputError('Incomplete generated file block; no files were applied');
      open = true;
    }
  }
  if (open) throw new ClientInputError('Incomplete generated file block; no files were applied');
}

export function validateGeneratedFiles(files: Array<{ path: string; content: string }>): void {
  if (files.length > 200) throw new ClientInputError('Too many generated files');
  for (const file of files) {
    assertNoSecrets(file.content);
    file.path = normalizeProjectPath(file.path);
    if (typeof file.content !== 'string' || new TextEncoder().encode(file.content).length > 1024 * 1024) {
      throw new ClientInputError('Generated file exceeds the size limit');
    }
  }
}

/**
 * Message safe to return to a client: validation errors are shown verbatim,
 * anything else is passed through secret redaction so provider keys, tokens
 * or connection strings embedded in upstream errors never reach the response.
 */
export function publicErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof ClientInputError) return error.message;
  const message = error instanceof Error ? error.message : '';
  return message ? redactSecretText(message).slice(0, 2_000) : fallback;
}

export function requireHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_048) throw new ClientInputError('URL must be an http(s) address');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new ClientInputError('URL must be an http(s) address'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new ClientInputError('URL must be an http(s) address');
  return parsed.toString();
}
