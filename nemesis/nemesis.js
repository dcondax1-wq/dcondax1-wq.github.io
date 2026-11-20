// NEMESIS page (ES module): loads the site's trades, builds the fallen and their autopsies (nemcore.js), draws the underworld (scene.js)
// and the words (this file). Text only through textContent (no data ever becomes HTML). window.NEM is the test hook.
// Kept on this phone only: the vows, in localStorage 'nemesis.v1'. Read (never written): the Zenith journal tags 'le.jtags'.
import { parseTrades, fallen, weeks, leaks, weekText, dayText, usd, vowText, LEAKS, LEAK_IDS, readTags, obsidianLesson, obsidianWeek, plainWeek, isLoss } from './nemcore.js';

import * as X from './extras.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const KEY = 'nemesis.v1';
const S = { trades: [], fallen: [], weeks: [], wk: '', all: false, sel: null, view: '', vows: {}, demo: true, scene: null, raw: null, ready: false, error: null, home: null, tagCount: 0, copied: '' };

const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const kids = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode: the vows just are not kept */ } },
};
const persist = () => store.write({ vows: S.vows });

// an optional file that answered 404 is not asked again for 30 minutes (a browser logs every 404 as a console error): once per phone, not on every open
const wasGone = (u) => { try { const t = +localStorage.getItem('nemesis.opt404.' + u); return !!t && Date.now() - t < 1800e3; } catch (_) { return false; } };
const markGone = (u) => { try { localStorage.setItem('nemesis.opt404.' + u, String(Date.now())); } catch (_) { /* private mode */ } };
async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { if (wasGone(url)) return null; const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.status === 404) markGone(url); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function journalTags() { try { return readTags(localStorage.getItem('le.jtags')); } catch (_) { return {}; } }

// ------------------------------------------------------------------------------------------------ the selection
const inWeek = () => (S.all ? S.fallen : S.fallen.filter((f) => f.wk === S.wk));
const byId = (id) => S.fallen.find((f) => f.id === id) || null;
const curWeekKey = () => (S.all ? (S.weeks[0] ? S.weeks[0].wk : '') : S.wk);
const weekLabel = () => (S.all ? 'All weeks' : weekText(S.wk));

function figures() {                                                       // newest first: the newest lies nearest the centre
  const sel = new Set(inWeek().map((f) => f.id));
  return S.fallen.slice().reverse().map((f) => ({ id: f.id, usd: f.usd, tone: f.tone, week: sel.has(f.id) }));
}
const toneName = { plan: 'plan loss', soft: 'plan, with a leak', break: 'rule break' };
const toneDot = (tone) => h('i', `d ${tone}`);

// ------------------------------------------------------------------------------------------------ the summary card
function renderSummary() {
  const list = inWeek(), rk = leaks(list), top = rk.rank[0];
  $('vText').textContent = S.fallen.length ? `${weekLabel()}: ${plainWeek(list, rk)}` : 'No losing trades to review yet.';
  $('tFallen').textContent = String(list.length);
  $('tLost').textContent = usd(-rk.lost);
  const lc = rk.rank.reduce((s, r) => s + r.cost, 0);
  $('tLeak').textContent = usd(-lc);
  { let av = $('avoid');                                          // AGORA: how much of the loss was avoidable, in dollars
    if (!av) { av = document.createElement('p'); av.id = 'avoid'; av.className = 'avoid'; $('live').before(av); }
    av.hidden = !(rk.lost > 0);
    { let bar = $('avbar'); if (!bar) { bar = document.createElement('span'); bar.id = 'avbar'; bar.className = 'avbar'; bar.append(document.createElement('i')); av.before(bar); }
      bar.hidden = !(rk.lost > 0); bar.firstChild.style.width = rk.lost > 0 ? Math.max(2, Math.round((lc / rk.lost) * 100)) + '%' : '0%'; }
    if (rk.lost > 0) av.textContent = lc > 0 ? `${Math.round((lc / rk.lost) * 100)}% of the money lost was avoidable: ${usd(lc)} of ${usd(rk.lost)}. The rest was the plan working as designed, a normal loss.` : `None of the ${usd(rk.lost)} lost was a leak: every loss was the plan working as designed.`; }
  const live = $('live'), ev = S.home && S.home.eval;
  if (ev && ev.balance != null && ev.floor != null) {
    live.textContent = `Your live eval now: balance ${usd(ev.balance)}, floor ${usd(ev.floor)}, room ${usd(ev.balance - ev.floor)}.`;
    live.hidden = false;
  } else live.hidden = true;
  $('wkLabel').textContent = weekLabel();
  const i = S.weeks.findIndex((w) => w.wk === S.wk), w = S.weeks[i];
  $('wkSub').textContent = S.all ? `${S.fallen.length} fallen in ${S.weeks.length} weeks` : w ? `${w.losses} fallen of ${w.trades} trades` : '';
  $('wkPrev').disabled = S.all || i < 0 || i >= S.weeks.length - 1;
  $('wkNext').disabled = S.all || i <= 0;
  $('wkAll').setAttribute('aria-pressed', String(S.all));
  return { list, rk, top };
}

