// NQ REPLAY THEATER (nq/replay.html; night 2026-11-27). A recent trading day played back like a film: the 5-minute candles draw bar by bar
// (1x / 5x / 15x / 60x = bars a second, a scrub bar, jump to the next event), LIT's steps light up as they happened, the bots' entries / stops /
// targets are drawn, R and $ tick, one narration line per event. Data: replay/index.json + replay/<day>.json (tools/build_replay.py: the
// bots' backtest twins on the PC's own bars). Honest: a day with no bot event says so. Text only through textContent; no storage; GET only.
// Reduced motion: no autoplay and no easing (the controls still work). Deep link: ?day=YYYY-MM-DD. window.NQREPLAY = the test hook.
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const REDUCE = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
const S = { idx: null, day: null, D: null, p: 0, playing: false, speed: 15, last: 0, raf: 0, shown: 0, ready: false, frames: 0, trades: [] };
const MD = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const dayLabel = (s, long) => { const d = MD(s); return d ? d.toLocaleDateString('en-US', long ? { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' } : { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : s; };
const hm = (t) => { try { return new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }); } catch (_) { return '--:--'; } };
const money = (v) => `${v < 0 ? '-' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const fmtR = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}R`;
async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }

/* ---------------- days ---------------- */
function drawDays() {
  const box = $('rDays'); clear(box);
  const D = (S.idx && S.idx.days) || [];
  $('dayRange').textContent = D.length ? `${dayLabel(S.idx.from)} - ${dayLabel(S.idx.to)}` : 'no days';
  if (!D.length) { box.appendChild(h('p', 'rnone', 'No replay days built yet (tools/build_replay.py).')); return; }
  for (const d of D) {
    const b = h('button', 'rday' + (d.trades ? ' has' : '')); b.type = 'button'; b.dataset.day = d.day; b.setAttribute('aria-pressed', String(d.day === S.day));
    b.appendChild(h('span', '', dayLabel(d.day))); b.appendChild(h('small', '', d.trades ? `${d.trades} trade${d.trades === 1 ? '' : 's'}` : `${d.setups} setup${d.setups === 1 ? '' : 's'}`));
    b.setAttribute('aria-label', `${dayLabel(d.day, true)}: ${d.trades} bot trade${d.trades === 1 ? '' : 's'}, ${d.setups} LIT setups`);
    b.addEventListener('click', () => openDay(d.day));
    box.appendChild(b);
  }
}
async function openDay(day) {
  pause();
  const D = await getJSON(`replay/${day}.json`);
  S.day = day; S.D = D; S.p = 0; S.shown = -1;
  for (const b of document.querySelectorAll('.rday')) b.setAttribute('aria-pressed', String(b.dataset.day === day));
  try { history.replaceState(null, '', `?day=${day}`); } catch (_) { /* file:// */ }
  $('thH').textContent = dayLabel(day, true);
  if (!D || !(D.bars || []).length) { $('rNow').textContent = 'This day could not be loaded.'; draw(); return; }
  const tix = D.bars.map((b) => b[0]);
  S.events = (D.events || []).map((e) => ({ ...e, i: Math.max(0, tix.findIndex((t) => t + 300 > e.t)) })).map((e) => ({ ...e, i: e.i < 0 ? D.bars.length - 1 : e.i }));
  // the trades: entry + its exit (same id)
  const by = {};
  for (const e of S.events) if (e.id && (e.kind === 'entry' || e.kind === 'exit')) (by[e.id] = by[e.id] || {})[e.kind] = e;
  S.trades = Object.values(by).filter((x) => x.entry);
  const sc = $('rScrub'); sc.max = String(D.bars.length - 1); sc.value = '0';
  const ev = S.events.filter((e) => e.kind !== 'setup').length, st = S.events.filter((e) => e.kind === 'setup').length;
  $('rNow').textContent = S.events.length ? `${ev ? `${S.trades.length} bot trade${S.trades.length === 1 ? '' : 's'}` : 'No bot trade'}${st ? ` and ${st} LIT setup${st === 1 ? '' : 's'} that stopped short` : ''} on this day. Press play.`
    : 'No bot event on this day: the candles only.';
  drawNotes(); update(true);
  if (!REDUCE) play();
}

