// EPILOGUE page (ES module): the Sunday review, "your week in 60 seconds". Reads ../home.json, ../odeon/trades.json, ../money/index.json (published), the Journal's ratings on this phone
// (localStorage 'journal.v1', READ ONLY) and fixture.json (DEMO). It writes ONLY its own history ('epilogue.v1', this phone), never in the demo. Copy puts plain text on the clipboard and
// sends nothing. Text only through textContent. window.EPILOGUE is the test hook; the marble scroll (epilogue3d.js) listens for 'epilogue:model'.
import * as C from './epiloguecore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const S = { fixture: null, home: null, trades: null, moneyIdx: null, hist: C.emptyHist(), demo: false, forced: false, monday: '', model: null, goalId: null, ready: false, saved: 0, copied: 0 };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function loadHist() { try { return C.cleanHist(JSON.parse(localStorage.getItem('epilogue.v1') || 'null')); } catch (_) { return C.emptyHist(); } }
function saveHist() { if (S.demo) return; try { localStorage.setItem('epilogue.v1', JSON.stringify(S.hist)); S.saved++; } catch (_) { /* not kept: the page still works */ } }
function journalEntries() { try { return C.normEntries(JSON.parse(localStorage.getItem('journal.v1') || 'null')); } catch (_) { return {}; } }

// ------------------------------------------------------------------------------------------------ the model
function model() {
  const q = new URLSearchParams(location.search), at = q.get('at'), wk = q.get('week'), d = at ? new Date(at) : new Date();
  const today = C.localYmd(Number.isFinite(d.getTime()) ? d : new Date());
  const asked = wk && /^\d{4}-\d{2}-\d{2}$/.test(wk) ? C.mondayOf(wk) : null;
  S.monday = asked || C.mondayOf(today);
  const current = S.monday === C.mondayOf(today);
  const trades = C.normTrades(S.trades), set = new Set(C.weekDays(S.monday));
  const homeHas = C.buildAccounts(S.home, null).demo === false, tradesHave = !S.forced && trades.some((t) => set.has(t.day) && t.src !== 'backtest');
  S.demo = S.forced || !(homeHas || tradesHave);
  let m, entries;
  if (S.demo) {
    const dd = C.demoData(S.fixture, S.monday) || { trades: [], entries: {}, accounts: [], money: null, hist: C.emptyHist() };
    if (!S.histInit) { S.hist = dd.hist; S.histInit = true; } entries = dd.entries;
    m = C.buildReview({ monday: S.monday, home: null, fxAccounts: dd.accounts, trades: dd.trades, entries, money: dd.money, current, demo: true });
  } else {
    if (!S.histInit) { S.hist = loadHist(); S.histInit = true; } entries = journalEntries();
    m = C.buildReview({ monday: S.monday, home: S.forced ? null : S.home, trades: S.trades, entries, money: S.moneyIdx, current });
  }
  if (!S.goalId || !C.goalById(S.goalId)) S.goalId = (S.hist.weeks[S.monday] && S.hist.weeks[S.monday].goal && S.hist.weeks[S.monday].goal.id) || m.goal.goal.id;
  m.goalChosen = C.goalById(S.goalId);
  m.goalOthers = C.GOALS.filter((g) => g.id !== S.goalId).slice(0, 3);
  S.model = m;
  return m;
}

// ------------------------------------------------------------------------------------------------ the page
const usdCls = (v) => 'it-usd ag-num ' + sign(v);

function renderHero(m) {
  $('headline').textContent = m.headline;
  $('rnote').textContent = (m.demo ? 'Example week, not real. ' : '') + (m.current ? 'The week so far (Monday to Sunday).' : 'A past week.') + ' Paper and real trades only.';
}

function renderAccounts(m) {
  const ul = $('accts'); clear(ul);
  for (const a of m.accounts) {
    const li = h('li', 'acct'); li.dataset.key = a.key; const top = h('div', 'it-top');
    top.appendChild(h('h3', '', a.name));
    top.appendChild(h('span', usdCls(a.week), C.both(a.week, a.weekR, a.weekEst)));
    li.appendChild(top);
    li.appendChild(h('p', 'it-detail', a.n ? a.n + ' trade' + (a.n === 1 ? '' : 's') + ': ' + a.wins + ' won, ' + a.losses + ' lost.' : a.from === 'home' ? 'The account reported this figure; no trade list yet (R is an estimate).' : a.has ? 'No trades this week.' : 'No numbers for this account yet.'));
    li.appendChild(h('p', 'it-detail oner', '1R on this account = ' + C.money(a.risk) + (a.est ? ' (its usual risk, an estimate)' : ' (its average losing trade)') + '. R is never added across accounts.'));
    ul.appendChild(li);
  }
  const t = h('li', 'total'); const top = h('div', 'it-top'); top.appendChild(h('h3', '', 'All accounts')); top.appendChild(h('span', usdCls(m.usd), C.moneyS(m.usd))); t.appendChild(top); ul.appendChild(t);
}

