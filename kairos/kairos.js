// KAIROS page (ES module): the right moment. The New York trading day on a ring and a marble sundial, the bot windows, what the bots do right now in plain words, today's trades on the clock
// (dollars with their R) and the history of dollars by hour (no claim below 3 trades). Reads odeon/trades.json, home.json (the bot's own state line, optional) and fixture.json (DEMO, never blank).
// Read only: sends nothing, keeps nothing. Text only through textContent / createElementNS. window.KAIROS is the test hook. ?at=2026-11-01T06:30:00Z fixes the clock (tests and links); ?demo=1 forces the demo.
import * as C from './kairoscore.js';
import { createSundial } from './kairosscene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, String(attrs[k])); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, odeon: null, home: null, trades: [], demo: false, forced: false, fixed: null, scene: null, mode: 'none', now: null, ns: null, sel: -1, ready: false, timer: 0 };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------ the ring
const CX = 160, CY = 160;
function drawRing(ns, tf) {
  const svg = $('ring'); clear(svg);
  svg.appendChild(sv('circle', { cx: CX, cy: CY, r: 134, class: 'face' }));
  for (const w of C.WINDOWS) svg.appendChild(sv('path', { d: C.arcPath(CX, CY, 100, 128, w.from, w.to), class: `band ${w.tone} ${S.windows.find((x) => x.id === w.id).state}`, 'data-w': w.id }));
  for (let hr = 0; hr < 24; hr++) { const [x0, y0] = C.polar(CX, CY, hr % 6 === 0 ? 94 : 97, hr * 60), [x1, y1] = C.polar(CX, CY, 100, hr * 60); svg.appendChild(sv('line', { x1: x0.toFixed(1), y1: y0.toFixed(1), x2: x1.toFixed(1), y2: y1.toFixed(1), class: 'tick' })); }
  for (const hr of [0, 6, 12, 18]) { const [x, y] = C.polar(CX, CY, 82, hr * 60); const t = sv('text', { x: x.toFixed(1), y: (y + 3).toFixed(1), 'text-anchor': 'middle', class: 'hr' }); t.textContent = String(hr).padStart(2, '0'); svg.appendChild(t); }
  for (const [mod, label] of [[120, '02:00'], [930, '15:30'], [970, '16:10'], [1020, '17:00'], [1080, '18:00']]) {
    const [x0, y0] = C.polar(CX, CY, 128, mod), [x1, y1] = C.polar(CX, CY, 136, mod); svg.appendChild(sv('line', { x1: x0.toFixed(1), y1: y0.toFixed(1), x2: x1.toFixed(1), y2: y1.toFixed(1), class: 'mark' }));
    if (mod !== 970) { const [tx, ty] = C.polar(CX, CY, 148, mod); const t = sv('text', { x: tx.toFixed(1), y: (ty + 3).toFixed(1), 'text-anchor': tx < CX - 4 ? 'end' : tx > CX + 4 ? 'start' : 'middle', class: 'mk' }); t.textContent = label; svg.appendChild(t); }
  }
  for (const t of tf.list) { const [x, y] = C.polar(CX, CY, 114, t.mod); const c = sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 5, class: 'dot ' + (t.usd > 0 ? 'w' : t.usd < 0 ? 'l' : 'z') }); const tt = sv('title'); tt.textContent = `${C.hhmm(t.mod)} ${t.side} ${C.both(t.usd, t.r, t.risk)}`; c.appendChild(tt); svg.appendChild(c); }
  const [nx, ny] = C.polar(CX, CY, 132, ns.et.mod);
  svg.appendChild(sv('line', { x1: CX, y1: CY, x2: nx.toFixed(1), y2: ny.toFixed(1), class: 'needle' })); svg.appendChild(sv('circle', { cx: nx.toFixed(1), cy: ny.toFixed(1), r: 6, class: 'now' }));
  const c1 = sv('text', { x: CX, y: CY - 2, 'text-anchor': 'middle', class: 'mid' }); c1.textContent = ns.et.hhmm; svg.appendChild(c1);
  const c2 = sv('text', { x: CX, y: CY + 16, 'text-anchor': 'middle', class: 'mid2' }); c2.textContent = ns.day + ' ET'; svg.appendChild(c2);
  svg.setAttribute('aria-label', `The New York day on a 24 hour ring. It is ${ns.et.hhmm}, ${ns.label}. ${tf.list.length} trade${tf.list.length === 1 ? '' : 's'} shown.`);
  $('ringNote').textContent = 'Midnight is at the top, the day runs clockwise. Green bands are entry windows, blue is paper only, amber is wind-down, grey is flat or the exchange break. Dots are trades; the gold hand is now.';
}

