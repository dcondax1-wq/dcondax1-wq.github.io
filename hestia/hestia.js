// HESTIA page (ES module): one screen that answers "what should I do right now?". Reads home.json (the three accounts), odeon/trades.json (the bot's trades) and fixture.json (DEMO when
// the site has no accounts yet). Read only: it never sends anything and keeps nothing on the phone. Text only through textContent / createElementNS. window.HESTIA is the test hook.
import * as C from './hestiacore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const S = { fixture: null, home: null, trades: [], demo: false, forced: false, now: new Date(), open: {}, model: null, ready: false };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------------------------------------ the model
function model() {
  const q = new URLSearchParams(location.search), at = q.get('at'), d = at ? new Date(at) : new Date();
  S.now = Number.isFinite(d.getTime()) ? d : new Date();
  const built = C.buildAccounts(S.forced ? null : S.home, S.fixture);
  S.demo = built.demo;
  const sess = C.sessionState(S.now), ymd = sess.et.ymd;
  const raw = !S.demo ? C.normTrades(S.trades) : [];
  const tr = S.demo || !raw.length ? { ...C.tradesFor(C.demoTrades(S.fixture, ymd), ymd), demo: true } : { ...C.tradesFor(raw, ymd), demo: false };
  const live = S.home && S.home.live ? S.home.live : null, first = built.accounts.find((a) => a.has && a.connected != null);
  const pos = !S.demo && live && live.position ? live.position : null;
  const m = { accounts: built.accounts, sess, trades: tr, live, position: pos, connected: S.demo ? true : first ? first.connected : null, ageMin: null };
  m.advice = C.advice(m);
  S.model = m;
  return m;
}

// ------------------------------------------------------------------------------------------------ the page
function renderAnswer(m) {
  const a = m.advice;
  $('ansH').textContent = a.title; $('ansWhy').textContent = a.why; $('ansDo').textContent = a.doNow;
  const p = $('ansPill'); p.textContent = { ok: 'All calm', warn: 'Look once', bad: 'Be careful', info: 'Nothing to do' }[a.level] || 'Calm'; p.className = 'pill ' + (a.level === 'info' ? 'info' : a.level);
  $('answer').dataset.level = a.level;
}

function dayLine(sess) {
  const svg = $('line'); clear(svg);
  const X = (mod) => 10 + (mod / 1440) * 340, seg = [[0, 120, '#3a3228', 'Overnight'], [120, 480, '#c8a24a', 'London'], [480, 930, '#7f8a52', 'New York'], [930, 970, '#e0b060', 'Wind-down'], [970, 1440, '#2b251d', 'Closed']];
  for (const [a, b, fill] of seg) svg.appendChild(sv('rect', { x: X(a), y: 22, width: X(b) - X(a), height: 14, rx: 3, fill, opacity: sess.id === 'closed' ? 0.45 : 1 }));
  for (const [mod, lab] of C.MARKS) { svg.appendChild(sv('line', { x1: X(mod), x2: X(mod), y1: 18, y2: 40, stroke: '#f3ece0', 'stroke-width': 1, opacity: 0.55 })); svg.appendChild(sv('text', { x: X(mod), y: 54, 'text-anchor': 'middle', fill: '#cfc4b2', 'font-size': 11 }, lab)); }
  const nx = X(sess.et.mod);
  svg.appendChild(sv('path', { d: `M${nx - 6} 8 L${nx + 6} 8 L${nx} 19 Z`, fill: '#f3ece0' }));
  svg.setAttribute('aria-label', `New York day from midnight: London 02:00 to 08:00, New York to 15:30, flat by 16:10. It is ${sess.et.hhmm} now.`);
}

function renderClock(m) {
  const s = m.sess;
  $('clkTime').textContent = s.et.hhmm; const p = $('clkPhase'); p.textContent = s.label; p.className = 'pill ' + (s.tone === 'ok' ? 'ok' : s.tone === 'warn' ? 'warn' : s.tone === 'info' ? 'info' : '');
  $('clkNext').textContent = s.next ? `Next: ${s.nextLabel} in ${C.duration(s.mins)}.` : 'The next change is more than a week away.';
  $('clkEntries').textContent = s.entries ? 'The bot may enter a trade now (02:00 to 15:30 ET).' : 'The bot will not open a new trade now.';
  dayLine(s);
}

