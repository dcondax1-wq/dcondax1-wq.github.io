// NQ DATA PORTS on nq/ (day-nqports 2026-11-27): five cards in #ports, code-split (nq.js adds this file near the section or when idle).
// Reads ./ports.json (tools/nq_ports.py) + ./news_week.json once; today's live numbers come from the page's own state (window.NQ_HOME.bars:
// the PC's chart bars since 18:00 ET, the same post the hero draws: never a second feed read). The model is portscore.js.
// textContent / createElement(NS) only. Redraws on 'nq-home' (live bars) and every minute (the countdowns).
import * as P from './portscore.js?v=1';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
const NS = 'http://www.w3.org/2000/svg';
const S = { ports: null, news: null, home: window.NQ_HOME || null };
const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

function tile(id, title, age, extra) {
  const t = el('article', 'pt-card'); t.id = id;
  const h = el('div', 'pt-head'); h.appendChild(el('h3', 'pt-h', title));
  if (age) { const a = el('span', 'pt-age lv-' + age.lv, age.text); a.title = 'How old this data is'; h.appendChild(a); }
  if (extra) h.appendChild(extra);
  t.appendChild(h); return t;
}
const line = (t, text, cls) => { if (text) t.appendChild(el('p', 'pt-l' + (cls ? ' ' + cls : ''), text)); };
function none(t, text) { t.appendChild(el('p', 'pt-none', text)); }

function spark(hist) {                       // VIX9D / VIX / VIX3M over the last 30 sessions (three thin lines)
  const W = 300, H = 64, s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'pt-spark'); s.setAttribute('role', 'img');
  const vals = hist.flatMap((r) => [r[1], r[2], r[3]]).filter((v) => Number.isFinite(v));
  if (hist.length < 2 || !vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), y = (v) => H - 4 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 8), x = (i) => (i / (hist.length - 1)) * W;
  s.setAttribute('aria-label', `VIX term structure, last ${hist.length} sessions: VIX9D (gold), VIX (lavender), VIX3M (mint)`);
  [[1, 'k9'], [2, 'k30'], [3, 'k3m']].forEach(([k, cls]) => {
    const d = hist.map((r, i) => (Number.isFinite(r[k]) ? `${i && Number.isFinite(hist[i - 1][k]) ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}` : '')).join(' ');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'pt-ln ' + cls); s.appendChild(p);
  });
  return s;
}
function bar(frac, cls) { const b = el('i', 'pt-bar ' + (cls || '')), f = el('i', 'pt-fill'); f.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; b.appendChild(f); return b; }

