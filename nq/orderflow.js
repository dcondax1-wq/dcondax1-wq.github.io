// NQ ORDER FLOW room (night-nq-of 2026-11-27). PAPER research only: nothing here trades.
// Reads of_room.json (tools/build_of_room.py) and the PC's public status post (../pc_feed.js fetchLatest: core "price" + "t", ext "ofp" =
// today's paper bot, engine/oflive.paper_tiny), every 30 s while the screen is visible. model() is pure (node-tested: tests/test_nq_of.py);
// draw() uses textContent / createElement(NS) only. Sends nothing, stores nothing. ?at=<ISO time> pins the clock (tests / screenshots).
export const NAMES = { pdh: 'Prior-day high', pdl: 'Prior-day low', onh: 'Overnight high', onl: 'Overnight low', orh: 'Opening-range high', orl: 'Opening-range low' };
const READ = { a: 'absorbed', n: 'not absorbed', u: 'untouched' };
const POLL_MS = 30000, LIVE_MAX_S = 3 * 3600;

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function etParts(t) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, min: +p.hour * 60 + +p.minute };
  } catch (_) { return null; }
}
export const fmtPx = (v) => (num(v) === null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtR = (v) => (num(v) === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`);
export const fmtUsd = (v) => (num(v) === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
export function ago(s) {
  if (num(s) === null || s < 0) return '';
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 2 * 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
// Zlarior's REAL trades never show $ here (a public page): "won $934" -> "won" (the paper bot's own 1-micro $ stays)
export const scrubReal = (s) => String(s || '').replace(/(Zlarior[^;]*?\b(?:won|lost))\s*[−-]?\$[\d,.]+/g, '$1');
export function verdictKind(txt) {
  const t = String(txt || '').toUpperCase();
  if (!t) return 'none';
  if (t.startsWith('YES') || t.startsWith('PASS')) return 'yes';
  if (t.startsWith('TOO FEW') || t.startsWith('WAITING') || t.startsWith('NOT RUN')) return 'few';
  if (t.startsWith('NO') || t.startsWith('REJECTED')) return 'no';
  return 'few';
}
function shortVerdict(txt) {
  const k = verdictKind(txt), s = String(txt || '');
  if (k === 'none') return 'Not scored yet';
  if (k === 'yes') return 'CANDIDATE: forward days decide';
  return s.split(/[:(]/)[0].trim() + (k === 'few' && /\d+ of \d+/.test(s) ? ` (${s.match(/\d+ of \d+/)[0]})` : '');
}

// ------------------------------------------------------------------------------------------------ the model (pure)
export function model({ room, lite, nowS }) {
  const now = num(nowS) ?? Date.now() / 1000, today = (etParts(now) || {}).day;
  const R = room && room.v === 1 ? room : null;
  const L = lite && typeof lite === 'object' ? lite : null;
  const pcT = L ? num(L.t) ?? num((L.reporter || {}).t) : null;
  const ofp = L && L.ofp && L.ofp.p === 1 && L.ofp.d === today && pcT !== null && now - pcT <= LIVE_MAX_S ? L.ofp : null;
  const roomToday = R && R.day === today;
  const M = { today, nowS: now, price: null, levels: [], rows: [], lit: [], stats: [], ring: { n: 0, need: 20 }, verdict: null, made: null };
  // where the day comes from
  if (ofp) { M.state = 'live'; M.day = today; M.chip = { text: `LIVE · PC ${ago(now - pcT)}`, level: 'ok' }; }
  else if (R && R.day) {
    M.state = roomToday ? 'live' : 'recorded'; M.day = R.day;
    const src = String(R.source || '');
    M.chip = { text: roomToday ? 'today (cloud copy)' : `${R.day} · ${src.startsWith('PC') ? 'PC paper bot' : 'recorded day'}`, level: roomToday ? 'ok' : 'warn' };
  } else { M.state = 'empty'; M.day = null; M.chip = { text: 'no order-flow day yet', level: 'bad' }; }
  if (L && num(L.price) !== null && pcT !== null && now - pcT <= LIVE_MAX_S && (M.state === 'live')) M.price = L.price;
  // levels: the live reads win; the room adds labels / zone volume when it is the same day
  const rl = R && R.day === M.day ? R.levels || [] : [];
  if (ofp && Array.isArray(ofp.lv)) {
    M.levels = ofp.lv.filter((x) => Array.isArray(x) && x.length >= 3).map(([nm, px, c]) => {
      const r = rl.find((y) => y.name === nm) || {};
      return { name: nm, label: NAMES[nm] || r.label || nm, px: num(px), read: READ[c] || 'untouched', vz: r.vz ?? null, dz: r.dz ?? null, t: r.t || null };
    });
  } else {
    M.levels = rl.map((r) => ({ name: r.name, label: NAMES[r.name] || r.label || r.name, px: num(r.px), read: r.read || 'untouched', vz: num(r.vz), dz: num(r.dz), t: r.t || null }));
  }
  M.levels = M.levels.filter((x) => x.px !== null).sort((a, b) => b.px - a.px);
  // paper rows + lane B
  M.rows = R && R.day === M.day ? (R.rows || []).slice() : [];
  if (ofp && Array.isArray(ofp.lb)) M.lit = ofp.lb.filter(Array.isArray).map(([t, d, r]) => ({ t, says: d, result: r }));
  else M.lit = R && R.day === M.day ? (R.lit || []).map((x) => ({ t: x.t, dir: x.dir, says: x.flow_says, result: x.result })) : [];
  // the day's numbers
  const td = (R && R.day === M.day && R.today) || {};
  const taken = ofp ? num(ofp.n) ?? 0 : num(td.taken) ?? M.rows.filter((r) => r.taken).length;
  const open = ofp ? num(ofp.o) ?? 0 : num(td.open) ?? 0;
  const dayR = ofp ? num(ofp.R) : num(td.R);
  const touched = M.levels.filter((x) => x.read !== 'untouched').length, absorbed = M.levels.filter((x) => x.read === 'absorbed').length;
  if (M.state !== 'empty') {
    M.stats = [{ k: 'paper trades', v: String(taken), cls: 'gold' }, { k: 'day', v: taken ? fmtR(dayR) : '-', cls: dayR > 0 ? 'up' : dayR < 0 ? 'dn' : '' },
      { k: 'levels swept', v: `${touched}/${M.levels.length}`, cls: '' }, { k: 'absorbed', v: String(absorbed), cls: absorbed ? 'up' : '' }];
    if (open) M.stats.push({ k: 'open', v: String(open), cls: 'gold' });
  }
  M.line = ofp && ofp.ln ? scrubReal(ofp.ln) : (R && R.day === M.day && R.line) ? scrubReal(R.line)
    : M.state === 'empty' ? 'No order-flow day has reached the site yet. The PC records ticks; the first day shows here after it is sent.'
      : 'No level was swept on this day.';
  // forward score + verdict
  const fw = (R && R.forward) || {};
  M.ring = { n: Math.max(0, num(fw.n) ?? 0), need: num(fw.need) || 20 };
  const V = R && R.verdict;
  if (V && (V.absorption || V.of1_lit || V.line)) {
    const ka = verdictKind(V.absorption), kb = verdictKind(V.of1_lit);
    M.verdict = { days: V.days ?? null, label: V.label || 'real', made: V.made || null, a: V.a || null, first: V.first || null, last: V.last || null,
      sides: V.sides || null, b: V.b || null,
      rows: [{ k: 'Does absorption pick winners?', v: shortVerdict(V.absorption), cls: ka },
        { k: 'Does it improve Zlarior? (pre-registered OF1)', v: shortVerdict(V.of1_lit) + (V.b && V.b.trades != null && kb === 'few' ? ` · ${V.b.trades} of ${V.b.need || 20} trades` : ''), cls: kb }],
      level: ka === 'no' && kb === 'no' ? 'bad' : 'warn',                // a candidate is not proven: gold, never green
      chip: V.label && V.label !== 'real' ? `${V.label} (test)` : `${V.days ?? 0} real days${ka === 'yes' || kb === 'yes' ? ' · candidate' : ''}`,
      note: V.label && V.label !== 'real' ? 'This verdict came from SIMULATED days (a pipeline test), not the market.' : 'A YES only starts the forward test on new days; nothing changes on a bot without the owner.' };
  } else {
    M.verdict = { rows: [{ k: 'Does absorption pick winners?', v: 'Not scored yet', cls: 'none' }, { k: 'Does it improve Zlarior?', v: 'Not scored yet', cls: 'none' }],
      level: 'warn', chip: 'waiting for real days', note: 'The first real verdict runs the night the PC sends its recorded tick days (tools/of_realday_verdict.py).' };
  }
  M.made = R && num(R.made) !== null ? R.made : null;
  M.ok = M.state !== 'empty';
  return M;
}

// ------------------------------------------------------------------------------------------------ drawing (browser only)
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); if (text != null) e.textContent = String(text); return e; }

function drawLadder(M) {
  const box = document.getElementById('ladder');
  box.replaceChildren();
  const items = M.levels.map((x) => ({ ...x, kind: 'lvl' }));
  if (M.price !== null) {
    let i = items.findIndex((x) => x.px < M.price);
    if (i < 0) i = items.length;
    items.splice(i, 0, { kind: 'now', px: M.price });
  }
  document.getElementById('ladChip').textContent = M.levels.length ? `${M.levels.length} levels` : 'none yet';
  document.getElementById('ladChip').dataset.level = M.levels.length ? 'ok' : 'warn';
  if (!items.length) { box.append(el('p', 'of-empty', M.state === 'empty' ? 'Levels appear once the PC has a tick day.' : 'No levels for this day.')); return; }
  const W = Math.round(Math.max(300, Math.min(760, box.clientWidth || 360))), ROW = 56, H = items.length * ROW + 10, vmax = Math.max(1, ...M.levels.map((x) => x.vz || 0));
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const defs = sv('defs');
  const sh = sv('linearGradient', { id: 'shine', x1: 0, y1: 0, x2: 1, y2: 0 });
  sh.append(sv('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 0 }), sv('stop', { offset: 0.5, 'stop-color': '#eafff0', 'stop-opacity': 0.85 }),
    sv('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': 0 }));
  defs.append(sh);
  for (const [id, c] of [['heatA', '#77db89'], ['heatN', '#ff5d6c']]) {
    const g = sv('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 });
    g.append(sv('stop', { offset: 0, 'stop-color': c, 'stop-opacity': 0.05 }), sv('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0.75 }));
    defs.append(g);
  }
  svg.append(defs);
  items.forEach((x, k) => {
    const y = 8 + k * ROW + ROW / 2;
    if (x.kind === 'now') {
      svg.append(sv('line', { class: 'now-line', x1: 4, x2: W - 4, y1: y, y2: y }), sv('circle', { class: 'now-dot', cx: 10, cy: y, r: 5 }),
        sv('text', { class: 'now-txt', x: 22, y: y - 6 }, `NOW ${fmtPx(x.px)}`));
      return;
    }
    const c = x.read === 'absorbed' ? 'a' : x.read === 'not absorbed' ? 'n' : 'u';
    const g = sv('g', { class: `rung rung-${c}`, style: `animation-delay:${k * 70}ms` });
    if (x.vz && c !== 'u') { const w = Math.max(10, Math.round(0.4 * W * x.vz / vmax)); g.append(sv('rect', { class: 'rung-heat', x: W - 4 - w, y: y - 10, width: w, height: 18, rx: 4 })); }
    if (c === 'a') g.append(sv('rect', { class: 'rung-shine', x: 0, y: y + 9, width: 70, height: 6, rx: 3, style: `animation-delay:${600 + k * 140}ms` }));
    g.append(sv('line', { class: 'rung-line', x1: 4, x2: W - 4, y1: y + 12, y2: y + 12 }),
      sv('text', { class: 'rung-name', x: 6, y: y - 8 }, x.label), sv('text', { class: 'rung-px', x: 6, y: y + 7 }, fmtPx(x.px) + (x.t ? `  · swept ${x.t}` : '')),
      sv('text', { class: 'rung-read', x: W - 8, y: y + 4, 'text-anchor': 'end' }, (READ[c] || 'untouched').toUpperCase() + (x.vz ? ` · ${x.vz.toLocaleString('en-US')} lots` : '')));
    svg.append(g);
  });
  box.append(svg);
  box.setAttribute('aria-label', 'Key levels: ' + M.levels.map((x) => `${x.label} ${fmtPx(x.px)} ${x.read}`).join('; '));
}

function drawTape(M) {
  const box = document.getElementById('tape');
  box.replaceChildren();
  const pts = M.rows.map((r) => ({ ...r, min: r.t ? +r.t.slice(0, 2) * 60 + +r.t.slice(3, 5) : null })).filter((r) => r.min !== null);
  // one lane per level (top = highest), time across: a heat-map of the day's sweeps
  const key = (v) => String(v || '').toLowerCase();
  const lanes = M.levels.length ? M.levels.map((x) => x.label) : [...new Set(pts.map((r) => r.level))];
  for (const r of pts) if (!lanes.some((l) => key(l) === key(r.level))) lanes.push(r.level);
  const laneOf = (lv) => lanes.findIndex((l) => key(l) === key(lv));
  const LANE = 28, top = 14, W = Math.round(Math.max(300, Math.min(760, box.clientWidth || 360))), x0 = 100, x1 = W - 16, a = 570, b = 960, H = top + Math.max(1, lanes.length) * LANE + 24;
  const X = (m) => x0 + (x1 - x0) * Math.min(1, Math.max(0, (m - a) / (b - a)));
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}` });
  lanes.forEach((nm, k) => {
    const y = top + k * LANE + LANE / 2;
    svg.append(sv('line', { class: 'tape-lane', x1: x0, x2: x1, y1: y, y2: y }), sv('text', { class: 'tape-name', x: 4, y: y + 3 }, String(nm).replace('Opening-range', 'Open rng').replace('Overnight', 'O/N').replace('Prior-day', 'Prior')));
  });
  const yb = top + lanes.length * LANE + 2;
  svg.append(sv('line', { class: 'tape-axis', x1: x0, x2: x1, y1: yb, y2: yb }));
  for (const [m, t] of [[570, '9:30'], [690, '11:30'], [810, '13:30'], [960, '16:00']]) svg.append(sv('text', { class: 'tape-tick', x: X(m), y: yb + 14, 'text-anchor': 'middle' }, t));
  const vmax = Math.max(1, ...M.levels.map((x) => x.vz || 0));
  for (const r of pts) {
    const y = top + laneOf(r.level) * LANE + LANE / 2;
    const lv = M.levels.find((x) => key(x.label) === key(r.level) || x.name === r.level) || {};
    const rad = 4 + 5 * Math.sqrt((lv.vz || vmax / 4) / vmax), cx = X(r.min);
    if (r.taken) svg.append(sv('path', { class: 'tape-take', d: `M${cx} ${y - rad - 2}l${rad + 2} ${rad + 2}l${-rad - 2} ${rad + 2}l${-rad - 2} ${-rad - 2}z` }));
    else svg.append(sv('circle', { class: `tape-dot ${r.absorbed ? 'a' : 'n'}`, cx, cy: y, r: rad }));
    if (num(r.R) !== null) svg.append(sv('text', { class: 'tape-lbl', x: cx + rad + 5, y: y + 4 }, fmtR(r.R)));
  }
  box.append(svg);
  document.getElementById('tapeNote').textContent = pts.length
    ? `${pts.length} sweep${pts.length > 1 ? 's' : ''}: gold diamond = paper trade taken, green = absorbed, red = not absorbed; size = volume at the level.`
    : (M.state === 'live' && M.levels.length ? 'No level swept yet today.' : 'The sweeps of a day show here.');
}

