import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const exists = (p) => existsSync(new URL(p, root));

const html = read('index.html');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const cached = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const localRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|data:)/.test(u));

test('every file the service worker caches exists', () => {
  for (const p of cached.filter((p) => p !== './')) assert.ok(exists(p), p);
});

test('every local file index.html loads is cached for offline use', () => {
  for (const p of localRefs) assert.ok(cached.includes(p), `${p} missing from ASSETS in sw.js`);
});

test('the page loads nothing from third-party servers', () => {
  // <a href> links (e.g. to AI assistants) only navigate when clicked; anything else would be fetched.
  const loaded = [...html.matchAll(/<(?!a\s)(\w+)[^>]*?(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(loaded, []);
  for (const f of ['src/app.js', 'src/styles.css']) assert.ok(!/https?:\/\//.test(read(f)), f);
});

test('manifest icons exist and include a maskable one', () => {
  for (const i of manifest.icons) assert.ok(exists(i.src), i.src);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
});

test('share target posts CSVs to the path sw.js handles', () => {
  assert.equal(manifest.share_target.action, './share-target');
  assert.ok(sw.includes("endsWith('/share-target')"));
  assert.equal(manifest.share_target.params.files[0].name, 'csv');
  assert.ok(sw.includes("form.getAll('csv')"));
});
