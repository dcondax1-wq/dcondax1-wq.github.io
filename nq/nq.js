// NQ page (ES module): "the NQ bots, right now". One page built for trust: per bot the status with the exact age of its last report, drawdown left, the day's P&L in $ with R,
// the eval progress, the last 10 trades with the rule that closed each, the plan in one sentence, the backtest facts with their dates, and an honest banner when the PC is silent.
// Reads ../home.json (the small first-paint file; never the 8 MB data.json), ./howto.json (docs/NQ_BOT_BACK.md, bundled by tools/nq_howto_build.py) and ./fixture.json (DEMO, never blank).
// Read only: it sends nothing and keeps nothing. Text only through textContent / createElementNS. The 3D columns come from nqscene.js (optional). window.NQ is the test hook.
// ?demo=1 the example; ?demo=1&silent=4d (or 90m, 5h) the example with a silent PC; ?flat=1 the 2D columns; ?howto=1 opens the sheet.
import * as C from './nqcore.js?v=d6';   // d6 (night-seedata): today's $ in the first line; d1 (polish2 2026-11-19): the CME trading day
import * as T from '../olympus/truth.js';
import * as D from './nqdesk.js?v=15';
import * as GM from './goals_model.js?v=1';             // night-nq-main: ONE goals model (QA #4)
import { unpack as unpackBars } from './nqbars.js?v=b2';     // nqdash3: the accounts strip, the bots' thinking, the quality checks
import * as G from './nqgoals.js?v=10';
import * as K7 from './clock7.js?v=3';                          // day-nqops: the MFFU 7-day clock card + window.NQ_K7 for Jarvis                       // v4: the goals strip, the numbers card, the bursts

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, home: null, howto: null, demo: false, forced: false, silent: 0, view: null, scene: '2d', ready: false, sheet: false, last: null };

async function getJSON(url, ms) {
  const E = window.NQ_EARLY && window.NQ_EARLY.json;  // perf: the page head started it already (index.html); used once
  if (E && E[url]) { const p = E[url]; delete E[url]; try { return await p; } catch (_) { return null; } }
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// the PC's own status post (ntfy, every 15 min: ../pc_feed.js, night-feedsB 2026-11-18) laid over home.json, the cloud's copy (its board is
// the cloud's paper twin on old bars: "$1,900 left", "ATLAS not set up"). No short race: the post can take a few seconds; the page shows the
// cloud's copy with its date meanwhile. Funded accounts get the payout coach's line (../business/payoutcoach.js), the ZEUS card's words.
// Both files come from index.html (plain tags before the OLYMPUS kit): no dynamic import on this page.
async function withPost(home) {
  if (!home || S.forced) return home;
  try {
    const F = window.PC_FEED;                     // index.html loads ../pc_feed.js and ../business/payoutcoach.js before the kit
    if (!F || !F.fetchLatest || !F.homeOver) return home;
    const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
    if (!lite) return home;
    S.lite = lite;                                // v4: the funded tracker (mf) for the goals
    return F.homeOver(home, lite, Date.now() / 1000, window.PAYOUT_COACH || null);
  } catch (_) { return home; }
}
// where the numbers come from, with their age or date: the PC's report, or the cloud's copy said to be one
function srcLine() {
  if (S.demo) return S.forced ? 'Example numbers (?demo=1): open the page without it for the live bots.' : 'Example numbers (fixture.json): the site has no home.json yet.';
  const pf = S.home && S.home.pc_feed, rt = pf && (pf.report_t || pf.t);
  if (rt) return `Source: your PC's status report, ${C.ageText(Math.max(0, Date.now() / 1000 - rt))} (the ZEUS card reads the same report).`;
  const b = S.home && S.home.built ? new Date(S.home.built) : null, when = b && !isNaN(b) ? b.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '';
  // the cloud's own cards are its paper twin (nqcore hides them): say so, never "these numbers may be old" over numbers that were never the account
  return `Source: the cloud's copy of the site (home.json${when ? ', built ' + when : ''}). Your PC's own report has not arrived on this page yet${C.cloudCopy(S.home) ? ": the cloud's copy only has its paper test, so no account numbers are shown. They appear the moment the report arrives." : ', so these numbers may be old.'}`;
}

/** the fixture keeps ages, not dates: every "..._ago_min" becomes a real time counted back from now, so the example is always "a few minutes ago" */
function demoHome(fx, nowMs, silentS) {
  const f = JSON.parse(JSON.stringify((fx && fx.home) || {})), now = Math.floor(nowMs / 1000) - (silentS || 0);
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'number' && k.slice(-8) === '_ago_min') { o[k.slice(0, -8)] = now - Math.round(v * 60); delete o[k]; } else walk(v);
    }
  };
  walk(f); return f;
}
function parseSilent(v) { const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(String(v || '')); return m ? Math.round(parseFloat(m[1]) * { m: 60, h: 3600, d: 86400 }[m[2]]) : 0; }

function model() {
  const now = Date.now(), real = !S.forced && C.hasData(S.home);
  S.demo = !real;
  // the account numbers go through the shared truth (olympus/truth.js), so NQ, Home, Aegis and Helios show the same drawdown left
  const canon = real ? T.canonHome(S.home, now / 1000) : null; S.ages = canon ? canon.truth.ages : null;
  S.view = C.build(real ? canon : demoHome(S.fixture, now, S.silent), now);
}

// ------------------------------------------------------------------------------------------------ the banner
function renderBanner() {
  const b = S.view.banner, box = $('banner');
  box.hidden = !b; if (!b) return;
  box.dataset.level = b.level; $('bannerTitle').textContent = b.title; $('bannerText').textContent = b.text;
}

