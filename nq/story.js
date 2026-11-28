// TODAY'S STORY (day-nqports 2026-11-27): the session as a timeline of key moments, each with a mini chart. One module for the nq/ card
// (#storyCard: today, the latest moments, the day chips, a link to the full page), the full page nq/story.html (#storyPage) and the hero's
// one line (nq/ [data-hx="story"]). The model is storycore.js. textContent / createElement(NS) only; reads published files + the PC's posts.
//   today      nq/: the page's own state (window.NQ_HOME: the chart bars, the PC post's glog + trades; never a 2nd feed read)
//              story.html: the PC's status post (../pc_feed.js PC_FEED.fetchLatest) + the chart topic (nqbars.js, signed posts kept)
//   past days  nq/replay/index.json + nq/replay/<day>.json (the PC's bars + the bots' replay twin), the last 5 stored;
//              nq/thoughts/<day>.json (the PC's own day thought log, engine/thoughtlog.py -> tools/nq_thoughts.py) when published
//   context    nq/ports.json (the normal Asia range, the prior day's levels, today's CME half day)
import * as SC from './storycore.js?v=3';
import { feedUrls, parse as parseBars, parseVerified, unpack } from './nqbars.js?v=b2';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
const NS = 'http://www.w3.org/2000/svg';
const get = (u, ms) => { const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 10000) : 0;
  return fetch(u, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }).then((r) => (r.ok ? r.json() : null)).catch(() => null).finally(() => clearTimeout(tm)); };
const PAGE = !!$('storyPage'), S = { ports: null, index: null, thIndex: null, replay: {}, pick: 'today', live: null, home: window.NQ_HOME || null, post: null, bars: null };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayName = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

async function replayDay(day) { if (!(day in S.replay)) S.replay[day] = await get(`./replay/${day}.json`); return S.replay[day]; }
function pastDays() { return (isObj(S.index) && Array.isArray(S.index.days) ? S.index.days : []).map((d) => d && d.day).filter((d) => /^\d{4}-\d\d-\d\d$/.test(String(d))); }
function hiLo(bars) { let hi = -Infinity, lo = Infinity; for (const b of bars || []) { hi = Math.max(hi, +b[2]); lo = Math.min(lo, +b[3]); } return Number.isFinite(hi) ? { pdh: hi, pdl: lo } : null; }
function liveParts() {
  const H = S.home, lite = (H && H.lite) || S.post || null, home = (H && H.home) || null;
  const bars = (H && Array.isArray(H.bars) && H.bars) || S.bars || [];
  const trades = (home && isObj(home.board) && home.board.trades) || (lite && isObj(lite.board) && lite.board.trades) || [];
  return { bars, glog: lite && isObj(lite.glog) ? lite.glog : null, trades, demo: !!(H && H.demo) };
}
async function storyFor(day) {
  const nowS = Date.now() / 1000, P = isObj(S.ports) ? S.ports : {}, normalAsia = isObj(P.normal) ? P.normal.asia : null, days = pastDays();
  if (day === 'today') {
    const L = liveParts(), today = SC.tradeDay(nowS), lv = isObj(P.sweeps) && isObj(P.sweeps.levels) ? P.sweeps.levels : null;
    let prior = null;
    const prevD = days.find((d) => d < today);
    if (lv && prevD && lv.day === prevD) prior = { pdh: lv.pdh, pdl: lv.pdl };
    else if (prevD) { const R = await replayDay(prevD); prior = R ? hiLo(R.bars) : null; }
    const half = (isObj(P.cal) && Array.isArray(P.cal.events) ? P.cal.events : []).find((e) => isObj(e) && e.day === today && e.kind === 'half');
    const st = SC.build({ day: today, live: true, nowS, bars: L.bars, prior, normalAsia, glog: L.glog, trades: L.trades, halt: half ? half.t : null });
    if (L.demo) st.moments = st.moments.map((m) => (m.tag === 'REAL' ? { ...m, tag: 'DEMO', text: m.text.replace('A real fill on the PC.', 'An example fill (DEMO).') } : m));
    return { ...st, demo: L.demo };
  }
  const R = await replayDay(day), i = days.indexOf(day), prevD = i >= 0 ? days[i + 1] : null, Rp = prevD ? await replayDay(prevD) : null;
  const T = isObj(S.thIndex) && Array.isArray(S.thIndex.days) && S.thIndex.days.some((x) => x && x.day === day) ? await get(`./thoughts/${day}.json`) : null;
  return SC.build({ day, live: false, nowS, bars: R ? R.bars : [], prior: Rp ? hiLo(Rp.bars) : null, normalAsia, twin: R ? R.events : [], thoughts: T && Array.isArray(T.rows) ? T.rows : null, trades: liveParts().trades });
}