function drawVol(box, nowS) {
  const V = P.vol(S.ports, nowS), t = tile('ptVol', 'Volatility weather', V.has ? V.age : null);
  if (!V.has) { none(t, V.line); box.appendChild(t); return; }
  const top = el('div', 'pt-top'); top.appendChild(el('b', 'pt-word tone-' + V.tone, V.word));
  const nums = el('div', 'pt-nums'); for (const [k, v] of V.nums) { const c = el('span', 'pt-num'); c.appendChild(el('small', '', k)); c.appendChild(el('b', 'ag-num', v ?? '-')); nums.appendChild(c); }
  top.appendChild(nums); t.appendChild(top);
  const sp = spark(V.hist); if (sp) { t.appendChild(sp); const lg = el('p', 'pt-legend'); for (const [c, n] of [['k9', 'VIX9D'], ['k30', 'VIX'], ['k3m', 'VIX3M']]) { const s = el('span', 'pt-key ' + c, n); lg.appendChild(s); } t.appendChild(lg); }
  line(t, V.curve); line(t, V.lit, 'gold'); line(t, V.gamma); line(t, V.vxn); line(t, V.vv, 'dim');
  box.appendChild(t);
}
function drawNormal(box, nowS) {
  const N = P.normal(S.ports, S.home && S.home.bars, nowS), t = tile('ptNormal', 'Today vs a normal day', N.has ? N.age : null);
  if (!N.has) { none(t, N.line); box.appendChild(t); return; }
  if (N.liveAge) t.appendChild(el('span', 'pt-live', N.liveAge + (S.home && S.home.demo ? ' (DEMO bars, not live)' : '')));
  if (N.line) line(t, N.line, 'dim');
  const g = el('div', 'pt-rows');
  for (const r of N.rows) { const x = el('div', 'pt-row lv-' + r.lv); x.appendChild(el('span', 'pt-k', r.k)); x.appendChild(el('b', 'ag-num', r.v)); x.appendChild(el('small', '', r.sub)); g.appendChild(x); }
  if (N.rows.length) t.appendChild(g);
  const wl = el('div', 'pt-wins'); wl.setAttribute('role', 'img');
  wl.setAttribute('aria-label', `Where the session high printed, last sessions: ${N.hiW.map((w) => `${w.label} ${w.pct}%`).join(', ')}`);
  for (const w of N.hiW) { const c = el('div', 'pt-win' + (N.nowWin === w.id ? ' now' : '')); c.appendChild(el('span', '', w.label.replace(/ \(.*\)/, ''))); c.appendChild(bar(w.pct / 60, 'hi')); c.appendChild(el('b', 'ag-num', `${w.pct}%`)); wl.appendChild(c); }
  t.appendChild(el('p', 'pt-sub', 'Where the day\'s HIGH usually prints'));
  t.appendChild(wl);
  line(t, N.where); line(t, N.base, 'dim'); line(t, N.esnq);
  box.appendChild(t);
}
function drawSweeps(box, nowS) {
  const W = P.sweeps(S.ports, S.home && S.home.bars, nowS), t = tile('ptSweeps', 'Sweep odds (the levels LIT trades)', W.has ? W.age : null);
  if (!W.has) { none(t, W.line); box.appendChild(t); return; }
  const tb = el('div', 'pt-sw');
  const hd = el('div', 'pt-swr head'); for (const h of ['', `All ${W.n.toLocaleString('en-US')} days`, `Last ${W.nRecent}`]) hd.appendChild(el('span', '', h)); tb.appendChild(hd);
  for (const r of W.rows) {
    const x = el('div', 'pt-swr'); const k = el('span', 'pt-k'); k.appendChild(el('b', '', r.k)); if (r.lvl) k.appendChild(el('small', 'ag-num', r.lvl)); if (r.now) k.appendChild(el('small', 'pt-now' + (/^taken/.test(r.now) ? ' hit' : ''), r.now));
    x.appendChild(k);
    for (const v of [r.all, r.recent]) { const c = el('span', 'pt-pc'); c.appendChild(bar((v || 0) / 100, '')); c.appendChild(el('b', 'ag-num', v === null ? '-' : `${v}%`)); x.appendChild(c); }
    tb.appendChild(x);
  }
  t.appendChild(tb); line(t, W.note, 'dim');
  box.appendChild(t);
}
function drawCot(box, nowS) {
  const C = P.cot(S.ports, nowS), t = tile('ptCot', 'Who is positioned how (CFTC)', C.has ? C.age : null);
  if (!C.has) { none(t, C.line); box.appendChild(t); return; }
  line(t, C.read);
  for (const r of C.rows) {
    const x = el('div', 'pt-cot'); const h = el('div', 'pt-cth'); h.appendChild(el('b', '', r.name)); h.appendChild(el('span', 'ag-num ' + (r.net >= 0 ? 'pos' : 'neg'), r.line)); x.appendChild(h);
    const rg = el('div', 'pt-range'); rg.setAttribute('role', 'img'); rg.setAttribute('aria-label', `${r.name}: ${r.pct ?? '-'}% of its 3-year range`);
    const m = el('i', 'pt-mark'); m.style.left = `${Math.round(r.frac * 100)}%`; rg.appendChild(m); x.appendChild(rg);
    const lb = el('div', 'pt-rl'); lb.appendChild(el('small', '', '3-yr most short')); lb.appendChild(el('small', '', '3-yr most long')); x.appendChild(lb);
    t.appendChild(x);
  }
  line(t, C.note, 'dim');
  box.appendChild(t);
}
function drawClock(box, nowS) {
  const K = P.clock(S.ports, S.news, nowS), t = tile('ptClock', 'Coming up', K.age);
  if (!K.has) { none(t, K.line); box.appendChild(t); return; }
  const ol = el('ol', 'pt-ev');
  for (const e of K.list) { const li = el('li', 'k-' + e.kind); li.appendChild(el('i', 'pt-ico', e.icon)); const d = el('div'); d.appendChild(el('b', '', e.when)); d.appendChild(el('span', '', e.what)); li.appendChild(d); ol.appendChild(li); }
  t.appendChild(ol);
  box.appendChild(t);
}
function draw() {
  const box = $('ports'); if (!box) return;
  const nowS = Date.now() / 1000, grid = box.querySelector('.pt-grid') || box.appendChild(el('div', 'pt-grid'));
  box.hidden = false; clear(grid);
  for (const f of [drawClock, drawVol, drawNormal, drawSweeps, drawCot]) { try { f(grid, nowS); } catch (_) { /* one card failing never blanks the rest */ } }
}
addEventListener('nq-home', (e) => { S.home = e.detail || S.home; if (S.ports) draw(); });
Promise.all([get('./ports.json'), get('./news_week.json')]).then(([p, n]) => { S.ports = p; S.news = n; S.home = window.NQ_HOME || S.home; draw(); setInterval(draw, 60000); });
