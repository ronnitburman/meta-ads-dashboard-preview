import { test } from 'node:test';
import assert from 'node:assert/strict';
import { month, record } from './fixtures.js';

const { parseExport, combine, totals, byEntity, dailySeries, insights, rollingCostPerResult, weekdayOf } = globalThis.MetaAds;

const load = (...files) => combine(files.map(([name, recs]) => parseExport(recs, name)));
const ids = (list) => list.map((i) => i.id);

// Cheap account: a lead every other day, healthy CTR. Saturdays deliver at a third.
const cheap = ['1111111 Cheap-Campaigns-Oct.csv', [
  ...month('Instant Form', (d, i) => {
    const sat = weekdayOf(d) === 6;
    return { spend: sat ? 60 : 200, impressions: 250, reach: 220, clicks: i % 2 ? 6 : 2, results: i % 2 ? 1 : '' };
  }),
  ...month('Old Sales', () => ({ delivery: 'inactive' })),
]];
// Expensive account: same spend, a lead every 7 days.
const pricey = ['2222222 Pricey-Campaigns-Oct.csv', month('Dubai Leads', (d, i) => ({ spend: 200, impressions: 200, reach: 180, clicks: i % 7 === 0 ? 5 : 1, results: i % 7 === 0 ? 1 : '' }))];

test('totals derive ratios from sums, not averages of ratios', () => {
  const t = totals(load(['1 A-Campaigns-x.csv', [
    record('2026-10-05', 'A', { spend: 100, impressions: 1000, clicks: 10, results: 1 }),
    record('2026-10-06', 'A', { spend: 300, impressions: 1000, clicks: 30, results: 3 }),
  ]]));
  assert.equal(t.cpr, 100);
  assert.equal(t.ctr, 2);
  assert.equal(t.cpm, 200);
  assert.equal(t.activeDays, 2);
});

test('daily series fills missing days with zeros', () => {
  const s = dailySeries(load(['1 A-Campaigns-x.csv', [record('2026-10-05', 'A', { spend: 1 }), record('2026-10-08', 'A', { spend: 1 })]]));
  assert.equal(s.days.length, 4);
  assert.deepEqual(s.accounts[0].points.map((p) => p.spend), [1, 0, 0, 1]);
});

test('rolling cost per result is null until a result lands', () => {
  assert.deepEqual(rollingCostPerResult([{ spend: 10, results: 0 }, { spend: 10, results: 1 }, { spend: 10, results: 0 }], 2), [null, 20, 20]);
});

test('budget pacing averages spend over daily budget', () => {
  const [e] = byEntity(load(['1 A-Campaigns-x.csv', [record('2026-10-05', 'A', { spend: 100 }), record('2026-10-06', 'A', { spend: 200 })]]));
  assert.equal(e.pacing, 0.75);
});

test('finds the account efficiency gap and flags small samples', () => {
  const found = insights(load(cheap, pricey));
  const gap = found.find((i) => i.id === 'account-efficiency');
  assert.ok(gap, ids(found).join());
  assert.match(gap.title, /^Cheap gets leads .*× cheaper than Pricey$/);
  assert.match(gap.detail, /Small sample/);
});

test('finds a weekday-clustered delivery dip', () => {
  const dip = insights(load(cheap)).find((i) => i.id === 'dip-1111111');
  assert.equal(dip.tone, 'warning');
  assert.match(dip.title, /under-delivers on Saturdays \(every one\)/);
});

test('reports idle campaigns and droughts', () => {
  const found = insights(load(cheap, pricey));
  assert.match(found.find((i) => i.id === 'idle').title, /^1 of 3 campaigns had zero delivery$/);
  assert.match(found.find((i) => i.id === 'drought-2222222|Dubai Leads').title, /6-day stretch without a lead/);
});

test('CTR on converting days vs the rest', () => {
  const ctr = insights(load(cheap, pricey)).find((i) => i.id === 'ctr-signal');
  assert.equal(ctr.tone, 'good');
  assert.match(ctr.title, /had .*× the link CTR/);
});

test('flags a campaign spending with no results', () => {
  const recs = [
    ...month('Works', (d, i) => ({ spend: 100, impressions: 100, clicks: 2, results: i % 3 ? '' : 1 })),
    ...month('Burns', () => ({ spend: 100, impressions: 100, clicks: 1 })),
  ];
  const found = insights(load(['1 A-Campaigns-x.csv', recs]));
  assert.equal(found[0].tone, 'critical');
  assert.match(found[0].title, /"Burns" spent .* with no leads/);
});

test('critical and warning insights sort before the rest', () => {
  const order = { critical: 0, warning: 1, good: 2, info: 3 };
  const tones = insights(load(cheap, pricey)).map((i) => order[i.tone]);
  assert.deepEqual(tones, [...tones].sort((a, b) => a - b));
});

test('no spend, no insights', () => {
  assert.deepEqual(insights(load(['1 A-Campaigns-x.csv', month('Idle', () => ({ delivery: 'inactive' }))])), []);
});