function drawTrades(M) {
  const ol = document.getElementById('trades'), empty = document.getElementById('tradesEmpty');
  ol.replaceChildren();
  for (const r of M.rows) {
    const li = el('li', 'of-trade'); li.dataset.taken = r.taken ? '1' : '0';
    const t1 = el('span', 't1');
    t1.append(el('span', `of-tag ${r.taken ? 'p' : 's'}`, r.taken ? 'PAPER' : 'SKIPPED'), document.createTextNode(`${r.t || ''} ${String(r.dir || '').toUpperCase()} · ${String(r.level || '').replace(/^./, (c) => c.toUpperCase())}`));
    const st = r.state === 'open' ? 'open' : r.state === 'waiting for fill' ? 'open' : num(r.R) === null ? '' : r.R > 0 ? 'up' : 'dn';
    const rr = el('span', `r ${st}`, r.state === 'open' ? 'OPEN' : r.state === 'waiting for fill' ? 'FILLING' : fmtR(r.R));
    const why = r.taken ? (r.why ? `${r.why}` : 'in the trade') : `flow said no (${r.why_not || 'not absorbed'})${num(r.R) !== null ? `: would have made ${fmtR(r.R)}` : ''}`;
    const t2 = el('span', 't2', [r.fill != null ? `in ${fmtPx(r.fill)}` : null, r.stop != null ? `stop ${fmtPx(r.stop)}` : null, r.target != null ? `target ${fmtPx(r.target)}` : null,
      r.taken && num(r.usd_1) !== null ? `1 MNQ ${fmtUsd(r.usd_1)}` : null, why].filter(Boolean).join(' · '));
    li.append(t1, rr, t2);
    ol.append(li);
  }
  empty.hidden = M.rows.length > 0;
  empty.textContent = M.state === 'empty' ? 'Paper trades show here once the order-flow bot has a day.' : M.state === 'live' && !M.rows.length && M.stats.length && M.stats[0].v !== '0'
    ? 'Today\'s trades are in the PC\'s live line above; the full list arrives with tonight\'s copy.' : 'No level signal on this day.';
}