/* ---------------- playback ---------------- */
function play() { if (!S.D || S.playing) return; if (S.p >= S.D.bars.length - 1) S.p = 0; S.playing = true; S.last = performance.now(); $('rPlay').textContent = '❚❚'; $('rPlay').setAttribute('aria-label', 'Pause'); loop(); }
function pause() { S.playing = false; cancelAnimationFrame(S.raf); const b = $('rPlay'); if (b) { b.textContent = '▶'; b.setAttribute('aria-label', 'Play'); } }
function loop() {
  if (!S.playing) return;
  const now = performance.now(), dt = Math.min(0.25, (now - S.last) / 1000); S.last = now;
  S.p = Math.min(S.D.bars.length - 1, S.p + dt * S.speed);
  update(false);
  if (S.p >= S.D.bars.length - 1) { pause(); return; }
  S.raf = requestAnimationFrame(loop);
}
function seek(p) { S.p = Math.max(0, Math.min(S.D.bars.length - 1, p)); update(true); }
function nextEvent() {
  if (!S.D) return;
  const cur = Math.floor(S.p);
  const e = S.events.find((x) => x.i > cur && x.kind !== 'setup') || S.events.find((x) => x.i > cur);
  if (e) seek(e.i); else seek(S.D.bars.length - 1);
}

/* ---------------- state at the playhead ---------------- */
function update(force) {
  const D = S.D; if (!D) return;
  const i = Math.floor(S.p), bar = D.bars[i];
  $('rScrub').value = String(i);
  $('rClock').textContent = `${hm(bar[0] + 300)} ET`;
  const seen = S.events.filter((e) => e.i <= i);
  if (seen.length !== S.shown || force) { drawStory(seen); S.shown = seen.length; }
  // LIT's steps for the newest LIT setup at the playhead
  const lit = seen.filter((e) => e.bot === 'LIT' && e.id);
  const cur = lit.length ? lit[lit.length - 1].id : null, mine = lit.filter((e) => e.id === cur);
  const exit = mine.find((e) => e.kind === 'exit');
  for (const li of document.querySelectorAll('#rSteps li')) {
    const s = li.dataset.s, got = s === 'x' ? !!exit : mine.some((e) => e.kind !== 'exit' && String(e.step) === s);
    li.className = got ? (s === 'x' ? (exit.r >= 0 ? 'win' : 'loss') : 'on') : '';
  }
  const lastLit = mine.length ? mine[mine.length - 1] : null;
  if (lastLit && !exit) { const li = document.querySelector(`#rSteps li[data-s="${lastLit.step}"]`); if (li) li.className = 'hot'; }
  // R and $: closed + open (marked to the playhead's close)
  const close = bar[4];
  let litR = 0, litU = 0, atlR = 0, atlU = 0, open = [];
  for (const T of S.trades) {
    const e = T.entry, x = T.exit;
    if (e.i > i) continue;
    const d = e.side === 'long' ? 1 : -1, risk = Math.abs(e.px - e.stop) || 1;
    let r, u;
    if (x && x.i <= i) { r = x.r; u = x.usd; } else {
      r = (close - e.px) * d / risk; u = e.bot === 'LIT' ? (close - e.px) * d * 2 * (e.qty || 1) : r * 250;
      open.push({ bot: e.bot, member: e.member, side: e.side, r, u });
    }
    if (e.bot === 'LIT') { litR += r; litU += u; } else { atlR += r; atlU += u; }
  }
  $('rPrice').textContent = close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const o = $('rOpen'); o.textContent = open.length ? open.map((x) => `${x.bot === 'LIT' ? 'LIT' : 'ATLAS ' + (x.member || '')} ${x.side} ${fmtR(x.r)}`).join(' · ') : ''; o.className = open.length ? (open[0].r >= 0 ? 'pos' : 'neg') : '';
  const tot = $('rTot'); clear(tot);
  const cell = (k, r, u, note) => { const c = h('div'); c.appendChild(h('small', '', k)); c.appendChild(h('b', u > 0.5 ? 'pos' : u < -0.5 ? 'neg' : '', `${fmtR(r)} ${money(u)}`)); if (note) c.appendChild(h('small', '', note)); return c; };
  tot.appendChild(cell('LIT so far', litR, litU, 'its real size')); tot.appendChild(cell('ATLAS so far', atlR, atlU, 'at $250 risk'));
  draw();
}
function drawStory(seen) {
  const ol = $('rStory'); clear(ol);
  if (!seen.length) { ol.appendChild(h('li', 'rnone', S.events.length ? 'Nothing yet at this point of the day.' : 'No bot event on this day: the candles only.')); return; }
  const last = seen[seen.length - 1];
  const now = $('rNow'); clear(now); now.appendChild(h('b', '', last.hm)); now.appendChild(document.createTextNode(last.text));
  seen.slice().reverse().forEach((e, k) => { const li = h('li', e.bot + (k === 0 ? ' fresh' : '')); li.appendChild(h('b', '', e.hm)); li.appendChild(h('small', '', e.bot === 'ATLAS' ? `ATLAS ${e.member || ''}` : 'LIT')); li.appendChild(document.createTextNode(e.text)); ol.appendChild(li); });
}
function drawNotes() {
  const ul = $('rNotes'); clear(ul);
  const N = (S.D && S.D.notes) || [];
  if (!N.length) { ul.appendChild(h('li', 'rnone', 'No live-account or order-flow note for this day.')); return; }
  for (const n of N) ul.appendChild(h('li', '', n.text));
}

