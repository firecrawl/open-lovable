/** Validates padded base64 without a repeated group that can exhaust V8's regexp stack.
 * Callers must enforce their own encoded and decoded byte budgets before allocation.
 */
export function isBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const content = padding ? value.slice(0, -padding) : value;
  return !/[^A-Za-z0-9+/]/.test(content);
}