function drawLit(M) {
  const ul = document.getElementById('lit');
  ul.replaceChildren();
  for (const x of M.lit) {
    const li = el('li');
    const says = x.says === 'take' ? 'take' : x.says === 'skip' ? 'skip' : 'none';
    const left = el('span'); left.append(document.createTextNode(`${x.t || ''} ${x.dir ? String(x.dir).toUpperCase() + ' ' : ''}· flow says `), el('span', `of-says ${says}`, says === 'none' ? 'NO READ' : says.toUpperCase()));
    const res = x.result === 'won' ? 'won' : x.result === 'lost' ? 'lost' : 'open';
    const right = el('span'); right.append(el('span', `of-res ${res}`, res === 'open' ? 'open' : res));
    if (res !== 'open' && says !== 'none') right.append(el('span', 'of-agree', (says === 'take') === (res === 'won') ? '  · flow right' : '  · flow wrong'));
    li.append(left, right);
    ul.append(li);
  }
  document.getElementById('litEmpty').hidden = M.lit.length > 0;
  document.getElementById('litChip').textContent = M.lit.length ? `${M.lit.length} today` : 'lane B';
}

function drawCompare(A) {
  // taken vs skipped: diverging bars around 0R, the numbers in words beside them
  const wrap = el('div', 'of-cmp'), mx = Math.max(0.5, Math.abs(A.taken.mean_R || 0), Math.abs(A.skipped.mean_R || 0));
  for (const [lab, x, cls] of [['Taken (absorbed)', A.taken, 'tk'], ['Skipped (flow said no)', A.skipped, 'sk']]) {
    const row = el('div', `of-cmp-row ${cls}`);
    const bar = el('div', 'of-cmp-bar'), fill = el('span', (x.mean_R || 0) >= 0 ? 'pos' : 'neg');
    fill.style.width = `${Math.round(50 * Math.abs(x.mean_R || 0) / mx)}%`;
    bar.append(el('i', 'zero'), fill);
    const nums = el('span', 'of-cmp-num');
    [`${x.n} trades`, `${fmtR(x.mean_R)} avg`, `${Math.round(x['win%'])}% won`, `${fmtUsd(x.usd_1)} at 1 MNQ`].forEach((t, i) => {
      if (i) nums.append(document.createTextNode(' · '));
      nums.append(el('span', 'nw', t));
    });
    row.append(el('span', 'of-cmp-lab', lab), bar, nums);
    wrap.append(row);
  }
  return wrap;
}

