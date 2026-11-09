import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record } from './fixtures.js';

const { accountFromFileName, parseExport, combine, num, resultLabel } = globalThis.MetaAds;

test('account id and name come from the Ads Manager file name', () => {
  assert.deepEqual(
    accountFromFileName('1234567890123456 Acme.Home-Goods-Campaigns-Oct-4-2026-Nov-2-2026.csv'),
    { id: '1234567890123456', name: 'Acme.Home Goods' },
  );
  assert.deepEqual(accountFromFileName('/x/y/export.csv'), { id: 'export', name: 'export' });
});

test('columns are matched by header, whatever their order', () => {
  const r = record('2026-10-05', 'Leads', { spend: 150.5, impressions: 200, reach: 180, clicks: 4, results: 1 });
  const shuffled = Object.fromEntries(Object.entries(r).reverse());
  const { rows, currency, level } = parseExport([shuffled], '1234567 Acct-Campaigns-Oct-1.csv');
  assert.equal(currency, 'INR');
  assert.equal(level, 'Campaign');
  assert.equal(rows[0].spend, 150.5);
  assert.equal(rows[0].clicks, 4);
  assert.equal(rows[0].results, 1);
  assert.equal(rows[0].daily, true);
  assert.equal(rows[0].account, 'Acct');
});

test('blank and "-" cells read as zero; summary rows without a name are dropped', () => {
  assert.equal(num(''), 0);
  assert.equal(num('-'), 0);
  assert.equal(num('1,234.5'), 1234.5);
  const blank = { ...record('2026-10-05', ''), 'Campaign name': '' };
  assert.equal(parseExport([blank, record('2026-10-05', 'A')], 'a.csv').rows.length, 1);
});

test('ad-level exports use the ad name as the entity', () => {
  const r = { ...record('2026-10-05', 'Camp'), 'Ad set name': 'Set', 'Ad name': 'Creative A' };
  const { rows, level } = parseExport([r], 'a.csv');
  assert.equal(level, 'Ad');
  assert.equal(rows[0].entity, 'Creative A');
  assert.equal(rows[0].campaign, 'Camp');
});

test('a file with no name columns is rejected', () => {
  assert.throws(() => parseExport([{ foo: '1' }], 'nope.csv'), /does not look like a Meta Ads export/);
});

test('overlapping uploads are de-duplicated, later file wins', () => {
  const a = parseExport([record('2026-10-05', 'A', { spend: 10 })], '1111111 X-Campaigns-a.csv');
  const b = parseExport([record('2026-10-05', 'A', { spend: 12 }), record('2026-10-06', 'A', { spend: 5 })], '1111111 X-Campaigns-b.csv');
  const rows = combine([a, b]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].spend, 12);
});

test('result indicators get readable labels', () => {
  assert.equal(resultLabel('actions:leadgen.other'), 'Leads');
  assert.equal(resultLabel('actions:offsite_conversion.fb_pixel_purchase'), 'Purchases');
  assert.equal(resultLabel(''), 'Results');
});