/* ---------------- the chart: candles on a perspective floor ---------------- */
function draw() {
  const cv = $('rChart'); if (!cv || !cv.getContext) return;
  const W = Math.max(280, cv.clientWidth), H = cv.clientHeight || 300, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  S.frames++;
  const D = S.D; if (!D) return;
  const B = D.bars, i = Math.floor(S.p), frac = REDUCE ? 1 : S.p - i;
  const N = W > 700 ? 96 : 60, a = Math.max(0, i - N + 8), z = Math.min(B.length - 1, Math.max(i, a + N - 1));
  const vis = B.slice(a, i + 1);
  // the price scale: the visible bars + the open trades' levels
  let lo = Infinity, hi = -Infinity;
  for (const b of vis) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); }
  const live = S.trades.filter((T) => T.entry.i <= i && T.entry.i >= a - 40 && (!T.exit || T.exit.i >= a));
  const near = (e) => e.target && Math.abs(e.target - e.px) <= 3 * Math.abs(e.px - e.stop);     // a far target (7R+) would squash the candles
  for (const T of live) for (const v of [T.entry.px, T.entry.stop, near(T.entry) ? T.entry.target : null]) if (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.08 || 5; lo -= pad; hi += pad;
  const top = 34, bot = H - 26, L = 8, R = W - 58;
  const x = (k) => L + (R - L) * ((k - a + 0.5) / (z - a + 1)), y = (v) => bot - (bot - top) * ((v - lo) / (hi - lo));
  // the perspective floor (subtle 3D depth)
  g.save(); g.strokeStyle = 'rgba(157,89,238,.16)'; g.lineWidth = 1;
  const vx = W / 2, vy = top - 120;
  for (let k = 0; k <= 12; k++) { const fx = L + (R - L) * k / 12; g.beginPath(); g.moveTo(fx, bot + 22); g.lineTo(vx + (fx - vx) * 0.55, top + (bot - top) * 0.35); g.stroke(); }
  for (let k = 0; k < 7; k++) { const t = k / 6, yy = top + (bot - top) * (0.35 + 0.65 * t * t) + 22 * t; g.beginPath(); g.moveTo(L, yy); g.lineTo(R, yy); g.stroke(); }
  g.restore();
  // price labels
  g.fillStyle = 'rgba(218,203,240,.75)'; g.font = '12px system-ui, sans-serif'; g.textAlign = 'left';
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g.fillText(Math.round(v).toLocaleString('en-US'), R + 6, y(v) + 4); }
  // trade boxes + levels
  for (const T of live) {
    const e = T.entry, xi = T.exit && T.exit.i <= i ? T.exit.i : i, x0 = x(Math.max(a, e.i)), x1 = x(xi) + 4, long = e.side === 'long';
    if (e.target) { const tv = near(e) ? e.target : (e.target > e.px ? hi : lo); g.fillStyle = 'rgba(119,219,137,.08)'; g.fillRect(x0, Math.min(y(e.px), y(tv)), x1 - x0, Math.abs(y(tv) - y(e.px))); }
    g.fillStyle = 'rgba(239,68,68,.08)'; g.fillRect(x0, Math.min(y(e.px), y(e.stop)), x1 - x0, Math.abs(y(e.stop) - y(e.px)));
    const line = (v, col, dash) => { g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0, y(v)); g.lineTo(x1, y(v)); g.stroke(); g.setLineDash([]); };
    line(e.px, '#f1c14b', []); line(e.stop, '#ef4444', [5, 4]);
    if (e.target && near(e)) line(e.target, '#77db89', [5, 4]);
    else if (e.target) {                                       // off the scale: an arrow at the edge with its price
      const up = e.target > e.px, yy = up ? top + 4 : bot - 4;
      g.fillStyle = '#77db89'; g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'left';
      g.textAlign = 'right';
      g.fillText(`${up ? '\u2191' : '\u2193'} target ${Math.round(e.target).toLocaleString('en-US')}`, R - 4, up ? yy + 26 : yy - 14);
    }
    g.fillStyle = '#f1c14b'; g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText(`${e.bot === 'LIT' ? 'LIT' : (e.member || 'ATLAS')} ${long ? '▲' : '▼'}`, x0 + 2, y(e.px) - 5);
  }
  // candles (the last one grows while the playhead moves through it)
  const cw = Math.max(2, (R - L) / (z - a + 1) * 0.62);
  for (let k = a; k <= i; k++) {
    const b = B[k], grow = k === i ? frac : 1, o = b[1], c = o + (b[4] - o) * grow, hh = o + (b[2] - o) * Math.min(1, grow * 1.4), ll = o + (b[3] - o) * Math.min(1, grow * 1.4);
    const up = c >= o, col = up ? '#77db89' : '#9d59ee';
    g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x(k), y(hh)); g.lineTo(x(k), y(ll)); g.stroke();
    g.fillStyle = up ? 'rgba(119,219,137,.85)' : 'rgba(157,89,238,.85)';
    if (k === i) { g.shadowColor = col; g.shadowBlur = 14; }
    g.fillRect(x(k) - cw / 2, y(Math.max(o, c)), cw, Math.max(1, Math.abs(y(o) - y(c))));
    g.shadowBlur = 0;
  }
  // event markers
  for (const e of S.events) {
    if (e.i < a || e.i > i) continue;
    const b = B[e.i], yy = e.kind === 'exit' ? y(b[4]) : e.side === 'long' ? y(b[3]) + 12 : y(b[2]) - 12;
    g.beginPath(); g.arc(x(e.i), yy, e.kind === 'setup' ? 3 : 5, 0, Math.PI * 2);
    g.fillStyle = e.kind === 'exit' ? ((e.r || 0) >= 0 ? '#77db89' : '#ef4444') : e.kind === 'setup' ? 'rgba(218,203,240,.7)' : '#f1c14b';
    g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.fill(); g.shadowBlur = 0;
  }
  // the playhead
  g.strokeStyle = 'rgba(241,193,75,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x(i) + cw / 2 + 2, top - 6); g.lineTo(x(i) + cw / 2 + 2, bot + 6); g.stroke();
  g.fillStyle = 'rgba(218,203,240,.8)'; g.font = '12px system-ui, sans-serif'; g.textAlign = 'center';
  for (let k = a; k <= z; k += Math.max(6, Math.round((z - a) / 5))) if (B[k] && x(k) > 22 && x(k) < R - 16) g.fillText(hm(B[k][0]), x(k), H - 8);
}