function drawVerdict(M) {
  const V = M.verdict, box = document.getElementById('verdict'), dl = document.getElementById('vgrid');
  box.dataset.level = V.level;
  const chip = document.getElementById('verChip'); chip.textContent = V.chip; chip.dataset.level = V.level;
  dl.replaceChildren();
  for (const r of V.rows) { const d = el('div'); d.append(el('dt', '', r.k), el('dd', r.cls, r.v)); dl.append(d); }
  const A = V.a;
  if (A && A.taken && A.skipped && num(A.taken.mean_R) !== null) {
    const d = el('div', 'of-vwide'); d.append(el('dt', '', `The evidence: ${A.resolved ?? A.taken.n + A.skipped.n} level sweeps${V.first ? `, ${V.first} to ${V.last}` : ''}`), drawCompare(A));
    const facts = [];
    if (num(A.p) !== null) facts.push(`chance check p = ${A.p} (about 1 in ${Math.max(1, Math.round(1 / Math.max(A.p, 1e-4)))} by luck)`);
    if (Array.isArray(A.halves) && A.halves.length === 2) facts.push(`older half ${fmtR(A.halves[0])}, newer half ${fmtR(A.halves[1])} better`);
    if (V.sides) facts.push(V.sides);
    d.append(el('dd', 'of-facts', facts.join(' · ')));
    dl.append(d);
  }
  document.getElementById('verNote').textContent = V.note;
}

