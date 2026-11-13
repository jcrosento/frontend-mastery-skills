import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { censusFromDocument, checkLock, INTERACTIVE_SELECTOR, validateLock } from '../skills/fe-guard/scripts/lock-core.mjs';
import { censusFromHtml, INTERACTIVE_SELECTOR as CLI_SELECTOR } from '../skills/fe-guard/scripts/lock-check.mjs';
import { spawnBounded } from '../scripts/run-bounded.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/fe-guard/scripts/lock-check.mjs');
const lock = {
  version: 1, mode: 'presence-order-label', attribute: 'data-testid',
  states: [{
    id: 'home', max_interactive: 4,
    landmarks: [
      { id: 'link-upload', label: 'Upload receipt' },
      { id: 'link-send', label: 'Send money' },
      { id: 'balance', order: false },
      { id: 'stage-', match: 'prefix', labels: ['Waiting', 'Sent'], optional: true, order: false },
      { id: 'alert', contains: ['more than the cash sent'], optional: true, order: false }
    ],
    absent: ['owner-totals']
  }]
};
const census = (landmarks, interactive = 3) => ({ landmarks: landmarks.map(([id, label]) => ({ id, label })), interactive });
const base = [['balance', 'PHP 12,000'], ['link-upload', 'Upload receipt'], ['link-send', 'Send money']];
const kinds = (result) => result.failures.map(f => f.kind);

test('fe-guard lock: geometry cannot be locked', () => {
  assert.deepEqual(validateLock(lock), []);
  for (const key of ['x', 'y', 'width', 'height', 'box']) {
    const bad = structuredClone(lock);
    bad.states[0].landmarks[0][key] = 10;
    assert.ok(validateLock(bad).some(p => p.includes('geometry cannot be locked')), `${key} must be rejected`);
  }
  assert.ok(validateLock({ ...lock, mode: 'pixel' }).some(p => p.startsWith('mode')));
  assert.ok(validateLock({ ...lock, version: 2 }).some(p => p.startsWith('version')));
  assert.ok(validateLock({ ...lock, states: [] }).some(p => p.startsWith('states')));
});

test('fe-guard lock: a screen that keeps its landmarks passes, wherever they sit', () => {
  assert.equal(checkLock(lock, 'home', census(base)).ok, true);
  const withOptional = census([...base, ['stage-12', 'Waiting'], ['stage-13', 'Sent'], ['alert', 'You spent more than the cash sent. Explain.']], 4);
  assert.equal(checkLock(lock, 'home', withOptional).ok, true);
  assert.equal(checkLock(lock, 'home', census([['link-upload', '  Upload\n receipt ']].concat(base.slice(2), [base[0]]))).ok, true, 'whitespace is normalised; unordered landmarks may move');
});

test('fe-guard lock: missing, relabelled, reordered, forbidden and extra controls fail', () => {
  assert.deepEqual(kinds(checkLock(lock, 'home', census(base.slice(0, 2)))), ['missing']);
  assert.deepEqual(kinds(checkLock(lock, 'home', census([base[0], base[1], ['link-send', 'Transfer']]))), ['label']);
  assert.deepEqual(kinds(checkLock(lock, 'home', census([base[0], base[2], base[1]]))), ['order']);
  assert.deepEqual(kinds(checkLock(lock, 'home', census([...base, ['owner-totals', 'PHP 2.4M']]))), ['forbidden']);
  assert.deepEqual(kinds(checkLock(lock, 'home', census(base, 5))), ['interactive']);
  assert.deepEqual(kinds(checkLock(lock, 'home', census([...base, ['stage-12', 'Paid']]))), ['label'], 'a generated id still has to carry a locked label');
  assert.deepEqual(kinds(checkLock(lock, 'home', census([...base, ['alert', 'Over budget']]))), ['label']);
});

test('fe-guard lock: unknown state, bad census and invalid lock never pass', () => {
  assert.deepEqual(kinds(checkLock(lock, 'settings', census(base))), ['unknown-state']);
  assert.deepEqual(kinds(checkLock(lock, 'home', null)), ['invalid-census']);
  assert.deepEqual(kinds(checkLock(lock, 'home', { landmarks: base.map(([id, label]) => ({ id, label })) })), ['interactive'], 'a ceiling needs a count');
  assert.equal(checkLock({ ...lock, mode: 'pixel' }, 'home', census(base)).ok, false);
});

const page = (body) => `<!doctype html><html><body>${body}</body></html>`;
const good = page(`
  <p data-testid="balance">PHP 12,000</p>
  <a href="/upload" data-testid="link-upload">Upload receipt</a>
  <a href="/send" data-testid="link-send"><span>Send</span> <span>money</span></a>
  <button>Help</button>
  <button disabled>Later</button>
  <div hidden><button data-testid="owner-totals">Totals</button></div>
  <a href="/x" style="display:none">Hidden link</a>
  <script>document.body.innerHTML = '<button data-testid="owner-totals">injected</button>'</script>`);