function acctCard(a) {
  const card = h('article', 'ag-card card acct'); card.dataset.key = a.key;
  const top = h('div', 'acct-top'), t = h('div'); t.appendChild(h('h3', '', a.name)); t.appendChild(h('p', 'note', `${a.size} · ${a.label}${a.demo ? ' · example' : ''}`));
  const hl = C.health(a), pill = h('span', 'pill ' + (hl.level === 'off' ? '' : hl.level), hl.text); top.append(t, pill); card.appendChild(top);
  if (!a.has) { card.appendChild(h('p', 'lead', 'No numbers yet. They show up as soon as the bot reports.')); return card; }
  if (a.room != null) {
    card.appendChild(h('p', 'dd ag-num', C.drawdownLine(a.room, a.mll)));
    const f = Math.max(0, Math.min(1, a.room / a.mll)), bar = h('div', 'ag-bar ' + (f < 0.25 ? 'red' : f < 0.5 ? 'amber' : 'green')), i = h('i'); i.style.width = Math.round(f * 100) + '%'; bar.appendChild(i);
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${Math.round(f * 100)} percent of the max loss is left`); card.appendChild(bar);
  } else card.appendChild(h('p', 'lead', a.stage === 'funded' ? 'Funded account: payout rules apply. Demeter shows the payout dates.' : 'Room left not reported yet.'));
  const kv = h('dl', 'kv'); const row = (k, v, cls) => { kv.appendChild(h('dt', '', k)); const dd = h('dd', cls || '', v); kv.appendChild(dd); };
  row('Today', C.both(a.today, a.risk, a.est), sign(a.today));
  if (a.stage === 'eval' && a.toTarget != null) row('To the target', `${C.money(a.toTarget)} of ${C.money(a.target)}`);
  card.appendChild(kv);
  const more = h('dl', 'kv more'); more.hidden = !S.open[a.key]; more.id = 'more-' + a.key;
  const mrow = (k, v, cls) => { more.appendChild(h('dt', '', k)); more.appendChild(h('dd', cls || '', v)); };
  mrow('This week', C.both(a.week, a.risk, a.est), sign(a.week));
  if (a.balance != null) mrow('Balance', C.money(a.balance));
  if (a.floor != null) mrow('Trailing floor', C.money(a.floor));
  mrow('Daily loss used', `${C.money(a.dllUsed)} of ${C.money(a.dll)}`);
  if (a.status) mrow('Status', a.status);
  card.appendChild(more);
  const b = h('button', 'btn', S.open[a.key] ? 'Hide details' : 'Details'); b.type = 'button'; b.setAttribute('aria-expanded', S.open[a.key] ? 'true' : 'false'); b.setAttribute('aria-controls', more.id);
  b.addEventListener('click', () => { S.open[a.key] = !S.open[a.key]; renderAccounts(S.model); });
  card.appendChild(b);
  return card;
}
function renderAccounts(m) { const box = $('accts'); clear(box); for (const a of m.accounts) box.appendChild(acctCard(a)); }

function renderToday(m) {
  const tt = C.totals(m.accounts), tr = m.trades;
  $('todayH').textContent = tr.label === 'Today' ? "Today's profit and loss" : `${tr.label}: profit and loss`;
  const tiles = $('todayTiles'); clear(tiles);
  const tile = (k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); t.appendChild(h('span', '', n)); tiles.appendChild(t); };
  tile('All accounts today', C.moneyS(tt.today), 'sum of the ' + tt.n + ' accounts', sign(tt.today));
  tile('All accounts this week', C.moneyS(tt.week), 'Monday to now', sign(tt.week));
  const list = $('tlist'); clear(list);
  if (!tr.list.length) list.appendChild(h('li', 'note', 'No trades yet. The bot trades about 2 to 4 times a week, so quiet days are normal.'));
  for (const t of tr.list.slice(0, 6)) { const li = h('li', 'trow'); li.appendChild(h('span', '', `${t.side || ''} ${t.qty ? t.qty + ' micros' : ''} · ${t.exit || 'closed'}`.trim())); li.appendChild(h('b', 'ag-num ' + sign(t.usd), `${C.moneyS(t.usd)} (${C.rOfTrade(t)})`)); list.appendChild(li); }
  $('todayNote').textContent = (tr.demo ? 'Example trades, not real. ' : '') + (tr.day ? `Day: ${tr.day}.` : '');
}

function renderBot(m) {
  $('botNext').textContent = C.botNext(m.sess, m.position, m.live);
  const kv = $('botKv'); clear(kv); const row = (k, v) => { kv.appendChild(h('dt', '', k)); kv.appendChild(h('dd', '', v)); };
  row('Trading window', '02:00 to 15:30 ET'); row('Bot flat at', '15:55 ET'); row('MFFU flat by', '16:10 ET'); row('Position', m.position ? 'Open' : 'None');
}

function render() {
  const m = model();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderAnswer(m); renderAccounts(m); renderToday(m); renderClock(m); renderBot(m);
  say(`${m.advice.title}. ${m.advice.why}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

function tick() { const m = model(); renderAnswer(m); renderClock(m); renderBot(m); say(`${m.advice.title}. ${m.advice.why}`); }

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, odeon] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), S.forced ? null : getJSON('../odeon/trades.json')]);
  S.fixture = fx; S.home = home; S.trades = odeon;
  render();
  setInterval(tick, 30000);
}
window.HESTIA = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Hestia could not start'); } catch (_) { /* nothing */ } });