function draw(M) {
  const app = document.getElementById('app');
  app.dataset.state = M.state;
  const c = document.getElementById('src'); c.textContent = M.chip.text; c.dataset.level = M.chip.level;
  document.getElementById('heroH').textContent = M.state === 'recorded' ? `Last recorded day · ${M.day}` : M.state === 'empty' ? 'Order flow' : 'Today';
  document.getElementById('heroLine').textContent = M.line;
  const st = document.getElementById('stats'); st.replaceChildren();
  for (const s of M.stats) { const d = el('span', `of-stat ${s.cls}`); d.append(el('b', '', s.v), el('span', '', s.k)); st.append(d); }
  const f = Math.min(1, M.ring.n / M.ring.need), C = 2 * Math.PI * 40;
  document.getElementById('ringFg').setAttribute('stroke-dasharray', `${(C * f).toFixed(1)} ${C.toFixed(1)}`);
  document.getElementById('ringN').textContent = String(M.ring.n);
  document.getElementById('ringOf').textContent = `of ${M.ring.need}`;
  drawLadder(M); drawTape(M); drawTrades(M); drawLit(M); drawVerdict(M);
  const age = M.made ? ago(M.nowS - M.made) : '';
  document.getElementById('made').textContent = age ? `Room data built ${age}.` : '';
}

