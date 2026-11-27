// NQ Accounts page (day-accounts 2026-11-23; night-nq-accounts 2026-11-27: premium cards + the business view). The rules live in
// acctcore.js (pure, node-tested); this file fetches and draws. Reads ../home.json, ../business/accounts.json, ../business/payday.json,
// ../business/forecast.json (pass / payout chances), ./plan12.json (the 12-month range) and the PC's public status post (../pc_feed.js).
// Funded accounts also get the payout tracker's line (payready.js model + ../business/payoutcoach.js). Text only through textContent /
// createElement(NS). Sends nothing, stores nothing. ?at=<ISO time> pins the clock (tests and screenshots only).
import * as D from './nqdesk.js?v=8';
import * as K7 from './clock7.js?v=3';
import * as A from './acctcore.js?v=2';
import { model as payModel } from './payready.js?v=3';

const $ = (id) => document.getElementById(id);
const S = { home: null, lite: null, biz: null, payday: null, forecast: null, plan: null, ready: false, model: null, open: new Set() };
const AT = (() => { try { const v = new URLSearchParams(location.search).get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; } catch (_) { return null; } })();
const T0 = Date.now() / 1000;
const nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);
const SVG = 'http://www.w3.org/2000/svg';
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
async function getPost() {
  const F = window.PC_FEED;
  if (!F || !F.fetchLatest) return null;
  try { return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { return null; }
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(SVG, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); return e; }
function etNow(t) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
  } catch (_) { return { date: null, min: null }; }
}

export function model(t) {
  const home = S.home || {}, F = window.PC_FEED;
  const h = S.lite && F && F.homeOver ? F.homeOver(home, S.lite, t, window.PAYOUT_COACH || null) : home;
  const accts = D.accounts(h, S.biz, t);
  const k7 = K7.rows(S.lite, t), et = etNow(t);
  const ctx = { lite: S.lite, biz: S.biz, payday: S.payday, forecast: S.forecast, nowS: t, today: K7.tradingDay(t), minuteET: et.min, etDate: et.date };
  const M = A.build(accts, k7, ctx);
  let pay = [];
  try { pay = window.PAYOUT_COACH ? payModel(S.lite, h, S.biz, window.PAYOUT_COACH, et.date || K7.tradingDay(t)) : []; } catch (_) { pay = []; }
  for (const c of M.cards) {
    c.x = A.extras(c, ctx);
    if (c.stage === 'Funded') c.x.pay = pay.find((p) => (p.l4 && c.l4 && p.l4 === c.l4) || c.x.ids.includes(String(p.id))) || null;
  }
  M.biz = A.business(S.plan, S.lite);
  return M;
}

