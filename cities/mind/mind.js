// Strategy Brain page (cities/mind/index.html). Reads odeon/trades.json (the trade ledger + replays), cities/brain-data.json (the
// research findings), home.json and the PC's status post (pc_feed.js). Built with createElement / textContent and SVG nodes only
// (no innerHTML of data). Read only: no arm / start / stop / order anywhere.
import * as M from './mindcore.js?v=m5';
import * as P from '../../pillars/pillarscore.js?v=p3';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const S = { file: null, data: null, lab: null, pillars: null, home: null, lite: null, glance: null, sel: null, trade: null, showAll: false, scene: null, now: () => Date.now() / 1000 };

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
function sv(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; }
async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }

/* ---------------- the lobe buttons (always there: the accessible way, and the low-power way) ---------------- */
function drawLobeBar() {
  const bar = $('lobes'); bar.replaceChildren();
  for (const L of M.LOBES) {
    const v = L.kind === 'strategy' ? M.live(L.id, S.glance, S.now()) : null;
    const b = el('button', { type: 'button', class: 'lobe' + (L.kind === 'research' ? ' res' : ''), 'data-lobe': L.id, 'aria-pressed': String(S.sel === L.id || (L.id === 'lab' && String(S.sel || '').startsWith('lab:'))), style: `--c:${L.color}`, onclick: () => select(L.id === S.sel ? null : L.id) },
      el('i'), el('span', { text: L.name }), el('small', { text: v ? lobeWord(L, v) : L.kind === 'lab' ? labWord() : L.kind === 'pillar' ? pillarWord(L.id) : 'research' }));
    bar.append(b);
  }
}
function pillarModel(id) {
  const p = S.pillars && (S.pillars.pillars || []).find((x) => x.id === id); if (!p) return null;
  return { ...P.pillar(p, { nowS: S.now(), glance: S.glance, lite: S.lite, file: S.file }), lessonsSample: !!S.pillars.lessons_sample };   // no account cards here: the Pillars page has them
}
function pillarWord(id) { const m = pillarModel(id); if (!m) return 'pillar'; return id === 'of' ? (m.tick && m.tick.has ? `${m.tick.d}/${m.tick.of} tick days` : 'waiting for ticks') : m.statusWord.toLowerCase(); }
function labWord() { const c = M.labCounts(S.lab); const n = c.live + c.paper + c.promising + c.rejected; return n ? `${n} tested · ${c.paper + c.promising} promising` : 'loading'; }
function lobeWord(L, v) {
  const ch = M.CHAINS[L.id] || [];
  return v.word === 'live' && ch[v.idx] ? `${ch[v.idx].label} now` : v.word === 'stale' && ch[v.idx] ? `last: ${ch[v.idx].label}` : v.word;
}
function pcPill() {
  const p = $('pcPill'), g = S.glance, t = g && +g.t ? S.now() - +g.t : null;
  if (t === null) { p.textContent = 'PC: waiting'; p.className = 'pill'; return; }
  p.textContent = t < M.FRESH_S ? `PC live · ${M.ageText(t)}` : `PC ${M.ageText(t)}`; p.className = 'pill ' + (t < M.FRESH_S ? 'live' : 'stale');
}

