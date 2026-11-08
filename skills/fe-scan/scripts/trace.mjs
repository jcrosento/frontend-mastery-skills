#!/usr/bin/env node
// Usage: node trace.mjs <url> [--cpu 4] [--down 1600] [--up 750] [--rtt 150]
// Throttled mobile CDP trace: long tasks with attribution, render-blocking resources, LCP element + request chain, CLS sources, third-party cost. Writes trace.json + bottleneck.md.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertRequestAllowed, installRequestGuard } from './network-policy.mjs';
import { writeArtifact } from './artifacts.mjs';

const url = process.argv[2];
if (!url) { console.error('Usage: node trace.mjs <url> [--cpu 4] [--down kbps] [--up kbps] [--rtt ms]'); process.exit(1); }
const opt = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const cpu = opt('cpu', 4), down = opt('down', 1600), up = opt('up', 750), rtt = opt('rtt', 150);
await assertRequestAllowed(url);
const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_'); const origin = new URL(url).origin;
const out = join('design', 'reports', 'scan', site, new Date().toISOString().slice(0, 10), 'trace'); mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
await installRequestGuard(ctx);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable'); await cdp.send('Performance.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: down * 1024 / 8, uploadThroughput: up * 1024 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

const reqs = new Map();
cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp, initiator: e.initiator?.url || e.initiator?.type, priority: e.request.initialPriority }));
cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.mime = e.response.mimeType; r.protocol = e.response.protocol; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker; r.ttfb = e.response.timing ? e.response.timing.receiveHeadersEnd : null; } });
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength; } });

await page.addInitScript(() => {
  window.__perf = { longTasks: [], cls: [], lcp: null, blocking: [] };
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration), attr: (e.attribution || []).map(a => `${a.containerType}:${a.containerSrc || a.containerName || ''}`).join(';') }))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__perf.cls.push({ value: +e.value.toFixed(4), start: Math.round(e.startTime), sources: (e.sources || []).map(s => s.node ? (s.node.tagName + (s.node.id ? '#' + s.node.id : '') + (s.node.className ? '.' + String(s.node.className).split(' ')[0] : '')) : '?') }); })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { const e = l.getEntries().pop(); if (e) window.__perf.lcp = { time: Math.round(e.startTime), size: e.size, url: e.url || null, el: e.element ? e.element.tagName + (e.element.id ? '#' + e.element.id : '') + (e.element.className ? '.' + String(e.element.className).split(' ')[0] : '') : null }; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.renderBlockingStatus === 'blocking') window.__perf.blocking.push({ url: e.name, dur: Math.round(e.duration), bytes: e.transferSize }); })).observe({ type: 'resource', buffered: true });
  } catch {}
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
await page.waitForTimeout(3000);
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transferKB: Math.round(n.transferSize / 1024) } : null; });
const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)])));
const perf = await page.evaluate(() => window.__perf);
const fonts = await page.evaluate(() => [...document.fonts].map(f => ({ family: f.family, weight: f.weight, status: f.status })));
const metrics = (await cdp.send('Performance.getMetrics')).metrics.reduce((a, m) => (a[m.name] = m.value, a), {});
await browser.close();

const list = [...reqs.values()].filter(r => r.end);
const tp = {}; for (const r of list) { let h; try { h = new URL(r.url).hostname; } catch { continue; } if (!r.url.startsWith(origin)) { tp[h] = tp[h] || { requests: 0, kb: 0 }; tp[h].requests++; tp[h].kb += Math.round((r.bytes || 0) / 1024); } }
const byType = {}; for (const r of list) { byType[r.type] = byType[r.type] || { n: 0, kb: 0 }; byType[r.type].n++; byType[r.type].kb += Math.round((r.bytes || 0) / 1024); }
const lcpReq = perf.lcp?.url ? list.find(r => r.url === perf.lcp.url) : null;
const tbt = perf.longTasks.reduce((a, t) => a + Math.max(0, t.dur - 50), 0);
const clsTotal = perf.cls.reduce((a, c) => a + c.value, 0);
const clsBySource = {}; for (const c of perf.cls) for (const s of c.sources) clsBySource[s] = +(((clsBySource[s] || 0) + c.value).toFixed(4));

