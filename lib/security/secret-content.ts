/** Credential checks adapted from Ollama Classe A+ internal/agent/secrets.go.
 * Copyright (c) Ollama. MIT; see THIRD_PARTY_NOTICES.md.
 * Heuristic defense, not a guarantee of complete secret detection.
 */
const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['private_key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g],
  ['github_token', /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ['provider_token', /\b(?:sk-|xai-)[A-Za-z0-9_-]{20,}\b/g],
  ['aws_access_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g],
  ['bearer_token', /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ['credential_assignment', /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*["']?\s*[:=]\s*["'][A-Za-z0-9._~+/=-]{12,}["']/gi],
];
const SENSITIVE_KEY = /^(?:authorization|cookie|set-cookie|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret)$/i;

export class SecretContentError extends Error {
  readonly code = 'SECRET_CONTENT_BLOCKED';
  readonly status = 422;
  constructor(readonly kinds: string[]) {
    super(`Possible credential content blocked (${kinds.join(', ')}). Remove secrets from project content and configure credentials on the server.`);
    this.name = 'SecretContentError';
  }
}
export function scanSecretContent(text: string): string[] {
  return PATTERNS.filter(([, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }).map(([kind]) => kind);
}

export function redactSecretText(text: string): string {
  return PATTERNS.reduce((result, [, pattern]) => {
    pattern.lastIndex = 0;
    return result.replace(pattern, '[REDACTED]');
  }, text);
}

export function assertNoSecrets(value: unknown): void {
  const found = new Set<string>();
  const seen = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    if (depth > 40) throw new Error('Content nesting exceeds safety limit');
    if (typeof item === 'string') {
      for (const kind of scanSecretContent(item)) found.add(kind);
    } else if (item && typeof item === 'object' && !seen.has(item)) {
      seen.add(item);
      for (const [key, child] of Object.entries(item)) {
        if (SENSITIVE_KEY.test(key) && typeof child === 'string' && child.length >= 12) found.add('credential_field');
        visit(child, depth + 1);
      }
    }
  }
  visit(value, 0);
  if (found.size) throw new SecretContentError([...found].sort());
}

export function redactSecretValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  function visit(item: unknown, depth: number): unknown {
    if (typeof item === 'string') return redactSecretText(item);
    if (depth > 20) return '[DEPTH_LIMIT]';
    if (item instanceof Error) return { name: item.name, message: redactSecretText(item.message) };
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) return '[CIRCULAR]';
    seen.add(item);
    if (item instanceof Uint8Array) return '[BINARY]';
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : visit(child, depth + 1)]));
  }
  return visit(value, 0);
}

export const safeLogger = Object.fromEntries(
  (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => [level,
    (...args: unknown[]) => globalThis.console[level](...args.map(redactSecretValue))]),
) as Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>;
