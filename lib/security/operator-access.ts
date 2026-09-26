/** Single-operator access control. This is not user/tenant authorization. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function deny(status: number, error: string, challenge = false): Response {
  return Response.json({ success: false, error }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Authorization',
      ...(challenge ? { 'WWW-Authenticate': 'Basic realm="Open Lovable", charset="UTF-8"' } : {}),
    },
  });
}

export function getTrustedAppOrigin(request: Request): string {
  const configured = process.env.OPEN_LOVABLE_APP_ORIGIN;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('OPEN_LOVABLE_APP_ORIGIN must be configured in production');
  }
  const suppliedHost = request.headers.get('host') || new URL(request.url).host;
  const url = new URL(configured || `http://${suppliedHost}`);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('App origin must be an origin without a path or credentials');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) {
    throw new Error('HTTPS is required except for loopback development');
  }
  if (!configured && !LOOPBACK.has(url.hostname)) {
    throw new Error('Unconfigured development servers are loopback-only');
  }
  if (suppliedHost.toLowerCase() !== url.host.toLowerCase()) {
    throw new Error('Request host does not match the configured app origin');
  }
  return url.origin;
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([left, right].map(async value =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))));
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function authorizeOperatorRequest(request: Request): Promise<Response | null> {
  const mode=process.env.OPEN_LOVABLE_AUTH_MODE||'individual';
  if(mode!=='individual')return deny(mode==='supabase'?403:503,'This operation is restricted to the isolated individual profile.');
  const password = process.env.OPEN_LOVABLE_PASSWORD;
  const username = process.env.OPEN_LOVABLE_USERNAME || 'admin';
  const production = process.env.NODE_ENV === 'production';
  if ((production && !password) || (password && (password.length < 32 || password.length > 512)) ||
      username.includes(':') || username.length > 128) {
    return deny(503, 'Configure a single-operator password of at least 32 characters before starting this deployment.');
  }
  let origin: string;
  try {
    origin = getTrustedAppOrigin(request);
  } catch {
    return deny(503, 'Application origin is missing, insecure, or does not match this request.');
  }
  const requestOrigin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (requestOrigin && requestOrigin !== origin)) {
    return deny(403, 'Cross-origin requests are not permitted.');
  }
  // npm run dev binds to 127.0.0.1; do not expose an unconfigured dev server through a proxy.
  if (!password) {
    if (!LOOPBACK.has(new URL(origin).hostname)) return deny(503, 'Public origins require operator credentials, including in development.');
    return null;
  }
  const authorization = request.headers.get('authorization') || '';
  if (!/^Basic /i.test(authorization) || authorization.length > 2048) {
    return deny(401, 'Operator authentication required.', true);
  }
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  const expected = btoa(String.fromCharCode(...bytes));
  if (!(await constantTimeEqual(authorization.slice(6), expected))) {
    return deny(401, 'Invalid operator credentials.', true);
  }
  return null;
}
