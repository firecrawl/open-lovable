import { quoteShellArgument } from '@/lib/security/input-validation';
import type { SandboxProvider } from './types';

export interface SandboxDiagnostics {
  success: boolean;
  status: 'responding' | 'errors' | 'unavailable';
  hasErrors: boolean | null;
  errors: Array<{ type: string; message: string }>;
  httpStatus: number | null;
  isRendering: null;
  validation: 'http-and-logs';
  checkedAt: string;
}

// Run inside the sandbox. Fixed loopback address; never fetch a user-provided URL from the host.
const probeScript = String.raw`
import { open } from 'node:fs/promises';
let log = '';
try {
  const file = await open('/tmp/vite.log', 'r');
  try {
    const stat = await file.stat();
    const bytes = Buffer.alloc(Math.min(stat.size, 65536));
    const read = await file.read(bytes, 0, bytes.length, Math.max(0, stat.size - bytes.length));
    log = bytes.subarray(0, read.bytesRead).toString('utf8');
  } finally { await file.close(); }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let httpStatus = null;
let connectionError = null;
try {
  const response = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(5000), redirect: 'error' });
  httpStatus = response.status;
  await response.body?.cancel();
} catch { connectionError = 'Preview HTTP endpoint is not responding'; }
const errors = log.split(/\r?\n/).filter(line => /failed to resolve import|internal server error|error when starting|syntaxerror|\[vite\].*error/i.test(line)).slice(-20).map(message => ({type:'vite-log',message:message.slice(0,1000)}));
if (connectionError) errors.push({type:'connection',message:connectionError});
console.log(JSON.stringify({httpStatus,errors}));
`;

export function unavailableDiagnostics(message: string): SandboxDiagnostics {
  return { success: false, status: 'unavailable', hasErrors: null,
    errors: [{type:'diagnostic',message}], httpStatus:null, isRendering:null,
    validation:'http-and-logs', checkedAt:new Date().toISOString() };
}

export async function inspectSandbox(provider: Pick<SandboxProvider, 'runCommand'>): Promise<SandboxDiagnostics> {
  const result = await provider.runCommand(`node --input-type=module -e ${quoteShellArgument(probeScript)}`);
  if (!result.success || result.exitCode !== 0) return unavailableDiagnostics('Unable to execute sandbox diagnostics');
  let payload: { httpStatus: number | null; errors: Array<{type:string;message:string}> };
  try {
    if (result.stdout.length > 65536) throw new Error('Oversized diagnostics');
    payload = JSON.parse(result.stdout.trim());
    if (!Array.isArray(payload.errors) || payload.errors.length > 21 ||
        payload.errors.some(error => typeof error.message !== 'string' || typeof error.type !== 'string') ||
        !(payload.httpStatus === null || (Number.isInteger(payload.httpStatus) && payload.httpStatus >= 100 && payload.httpStatus <= 599))) {
      throw new Error('Invalid diagnostics');
    }
  } catch { return unavailableDiagnostics('Sandbox diagnostics returned invalid output'); }
  const responding = payload.httpStatus !== null && payload.httpStatus >= 200 && payload.httpStatus < 400;
  return { success: responding && payload.errors.length === 0,
    status: !responding ? 'unavailable' : payload.errors.length ? 'errors' : 'responding',
    hasErrors: !responding ? null : payload.errors.length > 0,
    errors: payload.errors, httpStatus:payload.httpStatus, isRendering:null,
    validation:'http-and-logs', checkedAt:new Date().toISOString() };
}