test('fe-guard lock: census reads visible tagged elements and counts enabled controls, with scripts off', { timeout: 60_000 }, async () => {
  const result = await censusFromHtml(good);
  assert.deepEqual(result.landmarks, [{ id: 'balance', label: 'PHP 12,000' }, { id: 'link-upload', label: 'Upload receipt' }, { id: 'link-send', label: 'Send money' }]);
  assert.equal(result.interactive, 3, 'two links and one enabled button; hidden and disabled controls do not count');
  assert.equal(checkLock(lock, 'home', result).ok, true);
});

// A stand-in for a DOM: just enough for the census, so the test needs no browser and no extra package.
function fakeRoot(elements) {
  const make = (e) => ({
    disabled: Boolean(e.disabled),
    textContent: e.text ?? '',
    getAttribute: (name) => (name in (e.attrs ?? {}) ? e.attrs[name] : null),
    closest: () => (e.hidden ? {} : null)
  });
  return {
    querySelectorAll(selector) {
      const tagged = /^\[([a-z][a-z0-9-]*)\]$/.exec(selector);
      return elements.filter(e => (tagged ? e.attrs && tagged[1] in e.attrs : e.control)).map(make);
    }
  };
}

test('fe-guard lock: an app test can take the census itself, with the same rules as the browser check', () => {
  assert.equal(CLI_SELECTOR, INTERACTIVE_SELECTOR, 'one selector for both paths');
  const screen = [
    { attrs: { 'data-testid': 'balance' }, text: ' PHP   12,000 ' },
    { attrs: { 'data-testid': 'link-upload', 'aria-label': 'Upload receipt' }, text: 'icon', control: true },
    { attrs: { 'data-testid': 'link-send' }, text: 'Send money', control: true },
    { text: 'Help', control: true },
    { text: 'Later', control: true, disabled: true },
    { text: 'Soon', control: true, attrs: { 'aria-disabled': 'true' } },
    { attrs: { 'data-testid': 'owner-totals' }, text: 'Totals', control: true, hidden: true }
  ];
  const result = censusFromDocument(fakeRoot(screen), { attribute: 'data-testid', selector: INTERACTIVE_SELECTOR });
  assert.deepEqual(result.landmarks, [{ id: 'balance', label: 'PHP 12,000' }, { id: 'link-upload', label: 'Upload receipt' }, { id: 'link-send', label: 'Send money' }]);
  assert.equal(result.interactive, 3, 'hidden, disabled and aria-disabled controls do not count');
  assert.equal(checkLock(lock, 'home', result).ok, true);
  const relabelled = structuredClone(screen); relabelled[2].text = 'Pay';
  assert.deepEqual(kinds(checkLock(lock, 'home', censusFromDocument(fakeRoot(relabelled), { selector: INTERACTIVE_SELECTOR }))), ['label']);
  const extra = [...screen, { text: 'New', control: true }, { text: 'Newer', control: true }];
  assert.deepEqual(kinds(checkLock(lock, 'home', censusFromDocument(fakeRoot(extra), { selector: INTERACTIVE_SELECTOR }))), ['interactive']);
  assert.throws(() => censusFromDocument(fakeRoot(screen), {}), /selector/);
  assert.throws(() => censusFromDocument(fakeRoot(screen), { attribute: 'x] , [y', selector: 'a' }), /attribute/);

  // It is sent to a browser page as text, so it may use nothing from outside its own body.
  const context = vm.createContext({ Array, Error });
  const isolated = vm.runInContext(`(${censusFromDocument.toString()})`, context);
  assert.deepEqual(isolated(fakeRoot(screen), { selector: INTERACTIVE_SELECTOR }).interactive, 3);
});

test('fe-guard lock: command line passes a kept screen and fails a broken one', { timeout: 90_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-lock-'));
  try {
    writeFileSync(join(dir, 'lock.json'), JSON.stringify(lock));
    writeFileSync(join(dir, 'good.html'), good);
    writeFileSync(join(dir, 'bad.html'), page('<p data-testid="balance">PHP 12,000</p><a href="/send" data-testid="link-send">Send money</a><a href="/upload" data-testid="link-upload">Add receipt</a><button>1</button><button>2</button><button>3</button>'));
    const run = (...args) => spawnBounded(process.execPath, [script, ...args], { cwd: dir, timeoutMs: 40_000 });
    let result = await run('--lock', 'lock.json', '--state', 'home', '--html', 'good.html');
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: state "home"/);
    result = await run('--lock', 'lock.json', '--state', 'home', '--html', 'bad.html');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[label\] link-upload/);
    assert.match(result.stderr, /\[order\]/);
    assert.match(result.stderr, /\[interactive\]/);
    result = await run('--census', '--html', 'good.html');
    assert.equal(JSON.parse(result.stdout).interactive, 3);
    assert.equal((await run('--state', 'home', '--html', 'good.html')).code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fe-guard lock: shipped example lock is valid', () => {
  const example = JSON.parse(readFileSync(join(root, 'skills/fe-guard/templates/landmarks.lock.example.json'), 'utf8'));
  assert.deepEqual(validateLock(example), []);
});
