import { test } from 'node:test';
import assert from 'node:assert/strict';
import { month, record } from './fixtures.js';

const { parseExport, combine, contextReport, insights } = globalThis.MetaAds;

const load = (...files) => combine(files.map(([name, recs]) => parseExport(recs, name)));
const a = ['1111111 Alpha-Campaigns-Oct.csv', [
  ...month('Instant Form', (d, i) => ({ spend: 200, impressions: 250, reach: 220, clicks: i % 2 ? 6 : 2, results: i % 2 ? 1 : '' })),
  ...month('Old Sales', () => ({ delivery: 'inactive' })),
]];
const b = ['2222222 Beta-Campaigns-Oct.csv', month('Dubai Leads', (d, i) => ({ spend: 200, impressions: 200, reach: 180, clicks: 1, results: i % 7 === 0 ? 1 : '' }))];

test('header states the period, accounts, currency and result type', () => {
  const md = contextReport(load(a, b), { currency: 'INR' });
  assert.match(md, /^# Meta Ads performance: 4 Oct 2026 to 31 Oct 2026$/m);
  assert.match(md, /- Accounts: Alpha, Beta/);
  assert.match(md, /- Currency: INR/);
  assert.match(md, /- Primary result: Leads \(`actions:leadgen.other`\)/);
  assert.match(md, /- Attribution: 7-day click or 1-day view/);
});

test('totals match the data', () => {
  const md = contextReport(load(a, b), { currency: 'INR' });
  assert.match(md, /\| Amount spent \| INR 11,200 \|/);
  assert.match(md, /\| Leads \| 18 \|/);
});

test('every detected pattern is included', () => {
  const rows = load(a, b);
  const md = contextReport(rows);
  const found = insights(rows);
  assert.ok(found.length > 0);
  for (const i of found) assert.ok(md.includes(i.title), i.title);
});

test('has per-account, campaign, daily and weekday tables', () => {
  const md = contextReport(load(a, b));
  for (const h of ['## By account', '## Campaigns', '## Daily data', '## By weekday']) assert.ok(md.includes(h), h);
  // 28 days x 2 accounts of daily rows
  const daily = md.split('## Daily data')[1].split('## By weekday')[0];
  assert.equal(daily.split('\n').filter((l) => /^\| 2026-/.test(l)).length, 56);
  assert.match(daily, /\| 2026-10-04 \| Sun \| Alpha \|/);
});

test('a single account has no per-account table or account column', () => {
  const md = contextReport(load(a));
  assert.ok(!md.includes('## By account'));
  assert.match(md, /\| 2026-10-04 \| Sun \| 200.00 \|/);
});

test('hidden idle campaigns are listed as omitted; filters are stated', () => {
  const md = contextReport(load(a), { hideIdle: true, hiddenAccounts: ['Beta'] });
  assert.ok(!/\| Old Sales \|/.test(md));
  assert.match(md, /1 campaign\(s\) with zero spend omitted: Old Sales\./);
  assert.match(md, /- Excluded by filter: Beta/);
  assert.match(contextReport(load(a)), /\| Old Sales \|/);
});

test('pipes in names do not break tables', () => {
  const md = contextReport(load(['1 X-Campaigns-x.csv', [record('2026-10-05', 'UAE | Leads', { spend: 10, impressions: 10 })]]));
  assert.match(md, /\| UAE \\\| Leads \|/);
});

test('the question goes last; without one the AI is asked for the top takeaways', () => {
  const rows = load(a, b);
  assert.match(contextReport(rows, { question: '  Which campaign should I pause?  ' }), /## My question\n\nWhich campaign should I pause\?\n$/);
  assert.match(contextReport(rows), /## My question\n\nStart with the 3 most important takeaways/);
  assert.match(contextReport(rows), /My question is at the end\./);
});

test('empty selection says so', () => {
  assert.equal(contextReport([]), 'No Meta Ads data loaded.');
});