// ------------------------------------------------------------------------------------------------ pieces
function bar(cls, label, value, frac) {
  const w = el('div', 'ac-bar ' + cls), lab = el('div', 'lab');
  lab.append(el('span', null, label), el('b', null, value));
  const tr = el('div', 'tr'), fl = el('div', 'fl');
  fl.style.setProperty('--w', frac == null ? '0%' : `${Math.round(frac * 100)}%`);
  tr.appendChild(fl); w.append(lab, tr); return w;
}
/** the room gauge: a glowing ring, the room in $ inside, its share of the max loss under it */
function ring(c) {
  const box = el('div', 'ac-ring ' + (c.roomLvl === 'none' ? 'none' : c.roomLvl));
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', c.roomFrac == null ? 'Room to max loss: not reported' : `Room to max loss ${c.room} of ${c.roomOf}, ${Math.round(c.roomFrac * 100)} percent`);
  const s = sv('svg', { viewBox: '0 0 84 84', width: 84, height: 84, 'aria-hidden': 'true' });
  const d = c.x.ring;
  s.append(sv('circle', { cx: 42, cy: 42, r: 34, class: 'rg-track' }), sv('circle', { cx: 42, cy: 42, r: 34, class: 'rg-glow', 'stroke-dasharray': d.dash, transform: 'rotate(-90 42 42)' }),
    sv('circle', { cx: 42, cy: 42, r: 34, class: 'rg-arc', 'stroke-dasharray': d.dash, transform: 'rotate(-90 42 42)' }), sv('circle', { cx: 42, cy: 42, r: 25, class: 'rg-core' }));
  box.appendChild(s);
  const mid = el('div', 'rg-mid'); mid.append(el('b', null, c.roomFrac == null ? '-' : `${Math.round(c.roomFrac * 100)}%`), el('small', null, 'room'));
  box.appendChild(mid);
  return box;
}
function k7Box(c) {
  const k = c.clock;
  if (!k) return el('div', 'ac-k7 none', c.planned ? '7-day clock starts once the PC reports this account.' : '7-day clock: the PC has not reported this account yet.');
  const w = el('div', 'ac-k7 ' + k.lvl); w.setAttribute('aria-label', '7-day clock');
  const dial = el('div', 'k7-dial'); dial.setAttribute('role', 'img');
  dial.setAttribute('aria-label', k.left < 0 ? 'past the 7-day limit' : `${k.left} of 7 days left`);
  const s = sv('svg', { viewBox: '0 0 64 64', width: 64, height: 64, 'aria-hidden': 'true' });
  const seg = c.x.seg || [];
  for (let i = 0; i < 7; i++) {
    const a0 = (-90 + i * (360 / 7) + 4) * Math.PI / 180, a1 = (-90 + (i + 1) * (360 / 7) - 4) * Math.PI / 180, r = 27;
    const p = `M ${(32 + r * Math.cos(a0)).toFixed(2)} ${(32 + r * Math.sin(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(32 + r * Math.cos(a1)).toFixed(2)} ${(32 + r * Math.sin(a1)).toFixed(2)}`;
    s.appendChild(sv('path', { d: p, class: 'k7-seg ' + (seg[i] || 'spent') }));
  }
  dial.appendChild(s);
  const big = el('div', 'k7-num', k.left < 0 ? '!' : String(k.left)); big.appendChild(el('small', null, k.left === 1 ? 'day' : 'days'));
  dial.appendChild(big);
  const txt = el('div', 'k7-txt');
  txt.append(el('div', 't strong', k.leftText + (k.ses != null && k.left >= 0 ? ` · ${k.ses} session${k.ses === 1 ? '' : 's'}` : '')), el('div', 't', `${k.lastText} · ${k.hardText}`));
  const ka = el('div', 't'); ka.appendChild(el('span', 'ka ' + (k.on === true ? 'on' : k.on === false ? 'off' : 'unk'), k.kaText));
  if (k.actText) ka.appendChild(document.createTextNode(' · ' + k.actText));
  txt.appendChild(ka);
  w.append(dial, txt);
  return w;
}
function forecastChip(c) {
  const f = c.x.fc;
  const w = el('div', 'ac-fc');
  if (!f) { w.appendChild(el('span', 'fc-none', 'Forecast: not made for this account yet')); return w; }
  const b = el('div', 'fc-big ' + (f.pct >= 60 ? 'ok' : f.pct >= 30 ? 'warn' : 'bad'));
  b.append(el('b', null, `${Math.round(f.pct)}%`), el('small', null, f.label));
  const t = el('div', 'fc-txt');
  t.append(el('span', null, `in a 2026-like market${f.med ? ` · ~${Math.round(f.med)} sessions` : ''}`));
  if (f.bad !== null) t.append(el('span', 'dim', `${Math.round(f.bad)}% in a 2021-25 market`));
  w.append(b, t);
  return w;
}
function payLine(c) {
  const p = c.x.pay;
  if (!p) return c.eta ? (() => { const e = el('p', 'ac-eta', c.eta + ' '); e.appendChild(el('small', null, c.etaNote)); return e; })() : null;
  const box = el('div', 'ac-pay ' + (p.status === 'ready' ? 'ready' : p.status === 'allowed' ? 'allowed' : p.has ? '' : 'wait'));
  if (!p.has) {                          // no tracker yet (or a plan the coach does not cover): the estimate, in plain words
    box.append(el('b', null, 'Next payout'), el('span', null, c.eta || 'estimate not made yet'), el('small', null, 'The live payout tracker fills in from the PC\'s next report.'));
    return box;
  }
  box.append(el('b', null, p.verdict), el('span', null, p.need ? p.need.text : p.reason));
  if (p.has && p.proj && p.proj.text) box.appendChild(el('small', null, 'Next payout: ' + p.proj.text));
  else if (c.eta) box.appendChild(el('small', null, c.eta));
  return box;
}
function historyBox(c) {
  const w = el('div', 'ac-hist'); w.id = 'hist-' + c.key;
  const h = c.x.hist;
  if (!h) { w.appendChild(el('p', 'dim', 'History: the PC has not sent end-of-day points for this account yet.')); return w; }
  const W = 320, H = 90, P = A.sparkPath(h.pts, W, H, 6);
  const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hist-svg', role: 'img', 'aria-label': `End-of-day P&L, ${h.n} points, from ${A.money(h.first, true)} to ${A.money(h.last, true)}` });
  const up = h.last >= h.first;
  const id = 'g-' + c.key;
  const defs = sv('defs'), lg = sv('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.append(sv('stop', { offset: '0', 'stop-color': up ? '#77db89' : '#ff5d6c', 'stop-opacity': '.35' }), sv('stop', { offset: '1', 'stop-color': up ? '#77db89' : '#ff5d6c', 'stop-opacity': '0' }));
  defs.appendChild(lg); s.appendChild(defs);
  if (P.zero !== null) s.appendChild(sv('line', { x1: 0, x2: W, y1: P.zero, y2: P.zero, class: 'hist-zero' }));
  s.appendChild(sv('polygon', { points: `6,${P.zero} ${P.line} ${P.lastX},${P.zero}`, fill: `url(#${id})` }));
  s.appendChild(sv('polyline', { points: P.line, class: 'hist-line ' + (up ? 'up' : 'down') }));
  s.appendChild(sv('circle', { cx: P.lastX, cy: P.lastY, r: 4, class: 'hist-dot ' + (up ? 'up' : 'down') }));
  w.appendChild(s);
  const lg2 = el('p', 'dim', `End-of-day P&L, last ${h.n} trading days: ${A.money(h.first, true)} → ${A.money(h.last, true)} (low ${A.money(h.min, true)}, high ${A.money(h.max, true)})`);
  w.appendChild(lg2);
  return w;
}

function drawCard(c) {
  const box = el('article', 'ac-card'); box.id = 'acct-' + c.key; box.dataset.key = c.key;
  box.dataset.k7 = c.clock ? c.clock.lvl : 'none'; box.dataset.stale = c.fresh ? '0' : '1'; box.dataset.stage = c.stage.toLowerCase();
  const head = el('div', 'ac-head'), nm = el('div', 'ac-name');
  nm.append(el('h2', null, c.name), el('p', null, [c.plan, c.l4 ? `··${c.l4}` : ''].filter(Boolean).join(' · ') || ' '));
  const right = el('div', 'ac-tags');
  right.append(el('span', 'ac-stage' + (c.stage === 'Funded' ? ' funded' : ''), c.stage === 'Funded' ? 'FUNDED' : 'EVAL'));
  right.appendChild(el('span', 'ac-age ' + (c.dot === 'live' ? '' : c.dot === 'stale' ? 'warn' : 'bad'), c.ageText));
  head.append(nm, right); box.appendChild(head);

  const hero = el('div', 'ac-hero');
  const nums = el('div', 'ac-nums');
  const n1 = el('div', 'ac-num big'); n1.append(el('span', null, c.stage === 'Funded' ? 'Profit (MFFU balance)' : 'Balance'), el('b', 'cnt', c.balance)); if (c.balanceNote) n1.appendChild(el('small', null, c.balanceNote));
  const n2 = el('div', 'ac-num'); n2.append(el('span', null, 'Today'), el('b', c.todayLvl, c.today));
  const n3 = el('div', 'ac-num'); n3.append(el('span', null, 'Room left'), el('b', c.roomLvl === 'bad' ? 'bad' : '', c.room));
  nums.append(n1, n2, n3);
  hero.append(nums, ring(c)); box.appendChild(hero);

  box.appendChild(bar('goal', `${c.goal.label} (${c.goal.sub})`, c.goal.text, c.goal.frac));
  if (c.goal.note) box.appendChild(el('p', 'ac-mini dim', c.goal.note));
  const dl = c.x.dll;
  box.appendChild(dl ? bar('dll ' + dl.lvl, 'Daily loss used (soft stop)', dl.text, dl.frac) : (() => { const p = el('p', 'ac-mini dim', c.has ? 'Daily loss used: the PC has not sent it yet' : 'Daily loss used: no PC numbers yet'); return p; })());
  box.appendChild(forecastChip(c));
  const pl = payLine(c); if (pl) box.appendChild(pl);

  const ul = el('ul', 'ac-bots'); ul.setAttribute('aria-label', 'Bots on this account');
  for (const b of c.bots) ul.appendChild(el('li', b.state, `${b.name} · ${A.BOT_WORD[b.state] || b.state}`));
  box.appendChild(ul);
  box.appendChild(k7Box(c));

  const more = el('button', 'ac-more', S.open.has(c.key) ? 'Hide history' : 'History'); more.type = 'button';
  more.setAttribute('aria-expanded', String(S.open.has(c.key))); more.setAttribute('aria-controls', 'hist-' + c.key);
  const hist = historyBox(c); hist.hidden = !S.open.has(c.key);
  more.addEventListener('click', () => {
    const open = hist.hidden; hist.hidden = !open; more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Hide history' : 'History';
    if (open) S.open.add(c.key); else S.open.delete(c.key);
  });
  box.append(more, hist);
  return box;
}

function drawBiz(B) {
  const box = $('biz'); box.textContent = '';
  if (B.light) {
    const l = el('div', 'bz-light ' + (B.light.stop ? 'stop' : 'ok')); l.id = 'buyLight';
    l.append(el('i', 'dot'), el('b', null, B.light.word), el('span', null, B.light.line));
    box.appendChild(l);
  }
  const h = el('div', 'bz-head'); h.append(el('h2', null, 'The business, next 12 months'), el('span', 'dim', B.made ? `simulated ${B.made}` : ''));
  box.appendChild(h);
  if (!B.rows.length) { box.appendChild(el('p', 'dim', 'The 12-month plan has not been published yet.')); return; }
  for (const r of B.rows) {
    const row = el('div', 'bz-row' + (r.plan ? ' plan' : ''));
    row.append(el('div', 'bz-lab', r.label), el('div', 'bz-val', r.text));
    const tr = el('div', 'bz-tr'); tr.setAttribute('role', 'img'); tr.setAttribute('aria-label', `${r.label}: ${r.text}`);
    const seg = (cls, ab) => { const b = el('i', 'bz-band ' + cls); b.style.setProperty('--a', `${(ab[0] * 100).toFixed(1)}%`); b.style.setProperty('--b', `${(ab[1] * 100).toFixed(1)}%`); return b; };
    const mid = el('i', 'bz-mid'); mid.style.setProperty('--m', `${(r.mid * 100).toFixed(1)}%`);
    const z = el('i', 'bz-zero'); z.style.setProperty('--z', `${(r.zero * 100).toFixed(1)}%`);
    tr.appendChild(z); if (r.neg) tr.appendChild(seg('neg', r.neg)); if (r.posb) tr.appendChild(seg('pos', r.posb)); tr.appendChild(mid); row.appendChild(tr);
    if (r.plan) row.appendChild(el('p', 'bz-note', `Keep about ${A.money(r.cash)} for eval fees · ${Math.round(r.loss)}% chance of a losing year · fees ~${A.money(r.fees)} a month`));
    box.appendChild(row);
  }
  box.appendChild(el('p', 'bz-foot dim', B.note + ' Each bar on its own scale: the 10th to 90th percentile (red below $0, green above), the bright mark is the middle, the thin line is $0.'));
}

function render() {
  const t = nowS(), M = model(t); S.model = M;
  const pc = $('pc'); pc.textContent = M.pc.text; pc.dataset.level = M.pc.level;
  const bn = $('banner');
  if (M.banner) { bn.hidden = false; bn.dataset.level = M.banner.level; $('bannerTitle').textContent = M.banner.title; $('bannerText').textContent = M.banner.text; } else bn.hidden = true;
  const c = M.counts;
  $('sum').textContent = `${c.all} account${c.all === 1 ? '' : 's'} · ${c.live} live from the PC` + (c.risk ? ` · ${c.risk} at risk (7-day)` : c.warn ? ` · ${c.warn} getting close (7-day)` : ' · every 7-day clock OK');
  const T = A.totals(M.cards), tt = $('tot');
  if (tt) {
    tt.textContent = '';
    const cell = (lab, val, cls) => { const d = el('div', 'tt-cell'); d.append(el('span', null, lab), el('b', cls || null, val)); return d; };
    tt.append(cell('Today, all accounts', T.todayText, T.todayLvl), cell('Room left, all', T.roomText), cell('Live from the PC', `${T.n} of ${M.cards.length}`));
    tt.hidden = !T.n;
  }
  const box = $('cards'); box.textContent = '';
  for (const card of M.cards) box.appendChild(drawCard(card));
  if (!S.counted && T.n) { S.counted = true; countUp(box); }
  drawBiz(M.biz);
  if (!S.ready) tiltOn();
  S.ready = true;
}

// the big balances count up once on the first paint with PC numbers (0.9 s, ease-out); the final text is exact; off under reduced motion
function countUp(box) {
  if (REDUCED || typeof requestAnimationFrame !== 'function') return;
  for (const b of box.querySelectorAll('.ac-num.big b.cnt')) {
    const final = b.textContent, m = /^([+-]?)\$([\d,]+)$/.exec(final);
    if (!m) continue;
    const v = Number(m[2].split(',').join(''));
    if (!(v > 0)) continue;
    const t0 = performance.now(), sign = m[1];
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      b.textContent = k >= 1 ? final : `${sign}$${Math.round(v * e).toLocaleString('en-US')}`;
      if (k < 1 && b.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// a gentle 3D tilt that follows the finger / pointer (off under reduced motion; transform only, no layout)
function tiltOn() {
  if (REDUCED) return;
  const box = $('cards');
  box.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.ac-card'); if (!card) return;
    const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`); card.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`); card.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
  }, { passive: true });
  box.addEventListener('pointerleave', () => { for (const c of box.querySelectorAll('.ac-card')) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } }, { passive: true });
}