// ------------------------------------------------------------------ the page
function renderNow(ns) {
  $('clock').textContent = `${ns.day} ${ns.et.hhmm} ET`;
  $('phase').textContent = ns.label + (ns.entries ? ': entries are open' : '');
  const live = S.home && S.home.live && typeof S.home.live.model_state === 'string' ? S.home.live.model_state.replace(/[<>]/g, ' ').slice(0, 140) : '';
  $('doing').textContent = ns.text + (live ? ` The bot says: ${live}` : '');
  $('until').textContent = ns.until ? `Next: ${ns.until}.` : '';
  const p = $('entPill'); p.textContent = ns.entries ? 'Entries open' : ns.id === 'closed' ? 'Market closed' : 'No new entries'; p.className = 'pill ' + (ns.entries ? 'ok' : ns.id === 'winddown' || ns.id === 'flat' ? 'warn' : 'info');
  const dst = C.dstInfo(ns.et.ymd), box = $('dst'); box.hidden = dst.kind === 'none'; box.textContent = dst.text;
}
function renderWindows() {
  const ul = $('wins'); clear(ul);
  const label = { now: 'Now', next: 'Next', past: 'Done', later: 'Later' };
  for (const w of S.windows) {
    const li = h('li', 'win ' + w.state), t = h('div', 't'); t.appendChild(h('b', '', w.label)); const pill = h('span', 'pill ' + (w.state === 'now' ? 'ok' : w.state === 'next' ? 'info' : ''), label[w.state]); t.appendChild(pill);
    li.appendChild(t); li.appendChild(h('p', 'rng', `${w.range} ET · ${w.who}`)); li.appendChild(h('p', 'note', w.note)); ul.appendChild(li);
  }
  const extra = h('li', 'win'); extra.appendChild(h('p', 'rng', 'Fixed marks: 15:30 last entry · 15:55 bots flat · 16:10 MFFU flat · 17:00 to 18:00 CME break.')); ul.appendChild(extra);
}
function renderTrades(tf) {
  const ul = $('trades'); clear(ul);
  $('trPill').textContent = `${tf.label}${tf.list.length ? ' · ' + tf.list.length : ''}`; $('trPill').className = 'pill ' + (tf.label === 'Today' ? 'ok' : 'info');
  if (!tf.list.length) { ul.appendChild(h('li', 'empty', 'No trades yet. The bot takes at most one trade a day; it may be waiting for a sweep, or sitting out a quiet day.')); $('trNote').textContent = ''; return; }
  for (const t of tf.list) {
    const li = h('li', 'tr'), a = h('div', 't'); a.appendChild(h('b', '', `${C.hhmm(t.mod)} ET · ${t.side} · ${t.bot}`)); a.appendChild(h('span', 'usd ' + (t.usd > 0 ? 'pos' : t.usd < 0 ? 'neg' : ''), C.both(t.usd, t.r, t.risk))); li.appendChild(a);
    li.appendChild(h('p', 'note', [t.exit, t.held != null ? `held ${Math.round(t.held)} min` : '', t.src === 'real' ? 'real (eval)' : t.src === 'demo' ? 'example' : t.src ? 'paper' : ''].filter(Boolean).join(' · '))); ul.appendChild(li);
  }
  $('trNote').textContent = tf.label === 'Today' ? 'Placed on the ring by the minute they were entered (New York time).' : `Nothing yet today, so this is the last trading day, ${tf.day}.`;
}
function renderHeat() {
  const B = C.heat(S.trades), box = $('heat'); clear(box);
  const mx = Math.max(1, ...B.filter((b) => b.shown).map((b) => Math.abs(b.avg)));
  for (const b of B) {
    const lv = b.shown ? Math.min(3, Math.max(1, Math.ceil((Math.abs(b.avg) / mx) * 3))) : 0;
    const cls = !b.n ? 'none' : !b.shown ? 'few' : b.avg >= 0 ? 'pos i' + lv : 'neg i' + lv;
    const btn = h('button', 'cell ' + cls); btn.type = 'button'; btn.dataset.hour = String(b.h); btn.setAttribute('aria-pressed', S.sel === b.h ? 'true' : 'false');
    btn.setAttribute('aria-label', `${C.hhmm(b.h * 60)} to ${C.hhmm(b.h * 60 + 59)}: ${b.n} trades${b.shown ? '' : ', too few to judge'}`);
    btn.appendChild(h('b', '', String(b.h).padStart(2, '0'))); btn.appendChild(h('small', '', b.n ? `n=${b.n}` : '-'));
    btn.addEventListener('click', () => { S.sel = b.h; renderHeat(); }); box.appendChild(btn);
  }
  const d = $('heatDetail'); clear(d);
  const b = S.sel >= 0 ? B[S.sel] : null;
  if (!b) d.appendChild(h('p', 'note', 'Tap an hour to see its trades.'));
  else if (!b.n) d.appendChild(h('p', 'note', `${C.hhmm(b.h * 60)} to ${C.hhmm(b.h * 60 + 59)} ET: no trades.`));
  else if (!b.shown) d.appendChild(h('p', 'note', `${C.hhmm(b.h * 60)} to ${C.hhmm(b.h * 60 + 59)} ET: only ${b.n} trade${b.n === 1 ? '' : 's'} (${C.moneyS(b.usd)}, ${C.rS(b.rs)}). Too few to say anything about this hour (it needs ${C.MIN_N}).`));
  else d.appendChild(h('p', '', `${C.hhmm(b.h * 60)} to ${C.hhmm(b.h * 60 + 59)} ET: ${b.n} trades, ${C.both(b.usd, b.rs)} in total, ${C.both(b.avg, b.avgR)} each on average, ${Math.round(b.win * 100)}% winners.`));
  $('heatNote').textContent = `${C.heatWords(B)} Based on ${S.trades.length} trade${S.trades.length === 1 ? '' : 's'}${S.demo ? ' (EXAMPLE trades)' : ''}; a real trade and its paper twin count once. Hours are New York entry hours.`;
}
function render() {
  const now = S.fixed || new Date(), ns = C.nowState(now); S.now = now; S.ns = ns; S.windows = C.windowsFor(now);
  const tf = C.tradesFor(S.trades, ns.et.ymd); S.tf = tf;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderNow(ns); drawRing(ns, tf); renderWindows(); renderTrades(tf); renderHeat();
  if (S.scene) S.scene.set(ns.et.mod);
  say(`${ns.day} ${ns.et.hhmm} New York time. ${ns.label}. ${ns.entries ? 'Entries are open.' : 'No new entries.'} ${ns.until ? 'Next: ' + ns.until + '.' : ''}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const at = q.get('at'); if (at && !Number.isNaN(Date.parse(at))) S.fixed = new Date(at);
  const [fx, odeon, home] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../odeon/trades.json'), S.forced ? null : getJSON('../home.json')]);
  S.fixture = fx; S.odeon = odeon; S.home = home;
  const today = C.etParts(S.fixed || new Date()).ymd;
  const real = C.normTrades(odeon);
  if (real.length) { S.trades = real; S.demo = false; } else { S.trades = C.demoTrades(fx, today); S.demo = true; }
  try { S.scene = createSundial($('dial'), { O }); } catch (_) { S.scene = null; }
  S.mode = S.scene ? 'webgl' : 'flat'; if (!S.scene) document.querySelector('.stage').hidden = true;
  render();
  if (!S.fixed) S.timer = setInterval(render, 20000);
}
window.KAIROS = { S, C, ready: () => S.ready, scene: () => S.scene, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Kairos could not start'); } catch (_) { /* nothing */ } });
