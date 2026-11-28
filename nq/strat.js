// STRATEGY ROOM (day-strats 2026-11-27): nq/strat.html?s=lit | atlas | blitz | poseidon. One room per strategy: today's signals (the PC's public
// post: pc.glance + glog, of_room.json for POSEIDON), every trade it ever took on a tappable chart (strats/<s>.json: REAL / PAPER / BACKTEST
// tagged), equity live vs backtest by account, the numbers by period, and the Brain (brainview.js, loaded when its card nears the screen).
// The live chart is nqchart.js (window.NQ_STRAT filters it). Read only; text only via textContent; SVG drawn with createElementNS.
import { emoji } from './lcmodel.js?v=1';

const S = { s: window.NQ_STRAT || 'lit', d: null, lite: null, of: null, src: 'all', span: '2026', eq: '2026', stat: 0, sel: -1, rows: [], brain: null };
const NAME = { lit: 'Zlarior', atlas: 'ATLAS', blitz: 'BLITZ', poseidon: 'POSEIDON' };
const TAG = { live: 'REAL', paper: 'PAPER', backtest: 'BACKTEST', skip: 'SKIPPED' };
const COL = { live: '#f1c14b', paper: '#b48cf2', backtest: '#8f84a8', skip: '#ff5d73' };
const LIVE_COLS = ['#f1c14b', '#77db89', '#f472b6', '#a5b4fc'];
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, a, text) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a || {})) e.setAttribute(k, String(v)); if (text != null) e.textContent = String(text); return e; }
const clear = (e) => { while (e && e.firstChild) e.removeChild(e.firstChild); };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const money = (v) => { const n = num(v); if (n == null) return '-'; const a = Math.abs(Math.round(n)); return (n < 0 && a ? '-' : '') + '$' + a.toLocaleString('en-US'); };
const moneyS = (v) => { const n = num(v); return n == null ? '-' : (n > 0 && Math.round(n) ? '+' : '') + money(n); };
const px = (v) => (num(v) == null ? 'not recorded' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const rr = (v) => (num(v) == null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2) + 'R');
const ETF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hmET = (t) => (num(t) == null ? '' : ETF.format(new Date(t * 1000)));
const dayMs = (d) => Date.parse(d + 'T12:00:00Z');
const dayW = (d) => new Date(dayMs(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dayS = (d) => new Date(dayMs(d)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// ------------------------------------------------------------------------------------------------ the data
async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 9000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(tm); }
}
const C = (name) => (S.d ? S.d.cols.indexOf(name) : -1);
const get = (r, name) => r[C(name)];
async function lite() {
  const F = window.PC_FEED; if (!F || !F.fetchLatest) return null;
  try { return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 12000))]); } catch (e) { return null; }
}