// the shared NQ feed (nqfeed.js, night-nq-speed): the kept post paints at once (with its own age), every newer post re-renders
function feedOn() {
  const NQF = window.NQ_FEED;
  if (!NQF) return;
  try {
    const f = NQF.cached();
    if (f && !S.lite) S.lite = f;
    NQF.on((lite) => { if (lite) { S.lite = lite; if (S.ready) { try { render(); } catch (_) { /* keeps the last screen */ } } } });
  } catch (_) { /* the old path below still runs */ }
}

async function load(first) {
  const [home, biz, payday, fc, plan] = await Promise.all([getJSON('../home.json'), first || !S.biz ? getJSON('../business/accounts.json') : S.biz,
    first || !S.payday ? getJSON('../business/payday.json') : S.payday, getJSON('../business/forecast.json'), first || !S.plan ? getJSON('./plan12.json') : S.plan]);
  S.home = home; S.biz = biz; S.payday = payday; S.forecast = fc || S.forecast; S.plan = plan || S.plan;
  if (first) render();                 // the plan rows at once; the PC's numbers a moment later
  const lite = await getPost();
  if (lite) S.lite = lite;
  render();
}

window.NQ_ACCOUNTS = { S, model, ready: () => S.ready && S.loaded === true };
feedOn();
load(true).then(() => { S.loaded = true; }).catch(() => { S.loaded = true; try { render(); } catch (_) { /* nothing */ } });
setInterval(() => { try { render(); } catch (_) { /* keeps the last screen */ } }, 60000);           // ages and day counts move on
setInterval(() => { load(false).catch(() => {}); }, 5 * 60000);                                        // the PC posts every 15 min