/* ---------------- boot ---------------- */
async function boot() {
  $('rPlay').addEventListener('click', () => (S.playing ? pause() : play()));
  $('rNext').addEventListener('click', () => { pause(); nextEvent(); });
  $('rScrub').addEventListener('input', (e) => { pause(); seek(Number(e.target.value)); });
  for (const b of document.querySelectorAll('.rspeed .btn')) b.addEventListener('click', () => {
    S.speed = Number(b.dataset.x); for (const o of document.querySelectorAll('.rspeed .btn')) o.setAttribute('aria-pressed', String(o === b));
  });
  addEventListener('resize', () => draw());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  S.idx = await getJSON('replay/index.json');
  const want = new URLSearchParams(location.search).get('day');
  const days = (S.idx && S.idx.days) || [];
  S.day = days.some((d) => d.day === want) ? want : (days.find((d) => d.trades) || days[0] || {}).day || null;
  drawDays();
  if (S.day) await openDay(S.day); else $('rNow').textContent = 'No replay days built yet.';
  S.ready = true; document.documentElement.dataset.replay = 'ready';
  try { const O = window.OLYMPUS; if (O && O.ready) O.ready(); } catch (_) { /* nothing */ }
  const on = document.querySelector(`.rday[data-day="${S.day}"]`); if (on) try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) { /* old */ }
}
window.NQREPLAY = { S, ready: () => S.ready, play, pause, seek, nextEvent, openDay };
boot();