function tradeCard(label, t, none) {
  const li = h('li', 'tr'); li.dataset.kind = label.toLowerCase();
  if (!t) { li.appendChild(h('h3', '', label + ' trade')); li.appendChild(h('p', 'it-detail', none)); return li; }
  const top = h('div', 'it-top'); top.appendChild(h('h3', '', label + ': ' + t.side.toLowerCase() + ' on ' + C.dayLabel(t.day))); top.appendChild(h('span', usdCls(t.usd), C.both(t.usd, t.r))); li.appendChild(top);
  li.appendChild(h('p', 'it-detail', t.account + (t.qty ? ', ' + t.qty + ' micros' : '') + (t.exit ? ', exit ' + t.exit.toLowerCase() : '') + '.'));
  li.appendChild(h('p', 'it-detail ' + t.rule.verdict, t.rule.text));
  return li;
}
function renderTrades(m) { const ul = $('trades'); clear(ul); ul.appendChild(tradeCard('Best', m.best, 'No winning trade this week.')); ul.appendChild(tradeCard('Worst', m.worst, 'No losing trade this week.')); }

function renderDrawdown(m) {
  const ul = $('dd'); clear(ul);
  const has = m.accounts.filter((a) => a.has && a.room != null);
  if (!has.length) ul.appendChild(h('li', 'empty', 'No drawdown figures yet. They appear when the bot reports an account.'));
  for (const a of has) {
    const li = h('li', 'ddrow'); li.dataset.key = a.key;
    li.appendChild(h('h3', '', a.name));
    li.appendChild(h('p', 'it-detail', 'Drawdown used ' + C.money(a.used) + ' (' + a.usedPct + '%), left ' + C.money(a.room) + ' of ' + C.money(a.mll) + ' max loss.'));
    const f = a.room / a.mll, bar = h('div', 'ag-bar ' + (f < 0.25 ? 'red' : f < 0.5 ? 'amber' : 'green')), i = h('i'); i.style.width = Math.round(f * 100) + '%'; bar.appendChild(i);
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', Math.round(f * 100) + ' percent of the max loss is left'); li.appendChild(bar);
    ul.appendChild(li);
  }
}

function renderMachines(m) {
  const ul = $('machines'); clear(ul);
  const s = m.money.streams;
  if (!s.length) ul.appendChild(h('li', 'empty', 'No money-machine report yet. When the machines have run, their highlights show here.'));
  for (const x of s) {
    const li = h('li', 'mach'); li.dataset.id = x.id; const top = h('div', 'it-top');
    top.appendChild(h('h3', '', x.name)); top.appendChild(h('span', 'pill ' + (x.status === 'ok' ? 'ok' : x.status === 'sample' ? 'gold' : 'warn'), x.status === 'sample' ? 'sample' : x.status === 'ok' ? 'fresh' : 'old'));
    li.appendChild(top);
    if (x.headline) li.appendChild(h('p', 'it-detail', x.headline));
    if (x.base != null) li.appendChild(h('p', 'it-detail', 'Estimate: about ' + C.money(x.base) + ' a month' + (x.low != null && x.high != null ? ' (range ' + C.money(x.low) + ' to ' + C.money(x.high) + ')' : '') + '. Not a promise.'));
    ul.appendChild(li);
  }
  $('mnNote').textContent = s.length ? 'Paper ideas only. Nothing here was bought or placed.' : '';
}

function renderLessons(m) {
  const ol = $('lessons'); clear(ol);
  for (const l of m.lessons) { const li = h('li', 'lesson'); li.appendChild(h('h3', '', l.title)); li.appendChild(h('p', 'it-detail', l.text)); ol.appendChild(li); }
}

