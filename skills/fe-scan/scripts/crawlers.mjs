#!/usr/bin/env node
// Usage: node crawlers.mjs <url>   |   node crawlers.mjs --selftest
// Bot-access matrix: fetch /, /robots.txt, /sitemap.xml as Googlebot, Bingbot, GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended, curl, Chrome.
// Detects Cloudflare/WAF challenges and robots.txt disallows per bot. Network required except for --selftest.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UAS = {
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  Bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Google-Extended': 'Mozilla/5.0 (compatible; Google-Extended)',
  curl: 'curl/8.4.0',
  Chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
};
export const PATHS = ['/', '/robots.txt', '/sitemap.xml'];
export const isChallenge = (status, headers, body) => status === 403 || status === 429 || status === 503 || (headers && headers.get && headers.get('cf-mitigated') === 'challenge') || /just a moment|attention required|cf-chl|checking your browser|access denied|enable javascript and cookies/i.test((body || '').slice(0, 4000));
export function parseRobots(txt) { const groups = {}; let cur = []; for (const raw of (txt || '').split(/\r?\n/)) { const line = raw.replace(/#.*$/, '').trim(); if (!line) continue; const ua = line.match(/^user-agent:\s*(.+)$/i); if (ua) { const name = ua[1].trim().toLowerCase(); groups[name] = groups[name] || []; cur = [...(cur.length && cur.every(c => groups[c].length === 0) ? cur : []), name]; continue; } const d = line.match(/^disallow:\s*(\S*)/i); if (d) { for (const g of cur) groups[g].push(d[1] || '(none)'); } const a = line.match(/^allow:\s*(\S*)/i); if (a) { for (const g of cur) groups[g].push('ALLOW ' + a[1]); } } return groups; }
export const ruleFor = (groups, bot) => { const k = Object.keys(groups).find(g => g === bot.toLowerCase()) || (groups['*'] ? '*' : null); const dis = k ? groups[k].filter(x => !x.startsWith('ALLOW')) : []; return { group: k, disallow: dis, blockedAll: dis.includes('/') }; };
export function buildIssues(rows, robotsTxt) { const issues = []; for (const r of rows) { const blocked = [r.home, r.robots, r.sitemap].filter(x => x && (x.challenged || x.status >= 400 || x.status === 0)).length; if (blocked && r.bot !== 'curl') issues.push(`${r.bot}: ${blocked}/3 paths blocked or challenged (home ${r.home.status}${r.home.challenged ? ' challenge' : ''}, robots ${r.robots.status}, sitemap ${r.sitemap.status})`); if (r.robotsRule.blockedAll) issues.push(`${r.bot}: robots.txt disallows everything`); } if (!robotsTxt) issues.push('robots.txt not readable even as Chrome'); return issues; }

async function run(url) {
  const origin = new URL(url).origin; const site = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const stamp = process.env.FE_SCAN_STAMP || new Date().toISOString().slice(0, 10);
  const out = join('design', 'reports', 'scan', site, stamp); mkdirSync(out, { recursive: true });
  const matrix = {}; let robotsTxt = '';
  for (const [bot, ua] of Object.entries(UAS)) { matrix[bot] = {}; for (const p of PATHS) { try { const r = await fetch(origin + p, { headers: { 'user-agent': ua, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow' }); const body = await r.text(); matrix[bot][p] = { status: r.status, challenged: isChallenge(r.status, r.headers, body), server: r.headers.get('server') || '', cfRay: !!r.headers.get('cf-ray'), bytes: body.length }; if (bot === 'Chrome' && p === '/robots.txt' && r.status === 200) robotsTxt = body; } catch (e) { matrix[bot][p] = { status: 0, error: e.message.slice(0, 80) }; } } }
  const groups = parseRobots(robotsTxt);
  const rows = Object.keys(UAS).map(bot => ({ bot, home: matrix[bot]['/'], robots: matrix[bot]['/robots.txt'], sitemap: matrix[bot]['/sitemap.xml'], robotsRule: ruleFor(groups, bot) }));
  const issues = buildIssues(rows, robotsTxt);
  const report = { url, stamp, cloudflare: rows.some(r => r.home && r.home.cfRay), issues, rows };
  writeFileSync(join(out, 'crawlers.json'), JSON.stringify(report, null, 2));
  const c = x => x ? `${x.status}${x.challenged ? ' CHALLENGE' : ''}${x.error ? ' ERR' : ''}` : '-';
  const md = [`# Crawler access: ${url}`, '', `Cloudflare detected: ${report.cloudflare}`, '', '## Issues', ...(issues.length ? issues.map(i => '- ' + i) : ['- none: all bots get 200 on /, robots.txt and sitemap.xml']), '', '## Matrix', '| bot | / | robots.txt | sitemap.xml | robots.txt rule |', '|---|---|---|---|---|', ...rows.map(r => `| ${r.bot} | ${c(r.home)} | ${c(r.robots)} | ${c(r.sitemap)} | ${r.robotsRule.group ? `${r.robotsRule.group}: ${r.robotsRule.disallow.slice(0, 4).join(' ') || 'allow all'}` : 'no rule'} |`), '', '## How to fix (Cloudflare)', '- Bot Fight Mode cannot be scoped; prefer a WAF custom rule that Skips challenges when `cf.verified_bot_category in {"Search Engine Crawler" "AI Crawler" "AI Assistant" "AI Search"}`.', '- Add a Skip rule for `http.request.uri.path eq "/robots.txt" or starts_with(http.request.uri.path, "/sitemap")`.', '- To block AI training but allow AI search citations: disallow GPTBot, ClaudeBot, Google-Extended in robots.txt; allow OAI-SearchBot and PerplexityBot.'].join('\n');
  writeFileSync(join(out, 'crawlers.md'), md);
  console.log(JSON.stringify({ cloudflare: report.cloudflare, issues }, null, 2)); console.log(`\nWrote ${out}/crawlers.md`);
}

if (process.argv.includes('--selftest')) {
  const robots = `# comment\nUser-agent: *\nDisallow: /ops/\nDisallow: /assets/js/booking.js\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nAllow: /\n`;
  const g = parseRobots(robots);
  const hdr = v => ({ get: k => (k === 'cf-mitigated' ? v : null) });
  const rows = [
    { bot: 'Googlebot', home: { status: 200 }, robots: { status: 200 }, sitemap: { status: 200 }, robotsRule: ruleFor(g, 'Googlebot') },
    { bot: 'GPTBot', home: { status: 403, challenged: true }, robots: { status: 200 }, sitemap: { status: 200 }, robotsRule: ruleFor(g, 'GPTBot') },
    { bot: 'curl', home: { status: 403, challenged: true }, robots: { status: 403, challenged: true }, sitemap: { status: 403, challenged: true }, robotsRule: ruleFor(g, 'curl') }
  ];
  const issues = buildIssues(rows, robots);
  const checks = [
    ['wildcard group parsed', ruleFor(g, 'Googlebot').group === '*' && ruleFor(g, 'Googlebot').disallow.includes('/assets/js/booking.js')],
    ['stacked user-agents share rules', ruleFor(g, 'GPTBot').blockedAll && ruleFor(g, 'ClaudeBot').blockedAll],
    ['allow lines excluded from disallow', !ruleFor(g, 'PerplexityBot').blockedAll && ruleFor(g, 'PerplexityBot').disallow.length === 0],
    ['challenge by header', isChallenge(200, hdr('challenge'), '<html>')],
    ['challenge by body', isChallenge(200, hdr(null), '<title>Just a moment...</title>')],
    ['challenge by status', isChallenge(503, hdr(null), '')],
    ['clean 200 not a challenge', !isChallenge(200, hdr(null), '<html><title>Home</title>')],
    ['curl blocks not reported as issue', !issues.some(i => i.startsWith('curl:'))],
    ['GPTBot block + robots reported', issues.some(i => i.startsWith('GPTBot: 1/3')) && issues.some(i => i === 'GPTBot: robots.txt disallows everything')],
    ['Googlebot clean', !issues.some(i => i.startsWith('Googlebot'))]
  ];
  const failed = checks.filter(([, ok]) => !ok); checks.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`)); console.log(`\n${checks.length - failed.length}/${checks.length} selftest checks passed`); process.exit(failed.length ? 1 : 0);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2]; if (!url) { console.error('Usage: node crawlers.mjs <url> | --selftest'); process.exit(1); }
  await run(url);
}
