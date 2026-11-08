import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const IPV4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
];
const ipv4Int = value => value.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
const inV4Range = (value, network, bits) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Int(value) & mask) === (ipv4Int(network) & mask);
};
function parseV6(value) {
  let address = value.toLowerCase().split('%')[0];
  if (address.includes('.')) {
    const i = address.lastIndexOf(':'); const tail = address.slice(i + 1);
    if (isIP(tail) !== 4) return null;
    const n = ipv4Int(tail); address = `${address.slice(0, i)}:${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right].map(x => Number.parseInt(x || '0', 16));
  return groups.length === 8 && groups.every(x => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? groups : null;
}
export function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) return !IPV4_BLOCKED.some(([network, bits]) => inV4Range(address, network, bits));
  if (version !== 6) return false;
  const g = parseV6(address);
  if (!g) return false;
  // Permit only global-unicast 2000::/3, excluding special/documentation and transition blocks.
  const globalUnicast = (g[0] & 0xe000) === 0x2000;
  if (!globalUnicast) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0x0000 || g[1] === 0x0010 || g[1] === 0x0020)) return false;
  if (g[0] === 0x2002) return false; // 6to4 may tunnel private IPv4 destinations.
  return true;
}
const isFixtureLoopback = host => host === '127.0.0.1' || host === '::1';

export async function assertRequestAllowed(rawUrl, method = 'GET', { allowLoopbackFixture = false, lookup = dnsLookup } = {}) {
  const verb = String(method).toUpperCase();
  if (!['GET', 'HEAD'].includes(verb)) throw new Error(`blocked HTTP method: ${verb}`);
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('blocked invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`blocked URL scheme: ${url.protocol}`);
  if (url.username || url.password) throw new Error('blocked URL credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('blocked local hostname');
  }
  if (isIP(host)) {
    if (allowLoopbackFixture && isFixtureLoopback(host)) return true;
    if (!isPublicAddress(host)) throw new Error(`blocked non-public IP address: ${host}`);
    return true;
  }
  let records;
  try { records = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new Error(`blocked unresolved host: ${host}`); }
  if (!records.length || records.some(record => !isPublicAddress(record.address))) {
    throw new Error(`blocked host resolving to a non-public IP: ${host}`);
  }
  return true;
}

export async function safeFetch(rawUrl, options = {}) {
  const { allowLoopbackFixture = false, maxRedirects = 5, ...init } = options;
  const method = String(init.method || 'GET').toUpperCase();
  let target = rawUrl;
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    await assertRequestAllowed(target, method, { allowLoopbackFixture });
    const response = await fetch(target, { ...init, method, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    if (redirect === maxRedirects) throw new Error('blocked redirect limit exceeded');
    target = new URL(location, target).href;
    if (response.status === 303) throw new Error('blocked method-changing redirect');
  }
  throw new Error('blocked redirect loop');
}

export async function installRequestGuard(context, { allowLoopbackFixture = false, blocked = [], beforeContinue } = {}) {
  await context.route('**/*', async route => {
    const request = route.request();
    try {
      await assertRequestAllowed(request.url(), request.method(), { allowLoopbackFixture });
      if (beforeContinue && await beforeContinue(route) === false) {
        blocked.push({ url: request.url(), method: request.method(), reason: 'blocked by scan navigation policy' });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    } catch (error) {
      blocked.push({ url: request.url(), method: request.method(), reason: String(error.message || error) });
      await route.abort('blockedbyclient');
    }
  });
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', socket => {
      blocked.push({ url: socket.url(), method: 'WEBSOCKET', reason: 'blocked non-HTTP side channel' });
      socket.close({ code: 1008, reason: 'read-only scan blocks WebSocket' });
    });
  }
}
