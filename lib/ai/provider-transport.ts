import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as httpFetch } from 'undici';
import { prepareProviderBody } from '@/lib/security/provider-content';

const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
  ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24],
  ['192.168.0.0',16], ['192.88.99.0',24], ['198.18.0.0',15], ['198.51.100.0',24],
  ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4],
] as const) denied.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::',3,'ipv6');
for (const [address,prefix] of [['2001:db8::',32],['2002::',16],['2001::',32]] as const) denied.addSubnet(address,prefix,'ipv6');

export function isPublicProviderIP(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !denied.check(address,'ipv4') :
    family === 6 && globalV6.check(address,'ipv6') && !denied.check(address,'ipv6');
}
const LOOPBACK = new Set(['localhost','127.0.0.1','[::1]']);
export function validateProviderURL(raw: string, allowLoopback = false): URL {
  if (!raw || /[\s\\]/.test(raw)) throw new Error('Invalid provider URL');
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) throw new Error('Provider URL must not contain credentials, query or fragment');
  const local = LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && allowLoopback)) throw new Error('Provider requires HTTPS or explicitly configured loopback HTTP');
  const ip = url.hostname.replace(/^\[|\]$/g,'');
  if (local && !allowLoopback) throw new Error('Loopback provider must be explicitly configured');
  if (isIP(ip) && !local && !isPublicProviderIP(ip)) throw new Error('Private provider addresses are not permitted');
  url.pathname = url.pathname.replace(/\/+$/,'');
  return url;
}

/** DNS answers are validated in the actual connection lookup, not a separate preflight. */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, {all:true}, (error, addresses) => {
    if (error) return callback(error, '', 4);
    if (!addresses.length || addresses.some(item => !isPublicProviderIP(item.address))) {
      const failure = Object.assign(new Error('Provider DNS resolved to a prohibited address'), {code:'EACCES'});
      return callback(failure, '', 4);
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

export const loopbackLookup: LookupFunction = (_hostname, options, callback) => {
  // Do not allow a hosts-file or DNS rewrite of localhost to leave loopback.
  if (options.all) callback(null, [{address:'127.0.0.1',family:4}]);
  else callback(null, '127.0.0.1', 4);
};

export function createProviderFetch(baseURL: string, options: {allowLoopback?: boolean; timeoutMs?: number; maxDurationMs?: number; maxBytes?: number} = {}): typeof fetch {
  const base = validateProviderURL(baseURL, options.allowLoopback);
  const timeoutMs = options.timeoutMs ?? 180000;
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== base.origin || !(url.pathname === base.pathname || url.pathname.startsWith(base.pathname.replace(/\/$/,'') + '/')) || url.username || url.password) {
      throw new Error('Provider request escaped its configured origin or path');
    }
    if (input instanceof Request) throw new Error('Provider transport requires explicit request options');
    let requestBody:string|undefined;
    if (init?.body != null) {
      if (typeof init.body !== 'string') throw new Error('Provider transport only accepts JSON request bodies');
      if (Buffer.byteLength(init.body) > 12 * 1024 * 1024) throw new Error('Provider request exceeds byte limit');
      requestBody=await prepareProviderBody(init.body);
    }
    const local = LOOPBACK.has(base.hostname);
    const dispatcher = new Agent({connect: {timeout:10000, lookup:local ? loopbackLookup : publicLookup}});
    // The idle budget resets on each chunk. A separate hard ceiling still bounds the whole call.
    const idle = new AbortController();
    let idleTimer:ReturnType<typeof setTimeout>|undefined;
    const touch = () => {
      clearTimeout(idleTimer);
      idleTimer=setTimeout(()=>idle.abort(new Error('Provider idle timeout')),timeoutMs);
      idleTimer.unref();
    };
    touch();
    const signals = [idle.signal,AbortSignal.timeout(options.maxDurationMs ?? 900000)];
    if (init?.signal) signals.push(init.signal);
    try {
      const upstream = await httpFetch(url, {
        method:init?.method ?? 'GET', headers: new Headers(init?.headers), body: requestBody,
        signal:AbortSignal.any(signals), redirect:'error', dispatcher,
      });
      touch();
      const headers = new Headers(Array.from(upstream.headers.entries()));
      headers.delete('content-encoding');
      headers.delete('content-length');
      if (!upstream.body) {
        clearTimeout(idleTimer);
        await dispatcher.close();
        return new Response(null,{status:upstream.status,headers});
      }
      const reader = upstream.body.getReader();
      let bytes = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {clearTimeout(idleTimer);controller.close(); await dispatcher.close(); return;}
            touch();
            bytes += next.value.byteLength;
            if (bytes > maxBytes) throw new Error('Provider response exceeds byte limit');
            controller.enqueue(next.value);
          } catch {
            clearTimeout(idleTimer);
            controller.error(new Error('Provider stream failed or exceeded its limits'));
            await reader.cancel().catch(() => undefined);
            await dispatcher.destroy();
          }
        },
        async cancel(reason) {
          clearTimeout(idleTimer);
          await reader.cancel(reason).catch(() => undefined);
          await dispatcher.destroy();
        },
      });
      return new Response(body, {status:upstream.status,statusText:upstream.statusText,headers});
    } catch (error) {
      clearTimeout(idleTimer);
      await dispatcher.destroy();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new Error('Provider connection failed. Check server URL, credentials, TLS and network policy.');
    }
  };
}