// ------------------------------------------------------------------------------------------------ sheets
function fallenView() {
  const list = inWeek().slice().reverse();
  if (!list.length) return [h('p', 'strong', 'No fallen in this stretch: no trade lost more than $25.'), h('p', '', 'Use the arrows under the arena to look at another week.')];
  const ul = h('ul', 'list');
  for (const f of list) {
    const li = h('li'), b = h('button'); b.type = 'button'; b.dataset.id = f.id;
    if (f.id === S.sel) b.setAttribute('aria-current', 'true');
    const t = f.t, when = h('span', 'when');
    when.append(h('b', '', `${dayText(f.day)}${t.hhmm ? ' ' + t.hhmm : ''} ${t.side ? t.side.toLowerCase() : ''} ${t.strat}`.replace(/\s+/g, ' ')), h('span', '', `${f.a.verdict.toLowerCase()} · ${t.src}`));
    b.append(toneDot(f.tone), when, h('span', 'amt', usd(f.usd)));
    b.addEventListener('click', () => pick(f.id));
    li.append(b); ul.append(li);
  }
  return [h('p', 'strong', `${list.length} fallen. Tap one, or a figure in the arena, for its autopsy.`), ul];
}

// the deeper reads (extras.js) never hide the sheet they sit in
function more(fn) { try { return fn(); } catch (_) { return null; } }

function autopsyView(f) {
  const a = f.a, t = f.t;
  const head = h('p', 'strong'); head.append(h('span', `badge ${a.tone}`, a.verdict), h('span', 'who', a.who));
  const ol = h('ol', 'rows');
  for (const r of a.rows) {
    const li = h('li'), st = h('span', `st ${r.st}`, { ok: '✓', bad: '✕', warn: '!', na: '?', info: 'i' }[r.st] || '·'), d = h('div');
    st.setAttribute('aria-label', { ok: 'fine', bad: 'broken', warn: 'warning', na: 'not recorded', info: 'for your information' }[r.st] || '');
    d.append(h('span', 'l', r.label), h('p', 't', r.text));
    li.append(st, d); ol.append(li);
  }
  const lesson = h('div', 'lesson'); lesson.append(h('b', '', 'One lesson'), h('p', '', a.lesson));
  const i = S.fallen.indexOf(f), older = S.fallen[i - 1], newer = S.fallen[i + 1];
  const row = h('div', 'btnrow'), copy = h('button', 'btn', 'Copy for Obsidian'), box = h('textarea', 'copybox'); copy.type = 'button'; copy.id = 'copyLesson';
  box.hidden = true; box.readOnly = true; box.id = 'copyBox'; box.setAttribute('aria-label', 'The note to copy');
  copy.addEventListener('click', () => copyText(obsidianLesson(f), copy, box));
  const bo = h('button', 'btn ghost', '‹ Older'), bn = h('button', 'btn ghost', 'Newer ›'); bo.type = bn.type = 'button'; bo.id = 'olderF'; bn.id = 'newerF';
  bo.disabled = !older; bn.disabled = !newer;
  bo.addEventListener('click', () => older && pick(older.id)); bn.addEventListener('click', () => newer && pick(newer.id));
  const back = h('button', 'btn ghost', 'List'); back.type = 'button'; back.id = 'toList'; back.addEventListener('click', () => { S.sel = null; syncScene(); openSheet('fallen'); });
  row.append(copy, bo, bn, back);
  return [head, ol, more(() => X.replayChart(f, S.raw)), lesson, row, box, h('p', 'note', 'Copy only puts text on your clipboard. Nothing is sent anywhere.')];
}

