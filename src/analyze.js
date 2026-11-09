// Aggregation and pattern detection over normalised rows (see parse.js).
// Pure functions only, so the browser and the tests share one code path.

(() => {
  const { resultLabel } = globalThis.MetaAds; // load parse.js first

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function totals(rows) {
    const t = { spend: 0, impressions: 0, clicks: 0, results: 0, reach: 0, days: new Set() };
    for (const r of rows) {
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.results += r.results;
      t.reach += r.reach;
      if (r.spend > 0 && r.daily) t.days.add(r.start);
    }
    return withRatios({ ...t, activeDays: t.days.size, days: undefined });
  }

  function withRatios(t) {
    return {
      ...t,
      cpr: t.results > 0 ? t.spend / t.results : null,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
      cpc: t.clicks > 0 ? t.spend / t.clicks : null,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
      clicksPerResult: t.results > 0 ? t.clicks / t.results : null,
    };
  }

  function groupBy(rows, keyFn) {
    const groups = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    return groups;
  }

  function primaryResult(rows) {
    const counts = new Map();
    for (const r of rows) if (r.indicator && r.results > 0) counts.set(r.indicator, (counts.get(r.indicator) ?? 0) + r.results);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { indicator: top?.[0] ?? '', label: resultLabel(top?.[0]), mixed: counts.size > 1 };
  }

  function byEntity(rows) {
    return [...groupBy(rows, (r) => `${r.accountId}|${r.entity}`).values()].map((g) => {
      const last = g[g.length - 1];
      const daily = g.filter((r) => r.daily && r.budgetType.toLowerCase() === 'daily' && r.budget > 0 && r.spend > 0);
      return {
        key: `${last.accountId}|${last.entity}`,
        entity: last.entity,
        account: last.account,
        accountId: last.accountId,
        delivery: last.delivery,
        budget: last.budget,
        budgetType: last.budgetType,
        pacing: daily.length ? daily.reduce((s, r) => s + r.spend / r.budget, 0) / daily.length : null,
        ...totals(g),
      };
    });
  }

  function byAccount(rows) {
    return [...groupBy(rows, (r) => r.accountId).values()].map((g) => ({
      accountId: g[0].accountId,
      account: g[0].account,
      ...totals(g),
    }));
  }

  function dateRange(rows) {
    const dates = rows.filter((r) => r.daily).map((r) => r.start).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  }

  function eachDay(from, to) {
    const out = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }

  // One row per calendar day (gaps filled with zeros) per account.
  function dailySeries(rows) {
    const range = dateRange(rows);
    if (!range) return { days: [], accounts: [] };
    const days = eachDay(range.from, range.to);
    const accounts = [...groupBy(rows.filter((r) => r.daily), (r) => r.accountId).values()].map((g) => {
      const perDay = groupBy(g, (r) => r.start);
      return {
        accountId: g[0].accountId,
        account: g[0].account,
        points: days.map((d) => ({ date: d, ...totals(perDay.get(d) ?? []) })),
      };
    });
    return { days, accounts };
  }

  function weekdayOf(date) {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
  }

  // Splits consecutive days into Monday–Sunday weeks (a partial first/last
  // week is kept). Returns [{ n, from, to, start }] with day indices.
  function weeks(days) {
    const out = [];
    days.forEach((d, i) => {
      if (i === 0 || weekdayOf(d) === 1) out.push({ n: out.length + 1, from: i, to: i, start: d });
      else out[out.length - 1].to = i;
    });
    return out;
  }

  function byWeekday(rows) {
    const g = groupBy(rows.filter((r) => r.daily), (r) => weekdayOf(r.start));
    return WEEKDAYS.map((name, i) => ({ name, ...totals(g.get(i) ?? []) }));
  }

  function rolling(points, size) {
    return points.map((_, i) => {
      const win = points.slice(Math.max(0, i - size + 1), i + 1);
      const spend = win.reduce((s, p) => s + p.spend, 0);
      const results = win.reduce((s, p) => s + p.results, 0);
      return results > 0 ? spend / results : null;
    });
  }

  function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    if (!s.length) return 0;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function pctChange(now, before) {
    if (now == null || before == null || before === 0) return null;
    return ((now - before) / before) * 100;
  }

  const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // Each insight: { id, tone: good|warning|critical|info, title, detail }.
  // `money` formats currency so the copy matches the dashboard's locale.
  function insights(rows, money = (n) => n.toFixed(0)) {
    const out = [];
    const spendRows = rows.filter((r) => r.spend > 0);
    if (!spendRows.length) return out;
    const total = totals(rows);
    const { label } = primaryResult(rows);
    const unit = label.toLowerCase().replace(/s$/, '');
    const lowSample = total.results < 30;

    // Account vs account efficiency.
    const accounts = byAccount(rows).filter((a) => a.spend > 0);
    if (accounts.length >= 2) {
      const withRes = accounts.filter((a) => a.cpr != null).sort((a, b) => a.cpr - b.cpr);
      if (withRes.length >= 2) {
        const best = withRes[0];
        const worst = withRes[withRes.length - 1];
        const ratio = worst.cpr / best.cpr;
        if (ratio >= 1.3) {
          out.push({
            id: 'account-efficiency',
            tone: 'info',
            title: `${best.account} gets ${label.toLowerCase()} ${ratio.toFixed(1)}× cheaper than ${worst.account}`,
            detail:
              `${money(best.cpr)} per ${unit} (${best.results} from ${money(best.spend)}) vs ${money(worst.cpr)} (${worst.results} from ${money(worst.spend)}). ` +
              `It also needs ${best.clicksPerResult?.toFixed(1) ?? '–'} link clicks per ${unit} vs ${worst.clicksPerResult?.toFixed(1) ?? '–'}, ` +
              `so the gap is in conversion after the click, not just click cost.` +
              (lowSample ? ` Small sample (${total.results} ${label.toLowerCase()} total), so treat this as a direction, not a verdict.` : ''),
          });
        }
      }
      const noRes = accounts.filter((a) => a.results === 0);
      for (const a of noRes) {
        out.push({ id: `account-zero-${a.accountId}`, tone: 'critical', title: `${a.account} spent ${money(a.spend)} with no ${label.toLowerCase()}`, detail: `${a.clicks} link clicks and ${a.impressions.toLocaleString()} impressions produced nothing in this period.` });
      }
    }

    const entities = byEntity(rows);
    const spending = entities.filter((e) => e.spend > 0);

    // Campaigns burning budget without results.
    for (const e of spending) {
      const accountAlreadyFlagged = accounts.length >= 2 && accounts.some((a) => a.accountId === e.accountId && a.results === 0);
      if (e.results === 0 && e.spend >= 0.1 * total.spend && !accountAlreadyFlagged) {
        out.push({ id: `zero-${e.key}`, tone: 'critical', title: `"${e.entity}" spent ${money(e.spend)} with no ${label.toLowerCase()}`, detail: `${((e.spend / total.spend) * 100).toFixed(0)}% of total spend, ${e.clicks} link clicks. Pause it or fix the conversion path.` });
      }
    }

    // Spread between campaigns.
    const scored = spending.filter((e) => e.cpr != null).sort((a, b) => a.cpr - b.cpr);
    if (scored.length >= 2 && accounts.length < 2) {
      const [best, worst] = [scored[0], scored[scored.length - 1]];
      if (worst.cpr / best.cpr >= 1.5) {
        out.push({ id: 'entity-spread', tone: 'info', title: `"${best.entity}" is the most efficient at ${money(best.cpr)} per ${unit}`, detail: `"${worst.entity}" costs ${money(worst.cpr)} — ${(worst.cpr / best.cpr).toFixed(1)}× more. Shifting budget toward the cheaper one is the obvious test.` });
      }
    }

    // Spend concentration.
    if (spending.length >= 2) {
      const top = [...spending].sort((a, b) => b.spend - a.spend)[0];
      const share = top.spend / total.spend;
      if (share >= 0.5 && spending.length >= 3) {
        out.push({ id: 'concentration', tone: 'info', title: `${(share * 100).toFixed(0)}% of spend runs through one ${rows[0].level.toLowerCase()}`, detail: `"${top.entity}" (${top.account}). Results depend heavily on it; any fatigue there moves the whole account.` });
      }
    }

    // Idle campaigns cluttering the export.
    const idle = entities.filter((e) => e.spend === 0);
    if (idle.length) {
      out.push({ id: 'idle', tone: 'info', title: `${idle.length} of ${entities.length} ${rows[0].level.toLowerCase()}s had zero delivery`, detail: `${idle.map((e) => `"${e.entity}"`).join(', ')}. Archive them so exports and reports show only what is live.` });
    }

    // Droughts: consecutive spending days with no results, per live entity.
    const range = dateRange(rows);
    if (range) {
      for (const e of spending) {
        const days = groupBy(rows.filter((r) => r.daily && `${r.accountId}|${r.entity}` === e.key), (r) => r.start);
        let run = 0, runSpend = 0, best = { len: 0, spend: 0, from: '', to: '' }, from = '';
        let lastResult = null;
        for (const d of eachDay(range.from, range.to)) {
          const t = totals(days.get(d) ?? []);
          if (t.results > 0) lastResult = d;
          if (t.spend > 0 && t.results === 0) {
            if (run === 0) from = d;
            run += 1; runSpend += t.spend;
            if (run > best.len) best = { len: run, spend: runSpend, from, to: d };
          } else if (t.results > 0) { run = 0; runSpend = 0; }
        }
        const ongoing = best.to === range.to;
        if (e.results > 0 && best.len >= 5) {
          out.push({
            id: `drought-${e.key}`,
            tone: 'warning',
            title: ongoing
              ? `No ${unit} for the last ${best.len} days on "${e.entity}"`
              : `${best.len}-day stretch without a ${unit} on "${e.entity}"`,
            detail: `${fmtDay(best.from)} – ${fmtDay(best.to)}, ${money(best.spend)} spent (${e.account}).` + (ongoing ? ' Still running: check the form or creative before more budget goes in.' : ''),
          });
        }
        if (lastResult && !(ongoing && best.len >= 5)) {
          const since = eachDay(lastResult, range.to).length - 1;
          if (since >= 4 && e.delivery === 'active') {
            out.push({ id: `since-${e.key}`, tone: 'warning', title: `No ${unit} for the last ${since} days on "${e.entity}"`, detail: `Last one on ${fmtDay(lastResult)}. Check the form or creative before more budget goes in.` });
          }
        }
      }

      // Last 7 days vs the 7 before.
      const all = eachDay(range.from, range.to);
      if (all.length >= 14) {
        const last = new Set(all.slice(-7));
        const prev = new Set(all.slice(-14, -7));
        const a = totals(rows.filter((r) => r.daily && last.has(r.start)));
        const b = totals(rows.filter((r) => r.daily && prev.has(r.start)));
        const moves = [
          ['CTR', pctChange(a.ctr, b.ctr), true],
          [`cost per ${unit}`, pctChange(a.cpr, b.cpr), false],
          ['CPM', pctChange(a.cpm, b.cpm), false],
          ['spend', pctChange(a.spend, b.spend), null],
        ].filter(([, c]) => c != null && Math.abs(c) >= 15);
        if (moves.length || (a.results === 0 && b.results > 0)) {
          const worse = moves.filter(([, c, up]) => up != null && (up ? c < 0 : c > 0)).length;
          out.push({
            id: 'wow',
            tone: a.results === 0 && b.results > 0 ? 'critical' : worse > moves.length / 2 ? 'warning' : 'good',
            title: `Last 7 days vs the 7 before: ${a.results} vs ${b.results} ${label.toLowerCase()}`,
            detail: moves.map(([n, c]) => `${n} ${c > 0 ? '+' : ''}${c.toFixed(0)}%`).join(', ') + (moves.length ? '.' : 'No large swings in delivery metrics.'),
          });
        }
      }
    }

    // Do clicks predict leads? Compare CTR on days with and without a result.
    const days = [...groupBy(rows.filter((r) => r.daily && r.spend > 0), (r) => `${r.accountId}|${r.start}`).values()].map(totals);
    const hit = days.filter((d) => d.results > 0);
    const miss = days.filter((d) => d.results === 0);
    if (hit.length >= 3 && miss.length >= 3) {
      const avg = (xs, k) => xs.reduce((s, x) => s + (x[k] ?? 0), 0) / xs.length;
      const h = avg(hit, 'ctr');
      const m = avg(miss, 'ctr');
      if (m > 0 && h / m >= 1.3) {
        out.push({ id: 'ctr-signal', tone: 'good', title: `Days that produced ${label.toLowerCase()} had ${(h / m).toFixed(1)}× the link CTR`, detail: `${h.toFixed(2)}% on ${hit.length} days with a ${unit} vs ${m.toFixed(2)}% on ${miss.length} days without. CTR is a usable early warning: a low-CTR day rarely converts.` });
      } else if (m > 0 && h / m < 1.1) {
        out.push({ id: 'ctr-signal', tone: 'info', title: `CTR does not predict ${label.toLowerCase()} here`, detail: `${h.toFixed(2)}% link CTR on days with a ${unit} vs ${m.toFixed(2)}% without. The drop-off is after the click (form/landing page), not the ad.` });
      }
    }

    // Weekday pattern.
    const wd = byWeekday(rows).filter((d) => d.impressions > 0);
    if (range && eachDay(range.from, range.to).length >= 14 && wd.length >= 5) {
      const byCtr = [...wd].sort((a, b) => b.ctr - a.ctr);
      const hi = byCtr[0], lo = byCtr[byCtr.length - 1];
      if (lo.ctr > 0 && hi.ctr / lo.ctr >= 1.5) {
        const resHi = [...wd].sort((a, b) => b.results - a.results)[0];
        out.push({ id: 'weekday', tone: 'info', title: `${hi.name} has the best link CTR, ${lo.name} the worst`, detail: `${hi.ctr.toFixed(2)}% vs ${lo.ctr.toFixed(2)}%. Most ${label.toLowerCase()} landed on ${resHi.name} (${resHi.results}). Few weeks of data, so watch whether it repeats before dayparting.` });
      }
    }

    // Budget pacing.
    for (const e of spending) {
      if (e.pacing == null) continue;
      if (e.pacing < 0.8) {
        out.push({ id: `pacing-${e.key}`, tone: 'warning', title: `"${e.entity}" spends ${(e.pacing * 100).toFixed(0)}% of its daily budget`, detail: `Budget ${money(e.budget)}/day. Under-delivery usually means the audience is too narrow or the bid/cap is limiting.` });
      }
    }

    // Delivery dips.
    for (const acc of dailySeries(rows).accounts) {
      const live = acc.points.filter((p) => p.spend > 0);
      const med = median(live.map((p) => p.spend));
      const dips = live.filter((p) => p.spend < 0.6 * med);
      if (!dips.length || dips.length > Math.max(4, live.length / 4)) continue;
      const wdCount = groupBy(dips, (p) => weekdayOf(p.date));
      const [wdIdx, wdDips] = [...wdCount.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      const sameDay = live.filter((p) => weekdayOf(p.date) === wdIdx).length;
      const clustered = wdDips.length >= 3 && wdDips.length / dips.length >= 0.6;
      out.push({
        id: `dip-${acc.accountId}`,
        tone: clustered ? 'warning' : 'info',
        title: clustered
          ? `${acc.account} under-delivers on ${WEEKDAYS_LONG[wdIdx]}s` +
            ` (${wdDips.length === sameDay ? 'every one' : `${wdDips.length} of ${sameDay}`})`
          : `Delivery dipped on ${dips.length} day${dips.length > 1 ? 's' : ''} for ${acc.account}`,
        detail: `${dips.map((p) => `${WEEKDAYS[weekdayOf(p.date)]} ${fmtDay(p.date)} (${money(p.spend)})`).join(', ')} vs a typical ${money(med)}/day.` +
          (clustered ? ' A repeating weekday dip points to an ad schedule, a billing/spend-limit reset, or a weekly audience lull.' : ''),
      });
    }

    // Frequency.
    const freq = total.reach > 0 ? total.impressions / total.reach : null;
    if (freq != null && freq >= 2) {
      out.push({ id: 'frequency', tone: 'warning', title: `Average daily frequency is ${freq.toFixed(1)}`, detail: 'The same people see the ad repeatedly each day. Refresh creative or widen the audience.' });
    }

    const order = { critical: 0, warning: 1, good: 2, info: 3 };
    return out.sort((a, b) => order[a.tone] - order[b.tone]);
  }

  globalThis.MetaAds = Object.assign(globalThis.MetaAds, {
    totals, groupBy, primaryResult, byEntity, byAccount, dateRange, eachDay, dailySeries, weekdayOf, weeks, byWeekday, insights, rollingCostPerResult: rolling,
  });
})();