// ------------------------------------------------------------------------------------------------ boot
const S = { room: null, lite: null, M: null, ready: false, polls: 0 };
const AT = (() => { try { const v = new URLSearchParams(location.search).get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; } catch (_) { return null; } })();
const T0 = Date.now() / 1000, nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);
async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(tm); }
}
async function getPost() {
  const F = window.PC_FEED;
  if (!F || !F.fetchLatest) return null;
  try { return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { return null; }
}
async function refresh(full) {
  const [room, lite] = await Promise.all([full || !S.room ? getJSON('of_room.json') : Promise.resolve(S.room), getPost()]);
  if (room) S.room = room;
  if (lite) S.lite = lite;
  S.polls += 1;
  S.M = model({ room: S.room, lite: S.lite, nowS: nowS() });
  draw(S.M);
  S.ready = true;
}
function redraw() { S.M = model({ room: S.room, lite: S.lite, nowS: nowS() }); draw(S.M); }
if (typeof document !== 'undefined' && document.getElementById('app')) {
  window.NQ_OF = { S, ready: () => S.ready, model };
  draw(model({ room: null, lite: null, nowS: nowS() }));
  document.getElementById('app').dataset.state = 'loading';
  // the shared fast feed (nq/nqfeed.js, night-nq-speed): the kept post at once, then every newer post; our own poll only without it
  const NQF = window.NQ_FEED || null;
  if (NQF) {
    try {
      const first = NQF.cached();
      if (first) { S.lite = first; }
      NQF.on((lite) => { if (lite) { S.lite = lite; if (S.ready) redraw(); } });
    } catch (_) { /* the page still polls itself */ }
  }
  refresh(true);
  let timer = setInterval(() => { if (!document.hidden) refresh(S.polls % 10 === 0); }, NQF ? 5 * POLL_MS : POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  window.addEventListener('pagehide', () => clearInterval(timer));
  let rz = 0, lastW = innerWidth;                      // re-draw at a new WIDTH only (the ladder / tape keep their text size)
  window.addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (S.M) { drawLadder(S.M); drawTape(S.M); } }, 200); });
}
