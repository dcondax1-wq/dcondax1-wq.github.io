// THE WAR ROOM page (ES module). The model is warcore.js (pure, node-tested); this file draws it, polls the PC's posts while the page is
// visible (status every 60 s, chart every 2 min), ticks the countdowns each second, types the newest line of the story, draws the 2-hour
// chart with the levels each bot watches, and (only when the owner turns it on) shows milestone alerts on this phone.
// Text only through textContent. Storage: this phone's own conveniences only (the alert switch, what it already alerted, today's changes).
// Read only: GET requests to the site and the PC's public status topic; nothing is sent, armed, placed or closed. window.WARROOM = the test hook.
import * as C from './warcore.js?v=w4';
import * as NB from '../nq/nqbars.js?v=b2';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const nowS = () => Date.now() / 1000;
const q = new URLSearchParams(location.search);
const LOW = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || q.get('lite') === '1' || (navigator.connection && navigator.connection.saveData)
  || ((navigator.hardwareConcurrency || 8) <= 4 && q.get('fx') !== '3d'); } catch (_) { return false; } })();
if (LOW) document.documentElement.classList.add('wr-low');
const S = { src: { lite: null, bars: null, brief: null, pillars: null, hidden: [] }, model: null, prev: null, ready: false, typed: '', polls: 0, feed: null, sig: {} };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode: fine */ } },
};

async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }
async function getText(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.text() : null; } catch (_) { return null; } }

async function loadSite() {
  const [brief, pillars, home, feed] = await Promise.all(['../nq/brief.json', '../pillars/pillars-data.json', '../home.json', '../status_feed.json'].map(getJSON));
  S.src.brief = brief; S.src.pillars = pillars; S.feed = feed;
  const hb = home && (Array.isArray(home.hidden_bots) ? home.hidden_bots : home.board && Array.isArray(home.board.hidden_bots) ? home.board.hidden_bots : null);
  S.src.hidden = hb || ['blitz'];
}
async function pollCore() {
  const F = window.PC_FEED;
  if (!F || !F.fetchLatest) return;
  try {
    const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
    if (lite) S.src.lite = lite;
  } catch (_) { /* keep the last */ }
}
async function pollBars() {
  for (const u of NB.feedUrls(S.feed)) {
    const t = await getText(u);
    const post = t ? await NB.parseVerified(t, S.feed, nowS()) : null;
    if (post) { S.src.bars = post; return; }
  }
}

// ------------------------------------------------------------------------------------------------ render
function render() {
  const t = nowS(), memo = store.get('oly.wr.memo', []);
  const M = C.build(S.src, t, memo);
  if (S.model) {                                   // what changed since the last post this page saw: kept for today on this phone
    const ch = C.changes(S.model, M, t);
    if (ch.length) { const day = C.etNow(t).day, keep = memo.filter((m) => m && m.day === day).concat(ch).slice(-40); store.set('oly.wr.memo', keep); M.feed = C.feed(S.src, M, t, keep); }
  }
  S.prev = S.model; S.model = M;
  drawTop(M); drawTrades(M); drawOver(M); drawLadders(M); drawChart(M); drawFeed(M); alerts(M);
  if (!S.ready) {
    S.ready = true;
    document.dispatchEvent(new Event('wr-ready'));
    setTimeout(() => { if (LOW) return; import('../pillars/nightfx.js?v=h1').then((m) => m.mount()).catch(() => {}); import('../pillars/livefx.js?v=h1').then((m) => m.watch()).catch(() => {}); }, 300);
  }
}

function drawTop(M) {
  const pill = $('pcPill'); pill.dataset.level = M.pc.level; $('pcText').textContent = M.pc.text;
  $('px').textContent = M.price !== null ? C.px(M.price) : '-';
  const st = $('stale'); st.hidden = !M.pc.banner; st.textContent = M.pc.banner; st.dataset.level = M.pc.level;
  $('headline').textContent = M.headline;
  const nw = $('nextWin'); clear(nw);
  if (M.next) { nw.append(`Next window: ${M.next.who} opens ${M.next.day === 'today' ? '' : M.next.day + ' '}${M.next.at} ET · in `); const b = h('b', 'cd', C.clock(M.next.s - nowS())); b.dataset.until = M.next.s; nw.append(b); }
  else nw.textContent = M.bots.some((b) => b.window && b.window.state === 'open') ? 'A window is open now.' : '';
}

