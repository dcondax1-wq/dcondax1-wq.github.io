// NQ page (ES module): "the NQ bots, right now". One page built for trust: per bot the status with the exact age of its last report, drawdown left, the day's P&L in $ with R,
// the eval progress, the last 10 trades with the rule that closed each, the plan in one sentence, the backtest facts with their dates, and an honest banner when the PC is silent.
// Reads ../home.json (the small first-paint file; never the 8 MB data.json), ./howto.json (docs/NQ_BOT_BACK.md, bundled by tools/nq_howto_build.py) and ./fixture.json (DEMO, never blank).
// Read only: it sends nothing and keeps nothing. Text only through textContent / createElementNS. The 3D columns come from nqscene.js (optional). window.NQ is the test hook.
// ?demo=1 the example; ?demo=1&silent=4d (or 90m, 5h) the example with a silent PC; ?flat=1 the 2D columns; ?howto=1 opens the sheet.
import * as C from './nqcore.js';
import * as T from '../olympus/truth.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, home: null, howto: null, demo: false, forced: false, silent: 0, view: null, scene: '2d', ready: false, sheet: false, last: null };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

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
    svg.appendChild(sv('rect', { x, y: 36, width: w, height: 10, rx: 2, fill: lit ? '#e0b060' : '#bdb3a0' }));
    svg.appendChild(sv('path', { d: `M${mid - 11} 36c2-6 20-6 22 0z`, fill: '#9c6b3c' }));
    if (lit) { const f = sv('path', { d: `M${mid} 6c-8 8 0 12-5 22h10c-3-8 3-11-5-22z`, fill: '#e0b060', class: 'flame' }); f.dataset.key = c.key; svg.appendChild(f); }
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
    const top = h('div', 'row'); const t = h('h3', '', `${b.name} `); t.appendChild(h('small', '', b.key === 'lit' ? `LIT ${b.size}` : b.size)); top.appendChild(t);
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
    kv.appendChild(h('dt', '', 'Eval progress')); kv.appendChild(h('dd', 'soft', b.progLine));
    a.appendChild(kv);
    a.appendChild(bar(b.progress, 'gold', `${Math.round(b.progress * 100)} percent of the way to the target`));
    if (b.waiting && b.status.flame) a.appendChild(h('p', 'note', b.waiting));
    box.appendChild(a);
  }
}

// ------------------------------------------------------------------------------------------------ plan, trades, facts
function renderPlan() {
  const p = S.view.plan; $('planRule').textContent = p.rule; $('planNow').textContent = p.now; $('planNow').hidden = !p.now; $('planNote').textContent = p.note; $('planNote').hidden = !p.note;
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

function render() {
  model();
  const v = S.view;
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderBanner(); renderScene(); renderPlan(); renderBots(); renderTrades(); renderFacts();
  say(`${v.headline}${v.tight ? ` ${v.tight.name}: ${v.tight.ddLine}.` : ''}${S.demo ? ' Example numbers.' : ''}`);
  { const el = $('src'); if (el) el.textContent = S.demo ? (S.forced ? 'Example numbers (?demo=1): open the page without it for the live bots.' : 'Example numbers (fixture.json): the site has no home.json yet.') : S.ages ? 'Source: home.json (the PC\'s report via the cloud). ' + S.ages.line : ''; }
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
  tryScene();
}

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

async function refresh() {
  if (S.forced || document.hidden) return;
  const home = await T.withPcFeed(await getJSON('../home.json'));
  if (home && C.hasData(home)) S.home = home;
  render();
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1'; S.silent = parseSilent(q.get('silent'));
  for (const b of document.querySelectorAll('[data-howto]')) b.addEventListener('click', () => openSheet(b));
  $('sheetClose').addEventListener('click', closeSheet); $('veil').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); else if (e.key === 'Tab' && S.sheet) { e.preventDefault(); try { $('sheetClose').focus(); } catch (_) { /* nothing */ } } });   // the sheet has one control: focus stays on it
  const [fx, home, howto] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), getJSON('./howto.json')]);
  S.fixture = fx; S.home = home; S.howto = howto;
  render();
  // the PC's 15-minute status (no GitHub): laid over home.json when it arrives
  if (home) T.withPcFeed(home).then((h) => { if (h !== home && !S.forced) { S.home = h; render(); } });
  if (q.get('howto') === '1') openSheet($('howBtn'));
  setInterval(() => { if (!document.hidden) render(); }, 60000);        // the ages keep counting
  setInterval(refresh, 5 * 60000);                                       // a newer report, when the PC sends one
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  const A = window.AGORA;                                                // pull down to fetch the newest report (olympus/agora-ui.js)
  if (A && A.pull) A.pull(async () => { await refresh(); if (A.toast) A.toast(S.forced ? 'Demo numbers: nothing to refresh' : 'Up to date'); });
}
window.NQ = { S, C, ready: () => S.ready, render, openSheet, closeSheet };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('NQ could not start'); } catch (_) { /* nothing */ } });