function goalRow(box, goal, week, label) {
  clear(box);
  if (!goal) { box.appendChild(h('p', '', label)); return; }
  box.appendChild(h('p', '', goal.text));
  const b = h('button', 'btn', goal.done ? 'Ticked: done' : 'Tick when done'); b.type = 'button'; b.setAttribute('aria-pressed', goal.done ? 'true' : 'false'); b.dataset.week = week;
  b.addEventListener('click', () => { S.hist = C.tickGoal(S.hist, week, !goal.done); saveHist(); render(); });
  box.appendChild(b);
}

function renderGoals(m) {
  const prevKey = C.addDays(S.monday, -7), prev = S.hist.weeks[prevKey], pg = prev && prev.goal ? { ...C.goalById(prev.goal.id), done: prev.goal.done } : null;
  goalRow($('lastGoal'), pg, prevKey, 'No goal was set last week.');
  const cur = S.hist.weeks[S.monday], cg = { ...m.goalChosen, done: !!(cur && cur.goal && cur.goal.id === m.goalChosen.id && cur.goal.done) };
  goalRow($('goal'), cg, S.monday, '');
  const chips = $('goalChips'); clear(chips);
  for (const g of m.goalOthers) { const b = h('button', 'btn', 'Instead: ' + g.text); b.type = 'button'; b.dataset.goal = g.id; b.addEventListener('click', () => { S.goalId = g.id; S.hist = C.saveWeek(S.hist, S.monday, weekRec(S.model, { id: g.id, done: false })); saveHist(); render(); }); chips.appendChild(b); }
}

function weekRec(m, goal) { return { usd: m.usd, trades: m.trades, rated: m.rated, plan: m.plan, goal }; }

function renderShare(m) {
  const prevKey = C.addDays(S.monday, -7), prev = S.hist.weeks[prevKey], lg = prev && prev.goal ? { ...C.goalById(prev.goal.id), done: prev.goal.done } : null;
  $('shareText').value = C.shareText({ ...m, goal: { goal: m.goalChosen } }, lg);
}

function renderHistory(m) {
  const ul = $('hist'), rows = C.pastWeeks(S.hist, S.monday); clear(ul);
  if (!rows.length) { ul.appendChild(h('li', 'empty', 'No past weeks saved yet. Each time you open Epilogue on a live week, it keeps that week here.')); return; }
  for (const w of rows) {
    const li = h('li', 'past'); li.dataset.week = w.week; const top = h('div', 'it-top');
    top.appendChild(h('h3', '', w.label)); top.appendChild(h('span', usdCls(w.usd), C.moneyS(w.usd)));
    li.appendChild(top);
    const g = w.goal ? C.goalById(w.goal.id) : null;
    li.appendChild(h('p', 'it-detail', w.trades + ' trade' + (w.trades === 1 ? '' : 's') + (w.rated ? ', plan followed ' + w.plan + ' of ' + w.rated : '') + (g ? '. Goal: ' + g.text + (w.goal.done ? ' (done)' : ' (not ticked)') : '.')));
    ul.appendChild(li);
  }
}

function render() {
  const m = model();
  if (m.current) { const cur = S.hist.weeks[S.monday]; if (!cur || cur.usd !== m.usd || cur.trades !== m.trades || !cur.goal || cur.goal.id !== S.goalId) { S.hist = C.saveWeek(S.hist, S.monday, weekRec(m, cur && cur.goal && cur.goal.id === S.goalId ? cur.goal : { id: S.goalId, done: false })); saveHist(); } }
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(m); renderAccounts(m); renderTrades(m); renderDrawdown(m); renderMachines(m); renderLessons(m); renderGoals(m); renderShare(m); renderHistory(m);
  say(m.headline);
  S.ready = true;
  try { window.dispatchEvent(new CustomEvent('epilogue:model', { detail: { perDay: m.perDay, traded: m.traded, usd: m.usd } })); } catch (_) { /* the scroll is optional */ }
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

$('copyBtn').addEventListener('click', async () => {
  const text = $('shareText').value, b = $('copyBtn');
  try { await navigator.clipboard.writeText(text); S.copied++; b.textContent = 'Copied. Paste it anywhere.'; }
  catch (_) { $('textBox').open = true; $('shareText').focus(); $('shareText').select(); b.textContent = 'Press and hold the text to copy'; }
});

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, tr, mi] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), S.forced ? null : getJSON('../odeon/trades.json'), S.forced ? null : getJSON('../money/index.json')]);
  S.fixture = fx; S.home = home; S.trades = tr; S.moneyIdx = mi;
  render();
}
window.EPILOGUE = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Epilogue could not start'); } catch (_) { /* nothing */ } });
