import { isBase64 } from '@/lib/security/base64';
import { assertNoSecrets } from '@/lib/security/secret-content';
import { zipSync } from 'fflate';

const MAX_TOTAL = 8 * 1024 * 1024;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_FILES = 500;
const PRIVATE_PART = /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git|\.ssh|\.aws|\.azure|\.config|\.docker|credentials(?:\.json)?|secrets(?:\.json)?|id_rsa|id_ed25519)$/i;

function permittedPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\\\p{Cc}]/u.test(path) || path.startsWith('/') || /^[a-z]:/i.test(path)) return false;
  const parts = path.split('/');
  return parts.every(part => part && part !== '.' && part !== '..' && !PRIVATE_PART.test(part)) && !/\.(?:pem|key|p12|pfx|log)$/i.test(path);
}

/** Source runs inside the sandbox, never in the control-plane filesystem. */
export function createExportScript(root: string): string {
  return `
import { lstat, readdir, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, sep, join } from 'node:path';
const root = await realpath(${JSON.stringify(root)});
const files = [];
const excluded = [];
let total = 0;
let visited = 0;
const skip = /^(?:node_modules|\\.git|\\.next|dist|build|\\.env(?:\\..*)?|\\.npmrc|\\.netrc|\\.ssh|\\.aws|\\.azure|\\.config|\\.docker|credentials(?:\\.json)?|secrets(?:\\.json)?|id_rsa|id_ed25519)$/i;
async function walk(directory) {
  for (const item of await readdir(directory, {withFileTypes:true})) {
    if (++visited > 5000) throw new Error('Project contains too many entries');
    const path = join(directory,item.name);
    const name = relative(root,path).split(sep).join('/');
    if(skip.test(item.name) || /\\.(pem|key|p12|pfx|log)$/i.test(item.name) || item.isSymbolicLink()) { if (excluded.length < 500) excluded.push(name); continue; }
    const canonical = await realpath(path);
    if (canonical !== root && !canonical.startsWith(root + sep)) throw new Error('Export path escaped project root');
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) { excluded.push(name); continue; }
    if (stat.isDirectory()) { await walk(path); continue; }
    if (!stat.isFile()) continue;
    if(files.length >= ${MAX_FILES} || stat.size > ${MAX_FILE} || total + stat.size > ${MAX_TOTAL}) throw new Error('Project exceeds export limits');
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const current = await file.stat();
      if (!current.isFile() || current.size > ${MAX_FILE}) throw new Error('Export file changed');
      const buffer = Buffer.alloc(current.size + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await file.read(buffer, size, buffer.length - size, size);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      if (size > current.size) throw new Error('Export file changed during read');
      total += size;
      if (total > ${MAX_TOTAL}) throw new Error('Project exceeds export limit');
      files.push({path:name,base64:buffer.subarray(0,size).toString('base64')});
    } finally { await file.close(); }
  }
}
await walk(root);
console.log(JSON.stringify({files,excluded}));
`;
}

export function zipExportManifest(raw: string): { bytes: Uint8Array; excludedCount: number } {
  if (raw.length > 14 * 1024 * 1024) throw new Error('Export response exceeds limit');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) throw new Error('Invalid export manifest');
  const entries: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const file of manifest.files) {
    if (!permittedPath(file.path) || Object.hasOwn(entries,file.path) || typeof file.base64 !== 'string' || !isBase64(file.base64)) throw new Error('Unsafe export entry');
    const bytes = Buffer.from(file.base64,'base64');
    total += bytes.length;
    if (bytes.length > MAX_FILE || total > MAX_TOTAL) throw new Error('Export exceeds size limit');
    assertNoSecrets(bytes.toString('utf8'));
    entries[file.path] = bytes;
  }
  return { bytes:zipSync(entries,{level:3}), excludedCount:Array.isArray(manifest.excluded) ? manifest.excluded.length : 0 };
}
