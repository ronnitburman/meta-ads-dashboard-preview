/* global Papa, Chart */
(() => {
  const {
    parseExport, combine, totals, byEntity, byWeekday, dailySeries, dateRange, insights, primaryResult, rollingCostPerResult,
    contextReport, weeks, weekdayOf,
  } = globalThis.MetaAds;
  const $ = (sel) => document.querySelector(sel);
  const STORE = 'meta-ads-dashboard:v1';

  const state = {
    exports: [], // { fileName, ...parseExport() }
    names: {}, // accountId -> display name override
    colors: {}, // accountId -> series slot (fixed at first sight, never re-ranked)
    hidden: new Set(), // accountIds toggled off
    from: '',
    to: '',
    hideIdle: true,
    sort: { key: 'spend', dir: -1 },
  };
  const charts = {};

  // ---------- persistence (per-browser convenience only) ----------
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ exports: state.exports, names: state.names, colors: state.colors }));
    } catch { /* storage full or blocked: the dashboard still works for this visit */ }
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (saved) Object.assign(state, { exports: saved.exports ?? [], names: saved.names ?? {}, colors: saved.colors ?? {} });
    } catch { /* ignore */ }
  }

  // ---------- formatting ----------
  let currency = 'INR';
  const money = (n, digits = 0) => (n == null ? '–' : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: digits }).format(n));
  const int = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-IN'));
  const pct = (n) => (n == null ? '–' : `${n.toFixed(2)}%`);
  const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const seriesColor = (accountId) => css(`--series-${(state.colors[accountId] % 8) + 1}`);

  // ---------- ingest ----------
  function ingest(files) {
    const errors = [];
    let pending = files.length;
    for (const file of files) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data, meta }) => {
          try {
            const ex = parseExport(data, file.name, meta.fields);
            if (!ex.rows.length) throw new Error(`${file.name}: no rows found.`);
            state.exports = state.exports.filter((e) => e.fileName !== file.name).concat({ fileName: file.name, ...ex });
            for (const w of ex.warnings) errors.push(`${file.name}: ${w}`);
          } catch (err) {
            errors.push(err.message);
          }
          if (--pending === 0) {
            $('#errors').textContent = errors.join(' ');
            afterDataChange();
          }
        },
        error: (err) => {
          errors.push(`${file.name}: ${err.message}`);
          if (--pending === 0) { $('#errors').textContent = errors.join(' '); afterDataChange(); }
        },
      });
    }
  }

  function allRows() {
    return combine(state.exports).map((r) => ({ ...r, account: state.names[r.accountId] ?? r.account }));
  }

  function afterDataChange() {
    for (const ex of state.exports) {
      if (state.colors[ex.account.id] == null) state.colors[ex.account.id] = Object.keys(state.colors).length;
    }
    const range = dateRange(allRows());
    state.from = range?.from ?? '';
    state.to = range?.to ?? '';
    save();
    render();
  }

  // ---------- render ----------
  function filteredRows() {
    return allRows().filter((r) => !state.hidden.has(r.accountId)
      && (!state.from || !r.daily || r.start >= state.from)
      && (!state.to || !r.daily || r.start <= state.to));
  }

  function render() {
    const has = state.exports.length > 0;
    $('#dashboard').hidden = !has;
    $('#empty').hidden = has;
    $('#addFiles').hidden = !has;
    document.body.classList.toggle('has-data', has);
    renderFiles();
    if (!has) return;
    currency = state.exports[0].currency;
    const rows = filteredRows();
    const label = primaryResult(allRows()).label;
    const unit = label.replace(/s$/, '').toLowerCase();

    renderFilters();
    renderKpis(rows, label, unit);
    renderInsights(rows);
    renderCharts(rows, label, unit);
    renderTable(rows, label, unit);
    refreshPreview();
  }

  function renderFiles() {
    $('#files').innerHTML = state.exports.map((ex) => {
      const range = dateRange(ex.rows);
      const name = state.names[ex.account.id] ?? ex.rows[0]?.account ?? ex.account.name;
      return `<div class="file" title="${esc(ex.fileName)}">
        <span class="swatch" style="background:${seriesColor(ex.account.id)}"></span>
        <span class="name" data-rename="${esc(ex.account.id)}" title="Click to rename this account">${esc(name)}</span>
        <span class="meta">${range ? `${fmtDay(range.from)} – ${fmtDay(range.to)}` : `${ex.rows.length} rows`}</span>
        <button type="button" data-remove="${esc(ex.fileName)}" aria-label="Remove ${esc(ex.fileName)}">×</button>
      </div>`;
    }).join('') + (state.exports.length ? '<button class="btn btn-ghost" type="button" data-clear>Clear all</button>' : '');
  }

  function renderFilters() {
    const accounts = [...new Map(allRows().map((r) => [r.accountId, r.account])).entries()];
    $('#accountFilter').innerHTML = accounts.length < 2 ? '' : accounts.map(([id, name]) => `
      <button type="button" class="pill" data-account="${esc(id)}" aria-pressed="${!state.hidden.has(id)}">
        <span class="swatch" style="background:${seriesColor(id)}"></span>${esc(name)}
      </button>`).join('');
    const range = dateRange(allRows());
    for (const id of ['from', 'to']) {
      const el = $(`#${id}`);
      el.min = range?.from ?? '';
      el.max = range?.to ?? '';
      el.value = state[id];
    }
    $('#hideIdle').checked = state.hideIdle;
  }

  function renderKpis(rows, label, unit) {
    const t = totals(rows);
    const range = dateRange(rows);
    const accounts = new Set(rows.map((r) => r.accountId)).size;
    $('#periodLabel').textContent = range
      ? `${fmtDay(range.from)} – ${fmtDay(range.to)} · ${accounts} account${accounts === 1 ? '' : 's'}`
      : '';
    const tiles = [
      ['Amount spent', money(t.spend), t.activeDays ? `${t.activeDays} days with spend` : ''],
      [label, int(t.results), t.activeDays ? `${(t.results / t.activeDays).toFixed(2)} per active day` : ''],
      [`Cost per ${unit}`, money(t.cpr), ''],
      ['Link clicks', int(t.clicks), `${t.clicksPerResult ? t.clicksPerResult.toFixed(1) : '–'} clicks per ${unit}`],
      ['Link CTR', pct(t.ctr), `${int(t.impressions)} impressions`],
      ['CPC (link)', money(t.cpc, 2), ''],
      ['CPM', money(t.cpm), ''],
    ];
    $('#kpis').innerHTML = tiles.map(([l, v, s]) => `<div class="kpi"><div class="label">${esc(l)}</div><div class="value">${v}</div><div class="sub">${esc(s)}</div></div>`).join('');
  }

  const TONES = { critical: ['Critical', '⛔'], warning: ['Watch', '▲'], good: ['Working', '✓'], info: ['Pattern', '●'] };
  function renderInsights(rows) {
    const list = insights(rows, (n) => money(n));
    const urgent = list.filter((i) => i.tone === 'critical' || i.tone === 'warning').length;
    $('#insightCount').textContent = list.length
      ? `${list.length} found${urgent ? ` · ${urgent} need attention` : ''}`
      : '';
    $('#insights').innerHTML = list.length
      ? list.map((i) => `<li class="insight" data-tone="${i.tone}">
          <span class="tag" data-icon="${TONES[i.tone][1]}">${TONES[i.tone][0]}</span>
          <strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p></li>`).join('')
      : '<li class="empty">Not enough spend in this selection to find patterns.</li>';
  }

  // ---------- charts ----------
  function baseOptions({ stacked = false, integer = false, yFmt = (v) => v } = {}) {
    const grid = css('--grid');
    const text = css('--text-muted');
    Chart.defaults.font.family = css('--font');
    Chart.defaults.font.size = 11;
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: false,
      plugins: {
        legend: { display: true, position: 'bottom', align: 'start', labels: { color: css('--text-secondary'), usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, padding: 16, font: { size: 12 } } },
        tooltip: {
          backgroundColor: css('--ink'), titleColor: css('--on-ink'), bodyColor: css('--on-ink'),
          padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true, titleFont: { weight: '600' },
          callbacks: { label: (c) => `${c.dataset.label}: ${c.raw == null ? '–' : yFmt(c.raw)}` },
        },
      },
      scales: {
        x: { stacked, grid: { display: false }, ticks: { color: text, maxRotation: 0, autoSkipPadding: 12 }, border: { color: grid } },
        y: { stacked, beginAtZero: true, grid: { color: grid }, ticks: { color: text, callback: yFmt, ...(integer && { precision: 0, stepSize: 1 }) }, border: { display: false } },
      },
    };
  }

  function draw(id, config) {
    charts[id]?.destroy();
    charts[id] = new Chart($(`#${id}`), config);
  }

  // ---------- chart overlays: week bands + lead markers ----------
  // Shaded alternate weeks with a hairline at each Monday go behind the data;
  // one row of dots per account above the plot marks days that produced a result.
  const MARK_ROW = 12;
  const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeOverlays = {
    id: 'timeOverlays',
    beforeDraw(chart, _args, opts) {
      if (!opts.weeks?.length) return;
      const { ctx, chartArea: a, scales: { x } } = chart;
      const step = x.getPixelForValue(1) - x.getPixelForValue(0) || a.width;
      const edge = (i) => x.getPixelForValue(i) - step / 2;
      ctx.save();
      ctx.fillStyle = opts.bandColor;
      for (const w of opts.weeks) {
        if (w.n % 2) continue;
        const left = Math.max(a.left, edge(w.from));
        const right = Math.min(a.right, edge(w.to + 1));
        ctx.fillRect(left, a.top, right - left, a.bottom - a.top);
      }
      ctx.strokeStyle = opts.lineColor;
      ctx.lineWidth = 1;
      for (const w of opts.weeks.slice(1)) {
        const px = Math.round(Math.max(a.left, edge(w.from))) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, a.top);
        ctx.lineTo(px, a.bottom);
        ctx.stroke();
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts.leads?.length) return;
      const { ctx, chartArea: a, scales: { x } } = chart;
      ctx.save();
      opts.leads.forEach((row, r) => {
        const y = a.top - (opts.leads.length - r) * MARK_ROW + MARK_ROW / 2 - 3;
        row.counts.forEach((n, i) => {
          if (!n) return;
          ctx.beginPath();
          ctx.arc(x.getPixelForValue(i), y, Math.min(2.5 + n, 5.5), 0, Math.PI * 2);
          ctx.fillStyle = row.color;
          ctx.fill();
        });
      });
      ctx.restore();
    },
  };

  function renderCharts(rows, label, unit) {
    const series = dailySeries(rows);
    const labels = series.days.map(fmtDay);
    const surface = css('--surface-1');
    const wk = weeks(series.days);
    const weekOf = [];
    for (const w of wk) for (let i = w.from; i <= w.to; i += 1) weekOf[i] = w.n;
    const leadRows = series.accounts.map((a) => ({ color: seriesColor(a.accountId), counts: a.points.map((p) => p.results) }));

    // Options shared by the day-by-day charts: week bands, week-start labels,
    // weekday + week in the tooltip title and, optionally, lead markers.
    const timeOptions = (base, { marks = true } = {}) => {
      const o = baseOptions(base);
      o.layout = { padding: { top: marks ? leadRows.length * MARK_ROW + 4 : 4 } };
      o.plugins.timeOverlays = { weeks: wk, bandColor: css('--surface-2'), lineColor: css('--border'), leads: marks ? leadRows : [] };
      // Label each Monday; label the first day too unless a Monday follows within 2 days (labels would collide).
      const labelFirst = (wk[1]?.from ?? Infinity) >= 3;
      o.scales.x.ticks = { ...o.scales.x.ticks, autoSkip: false, callback: (_v, i) => ((i === 0 && labelFirst) || (i > 0 && weekdayOf(series.days[i]) === 1) ? labels[i] : '') };
      o.plugins.tooltip.callbacks.title = (items) => {
        const i = items[0].dataIndex;
        return `${WEEKDAY_SHORT[weekdayOf(series.days[i])]} ${labels[i]} · Week ${weekOf[i]}`;
      };
      if (marks) {
        o.plugins.tooltip.callbacks.afterBody = (items) => {
          const i = items[0].dataIndex;
          return `${label}: ${series.accounts.map((a) => `${a.account} ${a.points[i].results}`).join(' · ')}`;
        };
      }
      return o;
    };
    const bar = (acc, values) => ({
      label: acc.account, data: values, backgroundColor: seriesColor(acc.accountId),
      borderColor: surface, borderWidth: { top: 2 }, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18,
    });
    // Lines show a point only on days that produced a result, so conversions read against the trend.
    const line = (acc, values) => ({
      label: acc.account, data: values, borderColor: seriesColor(acc.accountId), backgroundColor: seriesColor(acc.accountId),
      borderWidth: 2, pointHoverRadius: 5, spanGaps: true, cubicInterpolationMode: 'monotone',
      pointRadius: (c) => (acc.points[c.dataIndex]?.results ? 4 : 0),
      pointBorderColor: surface, pointBorderWidth: 2,
    });

    document.querySelectorAll('[data-unit]').forEach((el) => { el.textContent = currency; });
    document.querySelector('[data-results-title]').textContent = `Daily ${label.toLowerCase()}`;
    document.querySelector('[data-cpr-title]').textContent = `Cost per ${unit}, rolling 7 days`;
    document.querySelector('[data-lead-key]').textContent = `Day with a ${unit}`;

    const plugins = [timeOverlays];
    draw('cSpend', { type: 'bar', plugins, data: { labels, datasets: series.accounts.map((a) => bar(a, a.points.map((p) => p.spend))) }, options: timeOptions({ stacked: true, yFmt: (v) => money(v) }) });
    draw('cResults', { type: 'bar', plugins, data: { labels, datasets: series.accounts.map((a) => bar(a, a.points.map((p) => p.results))) }, options: timeOptions({ stacked: true, integer: true, yFmt: (v) => int(v) }, { marks: false }) });
    draw('cCpr', { type: 'line', plugins, data: { labels, datasets: series.accounts.map((a) => line(a, rollingCostPerResult(a.points, 7))) }, options: timeOptions({ yFmt: (v) => money(v) }) });
    draw('cCtr', { type: 'line', plugins, data: { labels, datasets: series.accounts.map((a) => line(a, a.points.map((p) => p.ctr))) }, options: timeOptions({ yFmt: (v) => `${Number(v).toFixed(1)}%` }) });

    const wdByAcc = [...new Map(rows.map((r) => [r.accountId, r.account])).entries()].map(([id, name]) => ({
      accountId: id, account: name, days: byWeekday(rows.filter((r) => r.accountId === id)),
    }));
    const wdOpts = baseOptions({ yFmt: (v) => `${Number(v).toFixed(1)}%` });
    wdOpts.interaction = { mode: 'index', intersect: false };
    wdOpts.plugins.tooltip.callbacks.label = (c) => {
      const d = wdByAcc[c.datasetIndex].days[c.dataIndex];
      return `${c.dataset.label}: ${pct(d.ctr)} CTR · ${d.results} ${label.toLowerCase()} · ${money(d.spend)}`;
    };
    draw('cWeekday', {
      type: 'bar',
      data: { labels: wdByAcc[0]?.days.map((d) => d.name) ?? [], datasets: wdByAcc.map((a) => bar(a, a.days.map((d) => d.ctr))) },
      options: wdOpts,
    });
  }

  // ---------- table ----------
  function renderTable(rows, label, unit) {
    const level = rows[0]?.level ?? 'Campaign';
    $('#tableTitle').textContent = `${level}s`;
    let list = byEntity(rows);
    if (state.hideIdle) list = list.filter((e) => e.spend > 0);
    const cols = [
      ['entity', level, (e) => `${esc(e.entity)}${e.delivery ? `<span class="badge" data-state="${esc(e.delivery)}">${esc(e.delivery)}</span>` : ''}`],
      ['account', 'Account', (e) => `<span class="swatch" style="display:inline-block;margin-right:6px;background:${seriesColor(e.accountId)}"></span>${esc(e.account)}`],
      ['spend', 'Spent', (e) => money(e.spend)],
      ['results', label, (e) => int(e.results)],
      ['cpr', `Cost / ${unit}`, (e) => money(e.cpr)],
      ['clicks', 'Link clicks', (e) => int(e.clicks)],
      ['ctr', 'Link CTR', (e) => pct(e.ctr)],
      ['cpc', 'CPC', (e) => money(e.cpc, 2)],
      ['cpm', 'CPM', (e) => money(e.cpm)],
      ['pacing', 'Budget used', (e) => (e.pacing == null ? '<span class="dim">–</span>' : `${Math.round(e.pacing * 100)}% of ${money(e.budget)}`)],
    ];
    const { key, dir } = state.sort;
    list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
    const sum = totals(rows);
    $('#table').innerHTML = `<thead><tr>${cols.map(([k, h]) => `<th data-sort="${k}" aria-sort="${k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${list.map((e) => `<tr>${cols.map(([, , f]) => `<td>${f(e)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td><strong>Total</strong></td><td></td><td>${money(sum.spend)}</td><td>${int(sum.results)}</td><td>${money(sum.cpr)}</td><td>${int(sum.clicks)}</td><td>${pct(sum.ctr)}</td><td>${money(sum.cpc, 2)}</td><td>${money(sum.cpm)}</td><td></td></tr></tfoot>`;
  }

  // ---------- events ----------
  $('#file').addEventListener('change', (e) => { ingest([...e.target.files]); e.target.value = ''; });
  // Files can be dropped anywhere on the page; the drop zone and overlay light up while dragging.
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth += 1; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.csv$/i.test(f.name));
    if (files.length) ingest(files);
  });
  // The "Add files" label acts as a button for keyboard users too.
  $('#addFiles').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });

  $('#files').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { state.exports = state.exports.filter((x) => x.fileName !== rm.dataset.remove); afterDataChange(); return; }
    if (e.target.closest('[data-clear]')) { state.exports = []; state.hidden.clear(); afterDataChange(); return; }
    const rn = e.target.closest('[data-rename]');
    if (rn) {
      const name = prompt('Account name', rn.textContent);
      if (name?.trim()) { state.names[rn.dataset.rename] = name.trim(); save(); render(); }
    }
  });
  $('#accountFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-account]');
    if (!b) return;
    const id = b.dataset.account;
    if (state.hidden.has(id)) state.hidden.delete(id); else state.hidden.add(id);
    render();
  });
  $('#from').addEventListener('change', (e) => { state.from = e.target.value; render(); });
  $('#to').addEventListener('change', (e) => { state.to = e.target.value; render(); });
  // ---------- copy for AI ----------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API unavailable (older Safari, some file:// setups): fall back to a selection copy.
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  const isTouch = matchMedia('(pointer: coarse)').matches;
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const pasteHint = isTouch ? 'long-press → Paste' : isMac ? '⌘V' : 'Ctrl+V';
  document.querySelectorAll('[data-paste]').forEach((el) => { el.textContent = pasteHint; });

  function aiText() {
    const hiddenAccounts = [...new Map(allRows().filter((r) => state.hidden.has(r.accountId)).map((r) => [r.accountId, r.account])).values()];
    return contextReport(filteredRows(), { currency, hideIdle: state.hideIdle, hiddenAccounts, question: $('#aiQuestion').value });
  }

  function refreshPreview() {
    const preview = $('#aiPreview');
    if (preview.open) preview.querySelector('textarea').value = aiText();
  }

  // `target` names the assistant being opened, if any.
  async function copyForAI(target) {
    const text = aiText();
    const ok = await copyText(text);
    const status = $('#copyStatus');
    status.classList.toggle('error', !ok);
    const asked = $('#aiQuestion').value.trim() ? ' and your question' : '';
    status.textContent = ok
      ? `Copied the data${asked} (${text.trimEnd().split('\n').length} lines). ${target ? `In ${target}, click` : 'Open your AI chat, click'} the message box and paste (${pasteHint}), then send.`
      : 'Your browser blocked copying. Open "See exactly what gets copied" below, select all the text and copy it yourself.';
    if (!ok) { $('#aiPreview').open = true; refreshPreview(); }
  }

  // The link still opens the assistant in a new tab; copying starts in the same click.
  document.querySelectorAll('[data-assistant]').forEach((a) => a.addEventListener('click', () => copyForAI(a.textContent.trim())));
  $('#copy').addEventListener('click', () => copyForAI());

  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    $('#aiQuestion').value = chip.textContent;
    document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    refreshPreview();
  }));
  $('#aiQuestion').addEventListener('input', (e) => {
    document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === e.target.value)));
    refreshPreview();
  });
  $('#aiPreview').addEventListener('toggle', refreshPreview);

  $('#hideIdle').addEventListener('change', (e) => { state.hideIdle = e.target.checked; render(); });
  $('#table').addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'entity' || k === 'account' ? 1 : -1) };
    render();
  });

  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(`${STORE}:theme`, root.dataset.theme); } catch { /* ignore */ }
    render();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  try { const t = localStorage.getItem(`${STORE}:theme`); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }

  // ---------- installed-app plumbing ----------
  // Offline support and the share target need a service worker, which only
  // runs over http(s); opening index.html from disk simply skips this.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* app still works online */ });
  }

  // CSVs shared from another app (Android share sheet) are parked by sw.js.
  async function takeSharedFiles() {
    if (!new URLSearchParams(location.search).has('shared') || !('caches' in window)) return;
    history.replaceState(null, '', location.pathname);
    const cache = await caches.open('shared-files');
    const files = [];
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      files.push(new File([await res.blob()], decodeURIComponent(res.headers.get('x-file-name') ?? 'shared.csv'), { type: 'text/csv' }));
      await cache.delete(req);
    }
    if (files.length) ingest(files);
  }

  // "Open with → Meta Ads Dashboard" on desktop once installed.
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async ({ files }) => {
      if (files?.length) ingest(await Promise.all(files.map((h) => h.getFile())));
    });
  }

  load();
  afterDataChange();
  takeSharedFiles();
})();