function drawTrades(M) {
  const box = $('trades'); clear(box); box.hidden = !M.positions.length;
  for (const p of M.positions) {
    const c = h('article', 'glass trd'); c.style.setProperty('--c', p.color);
    const e = h('p', 'eyebrow'); e.append(h('i'), 'In a trade'); c.append(e, h('h3', '', p.head));
    const big = h('div', 'big'), u = h('span', 'usd num ' + ((p.usd || 0) >= 0 ? 'pos' : 'neg'), C.usd(p.usd, true)), r = h('span', 'r num ' + ((p.r || 0) >= 0 ? 'pos' : 'neg'), p.r !== null ? `${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R` : '');
    big.append(u, r, h('span', 'muted small', p.pts !== null ? `${p.pts >= 0 ? '+' : '-'}${C.pts(p.pts)} pts` : 'live $ from the PC')); c.append(big);
    const lv = h('div', 'lvls');
    for (const [cls, k, v] of [['', 'Entry', p.entry], ['s', 'Stop', p.stop], ['t', 'Target', p.target]]) { const d = h('div', cls); d.append(k, h('b', '', C.px(v))); lv.append(d); }
    c.append(lv);
    if (p.stop !== null && p.target !== null && p.live !== null) {   // where the price sits between the stop (left) and the target (right)
      const tr = h('div', 'track'), f = (x) => Math.max(0, Math.min(100, ((x - p.stop) / (p.target - p.stop)) * 100));
      const en = h('em'); en.style.left = f(p.entry) + '%'; const now = h('i'); now.style.left = f(p.live) + '%'; tr.append(en, now); tr.setAttribute('aria-hidden', 'true'); c.append(tr);
    }
    const m = h('p', 'meta'); m.append('Time in trade: '); const tb = h('b', 'cd', p.t ? C.clock(nowS() - p.t) : 'not sent'); if (p.t) tb.dataset.since = p.t; m.append(tb, ` · risk ${C.usd(p.riskUsd)}`);
    c.append(m, h('p', 'meta', p.close));
    box.append(c);
  }
}

function drawOver(M) {
  const box = $('over'); clear(box);
  for (const b of M.bots) {
    const a = h('a', 'ot' + (b.meter.pct >= 78 ? ' hot' : '')); a.href = '#lad-' + b.id; a.style.setProperty('--c', b.color);
    a.setAttribute('aria-label', `${b.name}: ${b.meter.word}, ${b.meter.pct}%. Open its steps.`);
    const ring = h('div', 'ring'); ring.style.setProperty('--p', b.meter.pct); ring.append(h('span', 'num', b.meter.unit ? `${b.meter.pct}%` : `${b.meter.pct}%`));
    const em = h('em', 'num');
    const w = b.window || {};
    if (w.state === 'open' && w.endS) { const s = h('span', 'cd', C.clock(w.endS - nowS())); s.dataset.until = w.endS; em.append(s, ' left'); }
    else if (w.nextS && !b.hidden) { em.append('in '); const s = h('span', 'cd', C.clock(w.nextS - nowS())); s.dataset.until = w.nextS; em.append(s); }
    else em.textContent = b.stepText;
    a.append(h('b', '', b.name), ring, h('small', '', b.meter.word), em);
    box.append(a);
  }
}