function mini(bars, m) {
  const sp = SC.snap(bars, m.t, m.level); if (!sp) return null;
  const W = 140, H = 40, s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'st-mini'); s.setAttribute('aria-hidden', 'true');
  const ln = (x1, y1, x2, y2, cls) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); l.setAttribute('class', cls); s.appendChild(l); };
  if (sp.lvl !== null) ln(0, (2 + sp.lvl * (H - 4)).toFixed(1), W, (2 + sp.lvl * (H - 4)).toFixed(1), 'st-lvl');
  ln((sp.mark * W).toFixed(1), 0, (sp.mark * W).toFixed(1), H, 'st-at');
  const p = document.createElementNS(NS, 'polyline'); p.setAttribute('points', sp.pts.map(([x, y]) => `${(x * W).toFixed(1)},${(2 + y * (H - 4)).toFixed(1)}`).join(' ')); p.setAttribute('class', 'st-px'); s.appendChild(p);
  return s;
}
function chips(box, onPick) {
  const row = el('div', 'st-days'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Pick a day');
  for (const d of ['today', ...pastDays().filter((x) => x < SC.tradeDay(Date.now() / 1000)).slice(0, 5)]) {
    const b = el('button', 'st-day', d === 'today' ? 'Today' : dayName(d)); b.type = 'button'; b.setAttribute('aria-pressed', S.pick === d ? 'true' : 'false');
    b.addEventListener('click', () => { S.pick = d; onPick(); }); row.appendChild(b);
  }
  box.appendChild(row);
}
function timeline(box, st, max) {
  const all = st.moments, list = max ? all.slice(-max) : all;
  if (st.note) box.appendChild(el('p', 'st-note', st.note));
  if (st.demo) box.appendChild(el('p', 'st-note', 'DEMO: example bars, not today\'s market.'));
  if (!list.length) { box.appendChild(el('p', 'st-empty', st.live ? 'Nothing has happened yet that is worth a line. The story fills in as the session runs.' : 'Nothing stored for this day.')); }
  else {
    if (max && all.length > list.length) box.appendChild(el('p', 'st-more', `${all.length - list.length} earlier moment${all.length - list.length === 1 ? '' : 's'} on the full page.`));
    const ol = el('ol', 'st-tl');
    for (const m of list) {
      const li = el('li', `st-m tone-${m.tone || 'calm'}${m.future ? ' later' : ''}`);
      const tm = el('div', 'st-when'); tm.appendChild(el('b', 'ag-num', m.hm)); tm.appendChild(el('span', 'st-emo', m.emoji)); li.appendChild(tm);
      const body = el('div', 'st-body'); const h = el('div', 'st-h'); h.appendChild(el('b', '', m.title)); if (m.tag) h.appendChild(el('span', 'st-tag ' + m.tag.toLowerCase(), m.tag)); if (m.future) h.appendChild(el('span', 'st-tag', 'LATER'));
      body.appendChild(h); body.appendChild(el('p', '', m.text));
      const g = mini(st.bars, m); if (g) body.appendChild(g);
      li.appendChild(body); ol.appendChild(li);
    }
    box.appendChild(ol);
  }
  if (st.waiting) { const w = el('div', 'st-wait'); w.appendChild(el('b', '', st.live ? 'What LIT is waiting for now' : 'What LIT was working on last')); w.appendChild(el('p', '', st.waiting)); box.appendChild(w); }
}
async function draw() {
  const box = PAGE ? $('storyPage') : $('storyCard'); if (!box) return;
  const st = await storyFor(S.pick);
  if (S.pick === 'today') S.live = st;
  clear(box); box.hidden = false;
  const hd = el('div', 'st-head'); const h2 = el('h2', 'st-title', PAGE ? 'The story of the session' : "Today's story"); h2.id = PAGE ? 'storyPageH' : 'storyH'; hd.appendChild(h2);
  hd.appendChild(el('span', 'pill ' + (st.moments.length ? 'ok' : 'warn'), S.pick === 'today' ? `${dayName(st.day)} · live` : dayName(st.day)));
  box.appendChild(hd);
  chips(box, draw);
  timeline(box, st, PAGE ? 0 : 7);
  if (!PAGE) { const a = el('a', 'btn st-open', 'Open the full story ›'); a.href = `story.html${S.pick === 'today' ? '' : '?day=' + S.pick}`; box.appendChild(a); }
  hero();
}
function hero() {                       // nq/ only: the one line under the hero's money
  const slot = document.querySelector('#hero [data-hx="story"]'); if (!slot || !S.live) return;
  const t = SC.storyLine(S.live); slot.textContent = t; slot.hidden = !t;
}
async function pagePost() {             // story.html: the PC's post + the chart topic (nq/ uses the page's own state instead)
  try { const F = window.PC_FEED; if (F && F.fetchLatest) S.post = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 12000))]); } catch (_) { S.post = null; }
  try {
    const feed = await get('../status_feed.json'), urls = feedUrls(feed);
    for (const u of urls) {
      const txt = await fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
      const post = feed && feed.vk ? await parseVerified(txt, feed, Date.now() / 1000) : parseBars(txt, Date.now() / 1000);
      if (post) { S.bars = unpack(post); break; }
    }
  } catch (_) { S.bars = null; }
}
addEventListener('nq-home', (e) => { S.home = e.detail || S.home; if (S.pick === 'today') draw(); else storyFor('today').then((st) => { S.live = st; hero(); }); });
(async () => {
  const q = new URLSearchParams(location.search).get('day');
  [S.ports, S.index, S.thIndex] = await Promise.all([get('./ports.json'), get('./replay/index.json'), get('./thoughts/index.json')]);
  if (q && /^\d{4}-\d\d-\d\d$/.test(q) && pastDays().includes(q)) S.pick = q;
  if (PAGE) await pagePost();
  S.home = window.NQ_HOME || S.home;
  await draw();
  try { const O = window.OLYMPUS; if (PAGE && O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  if (S.pick !== 'today') { S.live = await storyFor('today'); hero(); }
  setInterval(() => { if (S.pick === 'today') draw(); }, 120000);
})();
