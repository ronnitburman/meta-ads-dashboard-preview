// Synthetic exports shaped like real Ads Manager CSVs (header-keyed records,
// as PapaParse returns them). Real exports are never committed.

import './load.js';

const { eachDay } = globalThis.MetaAds;

const BASE = {
  'Attribution setting': '7-day click or 1-day view',
  'Ad set budget': '200',
  'Ad set budget type': 'Daily',
  Ends: 'Ongoing',
  'Results (initial)': '',
  'Results (initial) indicator': '',
};

export function record(date, campaign, { spend = 0, impressions = 0, reach = 0, clicks = '', results = '', delivery = 'active' } = {}) {
  return {
    'Reporting starts': date,
    'Reporting ends': date,
    'Campaign name': campaign,
    'Campaign delivery': delivery,
    ...BASE,
    Results: String(results),
    'Result indicator': results ? 'actions:leadgen.other' : '',
    'Cost per results': results ? String(spend / results) : '',
    'Amount spent (INR)': String(spend),
    Impressions: String(impressions),
    Reach: String(reach),
    'Link clicks': String(clicks),
    'CTR (all)': impressions ? String((Number(clicks || 0) / impressions) * 100) : '0',
  };
}

// 28 days from Sun 4 Oct 2026. `plan(date, i)` returns per-day overrides.
export function month(campaign, plan) {
  return eachDay('2026-10-04', '2026-10-31').map((d, i) => record(d, campaign, plan(d, i)));
}