function pillCls(p) { return /ARMED$/.test(p) && !/NOT/.test(p) ? 'ok' : /STOPPED|NO DATA/.test(p) ? 'bad' : /NOT ARMED|ON/.test(p) ? 'warn' : ''; }
const WORD = { done: 'passed', now: 'now', next: 'next', wait: '', off: 'off' };
function stepLi(s, b, withText) {
  const li = h('li', 'st ' + s.state); li.dataset.key = s.key;
  li.append(h('span', 'nd', s.state === 'done' ? '✓' : s.n), h('span', 'sl', s.label));
  if (WORD[s.state] && withText) li.lastChild.append(h('span', 'sw', WORD[s.state]));
  if (withText && s.state === 'now' && b.now) li.append(h('span', 'tx', b.now.text));
  if (withText && s.state === 'next' && b.next) li.append(h('span', 'tx', b.next.text));
  li.title = s.help;
  return li;
}
function drawLadders(M) {
  const box = $('ladders');
  for (const b of M.bots) {
    const sig = JSON.stringify([b.pill, b.groups, b.now, b.next, b.meter.pct, b.meter.word, b.window && b.window.text, b.why]);
    let card = $('lad-' + b.id);
    if (card && S.sig[b.id] === sig) { const bars = card.querySelectorAll('.bar i'); if (bars[1]) bars[1].style.setProperty('--f', b.meter.time); continue; }
    S.sig[b.id] = sig;
    const fresh = h('article', 'glass lad' + (b.hidden || b.id === 'of' ? ' dim' : '')); fresh.id = 'lad-' + b.id; fresh.style.setProperty('--c', b.color);
    fresh.setAttribute('aria-label', `${b.name} steps`);
    const head = h('div', 'lh'); head.append(h('span', 'dot'), h('h3', '', b.name), h('span', 'alias', b.alias), h('span', 'pill ' + pillCls(b.pill), b.pill));
    fresh.append(head);
    const m = h('div', 'meter'), mt = h('div', 'mt'); mt.append(h('span', '', b.id === 'of' ? 'Tick days collected' : 'How close to a trade'), h('b', 'num', `${b.meter.word} · ${b.meter.pct}%`));
    const bar = h('div', 'bar'), bi = h('i'); bi.style.setProperty('--f', 0); bar.append(bi);
    const tbar = h('div', 'bar time'), ti = h('i'); ti.style.setProperty('--f', 0); tbar.append(ti);
    m.append(mt, bar); if (b.window && b.window.state === 'open') m.append(tbar);
    fresh.append(m);
    const win = h('p', 'win'); const w = b.window || {};
    win.append(w.text || '');
    if (w.state === 'open' && w.endS) { win.append(' · '); const s = h('b', 'cd', C.clock(w.endS - nowS())); s.dataset.until = w.endS; win.append(s, ' left'); }
    else if (w.nextS && !b.hidden) { win.append(' · in '); const s = h('b', 'cd', C.clock(w.nextS - nowS())); s.dataset.until = w.nextS; win.append(s); }
    fresh.append(win);
    if (b.id === 'atlas') {
      const L = h('div', 'lobes');
      for (const g of b.groups) {
        const d = h('div', 'lobe'), t4 = h('h4', '', g.name); t4.append(h('small', '', g.window && g.window.span ? g.window.span.replace(' ET', '') : '')); d.append(t4);
        const ol = h('ol', 'steps'); for (const s of g.steps) ol.append(stepLi(s, b, false)); d.append(ol); L.append(d);
      }
      fresh.append(L);
      const ul = h('ul', 'lneeds');
      for (const g of b.groups) { const li = h('li', g.state); li.append(h('b', '', g.name), g.text ? `${g.text}. ` : '', g.needs); ul.append(li); }
      fresh.append(ul);
    } else {
      const ol = h('ol', 'steps'); for (const s of b.groups[0].steps) ol.append(stepLi(s, b, true));
      if (!b.groups[0].steps.length) ol.append(h('li', 'st wait', 'Waiting for the pillars file.'));
      fresh.append(ol);
    }
    if (b.nar) fresh.append(h('p', 'why', b.nar));
    if (b.why && b.id !== 'atlas') fresh.append(h('p', 'why', (b.id === 'lit' ? 'Last decision: ' : '') + b.why));
    if (card) card.replaceWith(fresh); else box.append(fresh);
    requestAnimationFrame(() => requestAnimationFrame(() => { bi.style.setProperty('--f', b.meter.pct / 100); ti.style.setProperty('--f', b.meter.time || 0); }));
  }
}