// ------------------------------------------------------------------------------------------------ the three columns
function renderFallback() {
  const svg = $('fallback'); clear(svg);
  const cols = S.view.columns, W = 360, base = 132, w = 46, gap = (W - cols.length * w) / (cols.length + 1);
  svg.appendChild(sv('rect', { x: 14, y: base, width: W - 28, height: 9, rx: 3, fill: '#cfc4b2' }));
  svg.appendChild(sv('rect', { x: 26, y: base + 9, width: W - 52, height: 7, rx: 3, fill: '#9a8f7d' }));
  cols.forEach((c, i) => {
    const x = gap + i * (w + gap), lit = c.lit, mid = x + w / 2;
    svg.appendChild(sv('rect', { x: x + 6, y: 46, width: w - 12, height: base - 46, fill: lit ? '#f3e2b8' : '#d8cfbd', rx: 2 }));
    for (const dx of [14, 23, 32]) svg.appendChild(sv('rect', { x: x + dx - 1, y: 46, width: 1.6, height: base - 46, fill: '#a99f8d', opacity: 0.5 }));
    svg.appendChild(sv('rect', { x, y: 36, width: w, height: 10, rx: 2, fill: lit ? '#9d59ee' : '#4a4458' }));
    svg.appendChild(sv('path', { d: `M${mid - 11} 36c2-6 20-6 22 0z`, fill: '#9c6b3c' }));
    if (lit) { const f = sv('path', { d: `M${mid} 6c-8 8 0 12-5 22h10c-3-8 3-11-5-22z`, fill: '#f1c14b', class: 'flame' }); f.dataset.key = c.key; svg.appendChild(f); }
  });
}
function renderScene() {
  renderFallback();
  const v = S.view, lit = v.columns.filter((c) => c.lit).map((c) => c.label), row = $('legend'); clear(row);
  for (const b of v.bots) {
    const d = h('div', 'leg'); d.dataset.key = b.key; d.dataset.lit = b.status.flame ? '1' : '0';
    d.appendChild(h('b', '', b.name)); d.appendChild(h('span', 'pill ' + (b.status.level === 'off' ? '' : b.status.level), b.status.label)); row.appendChild(d);
  }
  const text = lit.length ? `A flame burns for ${lit.join(', ')}: reported in the last 20 minutes.` : 'No flame burns: no bot has reported in the last 20 minutes.';
  $('scene').setAttribute('aria-label', 'Three marble columns, one per bot. ' + text); $('sceneNote').textContent = text;
  if (S.scene === 'webgl' && window.NQ3D) try { window.NQ3D.update(v.columns); } catch (_) { /* keep the picture */ }
}

// ------------------------------------------------------------------------------------------------ the bots
function bar(frac, level, label) {
  const b = h('div', 'ag-bar meter'); b.setAttribute('role', 'img'); b.setAttribute('aria-label', label);
  const i = h('i', level || ''); i.style.width = `${Math.round(Math.max(0, Math.min(1, frac || 0)) * 100)}%`; b.appendChild(i); return b;
}
function renderBots() {
  const box = $('bots'); clear(box);
  for (const b of S.view.bots) {
    const a = h('article', 'ag-card card bot'); a.dataset.key = b.key; a.dataset.level = b.status.level;
    const top = h('div', 'row'); const t = h('h3', '', `${b.name} `); t.appendChild(h('small', '', b.tag || (b.key === 'lit' ? `LIT ${b.size}` : b.size))); top.appendChild(t);
    top.appendChild(h('span', 'pill ' + (b.status.level === 'off' ? '' : b.status.level), b.status.label)); a.appendChild(top);
    a.appendChild(h('p', 'note when', `${b.status.line} ${b.paper ? 'Paper only.' : ''}`.trim()));
    if (!b.has) { a.appendChild(h('p', 'lead', 'No numbers from this bot yet. They appear here the moment the PC reports it.')); box.appendChild(a); continue; }
    if (b.room != null) {                                   // the same sentence, laid out as a hero number: label, the big $ left, then 'of $max max loss'
      const dd = h('p', 'dd'); dd.appendChild(h('span', 'ddl', 'Drawdown left ')); dd.appendChild(h('b', 'ddv ag-num', C.money(b.room)));
      dd.appendChild(h('span', 'ddo', ` of ${C.money(b.mll)} max loss`)); a.appendChild(dd);
    } else a.appendChild(h('p', 'dd ag-num', b.ddLine));
    if (b.roomFrac != null) a.appendChild(bar(b.roomFrac, b.roomFrac < 0.25 ? 'bad' : b.roomFrac < 0.5 ? 'warn' : 'ok', `${Math.round(b.roomFrac * 100)} percent of the max loss is left`));
    const kv = h('dl', 'kv');
    kv.appendChild(h('dt', '', b.dayLabel)); kv.appendChild(h('dd', b.today > 0.5 ? 'pos' : b.today < -0.5 ? 'neg' : '', b.todayText));
    kv.appendChild(h('dt', '', b.funded ? 'Payout progress' : 'Eval progress')); kv.appendChild(h('dd', 'soft', b.progLine));   // a funded account has no eval to pass: its payout line (phone QA 2026-11-19)
    a.appendChild(kv);
    a.appendChild(bar(b.progress, 'gold', `${Math.round(b.progress * 100)} percent of the way to ${b.funded ? 'a payout' : 'the target'}`));
    // what it is waiting for (night-nqdash2): always shown, with whose word it is and how old; a silent PC's line is called old
    if (b.waiting) { const w = h('p', 'note wait'); w.appendChild(h('b', '', b.status.flame ? (b.paper ? 'Waiting for (PAPER): ' : 'Waiting for (LIVE): ') : `Last said (${b.status.ageText || 'old'}): `)); w.appendChild(document.createTextNode(b.waiting)); a.appendChild(w); }
    const K = window.NQ_DEEP, fl = K && S.learned ? K.core.fillLine(S.learned, b.bot || b.key) : null;
    if (fl && fl.line) a.appendChild(h('p', 'note fills', `${fl.line} (LIVE fills, ZEUS nightly)`));
    box.appendChild(a);
  }
}