function leaksView() {
  const { list, rk } = renderSummary();
  const out = [h('p', 'strong', `${weekLabel()}: ${plainWeek(list, rk)}`)];
  if (rk.rank.length) {
    const ol = h('ol', 'leaklist'), max = rk.rank[0].cost || 1;
    rk.rank.forEach((r, i) => {
      const li = h('li'), hd = h('div', 'hd');
      hd.append(h('span', 'rk', String(i + 1)), h('span', 'nm', r.name), h('span', 'cost', usd(-r.cost)));
      const bar = h('div', 'bar'), fill = h('i'); fill.style.width = `${Math.max(4, Math.round((r.cost / max) * 100))}%`; bar.append(fill);
      const sub = h('p', 'sub', `${r.n} ${r.n === 1 ? 'loss' : 'losses'}. ${r.hard ? 'A rule of the plan.' : 'A habit, not a rule of the bot.'} ${LEAKS[r.id].vow}`);
      const mk = h('button', 'btn mini', S.vows[curWeekKey()] && S.vows[curWeekKey()].leak === r.id ? 'This is my vow' : 'Make it my vow'); mk.type = 'button'; mk.dataset.leak = r.id;
      mk.addEventListener('click', () => { setVow(r.id); openSheet('vow'); });
      li.append(hd, bar, sub, mk); ol.append(li);
    });
    out.push(ol);
  } else out.push(h('p', '', list.length ? 'None of the checks found a leak in these losses.' : 'Nothing to rank.'));
  if (rk.plan.n) out.push(h('p', '', `Plan losses: ${rk.plan.n} ${rk.plan.n === 1 ? 'trade' : 'trades'}, ${usd(-rk.plan.cost)}. The plan was followed; this is the price of the edge, not a leak.`));
  out.push(more(() => X.leakTimeline(S.weeks, S.fallen)), more(() => X.patterns(S.trades)));
  out.push(h('p', 'note', 'Cost = the loss of the trades that carry the leak (for heavy size, only the part above a third of the room or above the bot\'s size). A trade with two leaks counts under each, so the leaks can add up to more than the total.'));
  return out;
}

function setVow(leak) {
  const wk = curWeekKey();
  if (!wk) return;
  S.vows[wk] = { leak, text: vowText(leak), done: false };
  persist();
}

function vowView() {
  const wk = curWeekKey(), { list, rk } = renderSummary(), top = rk.rank[0];
  const v = S.vows[wk] || null, id = v ? v.leak : top ? top.id : 'plan', text = v ? v.text : vowText(id);
  const box = h('div', 'vowbox'); box.append(h('p', '', text));
  const out = [h('p', 'strong', `Vow from the week of ${wk ? weekText(wk) : '-'}${v ? '' : ' (suggested from the biggest leak)'}`), box];
  const lab = h('label', 'tick'), cb = h('input'); cb.type = 'checkbox'; cb.id = 'vowTick'; cb.checked = !!(v && v.done);
  lab.append(cb, h('span', '', 'I kept this vow'));
  cb.addEventListener('change', () => { if (!S.vows[wk]) S.vows[wk] = { leak: id, text, done: false }; S.vows[wk].done = cb.checked; persist(); openSheet('vow'); });
  out.push(lab, more(() => X.vowStreak(S.vows)));
  const others = rk.rank.filter((r) => r.id !== id).slice(0, 3);
  if (others.length) {
    const row = h('div', 'btnrow');
    for (const r of others) { const b = h('button', 'btn ghost', `Vow: ${LEAKS[r.id].short}`); b.type = 'button'; b.dataset.leak = r.id; b.addEventListener('click', () => { setVow(r.id); openSheet('vow'); }); row.append(b); }
    out.push(row);
  }
  const copy = h('button', 'btn', 'Copy week note for Obsidian'), area = h('textarea', 'copybox'); copy.type = 'button'; copy.id = 'copyWeek';
  area.hidden = true; area.readOnly = true; area.id = 'copyBox'; area.setAttribute('aria-label', 'The note to copy');
  copy.addEventListener('click', () => copyText(obsidianWeek(wk, list, rk, { text, done: cb.checked }), copy, area));
  const copyAll = h('button', 'btn ghost', 'Copy full review for Obsidian'); copyAll.type = 'button'; copyAll.id = 'copyAll';
  copyAll.addEventListener('click', () => { let t = ''; try { t = X.obsidianAll({ wk, list, rk, vows: S.vows, trades: S.trades, weeks: S.weeks, all: S.fallen }); } catch (_) { t = obsidianWeek(wk, list, rk, { text, done: cb.checked }); } copyText(t, copyAll, area); });
  const r2 = h('div', 'btnrow'); r2.append(copy, copyAll);
  out.push(r2, area);
  const done = Object.entries(S.vows).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8);
  if (done.length) {
    out.push(h('h3', '', `Vows kept: ${done.filter(([, x]) => x.done).length} of ${done.length}`));
    const ul = h('ul', 'hist');
    for (const [k, x] of done) { const li = h('li'); li.append(h('span', '', `${weekText(k)}: ${LEAKS[x.leak] ? LEAKS[x.leak].short : 'follow the plan'}`), h('span', x.done ? 'ok' : 'open', x.done ? 'kept' : 'open')); ul.append(li); }
    out.push(ul);
  }
  out.push(h('p', 'note', 'Your ticks stay in this page\'s localStorage on this phone. The Copy button only puts text on your clipboard. Nothing is sent anywhere.'));
  return out;
}

