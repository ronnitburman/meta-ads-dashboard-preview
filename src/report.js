// Builds a Markdown summary of what the dashboard is showing, for pasting
// into an AI assistant. Pure function: same rows and options, same text.
// Load after parse.js and analyze.js.

(() => {
  const {
    totals, byAccount, byEntity, byWeekday, dailySeries, dateRange, insights, primaryResult,
  } = globalThis.MetaAds;

  const TONE = { critical: 'Critical', warning: 'Watch', good: 'Working', info: 'Pattern' };

  const longDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  // The first `textCols` columns are left-aligned labels; the rest are numbers.
  const table = (head, body, textCols = 1) => [
    `| ${head.map(cell).join(' | ')} |`,
    `| ${head.map((_, i) => (i < textCols ? '---' : '---:')).join(' | ')} |`,
    ...body.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');

  const DEFAULT_QUESTION = 'Start with the 3 most important takeaways from this data and what I should do about each. Keep it practical, and tell me if the numbers are too small to be sure.';

  // opts: { currency, hideIdle, hiddenAccounts: [names], question }
  function contextReport(rows, opts = {}) {
    const currency = opts.currency ?? 'INR';
    const num = (n, digits = 0) => (n == null ? '–' : n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
    const money = (n, digits = 0) => (n == null ? '–' : `${currency} ${num(n, digits)}`);
    const pct = (n) => (n == null ? '–' : `${n.toFixed(2)}%`);

    if (!rows.length) return 'No Meta Ads data loaded.';

    const { label, indicator, mixed } = primaryResult(rows);
    const unit = label.replace(/s$/, '').toLowerCase();
    const range = dateRange(rows);
    const t = totals(rows);
    const level = rows[0].level;
    const attributions = [...new Set(rows.filter((r) => r.spend > 0 && r.attribution && r.attribution !== '-').map((r) => r.attribution))];
    const accountNames = [...new Set(rows.map((r) => r.account))].sort((x, y) => x.localeCompare(y));

    const out = [];
    out.push(`# Meta Ads performance${range ? `: ${longDay(range.from)} to ${longDay(range.to)}` : ''}`);
    out.push([
      `Context: summary from my Meta Ads Manager CSV exports (${level.toLowerCase()} level${range ? ', daily breakdown' : ''}), produced by a local dashboard. Please use it to answer my questions about ad performance. My question is at the end.`,
      '',
      `- Accounts: ${accountNames.join(', ')}`,
      opts.hiddenAccounts?.length ? `- Excluded by filter: ${opts.hiddenAccounts.join(', ')}` : null,
      `- Currency: ${currency}`,
      `- Primary result: ${label}${indicator ? ` (\`${indicator}\`)` : ''}${mixed ? '; campaigns optimise for different results, so totals mix result types' : ''}`,
      attributions.length ? `- Attribution: ${attributions.join('; ')}` : null,
      '- CTR and CPC below use link clicks. CPM is cost per 1,000 impressions.',
    ].filter((l) => l !== null).join('\n'));

    out.push('## Totals\n\n' + table(['Metric', 'Value'], [
      ['Amount spent', money(t.spend)],
      [label, num(t.results)],
      [`Cost per ${unit}`, money(t.cpr)],
      ['Impressions', num(t.impressions)],
      ['Link clicks', num(t.clicks)],
      ['Link CTR', pct(t.ctr)],
      ['CPC (link)', money(t.cpc, 2)],
      ['CPM', money(t.cpm)],
      [`Link clicks per ${unit}`, t.clicksPerResult == null ? '–' : t.clicksPerResult.toFixed(1)],
      ['Days with spend', num(t.activeDays)],
    ]));

    const accounts = byAccount(rows);
    if (accounts.length > 1) {
      out.push('## By account\n\n' + table(
        ['Account', 'Spent', label, `Cost / ${unit}`, 'Impressions', 'Link clicks', 'Link CTR', 'CPC', 'CPM'],
        accounts.sort((a, b) => b.spend - a.spend).map((a) => [a.account, money(a.spend), num(a.results), money(a.cpr), num(a.impressions), num(a.clicks), pct(a.ctr), money(a.cpc, 2), money(a.cpm)]),
      ));
    }

    let entities = byEntity(rows).sort((a, b) => b.spend - a.spend);
    const idle = entities.filter((e) => e.spend === 0);
    if (opts.hideIdle) entities = entities.filter((e) => e.spend > 0);
    out.push(`## ${level}s\n\n` + table(
      [level, 'Account', 'Status', 'Spent', label, `Cost / ${unit}`, 'Link clicks', 'Link CTR', 'CPM', 'Daily budget', 'Budget used'],
      entities.map((e) => [e.entity, e.account, e.delivery || '–', money(e.spend), num(e.results), money(e.cpr), num(e.clicks), pct(e.ctr), money(e.cpm), e.budget ? money(e.budget) : '–', e.pacing == null ? '–' : `${Math.round(e.pacing * 100)}%`]),
      3,
    ) + (opts.hideIdle && idle.length ? `\n\n${idle.length} ${level.toLowerCase()}(s) with zero spend omitted: ${idle.map((e) => e.entity).join(', ')}.` : ''));

    const found = insights(rows, (n) => money(n));
    if (found.length) {
      out.push('## Patterns the dashboard detected\n\n' + found.map((i) => `- **${TONE[i.tone]}: ${i.title}.** ${i.detail}`).join('\n'));
    }

    const series = dailySeries(rows);
    series.accounts.sort((x, y) => x.account.localeCompare(y.account));
    if (series.days.length) {
      const body = [];
      for (const d of series.days) {
        for (const acc of series.accounts) {
          const p = acc.points.find((x) => x.date === d);
          const wd = new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
          const row = [d, wd];
          if (series.accounts.length > 1) row.push(acc.account);
          row.push(num(p.spend, 2), num(p.impressions), num(p.clicks), pct(p.ctr), num(p.results));
          body.push(row);
        }
      }
      const head = ['Date', 'Day', ...(series.accounts.length > 1 ? ['Account'] : []), `Spent (${currency})`, 'Impressions', 'Link clicks', 'Link CTR', label];
      out.push('## Daily data\n\n' + table(head, body, series.accounts.length > 1 ? 3 : 2));

      out.push('## By weekday\n\n' + table(
        ['Weekday', 'Spent', 'Impressions', 'Link clicks', 'Link CTR', label, `Cost / ${unit}`],
        byWeekday(rows).map((w) => [w.name, money(w.spend), num(w.impressions), num(w.clicks), pct(w.ctr), num(w.results), money(w.cpr)]),
      ));
    }

    out.push(`## My question\n\n${opts.question?.trim() || DEFAULT_QUESTION}`);

    return out.join('\n\n') + '\n';
  }

  globalThis.MetaAds = Object.assign(globalThis.MetaAds, { contextReport });
})();
