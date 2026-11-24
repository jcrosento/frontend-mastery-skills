import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
// Key lists copied from Cursor's published schemas (https://github.com/cursor/plugins, schemas/), which allow no other keys.
const PLUGIN_KEYS = ['name', 'displayName', 'description', 'version', 'minClientVersions', 'author', 'publisher', 'homepage', 'repository', 'license', 'logo', 'keywords', 'category', 'tags', 'commands', 'agents', 'skills', 'rules', 'hooks', 'variables', 'mcpServers'];
const MARKET_KEYS = ['name', 'owner', 'metadata', 'plugins'];
const ENTRY_KEYS = ['name', 'source', 'description', 'minClientVersions'];

test('cursor plugin: the manifest has only keys Cursor allows and matches the package', () => {
  const plugin = read('.cursor-plugin/plugin.json');
  assert.match(plugin.name, NAME);
  assert.deepEqual(Object.keys(plugin).filter(key => !PLUGIN_KEYS.includes(key)), []);
  assert.equal(plugin.version, read('package.json').version, 'plugin version and package version move together');
  assert.equal(plugin.skills, './skills/');
  assert.ok(existsSync(join(root, plugin.skills)));
  // Skills only. A plugin rule is loaded into every chat and a hook runs on every edit; neither is installed without the user choosing it.
  for (const key of ['rules', 'hooks', 'mcpServers', 'commands', 'agents']) assert.equal(plugin[key], undefined, `${key} must not ship in the plugin`);
});

test('cursor plugin: the marketplace file lists this one plugin at the repository root', () => {
  const market = read('.cursor-plugin/marketplace.json');
  assert.deepEqual(Object.keys(market).filter(key => !MARKET_KEYS.includes(key)), []);
  assert.equal(typeof market.owner.name, 'string');
  assert.equal(market.plugins.length, 1);
  const [entry] = market.plugins;
  assert.deepEqual(Object.keys(entry).filter(key => !ENTRY_KEYS.includes(key)), []);
  assert.equal(entry.name, read('.cursor-plugin/plugin.json').name);
  assert.equal(entry.source, '.');
  const skills = readdirSync(join(root, 'skills')).filter(name => statSync(join(root, 'skills', name)).isDirectory()).length;
  assert.match(entry.description, new RegExp(`^${skills} `), 'the count in the description is the real number of skills');
});