function aboutView() {
  const n = S.trades.length, tn = Object.keys(journalTags()).length;
  return [
    h('p', 'strong', 'Nemesis reads the trades the site already shows and says what went wrong, in plain words.'),
    h('p', '', `A fallen is any trade that lost more than $25 (smaller losses are break-even scratches). ${n} trades are on the site; a real fill, its cloud twin and the backtest of the same setup count once.`),
    h('p', '', 'Checked from the site\'s own fields: the stop against the sweep extreme (the plan is 1 tick beyond), the size against the room and against the bot\'s twin, the entry hours (02:00-15:30 New York), break-even at 1R, one trade a day, trading after two losses, a late entry after the 1m CISD. Where a field is not on the site, the autopsy says "not recorded" and does not guess.'),
    h('p', '', 'Honest limits: trades you place by hand are not on the site, so they cannot be here. The room before each trade is an estimate (the shown trades replayed through a fresh 50K eval). "Heavy" (a third of the room) is my rule of thumb; the bot\'s own ceiling is 80%. Small samples are labelled as hints.'),
    h('p', '', `Your Zenith journal tags (Late entry, Would skip) are read from this phone when they exist: ${tn ? `${tn} tagged trades found` : 'none found'}. Nothing is written back.`),
    S.demo ? h('p', '', 'DEMO: the site data was not reachable, so this is a recorded copy of the trades.') : null,
    h('p', 'note', 'Read-only. No orders, no bot setting, no signal.'),
  ];
}

const TITLES = { fallen: 'The fallen', autopsy: 'Autopsy', leaks: 'Biggest leaks', vow: 'Your vow', about: 'How Nemesis works' };
function openSheet(view) {
  S.view = view;
  const f = view === 'autopsy' ? byId(S.sel) : null;
  if (view === 'autopsy' && !f) view = S.view = 'fallen';
  $('sheetTitle').textContent = view === 'autopsy' ? `Autopsy · ${dayText(f.day)} ${f.t.side ? f.t.side.toLowerCase() : ''} ${f.t.strat} ${usd(f.usd)}`.replace(/\s+/g, ' ') : TITLES[view];
  kids($('sheetBody'), view === 'fallen' ? fallenView() : view === 'autopsy' ? autopsyView(f) : view === 'leaks' ? leaksView() : view === 'vow' ? vowView() : aboutView());
  $('sheet').hidden = false;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (view === 'autopsy' ? 'fallen' : view))));
  history.replaceState(null, '', '#' + (view === 'autopsy' ? 'fallen' : view));
}
function closeSheet() {
  S.view = ''; $('sheet').hidden = true;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  history.replaceState(null, '', location.pathname + location.search);
}

function pick(id) {
  S.sel = id;
  if (S.scene) S.scene.select(id);
  openSheet('autopsy');
  if (O && O.sfx) O.sfx('tick');
}
function syncScene() { if (S.scene) { S.scene.setFigures(figures()); S.scene.select(S.sel); } }

// ------------------------------------------------------------------------------------------------ copy (clipboard only)
async function copyText(text, btn, box) {
  S.copied = text;
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (_) { ok = false; }
  if (!ok) {
    box.value = text; box.hidden = false; box.focus(); box.select();
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  }
  const was = btn.textContent;
  btn.textContent = ok ? 'Copied' : 'Select the text above and copy it';
  if (!ok) { box.value = text; box.hidden = false; }
  setTimeout(() => { btn.textContent = was; }, 2200);
}

