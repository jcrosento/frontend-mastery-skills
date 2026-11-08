import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { assertRequestAllowed, isPublicAddress, safeFetch } from '../skills/fe-scan/scripts/network-policy.mjs';

test('network policy rejects non-public IPv4/IPv6 and only permits explicit fixture loopback', async () => {
  for (const ip of ['0.1.2.3', '10.1.2.3', '100.64.1.2', '127.0.0.2', '169.254.169.254', '172.20.0.1', '192.168.1.4', '198.18.0.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::1']) {
    assert.equal(isPublicAddress(ip), false, `${ip} must not be public`);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(assertRequestAllowed('http://127.0.0.1/'), /non-public/);
  assert.equal(await assertRequestAllowed('http://127.0.0.1/', 'GET', { allowLoopbackFixture: true }), true);
  await assert.rejects(assertRequestAllowed('http://127.0.0.2/', 'GET', { allowLoopbackFixture: true }), /non-public/);
  await assert.rejects(assertRequestAllowed('http://localhost/'), /local hostname/);
  await assert.rejects(assertRequestAllowed('https://public.example/', 'POST'), /HTTP method/);
  await assert.rejects(assertRequestAllowed('https://user:pass@public.example/'), /credentials/);
  await assert.rejects(assertRequestAllowed('https://rebinding.example/', 'GET', { lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.8', family: 4 }] }), /non-public IP/);
  assert.equal(await assertRequestAllowed('https://public.example/', 'GET', { lookup: async () => [{ address: '93.184.216.34', family: 4 }] }), true);
});

test('safeFetch checks every redirect target and blocks writes before network contact', async () => {
  let redirectHits = 0, privateHits = 0, postHits = 0;
  const server = createServer((req, res) => {
    if (req.url === '/redirect') { redirectHits++; res.writeHead(302, { location: `http://127.0.0.2:${server.address().port}/private-final` }); return res.end(); }
    if (req.url === '/private-final') privateHits++;
    if (req.method === 'POST') postHits++;
    res.writeHead(200); res.end('ok');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(safeFetch(`${base}/redirect`, { allowLoopbackFixture: true }), /non-public/);
    await assert.rejects(safeFetch(`${base}/write`, { method: 'POST', allowLoopbackFixture: true }), /HTTP method/);
    assert.equal(redirectHits, 1);
    assert.equal(privateHits, 0, 'the redirect destination must not be contacted');
    assert.equal(postHits, 0, 'non-GET/HEAD must be rejected before the request');
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});