const candidates = [];
if (nav && nav.ttfb > 800) candidates.push({ score: nav.ttfb, title: `Slow server response (TTFB ${nav.ttfb} ms)`, fix: 'Enable full-page cache / CDN, upgrade hosting or PHP, reduce plugins/queries, keep TTFB < 800 ms.' });
const blockKB = perf.blocking.reduce((a, b) => a + (b.bytes || 0), 0) / 1024; if (perf.blocking.length) candidates.push({ score: perf.blocking.length * 300 + blockKB * 5, title: `${perf.blocking.length} render-blocking resources (${Math.round(blockKB)} KB)`, fix: 'Inline critical CSS, defer non-critical CSS/JS, remove unused plugin assets on this template.' });
if (perf.lcp && perf.lcp.time > 2500) candidates.push({ score: perf.lcp.time, title: `LCP ${perf.lcp.time} ms on ${perf.lcp.el || 'unknown element'}${lcpReq ? ` (${Math.round((lcpReq.bytes || 0) / 1024)} KB, priority ${lcpReq.priority}, initiator ${lcpReq.initiator})` : ''}`, fix: lcpReq ? 'Preload the LCP image with fetchpriority=high, serve AVIF/WebP at rendered size, do not lazy-load it, remove any overlay/animation delaying paint.' : 'LCP is text: fix font loading (preload woff2, font-display swap) and render-blocking CSS.' });
if (tbt > 200) candidates.push({ score: tbt * 2, title: `Main-thread blocking ${Math.round(tbt)} ms TBT across ${perf.longTasks.length} long tasks`, fix: 'Defer/split heavy scripts; top attributions: ' + perf.longTasks.sort((a, b) => b.dur - a.dur).slice(0, 3).map(t => `${t.dur}ms ${t.attr || 'unknown'}`).join('; ') });
if (clsTotal > 0.1) candidates.push({ score: clsTotal * 10000, title: `CLS ${clsTotal.toFixed(3)}`, fix: 'Reserve space for: ' + Object.entries(clsBySource).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ') + '. Set width/height on images and embeds, font size-adjust fallback.' });
const tpKB = Object.values(tp).reduce((a, v) => a + v.kb, 0); if (tpKB > 300) candidates.push({ score: tpKB * 3, title: `Third parties ${tpKB} KB across ${Object.keys(tp).length} hosts`, fix: 'Load analytics/chat/maps after interaction or via Partytown; top hosts: ' + Object.entries(tp).sort((a, b) => b[1].kb - a[1].kb).slice(0, 3).map(([h, v]) => `${h} ${v.kb} KB`).join(', ') });
const imgKB = byType.Image ? byType.Image.kb : 0; if (imgKB > 1000) candidates.push({ score: imgKB, title: `Images ${imgKB} KB in ${byType.Image.n} requests`, fix: 'Convert to AVIF/WebP, size to rendered width, lazy-load below fold, cap 2560px uploads.' });
const jsKB = byType.Script ? byType.Script.kb : 0; if (jsKB > 400) candidates.push({ score: jsKB * 2, title: `JavaScript ${jsKB} KB in ${byType.Script.n} requests`, fix: 'Remove unused plugins/libraries, code-split, load builder/animation libs only on pages that use them.' });
candidates.sort((a, b) => b.score - a.score);

const summary = { url, conditions: { device: 'Pixel 7', cpuThrottle: cpu, downKbps: down, upKbps: up, rttMs: rtt }, nav, paint, lcp: perf.lcp, tbt: Math.round(tbt), longTasks: perf.longTasks.length, cls: +clsTotal.toFixed(3), clsBySource, renderBlocking: perf.blocking, byType, thirdParties: tp, fontsLoaded: fonts.length, jsHeapMB: metrics.JSHeapUsedSize ? +(metrics.JSHeapUsedSize / 1048576).toFixed(1) : null, domNodes: metrics.Nodes, biggestBottleneck: candidates[0] || { title: 'No major bottleneck under these conditions' }, fixes: candidates };
writeArtifact(join(out, 'trace.json'), { summary, requests: list });
const md = [`# Bottleneck: ${url}`, '', `Conditions: Pixel 7, CPU x${cpu}, ${down}/${up} kbps, RTT ${rtt} ms`, '', `## Biggest bottleneck`, `**${summary.biggestBottleneck.title}**`, summary.biggestBottleneck.fix ? `Fix: ${summary.biggestBottleneck.fix}` : '', '', '## Ranked fixes', ...candidates.map((c, i) => `${i + 1}. ${c.title}\n   - ${c.fix}`), '', '## Numbers', '```json', JSON.stringify({ nav, paint, lcp: perf.lcp, tbt: summary.tbt, cls: summary.cls, byType, thirdParties: tp, domNodes: summary.domNodes, jsHeapMB: summary.jsHeapMB }, null, 2), '```'].join('\n');
writeArtifact(join(out, 'bottleneck.md'), md);
console.log(JSON.stringify({ biggestBottleneck: summary.biggestBottleneck.title, lcp: perf.lcp?.time, tbt: summary.tbt, cls: summary.cls, ttfb: nav?.ttfb, fixes: candidates.length }, null, 2));
console.log(`\nWrote ${out}/bottleneck.md`);