// ------------------------------------------------------------------------------------------------ update
function update() {
  renderSummary();
  syncScene();
  if (S.view) openSheet(S.view);
  postCard();
}
function setWeek(wk, all) {
  S.all = !!all; if (wk) S.wk = wk;
  if (S.sel && !S.all && byId(S.sel) && byId(S.sel).wk !== S.wk) S.sel = null;
  update();
}
function step(d) {
  const i = S.weeks.findIndex((w) => w.wk === S.wk), j = i + d;
  if (!S.all && j >= 0 && j < S.weeks.length) setWeek(S.weeks[j].wk, false);
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card() {
  const { list, rk } = renderSummary(), top = rk.rank[0];
  return { v: 1, name: 'Nemesis', status: { level: S.demo ? 'off' : 'ok', label: S.demo ? 'Demo data' : top ? `Leak: ${top.name}` : 'No leak' },
    kpis: [{ label: 'Fallen', value: String(list.length) }, { label: 'Lost', value: usd(-rk.lost) }, { label: 'Top leak', value: top ? top.name : 'None' }],
    lines: [`${weekLabel()}: ${plainWeek(list, rk)}`.slice(0, 120), 'Tap a fallen figure for its autopsy. Read-only.'],
    t: Math.floor(Date.now() / 1000), open: '#fallen', theme: '#13100d', stale_after: 604800 };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io')); } catch (_) { /* not inside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    const { createUnderworld } = await import('./scene.js');
    S.scene = createUnderworld($('view'), { O });
    S.scene.onPick(pick);
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}

function wire() {
  document.querySelectorAll('#pills button').forEach((b) => b.addEventListener('click', () => (S.view === b.dataset.view ? closeSheet() : openSheet(b.dataset.view))));
  $('close').addEventListener('click', closeSheet);
  $('wkPrev').addEventListener('click', () => step(1));
  $('wkNext').addEventListener('click', () => step(-1));
  $('wkAll').addEventListener('click', () => setWeek(S.wk, !S.all));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  const route = () => { const t = location.hash.slice(1); if (TITLES[t] && t !== 'autopsy') openSheet(t); };
  addEventListener('hashchange', route); route();
  const fit = () => document.documentElement.style.setProperty('--dock-h', Math.ceil($('dock').getBoundingClientRect().height) + 'px');
  fit(); addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe($('dock'));
}

async function main() {
  const scene = startScene();
  const [tr, home] = await Promise.all([getJSON('../odeon/trades.json'), getJSON('../home.json')]);
  let trades = parseTrades(tr), hm = home; S.raw = tr;
  S.demo = trades.length < 8;
  if (S.demo) {                                                          // the site data is not there: the recorded copy (DEMO)
    const fx = await getJSON('fixture.json');
    if (fx) { trades = parseTrades(fx); hm = fx.home; S.raw = fx; }
  }
  S.trades = trades;
  S.home = hm && Array.isArray(hm.accounts) ? hm.accounts.find((a) => a && a.eval && /50k/i.test(String(a.plan || a.id || '')) && a.kind !== 'paper') || null : null;
  const tags = journalTags();
  S.fallen = fallen(trades, tags);
  S.weeks = weeks(trades);
  S.wk = S.weeks[0] ? S.weeks[0].wk : '';
  S.vows = store.read().vows && typeof store.read().vows === 'object' ? store.read().vows : {};
  $('demo').hidden = !S.demo;
  await scene;
  wire();
  update();
  S.ready = true;
  document.body.dataset.ready = '1';
}

window.NEM = {
  state: () => ({ ready: S.ready, demo: S.demo, n: S.trades.length, fallen: S.fallen.length, week: S.wk, all: S.all, inWeek: inWeek().length, sel: S.sel, view: S.view, vows: S.vows,
    weeks: S.weeks.length, scene: S.scene ? S.scene.stats() : null, error: S.error, copied: S.copied, ids: S.fallen.map((f) => f.id), tones: S.fallen.map((f) => f.tone) }),
  pick, open: openSheet, week: (wk, all) => { setWeek(wk, all); return window.NEM.state(); },
  screenOf: (id) => (S.scene ? S.scene.screenOf(id) : null), card,
  fallen: () => S.fallen.map((f) => ({ id: f.id, day: f.day, wk: f.wk, usd: f.usd, tone: f.tone, verdict: f.a.verdict, flags: f.a.flags.map((x) => x.id) })),
};

main().catch((e) => { S.error = String((e && e.message) || e); if (O) O.fail(S.error); });