// ------------------------------------------------------------------------------------------------ the chart (canvas 2D, drawn once a post)
function drawChart(M) {
  const ch = M.chart, cv = $('chart'), empty = $('chartEmpty');
  $('chartAge').textContent = ch.state === 'none' ? 'no bars' : ch.state === 'ok' ? `${C.ago(ch.age)}` : `old: ${C.ago(ch.age)}`;
  $('chartText').textContent = ch.text;
  empty.hidden = ch.state !== 'none'; empty.textContent = ch.state === 'none' ? `${ch.text} The levels each bot watches are in its steps above.` : '';
  const lg = $('chartLegend'); clear(lg);
  const seen = new Set();
  for (const l of ch.levels) { const k = l.who + l.kind; if (seen.has(k)) continue; seen.add(k); const s = h('span'); const i = h('i', l.kind === 'level' ? 'dash' : ''); i.style.setProperty('--c', l.kind === 'stop' ? '#ff6b8a' : l.kind === 'target' ? '#77db89' : l.color); s.append(i, `${l.who === 'lit' ? 'LIT' : 'ATLAS'} ${l.kind === 'level' ? 'levels' : l.kind}`); lg.append(s); }
  $('chartOff').textContent = ch.off && ch.off.length ? 'Off the chart: ' + ch.off.slice(0, 6).map((l) => `${l.dir === 'up' ? '↑' : '↓'} ${l.label} ${C.px(l.price)} (${l.dist > 0 ? '+' : '-'}${C.pts(l.dist)})`).join(' · ') : '';
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (ch.state === 'none' || !ch.candles.length) return;
  const R = 62, n = ch.candles.length, cw = (W - R - 8) / n, y = (p) => 8 + (1 - (p - ch.lo) / (ch.hi - ch.lo)) * (H - 26);
  ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.strokeStyle = 'rgba(77,46,118,.35)'; ctx.lineWidth = 1;          // grid
  for (let i = 0; i <= 4; i += 1) { const p = ch.lo + ((ch.hi - ch.lo) * i) / 4, yy = Math.round(y(p)) + 0.5; ctx.beginPath(); ctx.moveTo(4, yy); ctx.lineTo(W - R, yy); ctx.stroke(); ctx.fillStyle = 'rgba(169,156,194,.7)'; ctx.fillText(C.px(p), W - R + 4, yy + 3); }
  ch.candles.forEach((c, i) => {
    const x = 4 + i * cw + cw / 2, up = c.c >= c.o;
    ctx.strokeStyle = up ? 'rgba(119,219,137,.85)' : 'rgba(255,107,138,.85)'; ctx.fillStyle = up ? 'rgba(119,219,137,.75)' : 'rgba(255,107,138,.75)';
    ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
    const top = y(Math.max(c.o, c.c)), bh = Math.max(1, Math.abs(y(c.o) - y(c.c))); ctx.fillRect(x - cw * 0.32, top, cw * 0.64, bh);
    const t = NB.et(c.t); if (t && i % 6 === 0) { ctx.fillStyle = 'rgba(169,156,194,.7)'; ctx.fillText(t.hm, Math.max(2, x - 12), H - 4); }
  });
  for (const l of ch.levels) {                                          // the levels each bot watches + the armed / open trade lines
    const yy = Math.round(y(l.price)) + 0.5, col = l.kind === 'stop' ? '#ff6b8a' : l.kind === 'target' ? '#77db89' : l.color;
    ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = l.kind === 'level' ? 0.7 : 1; ctx.lineWidth = l.kind === 'level' ? 1 : 1.6;
    ctx.setLineDash(l.kind === 'level' ? [4, 4] : l.kind === 'cisd' ? [8, 3] : []); ctx.shadowColor = col; ctx.shadowBlur = l.kind === 'level' ? 0 : 6;
    ctx.beginPath(); ctx.moveTo(4, yy); ctx.lineTo(W - R, yy); ctx.stroke(); ctx.restore();
    ctx.fillStyle = col; const lab = l.label.length > 26 ? l.label.slice(0, 25) + '…' : l.label; ctx.fillText(lab, 8, yy - 3);
  }
  const ly = y(ch.last);                                                // the last price tag
  ctx.fillStyle = '#f1c14b'; ctx.fillRect(W - R, ly - 8, R - 2, 16); ctx.fillStyle = '#000'; ctx.font = 'bold 10px -apple-system, Segoe UI, Roboto, sans-serif'; ctx.fillText(C.px(ch.last), W - R + 3, ly + 3.5);
  cv.setAttribute('aria-label', `${ch.text} Last price ${C.px(ch.last)}. ${ch.levels.length} levels and trade lines drawn.`);
}