/* ---------------- the sheet ---------------- */
function select(id) {
  S.sel = id; S.trade = null; S.showAll = false;
  if (S.scene) S.scene.select(id);
  drawLobeBar(); drawFlat();
  const sh = $('sheet');
  document.body.classList.toggle('sheet-open', !!id);
  if (!id) { sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true'); return; }
  renderSheet(); sh.classList.add('open'); sh.setAttribute('aria-hidden', 'false'); sh.scrollTop = 0;
}
function renderSheet() {
  if (String(S.sel || '').startsWith('lab:')) return neuronBody($('body'), S.sel.slice(4));
  if (String(S.sel || '').startsWith('find:')) return findingBody($('body'), S.sel);
  if (String(S.sel || '').startsWith('of:')) return ofTestBody($('body'), S.sel.slice(3));
  const L = M.lobeById(S.sel), body = $('body'); if (!L) return;
  if (L.kind === 'lab') return labBody(body);
  if (L.kind === 'pillar') return pillarBody(body, L);
  body.replaceChildren(el('h2', { text: L.name }), el('div', { class: 'muted', text: L.kind === 'strategy' ? L.sub : 'Research lobe: everything we tested in this family.' }));
  if (L.pillar) body.append(el('p', { class: 'muted' }, el('a', { class: 'link', href: '../../pillars/#' + L.id, text: `Open the ${L.name} pillar: accounts, edge, what's next ›` })));
  if (L.kind === 'strategy') strategyBody(L, body); else researchBody(L, body);
}
function strategyBody(L, body) {
  const v = M.live(L.id, S.glance, S.now()), chain = M.chainStates(L.id, v);
  const word = { live: 'Live', stale: 'Last known', waiting: 'Waiting', watching: 'Watching', done: 'Done for today', off: 'Off' }[v.word] || v.word;
  body.append(el('div', { class: 'state', id: 'liveState' }, el('b', { class: v.fresh ? 'live' : v.has ? 'stale' : 'waiting', text: word + (v.has ? ` · PC ${M.ageText(v.age)}` : '') }),
    document.createTextNode(' ' + (v.text || (v.has ? '' : 'Waiting for the PC\'s report.')))));
  body.append(el('h3', { text: 'How it thinks' }));
  const ar = el('div', { class: 'arrows', 'aria-hidden': 'true' });
  chain.forEach((s, i) => { if (i) ar.append(el('em', { text: '→' })); ar.append(el('span', { text: s.label })); });
  body.append(ar);
  const ol = el('ol', { class: 'chain', id: 'chain' });
  for (const s of chain) ol.append(el('li', { class: s.state, 'data-step': s.key }, el('span', { class: 'dot', text: s.state === 'done' ? '✓' : String(s.n) }), el('b', { text: s.label }), el('p', { text: s.help })));
  body.append(ol);

  const all = M.tradesFor(L.id, S.file);
  body.append(el('h3', { text: `Trades (${all.length})` }));
  if (!all.length) { body.append(el('p', { class: 'muted', text: 'No trades of this lobe in the ledger yet.' })); return; }
  const wrap = el('div', { class: 'tlwrap', id: 'tlwrap' });
  body.append(wrap);
  const list = el('div', { class: 'trades', id: 'trades' }), shown = S.showAll ? all : all.slice(0, 8);
  for (const t of shown) {
    const tl = M.timeline(L.id, t), won = (tl.usd || 0) > 0;
    list.append(el('button', { type: 'button', class: 'tr', 'data-id': tl.id, 'aria-pressed': String(S.trade === tl.id), onclick: () => { S.trade = tl.id; drawTimeline(L, t); markTrades(); } },
      el('span', {}, document.createTextNode(`${tl.day} · ${tl.side} ${tl.qty || ''} MNQ`), el('span', { class: 'src ' + tl.src, text: tl.src })),
      el('span', { class: 'usd ' + (won ? 'win' : 'loss'), text: tl.result }),
      el('span', { class: 'm', text: `Setup ${tl.setup.hm} · in ${tl.entry.hm} · out ${tl.exit.hm} ET` }), el('span', { class: 'm', text: tl.exit.kind.toLowerCase() })));
  }
  body.append(list);
  if (!S.showAll && all.length > shown.length) body.append(el('button', { type: 'button', class: 'more', text: `Show all ${all.length}`, onclick: () => { S.showAll = true; renderSheet(); } }));
  const first = S.trade ? all.find((t) => t.id === S.trade) : all[0];
  S.trade = first.id; drawTimeline(L, first); markTrades();
}
function markTrades() { for (const b of document.querySelectorAll('.tr')) b.setAttribute('aria-pressed', String(b.dataset.id === S.trade)); }

/* ---------------- one trade: horizontal timeline on a 5m mini-chart ---------------- */
function drawTimeline(L, t) {
  const tl = M.timeline(L.id, t), w = M.chartWindow(tl), box = $('tlwrap'); if (!box) return;
  box.replaceChildren();
  const card = el('div', { class: 'tl', id: 'timeline', 'data-id': tl.id });
  card.append(el('div', { class: 'muted', text: `${tl.label} · ${tl.day} · ${tl.side} ${tl.qty || ''} micro${tl.qty === 1 ? '' : 's'} · ${tl.src}` }));
  if (w) card.append(chart(tl, w));
  const row = el('div', { class: 'tlrow', id: 'tlrow' });
  const chip = (label, hm, text, cls) => el('div', { class: 'tlstep ' + (cls || '') }, el('b', { text: label }), el('span', { class: 't', text: hm || 'not recorded' }), el('div', { class: 'muted', text: text }));
  row.append(chip('Setup found', tl.setup.hm, short(tl.setup.text) || 'the setup bar'));
  tl.steps.forEach((s) => row.append(chip(`${s.n}. ${s.label}`, s.hm, s.px != null ? px(s.px) : '', s.seen && s.hm ? '' : 'miss')));
  row.append(chip('Exit', tl.exit.hm, `${px(tl.exit.px)} · ${tl.exit.kind.toLowerCase()}`, ''));
  row.append(chip('Result', '', tl.result, 'res ' + ((tl.usd || 0) > 0 ? 'win' : 'loss')));
  card.append(row);
  const kv = el('div', { class: 'kv' });
  [['Entry', px(tl.entry.px)], ['Stop', px(tl.stop)], ['Target', px(tl.target)], ['Exit', px(tl.exit.px)], ['Held', tl.held != null ? `${tl.held} min` : '-'], ['$ result', M.usd(tl.usd)]]
    .forEach(([k, v]) => kv.append(el('div', {}, document.createTextNode(k), el('b', { text: v }))));
  card.append(kv);
  const steps = tl.steps.filter((s) => s.text);
  if (steps.length) { const d = el('details', {}, el('summary', { class: 'muted', text: 'What the engine wrote at each step' })); steps.forEach((s) => d.append(el('p', { class: 'muted', text: `${s.hm || '--:--'} ${s.label}: ${s.text}` }))); card.append(d); }
  box.append(card);
}
const px = (v) => (v == null || !Number.isFinite(+v) ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const short = (s) => String(s || '').split(/\.\s|:\s/)[0].slice(0, 60);
function chart(tl, w) {
  const W = 358, H = 170, pl = 4, pr = 50, pt = 8, pb = 20, cw = W - pl - pr, ch = H - pt - pb;
  const X = (t) => pl + ((t - w.t0) / (w.t1 - w.t0)) * cw, Y = (p) => pt + (1 - (p - w.lo) / (w.hi - w.lo)) * ch;
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `5-minute chart: entry ${px(tl.entry.px)}, stop ${px(tl.stop)}, target ${px(tl.target)}, result ${tl.result}` });
  s.append(sv('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b0910' }));
  const bw = Math.max(1.5, cw / w.bars.length * .62);
  for (const b of w.bars) {
    const x = X(b.t + 150), up = b.c >= b.o, c = up ? '#77db89' : '#9d59ee';
    s.append(sv('line', { x1: x, x2: x, y1: Y(b.h), y2: Y(b.l), stroke: c, 'stroke-width': 1, opacity: .8 }));
    s.append(sv('rect', { x: x - bw / 2, y: Y(Math.max(b.o, b.c)), width: bw, height: Math.max(1, Math.abs(Y(b.o) - Y(b.c))), fill: c }));
  }
  const lvl = (p, col, lab, dash) => { if (p == null) return; s.append(sv('line', { x1: pl, x2: pl + cw, y1: Y(p), y2: Y(p), stroke: col, 'stroke-width': 1, 'stroke-dasharray': dash || '' }));
    s.append(sv('text', { x: pl + cw + 3, y: Y(p) + 3.5, fill: col, 'font-size': 9.5 }, lab)); };
  lvl(tl.target, '#77db89', 'target', '4 3'); lvl(tl.entry.px, '#f1c14b', 'entry'); lvl(tl.stop, '#ff6b8a', 'stop', '4 3');
  // the step markers: a numbered dot at each step's time (steps at the same time stack)
  const used = new Map(), marks = [['S', tl.setup.t, null], ...tl.steps.filter((x) => x.t != null && x.seen).map((x) => [String(x.n), x.t, x.px]), ['X', tl.exit.t, tl.exit.px]];
  for (const [lab, t, p] of marks) {
    if (t == null || t < w.t0 || t > w.t1) continue;
    const x = X(t), k = Math.round(x / 6), n = used.get(k) || 0; used.set(k, n + 1);
    s.append(sv('line', { x1: x, x2: x, y1: pt, y2: pt + ch, stroke: '#4d2e76', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
    const cy = p != null ? Y(p) : pt + ch - 8 - n * 14, cyy = p != null && n ? cy - n * 13 : cy;
    s.append(sv('circle', { cx: x, cy: cyy, r: 6, fill: lab === 'X' ? ((tl.usd || 0) > 0 ? '#77db89' : '#ff6b8a') : '#f1c14b', stroke: '#000', 'stroke-width': 1 }));
    s.append(sv('text', { x, y: cyy + 3.2, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700, fill: '#000' }, lab));
  }
  // the time axis
  const step = Math.max(1, Math.round(w.bars.length / 5)) * 300;
  for (let t = Math.ceil(w.t0 / step) * step; t < w.t1; t += step) s.append(sv('text', { x: X(t), y: H - 6, fill: '#a99cc2', 'font-size': 9, 'text-anchor': 'middle' }, M.hm(t, tl.off)));
  return s;
}

/* ---------------- research lobes ---------------- */
function researchBody(L, body) {
  const r = M.research(L.id, S.data, 8);
  if (!r) { body.append(el('p', { class: 'muted', text: 'The research findings did not load.' })); return; }
  body.append(el('div', { class: 'state' }, el('b', { class: 'live', text: `${r.total} findings` }), document.createTextNode(` · ${r.counts.a} adopted · ${r.counts.r} rejected · ${r.counts.o} open`)));
  body.append(el('h3', { text: 'Newest' }));
  for (const f of r.top) body.append(el('div', { class: 'find' }, el('span', { class: 'tag ' + f.s, text: f.verdict }), el('span', { text: `${f.d} · ${f.t}` }), el('div', { class: 'v', text: f.v })));
  body.append(el('p', {}, el('a', { class: 'link', href: '../brain.html', text: 'Open the full Research Brain →' })));
}

/* ---------------- the Strategy Lab (cities/lab-data.json) ---------------- */
const fmtN = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '-' : (+v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmtUsd = (v) => (v == null || !Number.isFinite(+v) ? '-' : (+v < 0 ? '-$' : '$') + Math.abs(Math.round(+v)).toLocaleString('en-US'));
function sampleBanner(body) {
  if (S.lab && S.lab.fixture) body.append(el('div', { class: 'sample', id: 'labSample', text: 'SAMPLE rows: the popular-strategy files (ICT + classic) have not landed yet. Rows marked SAMPLE are placeholders, not results. The LIT, ATLAS and Strategy Lab (LIT variant) rows are real.' }));
}
function labBody(body) {
  const c = M.labCounts(S.lab), rows = M.labRows(S.lab);
  body.replaceChildren(el('h2', { text: 'Strategy Lab' }), el('div', { class: 'muted', text: 'One neuron per tested strategy: gold live, mint paper / promising, dim violet rejected.' }));
  sampleBanner(body);
  if (!rows.length) { body.append(el('p', { class: 'muted', text: 'The Strategy Lab data did not load.' })); return; }
  body.append(el('div', { class: 'state' }, el('b', { class: 'live', text: `${rows.length} strategies` }), document.createTextNode(` · ${c.live} live · ${c.paper} paper · ${c.promising} promising · ${c.rejected} rejected`)));
  const b = S.lab.best_addon || {};
  body.append(el('div', { class: 'best', id: 'bestAddon' }, el('b', { text: 'Best add-on to LIT' }), el('div', { text: b.name || (/^None passed/.test(b.why || '') ? 'None passed' : 'None yet') }), el('p', { class: 'muted', text: b.why || '' })));
  body.append(el('h3', { text: 'Every strategy' }));
  const list = el('div', { class: 'trades', id: 'labList' });
  for (const r of rows.slice(0, S.showAll ? rows.length : 14)) {
    const sp = (r.spans || [])[r.spans.length - 1] || {};
    list.append(el('button', { type: 'button', class: 'tr', 'data-rid': r.id, onclick: () => select('lab:' + r.id) },
      el('span', {}, el('span', { class: 'tag v-' + r.verdict, text: M.VERDICT_WORD[r.verdict] || r.verdict }), document.createTextNode(' ' + r.name)),
      el('span', { class: 'usd ' + ((sp.usd_mo || 0) > 0 ? 'win' : 'loss'), text: sp.usd_mo == null ? '-' : fmtUsd(sp.usd_mo) + '/mo' }),
      el('span', { class: 'm', text: `${r.family} · PF ${fmtN(sp.pf, 2)} · ${fmtN(sp.tpw, 1)}/wk` }), el('span', { class: 'm', text: sp.k || '' })));
  }
  body.append(list);
  if (!S.showAll && rows.length > 14) body.append(el('button', { type: 'button', class: 'more', text: `Show all ${rows.length}`, onclick: () => { S.showAll = true; renderSheet(); } }));
  body.append(el('p', {}, el('a', { class: 'link', href: '../hub.html#lab', text: 'Sort them all in the Research Hub →' })));
}
function neuronBody(body, rid) {
  const r = M.labRow(S.lab, rid);
  body.replaceChildren();
  if (!r) { body.append(el('h2', { text: 'Strategy Lab' }), el('p', { class: 'muted', text: 'This strategy is not in the lab file any more.' })); return; }
  body.append(el('h2', { text: r.name }), el('div', { class: 'muted' }, el('span', { class: 'tag v-' + r.verdict, text: M.VERDICT_WORD[r.verdict] || r.verdict }), document.createTextNode(` ${r.family} · ${r.src}`)));
  if (r.src === 'fixture') sampleBanner(body);
  if (r.watch) body.append(el('div', { class: 'watch', id: 'labWatch', text: r.watch }));
  else if (r.why) body.append(el('div', { class: 'state', id: 'labWhy' }, el('b', { class: 'waiting', text: 'Why: ' }), document.createTextNode(r.why)));
  body.append(el('h3', { text: 'Rules' }));
  const ol = el('ol', { class: 'rules', id: 'labRules' }); (r.rules || []).slice(0, 3).forEach((t) => ol.append(el('li', { text: t }))); body.append(ol);
  body.append(el('h3', { text: 'The numbers' }));
  const tb = el('table', { class: 'spans', id: 'labSpans' }), hr = el('tr');
  ['Span', '/wk', 'Win', 'PF', '$/mo', 'Max DD'].forEach((h) => hr.append(el('th', { text: h }))); tb.append(el('thead', {}, hr));
  const tbody = el('tbody');
  for (const sp of r.spans || []) {
    const tr = el('tr'); [sp.k, fmtN(sp.tpw, 1), sp.win == null ? '-' : fmtN(sp.win, 0) + '%', fmtN(sp.pf, 2), fmtUsd(sp.usd_mo), fmtUsd(sp.maxdd)]
      .forEach((x, i) => tr.append(el('td', { class: i === 4 ? ((sp.usd_mo || 0) > 0 ? 'win' : 'loss') : '', text: x }))); tbody.append(tr);
  }
  tb.append(tbody); body.append(tb);
  body.append(el('button', { type: 'button', class: 'more', text: '← All strategies', onclick: () => select('lab') }));
}

/* ---------------- the pillars (ATLAS, BLITZ, ORDER FLOW: LIT is its own strategy sheet) ---------------- */
function pillarBody(body, L) {
  const m = pillarModel(L.id);
  body.replaceChildren(el('h2', { text: L.name }), el('div', { class: 'muted', text: L.sub }));
  if (!m) { body.append(el('p', { class: 'muted', text: 'The pillars data did not load.' })); return; }
  const dup = m.status.toLowerCase().startsWith(m.statusWord.split(' ')[0].toLowerCase());   // "NOT READY Not ready: ..." once only
  body.append(el('div', { class: 'state', id: 'pillarState' }, dup ? null : el('b', { class: m.level === 'ok' ? 'live' : m.level === 'off' ? 'off' : 'stale', text: m.statusWord + ' ' }), document.createTextNode(m.status)));
  if (L.id === 'of') body.append(el('div', { class: 'state', id: 'pillarTicks' }, el('b', { class: m.tick && m.tick.has ? 'live' : 'waiting', text: 'Ticks: ' }), document.createTextNode(m.tick ? m.tick.text : 'waiting')));
  if (L.id === 'atlas') {
    const row = el('div', { class: 'arrows' }); ['ema', 'macd', 'sr'].forEach((id) => { const x = M.lobeById(id); row.append(el('button', { type: 'button', class: 'more', style: 'width:auto;margin:0', text: x.name + ' ›', onclick: () => select(id) })); });
    body.append(el('h3', { text: 'Its three lobes' }), row);
  }
  body.append(el('h3', { text: 'Edge' }), el('p', { text: m.edge }));
  if (m.spans.length) {
    const tb = el('table', { class: 'spans', id: 'pillarSpans' }), hr = el('tr'); ['Span', '/wk', 'Win', 'PF', '$/mo'].forEach((h) => hr.append(el('th', { text: h }))); tb.append(el('thead', {}, hr));
    const tbody = el('tbody'); m.spans.forEach((sp) => { const tr = el('tr'); [sp.k, fmtN(sp.tpw, 1), sp.win == null ? '-' : fmtN(sp.win, 0) + '%', fmtN(sp.pf, 2), fmtUsd(sp.usd_mo)].forEach((x, i) => tr.append(el('td', { class: i === 4 ? ((sp.usd_mo || 0) > 0 ? 'win' : 'loss') : '', text: x }))); tbody.append(tr); });
    tb.append(tbody); body.append(tb);
  }
  if (L.id === 'of') { body.append(el('h3', { text: 'Waiting for the ticks' })); m.designs.forEach((d) => body.append(el('div', { class: 'find' }, el('span', { class: 'tag o', text: d.id }), el('span', { text: d.text }), el('div', { class: 'v', text: d.gate })))); }
  body.append(el('h3', { text: 'How it thinks' }));
  const ol = el('ol', { class: 'chain', id: 'chain' });
  m.chain.steps.forEach((x, i) => ol.append(el('li', { class: x.state, 'data-step': x.key }, el('span', { class: 'dot', text: x.state === 'done' ? '✓' : String(i + 1) }), el('b', { text: x.label }), el('p', { text: x.help }))));
  body.append(ol);
  body.append(el('h3', { text: 'What the market taught us' }));
  if (m.lessonsSample) body.append(el('div', { class: 'sample', text: 'SAMPLE: research/learn/insights.json has not landed yet; placeholders, not findings.' }));
  if (m.lessons.length) m.lessons.forEach((x) => body.append(el('p', { class: 'muted', text: `${x.d ? x.d + ' · ' : ''}${x.text}` }))); else body.append(el('p', { class: 'muted', text: 'Waiting: no lesson for this pillar yet.' }));
  if (m.risks.length) { body.append(el('h3', { text: 'Risks' })); m.risks.forEach((t) => body.append(el('p', { class: 'muted', text: '• ' + t }))); }
  body.append(el('h3', { text: "What's next" })); m.next.forEach((t, i) => body.append(el('p', { text: `${i + 1}. ${t}` })));
  body.append(el('p', { class: 'muted', text: `Source: ${m.src}` }), el('p', {}, el('a', { class: 'link', href: '../../pillars/#' + L.id, text: `Open the ${L.name} pillar ›` })));
}
function findingBody(body, id) {
  const f = M.finding(S.data, id);
  body.replaceChildren();
  if (!f) { body.append(el('h2', { text: 'Research' }), el('p', { class: 'muted', text: 'This finding is not in the Research Brain file any more.' })); return; }
  body.append(el('h2', { text: f.title }), el('div', { class: 'muted' }, el('span', { class: 'tag v-' + (f.verdict === 'adopted' ? 'live' : f.verdict === 'open' ? 'promising' : 'rejected'), text: M.VERDICT_WORD[f.verdict] || f.verdict }), document.createTextNode(` ${f.family} · ${f.date}`)));
  if (f.result) body.append(el('div', { class: 'state' }, el('b', { class: 'waiting', text: 'At stake: ' }), document.createTextNode(f.result)));
  body.append(el('p', { text: f.text }), el('p', {}, el('a', { class: 'link', href: '../brain.html', text: 'Open the Research Brain ›' })));
}
function ofTestBody(body, tid) {
  const p = S.pillars && (S.pillars.pillars || []).find((x) => x.id === 'of'), t = p && (p.tests || []).find((x) => x.id === tid);
  body.replaceChildren();
  if (!t) { body.append(el('h2', { text: 'Order flow' }), el('p', { class: 'muted', text: 'This test is not in the pillars file any more.' })); return; }
  body.append(el('h2', { text: t.name }), el('div', { class: 'muted' }, el('span', { class: 'tag v-' + t.verdict, text: M.VERDICT_WORD[t.verdict] || t.verdict }), document.createTextNode(` ORDER FLOW · ${t.stage}`)));
  const tb = el('table', { class: 'spans', id: 'ofSpans' }), hr = el('tr'); ['Span', '/wk', 'Win', 'PF', '$/mo'].forEach((h) => hr.append(el('th', { text: h }))); tb.append(el('thead', {}, hr));
  const tbody = el('tbody'); t.spans.forEach((sp) => { const tr = el('tr'); [sp.k, fmtN(sp.tpw, 1), sp.win == null ? '-' : fmtN(sp.win, 0) + '%', fmtN(sp.pf, 2), sp.usd_mo != null ? fmtUsd(sp.usd_mo) : sp.net_vs_lit != null ? fmtUsd(sp.net_vs_lit) + ' vs LIT' : '-'].forEach((x) => tr.append(el('td', { text: x }))); tbody.append(tr); });
  tb.append(tbody); body.append(tb, el('p', { class: 'muted', text: `Placebo p ${t.placebo_p ?? '-'}${t.holm_p != null ? ' · Holm p ' + t.holm_p : ''}. Bar data stands in for ticks here: the real test (OF1-OF3) waits for 60 tick days.` }));
  body.append(el('button', { type: 'button', class: 'more', text: '← ORDER FLOW', onclick: () => select('of') }));
}

/* ---------------- today: every bot's thinking in time order ---------------- */
function drawToday() {
  const box = $('today'); if (!box) return;
  const rows = M.today(S.glance, S.lite);
  box.replaceChildren(el('b', { class: 'th', text: 'Today' }));
  if (!rows.length) { box.append(el('span', { class: 'tchip none', text: S.glance ? 'No thinking logged yet today' : 'Waiting for the PC\'s report' })); return; }
  for (const r of rows) box.append(el('button', { type: 'button', class: 'tchip', style: `--c:${r.color}`, 'data-lobe': r.lobe, title: r.text, onclick: () => { if (M.lobeById(r.lobe)) select(r.lobe); } },
    el('span', { class: 'tt', text: r.hm }), el('span', { class: 'tb', text: r.name }), el('span', { class: 'tx', text: r.text })));
  box.scrollLeft = box.scrollWidth;
}

/* ---------------- 2D fallback (no WebGL) ---------------- */
function drawFlat() {
  const f = $('flat'); if (f.hidden) return;
  f.replaceChildren();
  const s = sv('svg', { viewBox: '-1.4 -1.2 2.8 2.3', role: 'group', 'aria-label': 'Lobe map' });
  s.append(sv('ellipse', { cx: 0, cy: 0, rx: 1.25, ry: 1.0, fill: '#16131e', stroke: '#4d2e76', 'stroke-width': .02 }));
  s.append(sv('line', { x1: 0, x2: 0, y1: -1, y2: 1, stroke: '#3e255e', 'stroke-width': .015 }));
  for (const L of M.LOBES) {
    const x = L.pos[0] * 1.05, y = -(L.pos[2] * .55 + L.pos[1] * .35), g = sv('g', { class: 'fl', 'data-lobe': L.id, tabindex: 0 });
    g.append(sv('circle', { cx: x, cy: y, r: S.sel === L.id ? .11 : .08, fill: L.color, opacity: S.sel && S.sel !== L.id ? .45 : 1 }));
    g.append(sv('text', { x, y: y + .19, fill: '#f3eefc', 'font-size': .085, 'text-anchor': 'middle' }, L.name));
    g.addEventListener('click', () => select(L.id === S.sel ? null : L.id));
    s.append(g);
  }
  f.append(s);
}

/* ---------------- boot ---------------- */
async function boot() {
  drawLobeBar();
  $('close').addEventListener('click', () => select(null));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });
  const [file, data, home, lab, pillars] = await Promise.all([getJSON('../../odeon/trades.json'), getJSON('../brain-data.json'), getJSON('../../home.json'), getJSON('../lab-data.json'), getJSON('../../pillars/pillars-data.json')]);
  Object.assign(S, { file, data, home, lab, pillars }); S.glance = M.glanceOf(null, home);
  drawLobeBar(); pcPill(); drawToday();
  startScene();
  try {
    const F = window.PC_FEED;
    if (F && F.fetchLatest) {
      const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
      if (lite) { S.lite = lite; S.glance = M.glanceOf(lite, home); drawLobeBar(); pcPill(); drawToday(); if (S.sel) renderSheet(); }
    }
  } catch (_) { /* the site's copy stays */ }
  const glow = {}; for (const L of M.LOBES) glow[L.id] = M.glow(L.id, { glance: S.glance, now: S.now(), data: S.data });
  if (S.scene) S.scene.setGlow(glow);
  document.documentElement.dataset.ready = '1';
}
async function startScene() {
  const q = location.search, flat = () => { $('flat').hidden = false; drawFlat(); document.documentElement.dataset.mode = '2d'; };
  if (/[?&]lite=2d/.test(q)) return flat();
  try {
    const Sc = await import('./mind-scene.js?v=m3');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, low = Sc.isLowPower(window);
    // the lobe names over the 3D, kept apart (M.placeLabels): selected first, then the strategies, then the research lobes
    const tips = M.LOBES.map((L) => { const d = el('div', { class: 'tip' + (L.pillar ? ' st pil' : L.kind === 'strategy' ? ' st' : ''), 'aria-hidden': 'true', 'data-tip': L.id, text: L.name }); document.body.append(d); return { L, d, w: 0, h: 0 }; });
    const onFrame = (proj) => {
      const r = $('c').getBoundingClientRect(), items = [];
      for (const t of tips) {
        if (!t.w) { t.w = t.d.offsetWidth || t.L.name.length * 6.5; t.h = t.d.offsetHeight || 14; }
        const p = proj(t.L.id);
        if (p && p.z < 1) items.push({ id: t.L.id, x: p.x, y: p.y, z: p.z, w: t.w, h: t.h, pri: (S.sel === t.L.id ? 10 : 0) + (t.L.pillar ? 3 : t.L.kind === 'strategy' ? 2 : 1) });
      }
      const pos = new Map(M.placeLabels(items, { w: r.width, h: r.height }).map((q) => [q.id, q]));
      for (const t of tips) {
        const q = pos.get(t.L.id), on = !!(q && q.show);
        t.d.style.display = on ? '' : 'none';
        if (on) { t.d.style.left = (r.left + q.x) + 'px'; t.d.style.top = (r.top + q.y) + 'px'; t.d.style.opacity = !S.sel || S.sel === t.L.id ? '1' : '.35'; }
      }
    };
    S.scene = await Sc.create($('c'), M.LOBES, { neurons: [...M.labNeurons(S.lab), ...M.pillarNeurons(S.data, S.lab, S.pillars)], reduce, low, onPick: (id) => select(id), onLost: flat, onFrame });
    if (!S.scene) return flat();
    document.documentElement.dataset.mode = low ? '3d-low' : '3d';
    window.__mind = { stats: () => S.scene.stats(), project: (id) => S.scene.project(id), select };
  } catch (_) { flat(); }
}
boot();
