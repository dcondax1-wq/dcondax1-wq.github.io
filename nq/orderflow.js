// NQ ORDER FLOW room (night-nq-of 2026-11-27). PAPER research only: nothing here trades.
// Reads of_room.json (tools/build_of_room.py) and the PC's public status post (../pc_feed.js fetchLatest: core "price" + "t", ext "ofp" =
// today's paper bot, engine/oflive.paper_tiny), every 30 s while the screen is visible. model() is pure (node-tested: tests/test_nq_of.py);
// draw() uses textContent / createElement(NS) only. Sends nothing, stores nothing. ?at=<ISO time> pins the clock (tests / screenshots).
import { mount as mountStrip } from './ofstrip.js?v=1';
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
export const fmtR = (v) => (num(v) === null ? '-' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) < 0.1 && v !== 0 ? 2 : 1)}R`);
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
  if (t.startsWith('NO') || t.startsWith('REJECTED') || t.startsWith('FAIL')) return 'no';
  if (t.startsWith('WEAK')) return 'few';
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
  // day-ofroom2: the control room (room "control" from tools/build_of_room.py + the PC's live lane block)
  const C = (R && R.control && typeof R.control === 'object') ? R.control : {};
  M.ladder = C.ladder || null;
  if (M.ladder) M.ring = { n: Math.max(0, num(M.ladder.n) ?? 0), need: num(M.ladder.need) || 30, label: 'first-of-day trades' };
  M.backtest = C.backtest || null;
  M.oos = C.oos || { pending: true, when: 'tonight 10:30 PM ET' };
  M.v5 = Array.isArray(C.v5) ? C.v5 : [];
  M.v5Line = C.v5_line || '';
  M.lane = laneOf(L, C.lane, pcT, now, today);
  M.ok = M.state !== 'empty';
  return M;
}

// the practice lane: the PC's live block (status post "ofl") wins when it is today's and fresh, else the room's copy
export const LANE_KEYS = ['ofl', 'oflane', 'of_lane'];
export function laneOf(L, roomLane, pcT, now, today) {
  let live = null;
  for (const k of LANE_KEYS) if (L && L[k] && typeof L[k] === 'object') { live = L[k]; break; }
  const fresh = live && pcT !== null && now - pcT <= LIVE_MAX_S;
  const x = fresh ? live : roomLane && typeof roomLane === 'object' ? roomLane : null;
  if (!x) return null;
  const trades = (Array.isArray(x.trades) ? x.trades : Array.isArray(x.tr) ? x.tr : []).map((t) => (Array.isArray(t)
    ? { t: t[0], dir: t[1], qty: t[2], status: t[3], pnl: t[4], why: t[5] } : t));
  const day = x.day || x.d || null;
  return { src: fresh ? 'live' : 'room', on: x.on === true || x.on === 1, account: String(x.account || x.acct || 'Sim102').slice(0, 12),
    cap: num(x.cap) ?? 1, used: num(x.used) ?? trades.filter((t) => ['open', 'closed', 'sending'].includes(t.status)).length,
    today: day === today, day, trades, why: x.why || null };
}
export function whyWords(t) {
  const w = String((t && t.why) || '').toLowerCase();
  if (t && t.status === 'refused' && /^(skipped|no fill)/.test(w)) return String(t.why);   // the lane's own short words (engine/oflive)
  if (t && t.status === 'refused') {
    if (w.includes('day cap')) return 'skipped: day cap (1 a day)';
    if (w.includes('late')) return 'skipped: too late to act';
    if (w.includes('news')) return 'skipped: news window';
    if (w.includes('kill')) return 'skipped: kill switch';
    if (w.includes('hedge')) return 'skipped: another account holds the other side';
    return `skipped: ${String(t.why || '').slice(0, 70)}`;
  }
  return t && t.status ? String(t.status) : '';
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

function drawLane(M) {
  const X = M.lane, box = document.getElementById('lane'), chip = document.getElementById('laneChip'), meta = document.getElementById('laneMeta'), ul = document.getElementById('laneTrades');
  meta.replaceChildren(); ul.replaceChildren();
  if (!X) {
    box.dataset.on = '0'; chip.textContent = 'no report yet'; chip.dataset.level = 'warn';
    ul.append(el('li', 'of-lane-empty', 'The lane\'s state reaches this page with the PC\'s report. On the PC: /oflane status (Telegram).'));
    return;
  }
  box.dataset.on = X.on ? '1' : '0';
  chip.textContent = X.on ? `ON · ${X.account}` : `OFF · ${X.account}`; chip.dataset.level = X.on ? 'ok' : 'warn';
  const used = el('span', 'of-pill', `Day cap: ${X.used} of ${X.cap} used`); if (X.used >= X.cap) used.dataset.full = '1';
  meta.append(el('span', 'of-pill', `${X.account} (simulation)`), used, el('span', 'of-pill', X.src === 'live' ? 'live from the PC' : (X.day ? `as of ${X.day}` : 'room copy')));
  const rows = X.today ? X.trades : [];
  if (!rows.length) ul.append(el('li', 'of-lane-empty', X.on ? 'No lane trade yet today: it waits for the first absorbed level sweep (09:45-15:00 ET).' : 'The lane is off: no simulation order goes out.'));
  for (const t of rows) {
    const li = el('li'); li.dataset.status = t.status || '';
    const head = el('span', 'of-lt-h', `${t.t || ''} ${String(t.dir || '').toUpperCase()}${t.qty ? ` ${t.qty} MNQ` : ''}`);
    const res = t.status === 'refused' ? el('span', 'of-lt-r skip', whyWords(t))
      : num(t.pnl) !== null ? el('span', `of-lt-r ${t.pnl >= 0 ? 'up' : 'dn'}`, `${fmtUsd(t.pnl)} (sim)`)
        : num(t.R) !== null ? el('span', `of-lt-r ${t.R >= 0 ? 'up' : 'dn'}`, fmtR(t.R))
          : el('span', 'of-lt-r open', t.status === 'open' ? 'OPEN' : t.status === 'sending' ? 'SENDING' : (t.status || ''));
    li.append(head, res);
    const why = t.status !== 'refused' && t.why ? el('span', 'of-lt-why', String(t.why)) : null;
    if (why) li.append(why);
    ul.append(li);
  }
}

function drawGate(M) {
  const G = M.ladder, chip = document.getElementById('gateChip'), ul = document.getElementById('gateChecks');
  ul.replaceChildren();
  if (!G) { chip.textContent = 'not scored yet'; document.getElementById('gateTxt').textContent = 'The ladder is scored nightly (tools/of_ladder.py).'; return; }
  const lvl = G.status === 'passed' || G.status === 'ask_owner' ? 'ok' : G.status === 'stopped' ? 'bad' : 'warn';
  chip.textContent = G.status === 'watching' ? 'watching' : String(G.status || '').replace('_', ' '); chip.dataset.level = lvl;
  document.getElementById('gateH').textContent = `The ladder: step ${G.step ?? 0}${G.step_name ? ` · ${G.step_name}` : ''}`;
  const n = num(G.n) ?? 0, need = num(G.need) || 30;
  document.getElementById('gateFill').style.width = `${Math.min(100, 100 * n / need)}%`;
  const bar = document.getElementById('gateBar'); bar.setAttribute('aria-valuenow', String(n)); bar.setAttribute('aria-valuemax', String(need));
  document.getElementById('gateTxt').textContent = `${n} of ${need} first-of-day trades` + (n ? ` · ${G.won ?? 0} won · ${fmtR(num(G.sum_R) ?? 0)} · ${fmtUsd(num(G.usd_1) ?? 0)} at 1 MNQ` : ' · the count starts with the next forward trade');
  const fmtV = (k, v) => (v === null || v === undefined ? '-' : k === 'mean R' ? fmtR(v) : k === 'PF ($)' ? Number(v).toFixed(2) : String(v));
  for (const g of G.gates || []) {
    const v = g.v, ok = v === null || v === undefined || n < need ? null : (g.k === 'mean R' ? v >= 0.2 : g.k === 'PF ($)' ? v >= 1.3 : null);
    const li = el('li'); li.dataset.ok = ok === null ? 'wait' : ok ? '1' : '0';
    li.append(el('span', 'of-ck-k', g.k), el('span', 'of-ck-need', g.need), el('span', 'of-ck-v', n ? fmtV(g.k, v) : '-'));
    ul.append(li);
  }
  const extra = [];
  if (num(G.later_n)) extra.push(`Later-in-the-day trades (not judged): ${G.later_n}, ${fmtR(num(G.later_sum_R) ?? 0)}.`);
  if (G.cap_one_a_day) extra.push('The ladder says: cap the lane at 1 trade a day.');
  document.getElementById('gateNote').textContent = 'Paper forward, judged ONCE on the first 30 first-of-day trades; set before any forward trade.' + (extra.length ? ' ' + extra.join(' ') : '');
}

function tile(v, k, cls) { const d = el('div', `of-tile ${cls || ''}`); d.append(el('b', '', v), el('span', '', k)); return d; }
function drawBacktest(M) {
  const B = M.backtest, box = document.getElementById('btTiles');
  box.replaceChildren();
  const later = document.getElementById('btLater');
  if (!B) { document.getElementById('btNote').textContent = 'Not in this copy of the room data yet.'; later.hidden = true; return; }
  document.getElementById('btNote').textContent = `Lane A, ${B.label}, ${B.days} real trading days. Costs in, $ at 1 micro. Not proof: the ladder decides.`;
  box.append(tile(num(B.per_week) !== null ? `${B.per_week.toFixed(1)}/wk` : '-', 'trades'), tile(num(B.win_pct) !== null ? `${Math.round(B.win_pct)}%` : '-', 'won', 'up'),
    tile(fmtR(B.mean_R), 'avg a trade', B.mean_R > 0 ? 'up' : 'dn'), tile(num(B.pf) !== null ? B.pf.toFixed(2) : '-', 'profit factor', 'gold'),
    tile(fmtUsd(B.usd_1), `on ${B.days} days`, B.usd_1 > 0 ? 'up' : 'dn'), tile(num(B.max_dd) !== null ? `$${Math.round(B.max_dd).toLocaleString('en-US')}` : '-', 'max drawdown'),
    tile(`${fmtR(B.half_old)} / ${fmtR(B.half_new)}`, 'older / newer half', 'wide'));
  const L = B.later;
  later.hidden = !L;
  if (L) later.textContent = `Later-in-the-day trades lose: ${L.trades} trades, ${fmtUsd(L.usd_1)} at 1 MNQ. That is why the lane takes 1 trade a day. The newer half (${fmtR(B.half_new)}) is much weaker than the older one.`;
}

function drawOos(M) {
  const O = M.oos || { pending: true }, box = document.getElementById('oos'), chip = document.getElementById('oosChip');
  box.dataset.pending = O.pending ? '1' : '0';
  if (O.pending) {
    chip.textContent = 'pending'; chip.dataset.level = 'warn';
    document.getElementById('oosBig').textContent = O.when ? O.when.replace(/^./, (c) => c.toUpperCase()) : 'Tonight';
    document.getElementById('oosNote').textContent = 'Lane A on a full year of NQ ticks, rules frozen. The result shows here when the run finishes.';
    return;
  }
  const k = verdictKind(O.verdict), v = String(O.verdict || '').toLowerCase();
  chip.textContent = O.days ? `${O.days} days` : 'done'; chip.dataset.level = k === 'yes' ? 'ok' : k === 'no' ? 'bad' : 'warn';
  const A = O.laneA || {};
  document.getElementById('oosBig').textContent = v === 'pass' ? 'PASS: the ladder still decides' : v === 'fail' ? 'FAIL: no edge on the full year'
    : v === 'weak' ? 'WEAK: not enough to act on' : O.verdict ? shortVerdict(O.verdict) : (num(A.mean_R) !== null ? `${fmtR(A.mean_R)} avg` : 'Done');
  document.getElementById('oosNote').textContent = [O.line || '', O.first ? `${O.first} to ${O.last}${O.days ? `, ${O.days} days` : ''}.` : ''].filter(Boolean).join(' ');
  const tiles = document.getElementById('oosTiles'); tiles.replaceChildren();
  const add = (val, key, cls) => { if (val !== null && val !== undefined && val !== '-') tiles.append(tile(val, key, cls)); };
  const H = A.halves || {};
  if (num(A.n) !== null) {
    add(num(A.tpw) !== null ? `${A.tpw.toFixed(1)}/wk` : String(A.n), num(A.tpw) !== null ? `${A.n} trades` : 'trades');
    add(num(A.win_pct) !== null ? `${Math.round(A.win_pct)}%` : null, 'won', 'up');
    add(fmtR(A.mean_R), 'avg a trade', A.mean_R > 0 ? 'up' : 'dn');
    add(num(A.pf) !== null ? A.pf.toFixed(2) : null, 'profit factor', 'gold');
    add(num(A.usd_1) !== null ? fmtUsd(A.usd_1) : null, 'at 1 MNQ', A.usd_1 > 0 ? 'up' : 'dn');
    add(num(A.max_dd) !== null ? `$${Math.round(Math.abs(A.max_dd)).toLocaleString('en-US')}` : null, 'max drawdown');
    const hs = [['h1_2026', '2026 H1'], ['h2_2026', '2026 H2'], ['dec_2025', 'Dec 2025']].filter((h) => num(H[h[0]]) !== null);
    if (hs.length) add(hs.map((h) => fmtR(H[h[0]])).join(' / '), hs.map((h) => h[1]).join(' / '), 'wide');
  }
  const bk = document.getElementById('oosBooks'); bk.replaceChildren();
  for (const [key, lab] of [['first', 'First trade of the day'], ['one_at_a_time', 'Every signal, one at a time']]) {
    const b = (O.books || {})[key];
    if (!b || num(b.n) === null) continue;
    const parts = [`${lab}: ${b.n} trades${num(b.tpw) !== null ? ` (${b.tpw.toFixed(1)}/wk)` : ''}`, `${fmtR(b.mean_R)} avg`,
      num(b.win_pct) !== null ? `${Math.round(b.win_pct)}% won` : null, num(b.pf) !== null ? `PF ${b.pf.toFixed(2)}` : null, num(b.usd_1) !== null ? fmtUsd(b.usd_1) : null];
    bk.append(el('li', '', parts.filter(Boolean).join(' · ')));
  }
}

function drawV5(M) {
  const ol = document.getElementById('v5List');
  ol.replaceChildren();
  document.getElementById('v5Line').textContent = M.v5Line || (M.v5.length ? '' : 'The v5 summary is not in this copy of the room data.');
  for (const r of M.v5) {
    const li = el('li'); const vk = /^(no|effectively no)/i.test(r.verdict) ? 'no' : /too few/i.test(r.verdict) ? 'few' : 'weak';
    li.dataset.v = vk; if (r.watch) li.dataset.watch = '1';
    const top = el('div', 'of-v5-top');
    top.append(el('span', 'of-v5-rank', `#${r.rank}`), el('span', 'of-v5-name', `${r.family} · ${r.variant}`));
    if (r.watch) top.append(el('span', 'of-tag p', 'WATCH'));
    top.append(el('span', `of-v5-v ${vk}`, r.verdict));
    const nums = el('div', 'of-v5-nums');
    for (const t of [num(r.per_week) !== null ? `${r.per_week}/wk` : null, num(r.win_pct) !== null ? `${Math.round(r.win_pct)}% won` : null, fmtR(r.mean_R), num(r.pf) !== null ? `PF ${r.pf.toFixed(2)}` : null, num(r.usd_1) !== null ? fmtUsd(r.usd_1) : null].filter(Boolean)) nums.append(el('span', 'nw', t));
    li.append(top, el('p', 'of-v5-what', r.what), nums);
    if (r.oos) {
      const o = r.oos, bits = [o.verdict ? String(o.verdict).toUpperCase() : null, num(o.n) !== null ? `${o.n} trades` : null,
        num(o.mean_R) !== null ? fmtR(o.mean_R) : null, num(o.usd_1) !== null ? fmtUsd(o.usd_1) : null, o.line || null].filter(Boolean);
      li.append(el('p', 'of-v5-oos', `Full year: ${bits.join(' · ') || 'scored'}`));
    }
    ol.append(li);
  }
}