// ------------------------------------------------------------------------------------------------ the header
function head() {
  const d = S.d || {}, paper = !!d.paper || S.s === 'blitz' || S.s === 'poseidon';
  document.title = `${NAME[S.s]} · NQ Strategy Room`;
  $('srName').textContent = NAME[S.s] + (S.s === 'poseidon' ? ' · order flow' : S.s === 'lit' ? ' · LIT' : '');
  $('srPaper').hidden = !paper;
  $('srWhat').textContent = d.what || '';
  for (const a of $('srTabs').querySelectorAll('a')) { if (a.dataset.s === S.s) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const to = d.data_to || {}, bits = [];
  if (to.backtest) bits.push(`backtest to ${dayW(to.backtest)}`);
  if (to.live) bits.push(`live to ${dayW(to.live)}`);
  if (to.paper) bits.push(`paper to ${dayW(to.paper)}`);
  $('srSrc').textContent = d.n ? `${d.n.toLocaleString('en-US')} trades · ${bits.join(' · ')}` : 'No data file';
  $('srSrc').dataset.level = d.n ? 'ok' : 'bad';
  $('srFoot').textContent = (d.note || '') + (d.sources ? ' Sources: ' + d.sources.join('; ') + '.' : '');
}

// ------------------------------------------------------------------------------------------------ today's signals (incl. the skipped ones, with why)
function sigRow(list, time, emo, who, text, cls) {
  const li = el('li', 'sr-sig' + (cls ? ' ' + cls : ''));
  li.append(el('span', 'sr-se', emo), el('span', 'sr-st', time || ''), el('b', 'sr-sn', who), el('span', 'sr-sx', text));
  list.appendChild(li);
}
function signals() {
  const list = $('sigList'); clear(list);
  const L = S.lite || {}, g = (L.pc && L.pc.glance) || {}, bots = Array.isArray(g.bots) ? g.bots : [];
  let n = 0, word = '';
  if (S.s === 'lit' || S.s === 'atlas') {
    const b = bots.find((x) => x && x.id === S.s), who = NAME[S.s];
    if (b) {
      if (b.stage) { sigRow(list, '', '📈', who, `Stage: ${b.stage}${b.on === false ? ' (off)' : ''}`); n++; }
      for (const a of Array.isArray(b.arm) ? b.arm : []) if (a && (a.text || a.trig)) { sigRow(list, '', '🎯', who, `Armed ${a.side || ''}: ${a.text || ''}${a.trig ? ' · fires on ' + a.trig : ''}`, 'arm'); n++; }
      if (b.wait) { sigRow(list, '', '⏳', who, b.wait); n++; }
      if (b.why) { sigRow(list, '', '🧠', who, b.why); n++; }
    }
    const gl = (L.glog && Array.isArray(L.glog[S.s]) ? L.glog[S.s] : (b && Array.isArray(b.log) ? b.log : [])).filter((r) => Array.isArray(r) && r[1]);
    for (const r of gl.slice(0, 10)) { sigRow(list, String(r[0]).slice(0, 5), emoji(String(r[1])), who, String(r[1]).slice(0, 220), /no trade|skip|blocked|not routed/i.test(r[1]) ? 'skip' : ''); n++; }
    word = S.lite ? (n ? `${n} from the PC` : 'quiet') : 'waiting for the PC';
    if (!n) sigRow(list, '', '⏳', who, S.lite ? `${who} has said nothing yet today in the PC's last post.` : 'Waiting for the PC\'s post (its thoughts and armed setups).');
  } else if (S.s === 'poseidon') {
    const O = S.of || {}, rows = Array.isArray(O.rows) ? O.rows : [];
    const ofp = L.ofp && typeof L.ofp === 'object' ? L.ofp : null;
    if (ofp && ofp.d) { sigRow(list, '', '🔱', 'Today', `${ofp.n || 0} paper signal${ofp.n === 1 ? '' : 's'} on ${ofp.d}${num(ofp.R) != null ? ', ' + rr(ofp.R) : ''} (the PC's paper bot)`); n++; }
    for (const r of rows) {
      const tk = !!r.taken, why = tk ? `${r.why || r.state || ''}${num(r.R) != null ? ' · ' + rr(r.R) : ''}${num(r.usd_1) != null ? ' · ' + moneyS(r.usd_1) + ' on 1 micro' : ''}` : `skipped: ${r.why_not || (r.absorbed ? 'not taken' : 'not absorbed')}`;
      sigRow(list, r.t || '', tk ? '🔱' : '⏳', r.level || 'level', `${(r.dir || '').toUpperCase()} · ${r.absorbed ? 'absorbed' : 'not absorbed'} · ${why}`, tk ? '' : 'skip'); n++;
    }
    word = O.day ? `${O.day === (new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) ? 'today' : 'last recorded day ' + O.day} · paper` : 'paper';
    if (!n) sigRow(list, '', '⏳', 'POSEIDON', 'No order-flow signals in the last recorded day.');
  } else {
    const p = (S.d && S.d.data_to && S.d.data_to.paper_summary) || null;
    sigRow(list, '', '🙈', 'BLITZ', 'BLITZ is hidden on the dashboards by your rule and runs on PAPER on the PC only: its live signals are not in the public feed, so none are shown here.');
    if (p) sigRow(list, '', '📄', 'Paper', `Since Oct 19: ${p.n} paper trades, ${p.win_pct}% won, ${p.sum_r > 0 ? '+' : ''}${p.sum_r}R (about ${moneyS(p.usd_150)} at $150 a trade). Replayed on the PC's bars; the PC's own ledger is not in the cloud.`);
    n = 0; word = 'paper · hidden';
  }
  $('sigChip').textContent = word;
}

// ------------------------------------------------------------------------------------------------ a small SVG plot (time on x, $ on y)
function plot(box, o) {
  clear(box);
  const W = Math.max(280, box.clientWidth || 340), H = o.h || 220, P = { l: 52, r: 10, t: 10, b: 24 };
  const xs = [], ys = [0];
  for (const s of o.lines || []) for (const [x, y] of s.pts) { xs.push(x); ys.push(y); }
  for (const d of o.dots || []) { xs.push(d.x); ys.push(d.y); }
  if (!xs.length) { box.appendChild(el('p', 'sr-empty', o.empty || 'Nothing to draw.')); return null; }
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 === x0) { x0 -= 864e5; x1 += 864e5; } if (y1 === y0) { y0 -= 100; y1 += 100; }
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r), Y = (y) => P.t + (1 - (y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'sr-svg' });
  const step = niceStep((y1 - y0) / 4);
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    const y = Y(v);
    svg.appendChild(sv('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, class: v === 0 ? 'sr-zero' : 'sr-grid' }));
    svg.appendChild(sv('text', { x: P.l - 6, y: y + 4, 'text-anchor': 'end', class: 'sr-ax' }, money(v).replace('$', '$').replace(/,000$/, 'k')));
  }
  const nx = W < 420 ? 3 : 5;
  const shortX = x1 - x0 < 150 * 864e5, lab = (d) => (shortX ? new Date(dayMs(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : dayS(d));
  for (let i = 0; i <= nx; i++) { const t = x0 + ((x1 - x0) * i) / nx, d = new Date(t).toISOString().slice(0, 10); svg.appendChild(sv('text', { x: X(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === nx ? 'end' : 'middle', class: 'sr-ax' }, lab(d))); }
  for (const s of o.lines || []) {
    if (!s.pts.length) continue;
    let d = ''; s.pts.forEach(([x, y], i) => { d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); });
    svg.appendChild(sv('path', { d, class: 'sr-line', stroke: s.color, 'stroke-width': s.w || 1.6, 'stroke-dasharray': s.dash || 'none', fill: 'none' }));
  }
  const pts = [];
  for (const d of o.dots || []) {
    const cx = X(d.x), cy = Y(d.y); pts.push([cx, cy, d.i]);
    const c = sv('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: d.r, fill: d.hollow ? 'none' : d.color, stroke: d.ring || (d.hollow ? d.color : 'none'), 'stroke-width': d.hollow ? 1.4 : 1.2, class: d.cls || '' });
    svg.appendChild(c);
  }
  const mark = sv('circle', { r: 9, class: 'sr-sel', cx: -50, cy: -50 }); svg.appendChild(mark);
  box.appendChild(svg);
  return { svg, pts, mark, X, Y };
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function seg(box, items, cur, on) {
  clear(box);
  for (const [k, label] of items) {
    const b = el('button', 'sr-sb', label); b.type = 'button'; b.setAttribute('aria-pressed', String(k === cur));
    b.addEventListener('click', () => on(k)); box.appendChild(b);
  }
}

// ------------------------------------------------------------------------------------------------ (2) every trade
function filtered() {
  const T = (S.d && S.d.trades) || [];
  return T.filter((r) => {
    const src = get(r, 'src'), day = get(r, 'day');
    if (S.src !== 'all' && src !== S.src) return false;
    if (S.span === '2026' && day < '2026-01-01') return false;
    if (S.span === '2021-25' && (day < '2021-01-01' || day > '2025-12-31')) return false;
    return true;
  });
}
function history() {
  const T = (S.d && S.d.trades) || [], has = new Set(T.map((r) => get(r, 'src')));
  const srcs = [['all', 'All'], ...['live', 'paper', 'backtest', 'skip'].filter((k) => has.has(k)).map((k) => [k, k === 'live' ? 'Real' : k === 'skip' ? 'Skipped' : k[0].toUpperCase() + k.slice(1)])];
  seg($('histSrc'), srcs, S.src, (k) => { S.src = k; S.sel = -1; history(); });
  const old = T.some((r) => get(r, 'day') < '2026-01-01');
  seg($('histSpan'), old ? [['2026', '2026'], ['2021-25', '2021-25'], ['all', 'All years']] : [['all', 'All']], old ? S.span : 'all', (k) => { S.span = k; S.sel = -1; history(); });
  if (!old) S.span = 'all';
  const rows = S.rows = filtered();
  let cum = 0;
  const big = rows.length > 700, dots = rows.map((r, i) => {
    const src = get(r, 'src'), usd = num(get(r, 'usd')) || 0;
    if (src !== 'skip') cum += usd;
    return { x: dayMs(get(r, 'day')), y: cum, i, color: COL[src] || COL.backtest, r: src === 'live' ? 5.5 : src === 'paper' ? 3.6 : src === 'skip' ? 3.2 : big ? 1.7 : 2.6,
      hollow: src === 'skip', ring: src === 'live' ? '#000' : null, cls: src === 'live' ? 'sr-live' : '' };
  });
  const line = { pts: dots.map((d) => [d.x, d.y]), color: 'rgba(157,89,238,0.55)', w: 1.2 };
  S.hp = plot($('histPlot'), { lines: [line], dots, h: 240, empty: 'No trades in this view.' });
  const net = rows.filter((r) => get(r, 'src') !== 'skip').reduce((a, r) => a + (num(get(r, 'usd')) || 0), 0);
  $('histChip').textContent = `${rows.length.toLocaleString('en-US')} trade${rows.length === 1 ? '' : 's'} · ${moneyS(net)}`;
  const key = $('histKey'); clear(key);
  for (const k of ['live', 'paper', 'backtest', 'skip'].filter((k) => rows.some((r) => get(r, 'src') === k))) { const s = el('span', 'sr-k'); const i = el('i'); i.style.background = COL[k]; s.append(i, document.createTextNode(TAG[k])); key.appendChild(s); }
  key.appendChild(el('span', 'sr-k sr-hint', 'Tap a dot'));
  if (S.hp) S.hp.svg.addEventListener('click', (ev) => { const p = nearest(S.hp, ev); if (p != null) pick(p); });
  const list = $('histList'); clear(list);
  rows.slice(-12).reverse().forEach((r) => {
    const i = rows.indexOf(r), li = el('li'), b = el('button', 'sr-row'); b.type = 'button';
    const src = get(r, 'src'), t = el('span', 'sr-tag ' + src, TAG[src] || src);
    b.append(t, el('span', 'sr-rd', `${dayW(get(r, 'day'))}${hmET(get(r, 't')) ? ' ' + hmET(get(r, 't')) : ''} · ${sideW(get(r, 'side'))}`), el('b', 'sr-rm ' + sign(get(r, 'usd')), moneyS(get(r, 'usd'))));
    b.setAttribute('aria-label', `${TAG[src]} trade ${dayW(get(r, 'day'))}, ${sideW(get(r, 'side'))}, ${moneyS(get(r, 'usd'))}. Show it.`);
    b.addEventListener('click', () => pick(i)); li.appendChild(b); list.appendChild(li);
  });
  if (S.sel >= 0 && S.sel < rows.length) pick(S.sel, true); else $('tradeCard').hidden = true;
}
const sideW = (s) => (String(s) === '1' || /long/i.test(s) ? 'Long' : String(s) === '-1' || /short/i.test(s) ? 'Short' : String(s || ''));
const sign = (v) => (num(v) == null ? '' : v > 0.5 ? 'pos' : v < -0.5 ? 'neg' : '');
function nearest(P, ev) {
  const r = P.svg.getBoundingClientRect(), vb = P.svg.viewBox.baseVal, sx = vb.width / r.width, x = (ev.clientX - r.left) * sx, y = (ev.clientY - r.top) * sx;
  let best = null, bd = 26 * sx;
  for (const [cx, cy, i] of P.pts) { const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = i; } }
  return best;
}
function pick(i, quiet) {
  const r = S.rows[i]; if (!r) return;
  S.sel = i;
  const card = $('tradeCard'); clear(card); card.hidden = false;
  const src = get(r, 'src'), t = get(r, 't'), xt = get(r, 'xt');
  const top = el('div', 'sr-tt'); top.append(el('span', 'sr-tag ' + src, TAG[src] || src), el('b', null, `${dayW(get(r, 'day'))}${hmET(t) ? ' · ' + hmET(t) + (hmET(xt) ? '-' + hmET(xt) : '') + ' ET' : ''}`));
  card.appendChild(top);
  const acct = get(r, 'acct'), tag = get(r, 'tag'), q = get(r, 'q');
  card.appendChild(el('p', 'sr-th', `${sideW(get(r, 'side'))}${q ? ' · ' + q + (S.s === 'poseidon' ? ' micro' : ' micros') : ''}${acct ? ' · ' + acct : ''}${tag ? ' · ' + tag : ''}`));
  const g = el('dl', 'sr-grid4');
  for (const [k, v] of [['Entry', px(get(r, 'e'))], ['Stop', px(get(r, 'sl'))], ['Target', px(get(r, 'tg'))], ['Exit', px(get(r, 'x'))]]) { const d = el('div'); d.append(el('dt', null, k), el('dd', v === 'not recorded' ? 'sr-nr' : '', v)); g.appendChild(d); }
  card.appendChild(g);
  const res = el('p', 'sr-res'); res.append(el('b', 'sr-rm ' + sign(get(r, 'usd')), moneyS(get(r, 'usd'))), document.createTextNode(` · ${rr(get(r, 'r'))} · ${whyW(get(r, 'k'))}${src === 'skip' ? ' (would have been: not taken)' : ''}`));
  card.appendChild(res);
  if (get(r, 'why')) card.appendChild(el('p', 'sr-why', get(r, 'why')));
  if (src === 'backtest') card.appendChild(el('p', 'sr-fine', 'Backtest: the research replay on CME NQ futures bars with costs in. Not money made.'));
  const nav = el('div', 'sr-nav');
  const prev = el('button', 'sr-nb', '‹ Older'), next = el('button', 'sr-nb', 'Newer ›');
  prev.type = next.type = 'button'; prev.disabled = i <= 0; next.disabled = i >= S.rows.length - 1;
  prev.addEventListener('click', () => pick(i - 1)); next.addEventListener('click', () => pick(i + 1));
  nav.append(prev, el('span', 'sr-ni', `${i + 1} of ${S.rows.length}`), next); card.appendChild(nav);
  if (S.hp) { const p = S.hp.pts[i]; if (p) { S.hp.mark.setAttribute('cx', p[0]); S.hp.mark.setAttribute('cy', p[1]); } }
  if (!quiet) { try { card.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { /* old browser */ } }
}
const WHY = { TARGET: 'target hit', STOP: 'stopped out', BE: 'break-even stop', TIME: 'time exit', EOD: 'flat by the close', TRAIL: 'trailing stop', DLL: 'daily loss limit' };
const whyW = (k) => WHY[String(k || '').toUpperCase()] || String(k || '').toLowerCase() || 'closed';

// ------------------------------------------------------------------------------------------------ (3) equity: live vs backtest, by account
function equity() {
  const E = (S.d && S.d.equity) || {}, live = Object.entries(E.live || {}), bt = E.backtest || [], pp = E.paper || [];
  const firstLive = live.length ? live.map(([, c]) => (c[0] || [])[0]).filter(Boolean).sort()[0] : null;
  const views = [['2026', '2026'], ...(bt.some((p) => p[0] < '2026-01-01') ? [['all', 'All years']] : []), ...(firstLive ? [['live', 'Since live']] : [])];
  if (!views.some(([k]) => k === S.eq)) S.eq = views[0][0];
  seg($('eqView'), views, S.eq, (k) => { S.eq = k; equity(); });
  const from = S.eq === '2026' ? '2026-01-01' : S.eq === 'live' ? firstLive : '0000';
  const rebase = (c) => { const before = c.filter((p) => p[0] < from).pop(), b = before ? before[1] : 0; return c.filter((p) => p[0] >= from).map(([d, v]) => [dayMs(d), v - b]); };
  const lines = [], key = $('eqKey'); clear(key);
  const add = (pts, color, label, w, dash) => { if (!pts.length) return; lines.push({ pts, color, w, dash }); const s = el('span', 'sr-k'); const i = el('i'); i.style.background = color; s.append(i, document.createTextNode(`${label} ${moneyS(pts[pts.length - 1][1])}`)); key.appendChild(s); };
  add(rebase(bt), '#8f84a8', 'Backtest', 1.6, '5 4');
  add(rebase(pp), '#b48cf2', 'Paper', 1.8);
  live.forEach(([a, c], j) => add(rebase(c), LIVE_COLS[j % LIVE_COLS.length], `${a} (real)`, 2.6));
  plot($('eqPlot'), { lines, h: 220, empty: 'No trades in this view.' });
  $('eqChip').textContent = live.length ? `${live.length} real account${live.length === 1 ? '' : 's'}` : (S.d && S.d.paper ? 'paper only' : 'no real trades yet');
  const notes = [];
  if (S.eq === 'live' && bt.length && bt[bt.length - 1][0] < firstLive) notes.push(`The backtest file ends ${dayW(bt[bt.length - 1][0])}, before the first real trade (${dayW(firstLive)}): the real line is drawn alone until the research is re-run.`);
  if (live.length) notes.push('Each real account starts at $0 here (its own trades only), like MFFU shows a sim-funded balance.');
  notes.push('Backtest sizing is the research\'s (its own risk per trade), so its $ is not the same scale as a real account\'s.');
  $('eqNote').textContent = notes.join(' ');
}

// ------------------------------------------------------------------------------------------------ (4) the numbers by period
function stats() {
  const sp = (S.d && S.d.spans) || [];
  if (!sp.length) { clear($('statTiles')); $('statTiles').appendChild(el('p', 'sr-empty', 'No trades to count.')); return; }
  if (S.stat >= sp.length) S.stat = 0;
  seg($('statSpan'), sp.map((x, i) => [i, x.k]), S.stat, (k) => { S.stat = k; stats(); });
  const x = sp[S.stat], box = $('statTiles'); clear(box);
  const tiles = [['Trades / week', x.tpw != null ? x.tpw.toFixed(1) : '-'], ['Won', x.win != null ? x.win.toFixed(0) + '%' : '-'], ['Profit factor', x.pf != null ? x.pf.toFixed(2) : '-'],
    ['Avg R', x.avg_r != null ? rr(x.avg_r) : '-'], ['$ / month', moneyS(x.usd_mo)], ['Max drawdown', money(x.max_dd)], ['Best trade', moneyS(x.best)], ['Worst trade', moneyS(x.worst)]];
  for (const [k, v] of tiles) { const t = el('div', 'sr-tile'); t.append(el('span', null, k), el('b', /^-\$/.test(v) || /^-/.test(v) ? 'neg' : /^\+/.test(v) ? 'pos' : '', v)); box.appendChild(t); }
  $('statChip').textContent = `${x.n} trades · ${moneyS(x.net)}`;
  const ref = ((S.d && S.d.research) || []).find((r) => r.k === x.k || (x.k.startsWith('2026 ') && !x.k.startsWith('2026 H1') && r.k === '2026 H2'));
  const src = x.src === 'paper' ? 'the real-tick paper signals' : x.k === 'Live (real)' ? 'the real accounts' : 'the backtest';
  $('statNote').textContent = `${dayW(x.from)} to ${dayW(x.to)}, from ${src}, the same math for every strategy.` +
    (ref ? ` The research file's own numbers (its sizing): PF ${ref.pf != null ? ref.pf : '-'}, ${moneyS(ref.usd_mo)} a month, ${ref.win != null ? ref.win + '% won' : ''}${ref.n ? ', ' + ref.n + ' trades' : ''}.` : '') +
    (S.d && S.d.paper ? ' PAPER only: no real money.' : '') + freshW();
}

function freshW() {
  const f = S.d && S.d.data_to && S.d.data_to.fresh;
  return f ? ` The backtest after ${dayW(f.after)} is a fresh replay on the newest bars to ${dayW(f.to)} (${f.n} trade${f.n === 1 ? '' : 's'}), checked against the stored research.${f.note ? ' ' + f.note + '.' : ''}` : '';
}
// ------------------------------------------------------------------------------------------------ (5) the Brain (brainview.js, the brains helper's)
function brain() {
  const card = $('brainCard'), mount = $('brainMount'); if (!card || !mount) return;
  const go = () => {
    if (S.brainTried) return; S.brainTried = true;
    $('brainChip').textContent = 'loading';
    import('./brainview.js?v=1').then((M) => {
      S.brain = M.mount(mount, { s: S.s, getState: () => ({ lite: S.lite, home: null, bars: barsNow() }) });
      $('brainChip').textContent = 'live';
    }).catch(() => { clear(mount); mount.appendChild(el('p', 'sr-empty', 'The decision trace is not on this copy of the site yet.')); $('brainChip').textContent = 'not here yet'; });
  };
  if (typeof IntersectionObserver === 'function') { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '300px 0px' }); io.observe(card); }
  else setTimeout(go, 1500);
}
function barsNow() { try { const C2 = window.NQCHART; return C2 && C2.S && C2.S.post && C2.B ? C2.B.unpack(C2.S.post) : null; } catch (e) { return null; } }

// ------------------------------------------------------------------------------------------------ boot
async function refresh() {
  if (document.hidden) return;
  const [l, of] = await Promise.all([lite(), S.s === 'poseidon' ? getJSON(new URL('./of_room.json', import.meta.url).href + '?t=' + Math.floor(Date.now() / 60000)) : null]);
  if (l) S.lite = l; if (of) S.of = of;
  signals();
  if (S.brain && S.brain.update) { try { S.brain.update(); } catch (e) { /* the card stays */ } }
}
async function boot() {
  head();
  S.d = await getJSON(new URL(`./strats/${S.s}.json?v=1`, import.meta.url).href, 15000);
  head();
  if (S.d) { history(); equity(); stats(); } else for (const id of ['histPlot', 'eqPlot', 'statTiles']) { clear($(id)); $(id).appendChild(el('p', 'sr-empty', 'This strategy\'s data file (strats/' + S.s + '.json) is not on this copy of the site.')); }
  signals();
  brain();
  $('app').dataset.state = S.d ? 'ok' : 'none';
  S.ready = true;
  await refresh();
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.d) { history(); equity(); } }, 200); });
}
window.STRAT = { S, ready: () => !!S.ready, pick };
boot().catch((e) => { S.err = String(e && e.message ? e.message : e); S.ready = true; });
