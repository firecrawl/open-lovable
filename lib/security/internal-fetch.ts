import { getTrustedAppOrigin } from './operator-access';

/** Forward credentials only to this configured app, never to a request-controlled host or redirect. */
export function fetchApplication(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  if (!/^\/api\/[a-z0-9-]+$/.test(path)) throw new Error('Invalid internal API path');
  const origin = getTrustedAppOrigin(request);
  const headers = new Headers(init.headers);
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  headers.set('origin', origin);
  return fetch(new URL(path, origin), {
    ...init,
    headers,
    redirect: 'error',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
  });
}