// ------------------------------------------------------------------------------------------------ the story, typed
function drawFeed(M) {
  const ol = $('feed'), top = M.feed[0], key = top ? `${top.t}|${top.text}` : '';
  clear(ol);
  if (!M.feed.length) { ol.append(h('li', '', 'No story yet: the PC has not reported today.')); return; }
  M.feed.forEach((f, i) => {
    const li = h('li', f.kind + (i === 0 && key !== S.typed ? ' fresh' : '')); li.style.setProperty('--c', f.color);
    const tx = h('span', 'tx', i === 0 && key !== S.typed && !LOW ? '' : f.text);
    li.append(h('span', 'hm', f.hm), tx); ol.append(li);
    if (i === 0 && key !== S.typed && !LOW) type(tx, f.text);
  });
  S.typed = key;
}
let typing = null;
function type(el, text) {
  if (typing) clearInterval(typing);
  let i = 0; el.classList.add('caret');
  const step = Math.max(1, Math.round(text.length / 90));
  typing = setInterval(() => { i = Math.min(text.length, i + step); el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing); typing = null; setTimeout(() => el.classList.remove('caret'), 1600); } }, 18);
}

// ------------------------------------------------------------------------------------------------ the optional milestone alerts (this phone, page open)
function pushOn() { return store.get('oly.wr.push', false) === true; }
function drawPush() {
  const b = $('pushBtn'), on = pushOn(); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'On' : 'Off';
}
function alerts(M) {
  const day = C.etNow(nowS()).day, seen = store.get('oly.wr.seen', { day, keys: [] }), keys = seen.day === day ? seen.keys : [];
  const fresh = M.milestones.filter((m) => !keys.includes(m.key));
  if (fresh.length && pushOn() && S.polls > 1 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    for (const m of fresh.slice(0, 3)) { try { new Notification('War Room', { body: m.text, tag: m.key }); } catch (_) { /* iOS: only from the Home Screen app */ } }
  }
  store.set('oly.wr.seen', { day, keys: keys.concat(fresh.map((m) => m.key)).slice(-60) });
}
$('pushBtn').addEventListener('click', async () => {
  const on = !pushOn(); store.set('oly.wr.push', on);
  if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (_) { /* no prompt */ } }
  drawPush();
  if (on && (typeof Notification === 'undefined' || Notification.permission === 'denied')) $('pushText').textContent = 'This browser cannot show alerts here. On iPhone: add the War Room to the Home Screen first (Share, Add to Home Screen), then turn this on there.';
});

// ------------------------------------------------------------------------------------------------ the clock: countdowns and time in trade, every second
setInterval(() => {
  if (document.hidden) return;
  const t = nowS();
  for (const e of document.querySelectorAll('.cd[data-until]')) e.textContent = C.clock(+e.dataset.until - t);
  for (const e of document.querySelectorAll('.cd[data-since]')) e.textContent = C.clock(t - +e.dataset.since);
}, 1000);

async function cycle(first) {
  if (!first && document.hidden) return;
  if (first || S.polls % 2 === 0) await Promise.all([pollCore(), pollBars()]); else await pollCore();
  S.polls += 1; render();
}
(async () => {
  drawPush();
  await loadSite();
  render();                                  // the site's own files at once (steps say "waiting" until the PC's post lands)
  await cycle(true);
  setInterval(() => cycle(false), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cycle(false); });
})();

window.WARROOM = { ready: () => S.ready && S.polls > 0, model: () => S.model, low: LOW };