// ------------------------------------------------------------------------------------------------ the news week (../nqdeep.js, ./news_week.json)
function renderNews() {
  const K = window.NQ_DEEP, box = $('newsWeek'); if (!K || !box) return;
  const nowS = Math.floor(Date.now() / 1000), et = C.etParts ? C.etParts(nowS) : null;
  const day = et && et.day ? et.day : new Date().toISOString().slice(0, 10), hm = et && et.hm ? et.hm : '';
  const N = K.core.weekNews(S.news, day, hm);
  K.draw.news(box, N);
  $('newsSrc').textContent = S.news && S.news.built ? `The bot's calendar, copied ${K.core.shortDay(S.news.built)}` : 'No calendar in this build';
}

// ------------------------------------------------------------------------------------------------ plan, trades, facts
// QA #8: the PC's own entry window (board.lit.window.text, e.g. "next entry window Fri 02:00-13:00 ET") on a short CME day: the window ends
// before 15:30, so "flat by 15:55" would be wrong that day (engine/cme_calendar: entries stop 15 min and the bot is flat 5 min before a halt)
export function shortDay(text) {
  const m = /(?:\b(Mon|Tue|Wed|Thu|Fri|Sun|Sat)\w*\s+)?(\d\d):(\d\d)\s*[-\u2013]\s*(\d\d):(\d\d)/.exec(String(text || ''));
  if (!m) return null;
  const end = +m[4] * 60 + +m[5];
  return end < 930 ? { day: m[1] || '', end: `${m[4]}:${m[5]}` } : null;
}
/** today's early halt from the brief (engine/cme_calendar rule: entries stop 15 min, flat 5 min before it); null on a normal day / an old brief */
export function haltClose(brief, nowS) {
  try {
    const e = brief && typeof brief.early_close === 'string' ? /^(\d\d):(\d\d)$/.exec(brief.early_close) : null;
    if (!e || String(brief.day || '') !== D.etParts(nowS).day) return null;
    const m = +e[1] * 60 + +e[2], hm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    return m < 960 ? { halt: hm(m), entry: hm(m - 15), flat: hm(m - 5) } : null;
  } catch (_) { return null; }
}
// weight pass: plan.js (the battle plan + alert history) is code-split: added when its card nears the screen or the browser is idle,
// never in the first paint's way (it reads window.NQ_HOME at start, then the 'nq-home' events)
function loadPlan() {
  if (S.planAsked) return; S.planAsked = true;
  const go = () => { if (S.planIn) return; S.planIn = true; const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./plan.js?v=4', import.meta.url).href; document.head.appendChild(t); };
  const card = $('battle');
  if (card && 'IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '600px 0px' }); io.observe(card); }
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(go, { timeout: 4000 });
}
// the December card (december.js + decore.js): code-split like plan.js, added near its card or when idle
function loadDec() {
  if (S.decAsked) return; S.decAsked = true;
  const go = () => { if (S.decIn) return; S.decIn = true; const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./december.js?v=1', import.meta.url).href; document.head.appendChild(t); };
  const card = $('decCard');
  if (card && 'IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '600px 0px' }); io.observe(card); }
  (window.requestIdleCallback || ((f) => setTimeout(f, 2000)))(go, { timeout: 5000 });
}
// BRIEF ME (briefme.js + briefcore.js, lazy: idle or the first tap) and SUNLIGHT MODE (sun.css, html.sun; the head script applies it before paint)
function loadBrief() {
  if (S.briefIn) return; S.briefIn = true;
  const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./briefme.js?v=1', import.meta.url).href; document.head.appendChild(t);
}
function briefTap() {
  if (window.NQ_BRIEF) { window.NQ_BRIEF.toggle(); return; }
  try { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (_) { /* iOS: unlock speech inside the tap */ }
  window.NQ_BRIEF_ASK = true; loadBrief();
}
function sunSet(onOff, store) {
  const d = document.documentElement, l = document.getElementById('sunCss');
  d.classList.toggle('sun', !!onOff);
  if (l && onOff) l.media = 'all';
  if (store) { try { localStorage.setItem('nq.sun', onOff ? '1' : '0'); } catch (_) { /* private mode: this visit only */ } }
  const b = $('hxSun'); if (b) { b.setAttribute('aria-pressed', onOff ? 'true' : 'false'); const t = b.querySelector('.hx-tl'); if (t) t.textContent = onOff ? 'Sunlight on' : 'Sunlight'; }
}
// HOW TO READ THIS PAGE (tour.js): first visit only (localStorage 'nq.tour' unset) or ?tour=1; added when the browser is idle
function loadTour() {
  let seen = false; try { seen = !!localStorage.getItem('nq.tour'); } catch (_) { seen = false; }
  const force = /[?&]tour=1\b/.test(location.search);
  if ((seen || navigator.webdriver) && !force) return;   // an automated browser (the test suites) is not the owner: ?tour=1 only
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => { const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./tour.js?v=2', import.meta.url).href; document.head.appendChild(t); }, { timeout: 4000 });
}
function toolsInit() {
  const b = $('hxBrief'), s = $('hxSun');
  if (b) {
    b.addEventListener('click', briefTap);
    if (!('speechSynthesis' in window)) { const t = b.querySelector('.hx-tl'); if (t) t.textContent = 'Show brief'; b.title = 'This browser has no voice: the brief shows as text'; }
    (window.requestIdleCallback || ((f) => setTimeout(f, 2500)))(loadBrief, { timeout: 6000 });
  }
  loadTour();
  if (s) { sunSet(document.documentElement.classList.contains('sun'), false); s.addEventListener('click', () => sunSet(!document.documentElement.classList.contains('sun'), true)); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', toolsInit); else toolsInit();
// QA #5: a jump-bar link (or any #hash) into a folded section opens the fold first
function openFoldFor(hash) {
  try { const t = hash && document.getElementById(hash.slice(1)); const f = t && (t.matches('details') ? t : t.closest('details')); if (f && !f.open) f.open = true; } catch (_) { /* nothing */ }
}
addEventListener('click', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href^="#"]'); if (a) openFoldFor(a.getAttribute('href')); });
addEventListener('hashchange', () => openFoldFor(location.hash));
function renderPlan() {
  const p = S.view.plan, w = (() => { try { const h0 = deskHome(); return h0 && h0.board && h0.board.lit && h0.board.lit.window ? h0.board.lit.window.text : ''; } catch (_) { return ''; } })();
  const sd = shortDay(w), hc = haltClose(S.brief, Date.now() / 1000);
  // QA #8: ONE sentence from the day's real close (the brief's early_close today, else the PC's window text): never "flat by 15:55" next to a 13:15 halt
  $('planRule').textContent = hc ? `Today is a short CME day: the CME halts at ${hc.halt} ET, so LIT's one trade can start until ${hc.entry} ET and it is flat by ${hc.flat} ET.`
    : sd ? `${sd.day ? sd.day + ' is' : 'Today is'} a short CME day: LIT's window ends at ${sd.end} ET and it is flat 5 minutes before the early halt.` : p.rule; $('planNow').textContent = p.now; $('planNow').hidden = !p.now; $('planNote').textContent = p.note; $('planNote').hidden = !p.note;
}
function renderTrades() {
  const ol = $('trades'); clear(ol); const rows = S.view.trades;
  $('tradesNote').textContent = rows.length ? `The newest first. ${S.view.pc.code === 'running' ? '' : 'Trades made since the last report are not here yet.'}`.trim() : 'No trade in the last report. Quiet days are normal: the plan is 2 to 4 trades a week.';
  for (const t of rows) {
    const li = h('li', 'trade'); li.dataset.key = t.key;
    const l = h('div', 'tl'); l.appendChild(h('b', '', `${t.name}${t.member ? ' ' + t.member : ''}`)); l.appendChild(h('span', 'note', `${t.dayLabel}${t.side ? ', ' + t.side : ''}, ${t.src}`)); li.appendChild(l);
    const r = h('div', 'tr'); r.appendChild(h('b', 'ag-num ' + t.sign, t.text)); r.appendChild(h('span', 'note rule', t.rule)); li.appendChild(r);
    ol.appendChild(li);
  }
}
function renderFacts() {
  const box = $('facts'); clear(box);
  S.view.facts.forEach((f, i) => {
    const d = h('div', 'fact' + (i === 0 ? ' main' : '')); d.dataset.id = f.id;
    d.appendChild(h('p', 'ag-eyebrow', f.title)); d.appendChild(h('p', 'fline ag-num', f.line));
    d.appendChild(h('p', 'note', `${f.dates}, ${f.trades} trades, costs in. ${f.why}`)); box.appendChild(d);
  });
}

// ------------------------------------------------------------------------------------------------ the how-to sheet
function renderSheet() {
  const hw = C.howto(S.howto), body = $('sheetBody'); clear(body);
  if (!hw) { body.appendChild(h('p', 'lead', 'The steps are in docs/NQ_BOT_BACK.md in the bot folder. This page could not load its copy.')); return; }
  $('sheetH').textContent = `${hw.title} (${hw.steps.length} steps)`;
  if (hw.intro) body.appendChild(h('p', 'lead', hw.intro));
  const ol = h('ol', 'steps');
  for (const s of hw.steps) {
    const li = h('li'); li.appendChild(h('b', '', s.title)); if (s.text) li.appendChild(h('p', '', s.text));
    if (s.code) { const c = h('code', 'cmd', s.code); c.setAttribute('aria-label', 'The line to copy: ' + s.code); li.appendChild(c); }
    ol.appendChild(li);
  }
  body.appendChild(ol);
  if (hw.undo) body.appendChild(h('p', 'note', hw.undo));
  if (hw.limits.length) { body.appendChild(h('p', 'ag-eyebrow', 'Honest limits')); const ul = h('ul', 'plain'); for (const l of hw.limits) ul.appendChild(h('li', '', l)); body.appendChild(ul); }
}
function openSheet(from) {
  S.sheet = true; S.last = from || document.activeElement; renderSheet();
  $('sheet').hidden = false; $('veil').hidden = false; document.documentElement.classList.add('sheet-open');
  for (const b of document.querySelectorAll('[data-howto]')) b.setAttribute('aria-expanded', 'true');
  try { $('sheetClose').focus(); } catch (_) { /* nothing */ }
  say('The five steps are open.');
}
function closeSheet() {
  if (!S.sheet) return;
  S.sheet = false; $('sheet').hidden = true; $('veil').hidden = true; document.documentElement.classList.remove('sheet-open');
  for (const b of document.querySelectorAll('[data-howto]')) b.setAttribute('aria-expanded', 'false');
  try { if (S.last && S.last.focus) S.last.focus(); } catch (_) { /* nothing */ }
}

// ------------------------------------------------------------------------------------------------ nqdash3: accounts, thinking, quality (nqdesk.js)
// the PC's chart post (the live chart module keeps it in window.NQCHART.S.post): its open trades with the stop as it is now and the last bar's close
function chartOf(post) {
  try {
    if (!post || typeof post !== 'object') return null;
    const b = unpackBars(post), last = b.length ? b[b.length - 1][4] : null;
    return { opens: Array.isArray(post.open) ? post.open : [], last, t: +post.t || (b.length ? b[b.length - 1][0] + 300 : null) };
  } catch (_) { return null; }
}
function deskChart() { if (S.demo) return S.fixture && S.fixture.chart ? chartOf(demoHome({ home: S.fixture.chart }, Date.now(), S.silent)) : null; const C2 = window.NQCHART; return C2 && C2.S ? chartOf(C2.S.post) : null; }
// Chronos: the past days list needs ../odeon/trades.json (~0.5 MB): fetched once, only when its card is about to show (no layout jump: the card keeps its height)
function watchPast() {
  if (S.pastWatch) return; S.pastWatch = true;
  const card = $('pastCard'); if (!card) return;
  const go = async () => {
    const box = $('pastDays'); if (!box) return;
    const od = await getJSON('../odeon/trades.json', 12000);
    try { D.draw.past(box, D.pastDays(od)); } catch (_) { /* nothing */ }
    card.classList.remove('dk-lazy');
  };
  let once = false; const run = () => { if (once) return; once = true; go(); };
  const fold = card.closest('details');                 // QA #6: folded in "Checks": load when the fold opens (a closed fold never intersects)
  if (fold) { if (fold.open) run(); else fold.addEventListener('toggle', () => { if (fold.open) run(); }); return; }
  if (!('IntersectionObserver' in window)) { run(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '400px 0px' });
  io.observe(card);
}
// the hero scene's ribbon: today's (the CME day's, from 18:00 ET) 5-minute closes in the PC's chart post; the DEMO's fixture chart; else none
function heroBars() {
  try {
    const post = S.demo ? (S.fixture && S.fixture.chart ? demoHome({ home: S.fixture.chart }, Date.now(), S.silent) : null) : (window.NQCHART && window.NQCHART.S ? window.NQCHART.S.post : null);
    if (!post) return null;
    if (S.heroKey === post) return S.heroB;
    const b = unpackBars(post); if (!b.length) return null;
    const last = b[b.length - 1][0], p = D.etParts(last), m = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3);
    const t0 = last - ((m - 1080 + 1440) % 1440) * 60;                  // 18:00 ET before the last bar
    S.heroKey = post; S.heroB = b.filter((x) => x[0] >= t0);
    return S.heroB.length > 3 ? S.heroB : b.slice(-120);
  } catch (_) { return null; }
}
function deskHome() { return S.demo ? demoHome(S.fixture, Date.now(), S.silent) : S.home; }
// day-nqops 2026-11-21: the MFFU 7-day clock per account (clock7.js: the PC's k7 block, else its mf rows); Jarvis reads window.NQ_K7
function drawK7(nowS) {
  const list = S.demo ? [] : K7.rows(S.lite, nowS), ul = $('k7List'), pill = $('k7Pill');
  try { window.NQ_K7 = { t: Math.round(nowS), rows: K7.jarvis(list) }; } catch (_) { /* nothing */ }
  if (!ul) return;
  ul.textContent = '';
  for (const r of list) {
    const w = K7.words(r), li = document.createElement('li');
    li.className = 'k7r ' + r.lvl;
    const b = document.createElement('b'); b.textContent = r.nm; li.appendChild(b);
    for (const [cls, txt] of [['k7l', w.last], ['k7h', w.hard], ['k7k', w.ka], ['k7a', w.act]]) { const sp = document.createElement('span'); sp.className = cls; sp.textContent = txt; li.appendChild(sp); }
    ul.appendChild(li);
  }
  if (pill) {
    const worst = list.find((r) => r.lvl === 'bad') || list.find((r) => r.lvl === 'warn');
    pill.textContent = S.demo ? 'DEMO' : !list.length ? 'NO DATA' : worst ? `${worst.nm.split(' ')[0]}: ${worst.left <= 0 ? 'TODAY' : worst.left + 'd'}` : 'ALL OK';
    pill.className = 'pill ' + (!list.length || S.demo ? 'warn' : worst ? worst.lvl : 'ok');
  }
}
function renderDesk() {
  const nowS = Date.now() / 1000, home = deskHome(), file = S.demo ? (S.fixture && S.fixture.trades_file) || S.tfile : S.tfile;
  try {
    try { drawK7(nowS); } catch (_) { /* the card keeps its note */ }
    const A = D.accounts(home, S.biz, nowS, deskChart()), box = $('acctStrip');
    if (box) D.draw.accounts(box, A);
    const nLive = A.filter((a) => a.dot === 'live').length, p = $('acctPill');
    if (p) { p.textContent = S.demo ? 'DEMO' : `${nLive} of ${A.filter((a) => a.dot !== 'plan').length} live`; p.className = 'pill ' + (S.demo ? 'warn' : nLive ? 'ok' : 'bad'); }
  } catch (_) { /* the rest of the page still draws */ }
  try {
    const B = D.thinking(home, S.news, file, nowS, deskChart(), S.brief), box = $('think');
    if (box) D.draw.thinking(box, B);
    const p = $('thinkPill'); if (p) { const inT = B.filter((b) => b.phase === 'in').length; p.textContent = inT ? `${inT} in a trade` : S.demo ? 'DEMO' : 'LIVE'; p.className = 'pill ' + (inT ? 'warn' : S.demo ? 'warn' : 'ok'); }
  } catch (_) { /* nothing */ }
  try {                                   // round 3: Ares (GO / WAIT / HALT per account) and Kairos (the day line)
    const G = D.gate(D.accounts(home, S.biz, nowS, deskChart()), home, S.news, nowS), box = $('gates');
    if (box) D.draw.gate(box, G);
    const p = $('gatePill'), n = G.filter((g) => g.level === 'go').length;
    if (p) { p.textContent = S.demo ? 'DEMO' : G.length ? `${n} of ${G.length} GO` : '-'; p.className = 'pill ' + (S.demo ? 'warn' : n ? 'ok' : 'warn'); }
    const dl = $('dayLine'); if (dl) D.draw.day(dl, D.dayLine(home, nowS));
  } catch (_) { /* nothing */ }
  watchPast();
  try { renderV4(home, file, nowS); } catch (_) { /* the rest of the page still draws */ }
  try {
    const Q = D.quality(home, file, S.news, nowS, S.edge, deskChart()), box = $('qual');
    if (box) D.draw.quality(box, Q);
    const p = $('qualPill'); if (p) { p.textContent = `${Q.okN} of ${Q.rows.length} OK`; p.className = 'pill ' + Q.level; }
  } catch (_) { /* nothing */ }
}

function render() {
  model();
  const v = S.view;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderBanner(); renderDesk(); renderScene(); renderPlan(); renderBots(); renderNews(); renderTrades(); renderFacts();
  say(`${v.headline}${v.tight ? ` ${v.tight.name}: ${v.tight.ddLine}.` : ''}${S.demo ? ' Example numbers.' : ''}`);
  { const el = $('src'); if (el) el.textContent = srcLine(); }   // (the hero shows today's $: v.todayLine stays in the model for Jarvis / tests)
  S.ready = true;
  try {                                  // night-nq-main: the battle plan + alert history (plan.js) read the SAME merged PC state, never a 2nd feed read
    window.NQ_HOME = { home: deskHome(), lite: S.lite || null, demo: S.demo, chart: deskChart() };   // chart = the PC's last 5-min bar (the battle plan's only "now" price)
    dispatchEvent(new CustomEvent('nq-home', { detail: window.NQ_HOME }));
    loadPlan(); loadDec();
  } catch (_) { /* the plan keeps its last draw */ }
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  tryScene(); tryLand();
}

// ------------------------------------------------------------------------------------------------ v4: goals, numbers, the 3D landscape
const EQ_IDS = { zlarior: ['mffu50k_eval', 'lit'], fresh25: ['b25k_2'], atlas: ['atlas', 'acct_b'], rapid1: ['rapid'] };
const V4 = { open: null, wins: null, fracs: null, land: 'none', vault: null, pay: null, payP: null };
function renderV4(home, file, nowS) {
  const chart = deskChart(), A = D.accounts(home, S.biz, nowS, chart);
  // the funded tracker's rules (payready.js, the same as the Board / Trading) come with the PC's post, after the first paint (a later import:
  // the page's eager JS budget); until then the goal uses MFFU's plan numbers and the chips say the rule without a tick
  let pay = [];
  if (S.lite && window.PAYOUT_COACH) {
    if (V4.pay) { try { pay = V4.pay(S.lite, home, S.biz, window.PAYOUT_COACH, D.etParts(nowS).day); } catch (_) { pay = []; } }
    else if (window.NQ_PAYREADY) { V4.pay = window.NQ_PAYREADY; try { pay = V4.pay(S.lite, home, S.biz, window.PAYOUT_COACH, D.etParts(nowS).day); } catch (_) { pay = []; } }
    else if (!V4.payP) {
      V4.payP = true;
      window.addEventListener('nq-payready', () => { V4.pay = window.NQ_PAYREADY || null; if (S.ready) renderDesk(); }, { once: true });
      const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./payready_late.js?v=2', import.meta.url).href; document.head.appendChild(t);
    }
  }
  const rows = (S.lite && S.lite.mf && Array.isArray(S.lite.mf.a)) ? S.lite.mf.a : [], eq = {};
  for (const k in EQ_IDS) { const r = rows.find((x) => x && EQ_IDS[k].includes(x.id)); if (r) eq[k] = r.eq; }
  const list = G.goals(A, pay, S.goals, nowS, eq, window.PC_FEED && window.PC_FEED.mffuView);   // MFFU's own view of a funded account when pc_feed.js has it
  const box = $('goals');
  if (box) G.drawGoals(box, list, $('goalDetail'), { open: V4.open, onOpen: (k) => { V4.open = k; } });
  const fa = D.feedAge(home, nowS), age = $('goalAge');
  if (age) { age.textContent = S.demo ? 'DEMO' : fa.fromPc ? D.updated(fa.report) : 'plan + cloud copy'; age.className = 'pill ' + (S.demo ? 'warn' : fa.fromPc ? D.ageLevel(fa.report, 'pc') : 'warn'); }
  try {                                   // night-nq-main: the hero (today's $, every account's way to pass + room, LIT / ATLAS in one word)
    const B = D.thinking(home, S.news, file, nowS, chart, S.brief);
    const H = D.hero(A, list, B, home, nowS, S.demo); window.NQ_HERO = H;   // BRIEF ME reads the hero's own model
    D.draw.hero($('hero'), H);
    if (!S.scene3 && $('heroScene')) S.scene3 = D.heroScene($('heroScene'), heroBars) || true;
    else if (S.scene3 && S.scene3.redraw) S.scene3.redraw();
  } catch (_) { /* the rest of the page still draws */ }
  const real = G.realRows(file, chart, G.fundedSince(S.lite));   // ATLAS's passed-eval trades are not the funded account's
  // below the first screen: the numbers card and the landscape draw when the main thread is free (perf: one long task less at load)
  later(() => {
    const nb = $('nums'); if (nb) G.drawNumbers(nb, G.numbers(A, real, nowS), G.clock(nowS), G.vixLine(S.brief), G.opens(A));
    const np = $('numPill'); if (np) { np.textContent = S.demo ? 'DEMO' : 'REAL FILLS'; np.className = 'pill ' + (S.demo ? 'warn' : 'ok'); }
    drawLand(chart, list);
  });
  // bursts: a new winning real trade, or a goal ring crossing a quarter, since the page opened (never on the first draw)
  const wins = real.filter((r) => r.usd > 0.5).length, fr = Object.fromEntries(list.map((g) => [g.key, Math.floor(g.frac * 4)]));
  const FX = window.OLYMPUS_NQFX || null;               // DESIGN's kit (olympus/nqfx.js): its sparks + toast; our own canvas burst without it
  if (V4.wins !== null && wins > V4.wins) {
    const last = real.filter((r) => r.usd > 0.5).slice(-1)[0];
    try { if (FX && FX.win) FX.win($('goalCard'), { usd: last ? last.usd : 0 }); else G.burst($('goalCard'), 'win'); } catch (_) { /* nothing */ }
    try { if (window.NQLAND) window.NQLAND.burst('win'); } catch (_) { /* nothing */ }
  } else if (V4.fracs) for (const k in fr) if (fr[k] > (V4.fracs[k] ?? 9)) {
    const el = box && box.querySelector(`[data-key="${k}"]`), g = list.find((x) => x.key === k);
    try { if (FX && FX.milestone) FX.milestone(el, { text: `${g ? g.name : ''}: ${Math.round((g ? g.frac : 0) * 100)}% of the goal` }); else G.burst(el, 'goal'); } catch (_) { /* nothing */ }
    try { if (window.NQLAND) window.NQLAND.burst('goal'); } catch (_) { /* nothing */ }
    break;
  }
  V4.wins = wins; V4.fracs = fr;
  drawVault(list.find((g) => g.kind === 'payout'));
}
// ATLAS's first payout as DESIGN's vault (NQFX.vault): value = MFFU's profit / the $2,100 goal; the kit draws a 2D vault at once and
// brings the 3D door after load + idle (never on the first paint), still under reduced motion. Without the kit: the card says the numbers.
function drawVault(g) {
  const host = $('vault'), pill = $('vaultPill'), note = $('vaultNote');
  if (!host) return;
  if (!g || !g.has) { $('vaultCard').hidden = true; return; }
  $('vaultCard').hidden = false;
  const label = `${G.usd(g.balance)} of ${G.usd(g.goalAt)}`;
  if (pill) { pill.textContent = g.left <= 0 ? 'READY' : `${Math.round(g.frac * 100)}%`; pill.className = 'pill ' + (g.left <= 0 ? 'ok' : 'warn'); }
  if (note) note.textContent = GM.goal({ name: g.name, key: g.key, stage: 'Funded', balance: g.balance }).line;   // QA #4: the one goals model; no hard-coded date
  V4.vaultArgs = [g.frac, label];
  if (V4.vault) { try { V4.vault.call('set', g.frac, label); } catch (_) { /* the note says it */ } return; }
  // perf (sweep 2026-11-20: the kit's 3D vault pulled three.js in on load: a 1.7 s long task at 4x CPU): the kit and its vault only when the card
  // is (about) on the screen
  if (V4.vaultWait) return;
  V4.vaultWait = true;
  const go = () => fxKit().then((FX) => {
    if (!FX || V4.vault) return;
    try { const [f, l] = V4.vaultArgs; V4.vault = FX.vault(host, { value: f, label: l, aria: `ATLAS first payout goal: ${l}` }); } catch (_) { /* the note says it */ }
  }).catch(() => { /* the note says it */ });
  if (typeof IntersectionObserver !== 'function') { go(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '0px 0px 25% 0px' });
  io.observe($('vaultCard'));
}
// DESIGN's NQ effects kit (olympus/nqfx.js: bursts, toasts, the vault) is not a page tag: it comes after the first paint, when the browser is idle
// (perf: the page's eager JS stays under its 600 KB budget). Resolves to OLYMPUS_NQFX or null (no kit: our own canvas burst, the vault note).
let fxP = null;
function fxKit() {
  if (fxP) return fxP;
  fxP = new Promise((res) => {
    if (window.OLYMPUS_NQFX) { res(window.OLYMPUS_NQFX); return; }
    later(() => {
      const t = document.createElement('script'); t.src = '../olympus/nqfx.js?v=n6'; t.async = true;
      t.onload = () => { const F = window.OLYMPUS_NQFX; if (!F || !F.ready) { res(null); return; } F.ready().then(() => res(F), () => res(null)); };
      t.onerror = () => res(null);
      document.head.appendChild(t);
    });
  });
  return fxP;
}
const later = (fn) => { const run = () => { try { fn(); } catch (_) { /* the rest of the page still draws */ } };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 }); else setTimeout(run, 60); };
function landData(list) {
  const M = window.NQCHART && window.NQCHART.S && window.NQCHART.S.model;
  const candles = M && Array.isArray(M.candles) ? M.candles : [], close = new Map(candles.map((c) => [c.time, c.close]));
  const mk = M && Array.isArray(M.markers) ? M.markers : [], exits = new Set(mk.filter((m) => m.kind === 'exit').map((m) => String(m.id).slice(1)));
  const trades = mk.filter((m) => m.kind === 'exit' || (m.kind === 'entry' && !exits.has(String(m.id).slice(1))))
    .map((m) => ({ time: m.time, price: m.price ?? close.get(m.time) ?? null, usd: m.kind === 'exit' ? (/^-/.test(m.text || '') ? -1 : 1) : 0, side: /Up/.test(m.shape || '') ? 1 : -1, open: m.kind === 'entry' }));
  const g = list.find((x) => x.key === 'atlas') || list[0];
  return { candles, trades, goal: g ? g.frac : 0 };
}
function drawLand(chart, list) {
  const d = landData(list);
  if (V4.land === 'webgl') { try { window.NQLAND.update(d); } catch (_) { /* the picture stays */ } return; }
  const svg = $('landFb'); if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const c = d.candles.length > 1 ? d.candles.map((x) => x.close) : Array.from({ length: 60 }, (_, i) => 50 + Math.sin(i / 6) * 12 + Math.sin(i / 2.3) * 4);
  const lo = Math.min(...c), hi = Math.max(...c), W = 360, H = 240, y = (v) => H - 30 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 80);
  const pts = c.map((v, i) => `${((i / (c.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
  const defs = sv('defs', {}), gr = sv('linearGradient', { id: 'landG', x1: 0, y1: 0, x2: 0, y2: 1 });
  gr.appendChild(sv('stop', { offset: '0', 'stop-color': '#9d59ee', 'stop-opacity': '0.5' })); gr.appendChild(sv('stop', { offset: '1', 'stop-color': '#4d2e76', 'stop-opacity': '0' }));
  defs.appendChild(gr); svg.appendChild(defs);
  svg.appendChild(sv('path', { class: 'a', d: `M0,${H} L${pts} L${W},${H} Z` }));
  svg.appendChild(sv('path', { class: 'l', d: `M${pts}` }));
}
let landTried = false;
function tryLand() {
  if (landTried || !S.ready) return;
  const M = window.NQLAND; if (!M) return;
  let lite = false; try { lite = !!(O && O.lite && O.lite()); } catch (_) { /* nothing */ }
  if (lite || new URLSearchParams(location.search).get('flat') === '1') return;
  landTried = true;
  const box = $('land3d');
  try { box.hidden = false; if (M.mount(box, landData(G.goals(D.accounts(deskHome(), S.biz, Date.now() / 1000, deskChart()), [], S.goals, Date.now() / 1000)))) { V4.land = 'webgl'; $('landFb').style.visibility = 'hidden'; } else box.hidden = true; } catch (_) { box.hidden = true; }
}
window.addEventListener('nqland', tryLand);

// ------------------------------------------------------------------------------------------------ the optional 3D columns
let tried = false;
function tryScene() {
  if (tried || !S.ready || S.scene === 'webgl') return;
  const M = window.NQ3D;
  if (!M) return;
  let lite = false; try { lite = !!(O && O.lite && O.lite()); } catch (_) { /* nothing */ }
  if (lite || new URLSearchParams(location.search).get('flat') === '1') return;
  tried = true;
  try { if (M.mount($('scene3d'), S.view.columns)) { S.scene = 'webgl'; $('scene3d').hidden = false; $('fallback').style.visibility = 'hidden'; renderScene(); } } catch (_) { S.scene = '2d'; }
}
window.addEventListener('nq3d', tryScene);
window.addEventListener('nq-bars', () => { if (S.ready) renderDesk(); });
window.addEventListener('nq-bars', () => { if (S.ready) try { tryLand(); } catch (_) { /* nothing */ } });   // a new chart post (the live chart module): the open trade's stop and $ now

// night-nq-speed's shared feed (nqfeed.js, when the page has it): every newer post re-draws at once (its fetchLatest wrap answers from the kept post)
window.addEventListener('nq-feed', () => { if (S.ready) refresh(); });
async function refresh() {
  if (S.forced || document.hidden) return;
  const home = await withPost(await getJSON('../home.json'));
  if (home && C.hasData(home)) S.home = home;
  render();
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1'; S.silent = parseSilent(q.get('silent'));
  for (const b of document.querySelectorAll('[data-howto]')) b.addEventListener('click', () => openSheet(b));
  $('sheetClose').addEventListener('click', closeSheet); $('veil').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); else if (e.key === 'Tab' && S.sheet) { e.preventDefault(); try { $('sheetClose').focus(); } catch (_) { /* nothing */ } } });   // the sheet has one control: focus stays on it
  const [fx, home, howto, news, learned, biz, tfile, edge, brief, goals] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), getJSON('./howto.json'), getJSON('./news_week.json'), null /* QA #14: ../hub/learned.json is never published (a 404 on every load): off until the lead publishes it (LEAD_WIRES) */,
    getJSON('../business/accounts.json'), getJSON('../trading/trades.json'), getJSON('../edge.json'), getJSON('./brief.json'), getJSON('../business/goals.json')]);
  S.fixture = fx; S.howto = howto; S.news = news; S.learned = learned; S.biz = biz; S.tfile = tfile; S.edge = edge; S.brief = brief; S.goals = goals;   // brief.json: the day-brief helper's pre-market brief (optional)
  // the PC's 15-minute status (no GitHub) first, up to 3.5 s, so the first numbers on screen are the real ones; when it is later than
  // that the cloud's copy shows (its source line says so) and the post is laid over it when it arrives, however long ntfy takes
  const post = home ? withPost(home) : Promise.resolve(home);
  const early = await Promise.race([post, new Promise((r) => setTimeout(() => r(null), 3500))]);
  S.home = early || home;
  render();
  if (!early && home) post.then((h) => { if (h && h !== home && !S.forced) { S.home = h; render(); } });
  if (q.get('howto') === '1') openSheet($('howBtn'));
  setInterval(() => { if (!document.hidden) render(); }, 60000);        // the ages keep counting
  setInterval(refresh, 5 * 60000);                                       // a newer report, when the PC sends one
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  const A = window.AGORA;                                                // pull down to fetch the newest report (olympus/agora-ui.js)
  if (A && A.pull) A.pull(async () => { try { window.dispatchEvent(new Event('nq-refresh')); } catch (_) { /* the live chart polls by itself */ } await refresh(); if (A.toast) A.toast(S.forced ? 'Demo numbers: nothing to refresh' : 'Up to date'); });
}
window.NQ = { S, C, D, ready: () => S.ready, render, openSheet, closeSheet };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('NQ could not start'); } catch (_) { /* nothing */ } });
