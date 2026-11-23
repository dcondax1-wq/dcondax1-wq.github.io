// Research Hub: the Strategy Lab tab (day-mind 2026-11-23). Data = lab-data.json (tools/build_strategy_lab.py): one row per tested strategy,
// up to three spans of numbers. A sortable table (by $/month, PF, trades a week; on the worst or the latest span), verdict filter, the
// "Best add-on to LIT" card. Rows tap open to the rules (3 lines) and every span. Built with createElement / textContent only. Read only.
(function () {
  'use strict';
  const S = { data: null, sort: 'usd_mo', dir: -1, on: 'worst', v: '', open: null };
  const $ = (id) => document.getElementById(id);
  const VW = { live: 'Live', paper: 'Paper', promising: 'Promising', rejected: 'Rejected' };
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  }
  const n = (v) => (v == null || !Number.isFinite(+v) ? null : +v);
  const fmt = (v, d) => (n(v) === null ? '-' : n(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const usd = (v) => (n(v) === null ? '-' : (n(v) < 0 ? '-$' : '$') + Math.abs(Math.round(n(v))).toLocaleString('en-US'));

  /** the span a row is scored on: its worst (lowest $/month) or its latest */
  function pick(r) {
    const sp = (r.spans || []).filter((x) => x && typeof x === 'object');
    if (!sp.length) return {};
    if (S.on === 'latest') return sp[sp.length - 1];
    return sp.reduce((a, b) => ((n(b.usd_mo) ?? 1e12) < (n(a.usd_mo) ?? 1e12) ? b : a));
  }
  function rows() {
    const d = S.data; if (!d) return [];
    return d.rows.filter((r) => !S.v || r.verdict === S.v || (S.v === 'promising' && r.verdict === 'paper'))
      .map((r) => ({ r, s: pick(r) }))
      .sort((a, b) => ((n(a.s[S.sort]) ?? -1e12) - (n(b.s[S.sort]) ?? -1e12)) * S.dir || a.r.name.localeCompare(b.r.name));
  }

  function render() {
    const box = $('labBody'); if (!box || !S.data) return;
    box.replaceChildren();
    const d = S.data;
    if (d.fixture) box.append(el('div', { class: 'lsample', id: 'hubSample', text: 'SAMPLE rows: the popular-strategy files (ICT + classic) have not landed yet. Rows named SAMPLE are placeholders, not results. LIT, ATLAS and the Strategy Lab (LIT variant) rows are real.' }));
    const b = d.best_addon || {};
    box.append(el('div', { class: 'lbest', id: 'hubBest' }, el('b', { text: 'Best add-on to LIT' }), el('div', { class: 'nm', text: b.name || (/^None passed/.test(b.why || '') ? 'None passed' : 'None yet') }), el('p', { text: b.why || '' })));
    const counts = { live: 0, paper: 0, promising: 0, rejected: 0 }; d.rows.forEach((r) => { if (r.verdict in counts) counts[r.verdict] += 1; });
    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Verdict' });
    [['', `All ${d.rows.length}`], ['live', `Live ${counts.live}`], ['promising', `Promising ${counts.promising + counts.paper}`], ['rejected', `Rejected ${counts.rejected}`]].forEach(([v, t]) =>
      chips.append(el('button', { type: 'button', class: 'chip ' + (v ? v[0] : ''), 'data-lv': v, 'aria-pressed': String(S.v === v), text: t, onclick: () => { S.v = v; render(); } })));
    box.append(chips);
    const on = el('div', { class: 'chips', role: 'group', 'aria-label': 'Score on' });
    [['worst', 'Worst span'], ['latest', 'Latest span']].forEach(([k, t]) => on.append(el('button', { type: 'button', class: 'chip', 'data-on': k, 'aria-pressed': String(S.on === k), text: t, onclick: () => { S.on = k; render(); } })));
    box.append(on);
    const tb = el('table', { class: 'ltab', id: 'labTable' }), hr = el('tr');
    hr.append(el('th', { text: 'Strategy' }));
    [['usd_mo', '$/mo'], ['pf', 'PF'], ['tpw', '/wk']].forEach(([k, t]) => {
      const sorted = S.sort === k;
      hr.append(el('th', { 'aria-sort': sorted ? (S.dir < 0 ? 'descending' : 'ascending') : 'none' },
        el('button', { type: 'button', class: 'sort' + (sorted ? ' on' : ''), 'data-sort': k, text: t + (sorted ? (S.dir < 0 ? ' ▼' : ' ▲') : ''), onclick: () => { if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = -1; } render(); } })));
    });
    tb.append(el('thead', {}, hr));
    const body = el('tbody');
    for (const { r, s } of rows()) {
      const tr = el('tr', { class: 'lr', 'data-id': r.id, tabindex: 0, onclick: () => { S.open = S.open === r.id ? null : r.id; render(); } });
      tr.append(el('td', {}, el('span', { class: 'vt v-' + r.verdict, text: VW[r.verdict] || r.verdict }), el('span', { class: 'ln', text: r.name }), el('small', { text: `${r.family} · ${s.k || ''}` })));
      tr.append(el('td', { class: (n(s.usd_mo) || 0) > 0 ? 'pos' : 'neg', text: usd(s.usd_mo) }), el('td', { text: fmt(s.pf, 2) }), el('td', { text: fmt(s.tpw, 1) }));
      body.append(tr);
      if (S.open === r.id) {
        const det = el('td', { colspan: 4, class: 'ldet' });
        if (r.watch) det.append(el('p', { class: 'lwatch', text: r.watch })); else if (r.why) det.append(el('p', { class: 'lwhy', text: 'Why: ' + r.why }));
        const ol = el('ol'); (r.rules || []).slice(0, 3).forEach((t) => ol.append(el('li', { text: t }))); det.append(ol);
        const st = el('table', { class: 'lspan' }), h = el('tr'); ['Span', '/wk', 'Win', 'PF', '$/mo', 'Max DD'].forEach((x) => h.append(el('th', { text: x }))); st.append(h);
        (r.spans || []).forEach((x) => { const rr = el('tr'); [x.k, fmt(x.tpw, 1), x.win == null ? '-' : fmt(x.win, 0) + '%', fmt(x.pf, 2), usd(x.usd_mo), usd(x.maxdd)].forEach((v) => rr.append(el('td', { text: v }))); st.append(rr); });
        det.append(st, el('a', { class: 'lgo', href: 'mind/', text: 'See it in the Strategy Brain ›' }));
        body.append(el('tr', { class: 'ldrow' }, det));
      }
    }
    tb.append(body); box.append(tb);
    box.append(el('p', { class: 'foot', text: `Sources: ${(d.sources || []).join(', ')}. Scored on each row's ${S.on} span. Read only: nothing here changes a bot.` }));
  }

  function tab(t) {
    const lab = t === 'lab';
    $('main').hidden = lab; $('lab').hidden = !lab;
    for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    if (lab && !S.data) load();
    try { history.replaceState(null, '', lab ? '#lab' : location.pathname + location.search); } catch (_) { /* file: */ }
  }
  async function load() {
    const box = $('labBody');
    try {
      const r = await fetch('lab-data.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(); if (!d || !Array.isArray(d.rows)) throw new Error('bad data');
      S.data = d; render();
    } catch (e) { if (box) box.replaceChildren(el('p', { class: 'foot', text: 'Could not load the Strategy Lab (' + e.message + ').' })); }
  }
  function boot() {
    const t = $('tabs'); if (!t) return;
    t.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) tab(b.dataset.tab); });
    if (location.hash === '#lab') tab('lab');
  }
  window.HubLab = { S, rows, pick, render, tab };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