function draw(M) {
  const app = document.getElementById('app');
  app.dataset.state = M.state;
  const c = document.getElementById('src'); c.textContent = M.chip.text; c.dataset.level = M.chip.level;
  document.getElementById('heroH').textContent = M.state === 'recorded' ? `Last recorded day · ${M.day}` : M.state === 'empty' ? 'POSEIDON · order flow' : 'Today';
  document.getElementById('heroLine').textContent = M.line;
  const st = document.getElementById('stats'); st.replaceChildren();
  for (const s of M.stats) { const d = el('span', `of-stat ${s.cls}`); d.append(el('b', '', s.v), el('span', '', s.k)); st.append(d); }
  const f = Math.min(1, M.ring.n / M.ring.need), C = 2 * Math.PI * 40;
  document.getElementById('ringFg').setAttribute('stroke-dasharray', `${(C * f).toFixed(1)} ${C.toFixed(1)}`);
  document.getElementById('ringN').textContent = String(M.ring.n);
  document.getElementById('ringOf').textContent = `of ${M.ring.need}`;
  document.getElementById('ringCap').textContent = M.ring.label || 'forward paper trades';
  drawLane(M); drawGate(M); drawBacktest(M); drawOos(M); drawV5(M);
  drawLadder(M); drawTape(M); drawTrades(M); drawLit(M); drawVerdict(M);
  const age = M.made ? ago(M.nowS - M.made) : '';
  document.getElementById('made').textContent = age ? `Room data built ${age}.` : '';
}

// ------------------------------------------------------------------------------------------------ boot
const S = { room: null, lite: null, M: null, ready: false, polls: 0, strip: null };
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
async function loadStrip() {
  const d = await getJSON('of_strip.json');
  const chip = document.getElementById('stripChip'), box = document.getElementById('strip');
  if (!d || !Array.isArray(d.bars) || !d.bars.length) {
    chip.textContent = 'no day yet';
    if (!S.strip) box.replaceChildren(el('p', 'of-empty', 'The footprint shows here once a recorded tick day reaches the site.'));
    return;
  }
  chip.textContent = d.day ? `${d.day} · ${d.bars.length} bars` : `${d.bars.length} bars`; chip.dataset.level = 'ok';
  if (S.strip) S.strip.update(d); else S.strip = mountStrip(box, d, { height: 230 });
}
async function refresh(full) {
  if (full || !S.strip) loadStrip();
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
