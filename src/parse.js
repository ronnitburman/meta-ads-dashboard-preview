// Turns the header-keyed records of a Meta Ads Manager CSV export into
// normalised rows. Column order differs between accounts and exports, so
// every field is looked up by header name, never by position.
// Plain script (no modules) so index.html works when opened straight from disk.

(() => {
  const FIELDS = {
    start: [/^reporting starts$/i, /^day$/i, /^date$/i],
    end: [/^reporting ends$/i],
    account: [/^account name$/i],
    campaign: [/^campaign name$/i],
    adset: [/^ad set name$/i],
    ad: [/^ad name$/i],
    delivery: [/^(campaign|ad set|ad) delivery$/i, /^delivery$/i],
    attribution: [/^attribution setting$/i],
    results: [/^results$/i],
    indicator: [/^result indicator$/i],
    budget: [/^(ad set|campaign) budget$/i, /^budget$/i],
    budgetType: [/^(ad set|campaign) budget type$/i, /^budget type$/i],
    spend: [/^amount spent/i],
    impressions: [/^impressions$/i],
    reach: [/^reach$/i],
    clicks: [/^link clicks$/i],
    ctrAll: [/^ctr \(all\)$/i],
  };

  function findColumn(headers, patterns) {
    for (const p of patterns) {
      const hit = headers.find((h) => p.test(h.trim()));
      if (hit !== undefined) return hit;
    }
    return null;
  }

  function num(value) {
    if (value === undefined || value === null) return 0;
    const s = String(value).replace(/,/g, '').trim();
    if (s === '' || s === '-') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // "1234567890123456 Acme-Home-Goods-Campaigns-Oct-4-2026-Nov-2-2026.csv"
  //   -> { id: "1234567890123456", name: "Acme Home Goods" }
  function accountFromFileName(fileName) {
    const base = fileName.replace(/^.*[\\/]/, '').replace(/\.csv$/i, '');
    const m = base.match(/^(\d{6,})\s+(.+?)-(Campaigns|Ad-sets|Ad-Sets|Ads)-/);
    if (m) return { id: m[1], name: m[2].replace(/-/g, ' ').trim() };
    const loose = base.match(/^(\d{6,})\s+(.+)$/);
    if (loose) return { id: loose[1], name: loose[2].trim() };
    return { id: base, name: base };
  }

  function resultLabel(indicator) {
    if (!indicator) return 'Results';
    if (/lead/i.test(indicator)) return 'Leads';
    if (/purchase/i.test(indicator)) return 'Purchases';
    if (/link_click/i.test(indicator)) return 'Link clicks';
    if (/landing_page_view/i.test(indicator)) return 'Landing page views';
    if (/messag/i.test(indicator)) return 'Conversations';
    if (/reach/i.test(indicator)) return 'Reach';
    if (/video/i.test(indicator)) return 'Video views';
    return indicator.replace(/^actions:/, '').replace(/[._]/g, ' ');
  }

  function parseExport(records, fileName, headers = Object.keys(records[0] ?? {})) {
    const col = Object.fromEntries(
      Object.entries(FIELDS).map(([k, pats]) => [k, findColumn(headers, pats)]),
    );
    const warnings = [];
    if (!col.start) warnings.push('No "Reporting starts" column — rows cannot be placed on a timeline.');
    if (!col.spend) warnings.push('No "Amount spent" column found.');
    if (!col.campaign && !col.adset && !col.ad) {
      throw new Error(`${fileName}: this does not look like a Meta Ads export (no campaign, ad set or ad name column).`);
    }

    const currency = col.spend?.match(/\(([A-Z]{3})\)/)?.[1] ?? 'INR';
    const level = col.ad ? 'Ad' : col.adset ? 'Ad set' : 'Campaign';
    const fromFile = accountFromFileName(fileName);

    const rows = [];
    for (const r of records) {
      const entity = (r[col.ad] ?? r[col.adset] ?? r[col.campaign] ?? '').trim();
      if (!entity) continue; // Meta's optional summary row has no name
      const start = (r[col.start] ?? '').trim();
      const end = (r[col.end] ?? start).trim();
      const results = num(r[col.results]);
      rows.push({
        accountId: fromFile.id,
        account: (r[col.account] ?? '').trim() || fromFile.name,
        file: fileName,
        level,
        entity,
        campaign: (r[col.campaign] ?? entity).trim(),
        start,
        end,
        daily: Boolean(start) && start === end,
        delivery: (r[col.delivery] ?? '').trim().toLowerCase(),
        attribution: (r[col.attribution] ?? '').trim(),
        results,
        indicator: (r[col.indicator] ?? '').trim(),
        budget: num(r[col.budget]),
        budgetType: (r[col.budgetType] ?? '').trim(),
        spend: num(r[col.spend]),
        impressions: num(r[col.impressions]),
        reach: num(r[col.reach]),
        clicks: num(r[col.clicks]),
        ctrAll: num(r[col.ctrAll]),
      });
    }
    return { rows, currency, level, account: fromFile, warnings };
  }

  // Several uploads can overlap (same account exported twice, or overlapping
  // date ranges). The later file wins for an identical account/entity/period.
  function combine(exports) {
    const byKey = new Map();
    for (const ex of exports) {
      for (const row of ex.rows) {
        byKey.set(`${row.accountId}|${row.level}|${row.entity}|${row.start}|${row.end}`, row);
      }
    }
    return [...byKey.values()].sort((a, b) => a.start.localeCompare(b.start) || a.entity.localeCompare(b.entity));
  }

  globalThis.MetaAds = Object.assign(globalThis.MetaAds ?? {}, {
    num, accountFromFileName, resultLabel, parseExport, combine,
  });
})();
