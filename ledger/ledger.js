// LEDGER page (ES module): your real money, on your phone. Loads what the site knows (../home.json, rules.json, the public Kalshi feed: read only), merges it with what you entered
// (localStorage 'ledger.v1', never sent anywhere), and writes the numbers of ledgercore.js into glass cards over the 3D vault (ledgerscene.js). Text only through textContent
// (no data ever becomes HTML). window.LG is the test hook; ?today=YYYY-MM-DD pretends it is that day (tests, screenshots).
import * as C from './ledgercore.js';
import * as SB from './scoreboardcore.js';
import * as T from '../olympus/truth.js';

const O = window.OLYMPUS || null;
const KEY = 'ledger.v1';
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const S = { st: C.emptyState(), score: null, home: null, rules: null, feed: null, fixture: null, roadmap: null, demo: false, tab: 'over', model: null, scene: null, prev: null, editing: null, filter: 'all', calMonth: null, saveOk: true, ready: false, error: null, undoTimer: 0, today: C.todayET(), clearArmed: 0 };
const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const kids = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };
function sv(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const k of Object.keys(attrs || {})) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const card = (title, ...c) => { const e = h('article', 'card'); e.setAttribute('data-oly-fx', 'glassSpecular'); if (title) e.append(h('h2', '', title)); e.append(...c.flat().filter(Boolean)); return e; };
const sign = (x) => (x > 0.004 ? 'pos' : x < -0.004 ? 'neg' : 'dim');
const kv = (rows) => { const ul = h('ul', 'kv'); for (const r of rows) { if (!r) continue; const li = h('li', r[3] || ''); li.append(h('span', 'k', r[0]), h('span', `v ${r[2] || ''}`, r[1])); ul.append(li); } return ul; };
const pct0 = (x) => `${Math.round(x * 100)}%`;
const NAMES = { kalshi: 'Kalshi bot (real money)', general: 'General (expenses, other income)' };

// an optional file that answered 404 is not asked again for 30 minutes (a browser logs every 404 as a console error): once per phone, not on every open
const wasGone = (u) => { try { const t = +localStorage.getItem('ledger.opt404.' + u); return !!t && Date.now() - t < 1800e3; } catch (_) { return false; } };
const markGone = (u) => { try { localStorage.setItem('ledger.opt404.' + u, String(Date.now())); } catch (_) { /* private mode */ } };
async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { if (wasGone(url)) return null; const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.status === 404) markGone(url); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
// the feed is this site's own copy (pc_publish puts the Kalshi bot's feed next to the pages as kalshi.json), nothing else: the old kalshi-feed
// repo on the suspended account is retired (polish2 2026-11-19). A host that answers a missing file with its index page gives HTML: not an object = none.
const SITE_FEED = '../kalshi.json';
async function getFeed(ms) { const j = await getJSON(SITE_FEED, ms); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; }
const store = {
  read() { try { return C.loadState(localStorage.getItem(KEY)); } catch (_) { return C.emptyState(); } },
  write(s) { try { localStorage.setItem(KEY, C.serialize(s)); return true; } catch (_) { return false; } },
};

// ------------------------------------------------------------------------------------------------ the numbers
function knownAccounts() {
  const home = S.home, rules = S.rules, out = [];
  const list = home && home.goals && Array.isArray(home.goals.accounts) ? home.goals.accounts : home && Array.isArray(home.accounts) ? home.accounts : [];
  for (const a of list) {
    if (!a || typeof a !== 'object' || !a.id) continue;
    const kn = rules && rules.accounts ? rules.accounts[a.id] : null;
    out.push({ id: String(a.id), name: kn ? kn.name : String(a.name || a.id), stage: String(a.stage || a.kind || ''), profit: C.num(a.profit != null ? a.profit : a.eval && a.eval.profit), status: String(a.status || '') });
  }
  return out;
}
// day-arenas 2026-11-20: the PC's other real evals (Zlarior 25K #2: only the PC's own account list has it, olympus/truth.js extraOf) get
// their fee too, at the owner's price for that plan (rules.json plans), so the Ledger's net matches Hera and the money cards ($197.80, not $134.80)
function extraFees(today) {
  const out = [];
  for (const a of S.extra || []) {
    const plan = S.rules && S.rules.plans ? S.rules.plans[a.size === '50K' ? 'builder_50k' : 'builder_25k'] : null, price = plan ? C.num(plan.price_owner) : null;
    if (price == null || price <= 0 || (S.rules && S.rules.accounts && S.rules.accounts[a.id])) continue;
    out.push({ key: `auto:fee:${a.id}`, kind: 'fee', amount: price, date: today, cat: 'Eval fees', acct: a.id, note: `${a.name} (the PC's account list, the price list's ${plan.name || a.size} price; confirm the date)`, auto: true });
  }
  return out;
}
function recalc() {
  const today = S.today, auto = C.autoEntries({ home: S.home, rules: S.rules }, today).concat(extraFees(today)), merged = C.merge(S.st, auto, today);
  let list = merged.list, feed = S.feed, known = knownAccounts();
  S.demo = S.st.entries.length === 0 && merged.auto.length === 0 && !feed && !!S.fixture;
  if (S.demo) {
    const fx = S.fixture, off = (o) => C.addDays(today, o);
    list = C.expand(fx.entries.map((e) => C.cleanEntry({ ...e, id: 'demo' + Math.abs(e.off) + e.kind, date: off(e.off) })).filter(Boolean), today);
    feed = { balance: fx.kalshi.balance, total_pnl: fx.kalshi.total_pnl, days: fx.kalshi.days.map((d) => [off(d[0]), d[1]]) };
    known = fx.accounts.map((a) => ({ id: a.id, name: a.name, stage: a.stage, profit: a.profit, status: a.status }));
  }
  const t = C.totals(list, feed, today), be = C.breakEven(list, feed, today);
  S.model = { today, list, auto: merged.auto, suppressed: merged.suppressed, feed, known, totals: t, be, accounts: C.accounts(list, feed, known), months: C.byMonth(list, feed, today, 8), burn: C.monthlyBurn(S.demo ? list.filter((e) => e.recurring).map((e) => ({ ...e, rec: { every: 'month' } })) : S.st.entries) };
}
const acctName = (id) => { const k = S.model.known.find((a) => a.id === id); return k ? k.name : NAMES[id] || id; };

// ------------------------------------------------------------------------------------------------ the hero
/** the Money plan lines inside the break-even tracker: expected cash so far (conservative first, Jan-Jun second) against the cash that really moved */
function planCheck(rv) {
  const demo = S.demo, id = 'planCheck';
  const rows = kv([['Plan said by now, cautious (estimate)', C.money(rv.expected, 0), ''], ['Plan said by now, hopeful (estimate)', C.money(rv.expectedJanJun, 0), 'dim'],
    demo ? ['Actual cash so far', 'add your first entry', 'dim'] : ['Real cash so far (payouts in, minus fees and resets)', C.moneyS(rv.actual, 0), sign(rv.actual)]]);
  rows.id = id;
  const msg = h('p', demo || rv.state === 'before' ? '' : 'strong', demo ? 'These are example numbers, so the plan check waits for your own entries.' : rv.verdict);
  msg.id = 'planCheckMsg';
  const head = h('p', 'strong', `Expected vs actual cash so far this year (the Money plan starts ${rv.start})`); head.id = 'planCheckHead';
  return [head, rows, msg];
}
function beText(be) {
  if (be.state === 'nocost') return 'No costs yet';
  if (be.state === 'paid') return 'Paid back';
  if (be.state === 'on_track') return `${be.months} month${be.months === 1 ? '' : 's'}${be.early ? ' (early guess)' : ''}`;
  if (be.state === 'stalled') return 'Not at this pace';
  return 'Too early to say';
}
function renderHero() {
  const m = S.model, t = m.totals, net = $('net');
  net.textContent = C.money(t.net);
  net.classList.toggle('neg', t.net < 0);
  const nIn = m.list.filter((e) => !e.auto).length, k = t.kalshi;
  $('netNote').textContent = S.demo ? 'Example numbers: add your first entry to start your real ledger.' : `Payouts received + other income - costs${k.basis !== 'none' ? ` + your Kalshi result` : ''}. ${m.auto.length ? `${m.auto.length} filled from the site. ` : ''}${nIn} dated ${nIn === 1 ? 'entry' : 'entries'}.`;
  const mn = $('mNet'); mn.textContent = C.moneyS(t.month.net); mn.className = sign(t.month.net);
  $('beChip').textContent = beText(m.be);
  $('demo').hidden = !S.demo; $('demoBanner').hidden = !S.demo;
  const sc = S.scene;
  if (sc) {
    sc.set({ net: t.net });
    $('coinNote').textContent = t.net > 0 ? `${sc.coins()} gold coins in the vault: 1 coin = $${sc.unit()}.` : 'No coins: the vault is empty while your net is at or below zero.';
  } else $('coinNote').textContent = '';
}

// ------------------------------------------------------------------------------------------------ the panels
/** AGORA (2026-11-09): three plain money answers at the top: how many months of costs your profit covers, how much of each dollar earned you keep, the biggest cost. */
function snapCard(m, t) {
  const earned = t.income + Math.max(0, t.kalshiAll), keep = earned > 0 ? Math.max(-1, Math.min(1, (earned - t.costs) / earned)) : null;
  const cover = m.burn > 0 && t.net > 0 ? t.net / m.burn : null;
  let big = null; for (const [cat, v] of Object.entries(t.byCat || {})) if (v < 0 && (!big || v < big[1])) big = [cat, v];
  const tile = (k, v, note, cls) => { const d = h('div', 'snapt'); d.append(h('span', 'ag-cap', k), h('b', 'ag-money ' + (cls || ''), v), h('small', 'ag-cap', note)); return d; };
  const grid = h('div', 'snap');
  grid.append(
    tile('Costs covered', cover == null ? '-' : `${cover >= 10 ? Math.round(cover) : cover.toFixed(1)} mo`, cover == null ? (m.burn > 0 ? 'Earn a profit to cover your repeating costs.' : 'No repeating costs recorded.') : `of your ${C.money(m.burn, 0)} a month in repeating costs`, cover != null ? 'pos' : ''),
    tile('You keep', keep == null ? '-' : `${Math.round(keep * 100)}c`, keep == null ? 'Add income to see this.' : 'of every $1 you earned, after costs', keep != null && keep < 0 ? 'neg' : 'pos'),
    tile('Biggest cost', big ? C.money(-big[1], 0) : '-', big ? big[0] : 'No costs yet', big ? 'neg' : ''));
  return card('Your money in three numbers', grid);
}
/** the Scoreboard (2026-11-13): the site's money/scoreboard.json (tools/money_scoreboard.py) = every money source in one place, read only, with ages */
function scoreCard() {
  const v = SB.view(S.score, Date.now() / 1000), title = 'Every money source, in real $';
  if (!v.ok) { const c = card(title, h('p', '', v.text)); c.id = 'score'; return c; }
  const tile = (x) => { const d = h('div', 'snapt'); d.append(h('span', 'ag-cap', x.k), h('b', 'ag-money ' + x.cls, x.v), h('small', 'ag-cap', x.note)); return d; };
  const grid = h('div', 'snap'); grid.append(...v.tiles.map(tile));
  const src = h('ul', 'kv sbsrc');
  for (const s of v.sources) {
    const li = h('li'), k = h('span', 'k'), val = h('span', 'v');
    k.append(document.createTextNode(s.name), h('small', '', s.note));
    val.append(h('span', 'chip ' + s.chip, s.status), h('small', '', s.age));
    li.append(k, val); src.append(li);
  }
  const notes = v.bySource.filter((r) => r[3]).map((r) => h('p', '', `${r[0]}: ${r[3]}`));
  const c = card(title, h('p', 'strong', 'Only real cash counts here. Paper (practice) results and estimates are shown but not added in.'), grid,
    kv(v.rows), h('p', '', v.nextText),
    h('h3', '', 'By source (cash)'), kv(v.bySource.map((r) => [r[0], r[1], r[2]])), ...notes,
    v.paper.length ? h('h3', '', 'On paper (not cash)') : null, v.paper.length ? kv(v.paper) : null,
    h('h3', '', 'Sources and how old they are'), src,
    v.missing ? h('p', 'warn', v.missing) : null, v.stale ? h('p', 'warn', 'This scoreboard is more than 36 hours old: the site has not been rebuilt since.') : null,
    h('p', '', v.foot));
  c.id = 'score';
  return c;
}
function overView() {
  const m = S.model, t = m.totals, k = t.kalshi, be = m.be, out = [];
  out.push(snapCard(m, t));
  out.push(scoreCard());
  out.push(card('Where the money went', kv([
    ['Payouts received', C.money(t.byKind.payout_in || 0), 'pos'], ['Other income', C.money(t.byKind.income || 0), 'pos'],
    ['Eval fees', C.money(-(t.byKind.fee || 0)), 'neg'], ['Resets and activation', C.money(-((t.byKind.reset || 0) + (t.byKind.activation || 0))), 'neg'],
    ['Expenses', C.money(-(t.byKind.expense || 0)), 'neg'], k.basis !== 'none' ? ['Kalshi result', C.moneyS(k.result), sign(k.result)] : null,
    ['Net profit', C.moneyS(t.net), sign(t.net), 'tot'],
  ]), h('p', '', 'Only money that really moved counts. A payout asked for but not in your bank yet is pending. Eval profit is not cash until MFFU pays it.'),
  t.pending > 0 ? h('p', 'strong', `Pending payouts: ${C.money(t.pending)} requested, not received yet.`) : null));
  const paid = t.costs > 0 ? Math.max(0, Math.min(1, (t.income + Math.max(0, t.kalshiAll)) / t.costs)) : 1;
  const bar = h('div', 'bar'), fill = h('i'); fill.style.width = pct0(paid); bar.append(fill);
  const lines = [];
  if (be.state === 'paid') lines.push(`Everything is paid back with ${C.money(be.surplus)} to spare.`);
  else if (be.state === 'nocost') lines.push('No costs recorded yet, so there is nothing to pay back.');
  else if (be.state === 'on_track') lines.push(`At the pace of your last ${Math.min(3, be.monthsOfData)} full month${be.monthsOfData === 1 ? '' : 's'} (${C.moneyS(be.rate)} a month) you are ${be.months} month${be.months === 1 ? '' : 's'} from paying back the ${C.money(be.deficit)} still open.`);
  else if (be.state === 'stalled') lines.push(`You still need ${C.money(be.deficit)}, and at the pace of your recent months (${C.moneyS(be.rate)} a month) you do not get there.`);
  else lines.push(`${C.money(be.deficit == null ? 0 : be.deficit)} still to pay back. There are not enough full months yet to give a pace.`);
  const rv = S.roadmap ? C.roadmapVsActual(m.list, S.roadmap, m.today) : null, planLines = rv ? planCheck(rv) : [];
  out.push(card('Break-even tracker', h('p', 'strong', `${C.money(t.income + Math.max(0, t.kalshiAll))} back of ${C.money(t.costs)} spent (${pct0(paid)})`), bar, ...lines.map((x) => h('p', '', x)),
    h('p', 'warn', be.early ? `Only ${be.monthsOfData} full month${be.monthsOfData === 1 ? '' : 's'} of data: treat this as a rough guess, not a forecast.` : 'A pace from the recent past, not a promise. Payouts come in lumps; one month can swing it.'), ...planLines));
  const mo = t.month;
  out.push(card('This month', kv([['Income', C.money(mo.income), 'pos'], ['Costs', C.money(-mo.costs), 'neg'], k.basis !== 'none' ? ['Kalshi (bot days)', C.moneyS(mo.kalshi), sign(mo.kalshi)] : null, ['Net', C.moneyS(mo.net), sign(mo.net), 'tot'],
    m.burn > 0 ? ['Repeating costs a month', C.money(-m.burn), 'neg'] : null])));
  if (m.auto.length) {
    const ul = h('ul', 'list');
    for (const a of m.auto) {
      const li = h('li'), row = h('div', 'erow'); row.style.gridTemplateColumns = 'minmax(0,1fr) auto';
      const tt = h('div', 't'); tt.append(document.createTextNode(`${a.note.split(' (')[0]}: ${C.money(-a.amount)}`), h('small', '', `${a.date} · from the site, confirm the date`));
      const bt = h('div', 'row2'); bt.style.marginTop = '0';
      const keep = h('button', 'btn sm gold', 'Keep'); keep.type = 'button'; keep.dataset.act = 'keep'; keep.dataset.key = a.key;
      const hide = h('button', 'btn sm', 'Not mine'); hide.type = 'button'; hide.dataset.act = 'hide'; hide.dataset.key = a.key;
      bt.append(keep, hide); row.append(tt, bt); li.append(row); ul.append(li);
    }
    out.push(card('Added for you from the site', h('p', '', 'The site knows these accounts and your real prices, so they count already. Keep = make it yours (then edit). Not mine = hide it.'), ul));
  }
  const up = C.upcoming(S.st.entries, m.today, 30);
  if (up.length) out.push(card('Coming up (30 days)', kv(up.slice(0, 6).map((e) => [`${e.date} · ${e.note || e.cat}`, C.money(C.KINDS[e.kind].dir < 0 ? -e.amount : e.amount), C.KINDS[e.kind].dir < 0 ? 'neg' : 'pos']))));
  return out;
}
function acctView() {
  const m = S.model, out = [];
  for (const a of m.accounts) {
    const e = h('article', 'card'); e.setAttribute('data-oly-fx', 'glassSpecular');
    const head = h('h2', '', acctName(a.id)); e.append(head);
    const chips = h('p'); chips.append(Object.assign(h('span', `chip ${a.payback === 'paid back' ? 'ok' : a.payback === 'partly paid back' ? 'warn' : a.payback === 'no cost yet' ? 'info' : 'bad'}`, a.payback.toUpperCase())));
    if (a.stage) chips.append(document.createTextNode(' '), h('span', 'chip info', `${a.stage}${a.status ? ' · ' + a.status : ''}`.toUpperCase()));
    e.append(chips);
    const rows = [['Cost to date', C.money(-a.cost), a.cost ? 'neg' : 'dim'], a.fees ? ['  eval fees', C.money(-a.fees), 'dim'] : null, a.resets ? ['  resets', C.money(-a.resets), 'dim'] : null, a.activation ? ['  activation', C.money(-a.activation), 'dim'] : null, a.expenses ? ['  expenses', C.money(-a.expenses), 'dim'] : null,
      ['Payouts received', C.money(a.payouts), a.payouts ? 'pos' : 'dim'], a.pending ? ['Payouts requested, waiting', C.money(a.pending), 'dim'] : null, a.income ? ['Other income', C.money(a.income), 'pos'] : null];
    if (a.id === 'kalshi' && a.kalshi) {
      const k = a.kalshi;
      rows.push(['Put in (deposits)', C.money(k.deposits), 'dim'], ['Taken out', C.money(k.withdrawals), 'dim'], k.balance != null ? ['Balance now', C.money(k.balance), ''] : null, k.result != null ? ['Result', C.moneyS(k.result), sign(k.result)] : null);
    }
    rows.push(['Net so far', C.moneyS(a.net), sign(a.net), 'tot']);
    e.append(kv(rows));
    if (a.id === 'kalshi' && a.kalshi) e.append(h('p', '', a.kalshi.basis === 'balance' ? 'Result = balance + what you took out - what you put in.' : a.kalshi.basis === 'bot' ? 'No deposits recorded, so this is the bot\'s own total P&L from its public feed. Add your deposits and withdrawals for the real result.' : 'No Kalshi data yet.'));
    if (a.sim != null && a.id !== 'kalshi') e.append(h('p', '', `Simulated eval P&L ${C.moneyS(a.sim)}: performance on the account, not cash. Cash is what MFFU pays you.`));
    if (a.togo > 0 && a.cost > 0) e.append(h('p', 'strong', `${C.money(a.togo)} to pay back.`));
    out.push(e);
  }
  if (!out.length) out.push(card('Accounts', h('p', '', 'No accounts yet. Add an eval fee or a payout and the account appears here.')));
  return out;
}
function barsChart(rows) {
  const W = 340, H = 170, padL = 6, padB = 22, n = rows.length, bw = (W - padL * 2) / n;
  const up = rows.map((r) => r.income + Math.max(0, r.kalshi)), dn = rows.map((r) => r.costs + Math.max(0, -r.kalshi)), cum = rows.map((r) => r.cum);
  const hi = Math.max(1, ...up, ...cum), lo = Math.min(0, ...cum, ...dn.map((x) => -x)), sc = (v) => 8 + (hi - v) / (hi - lo || 1) * (H - padB - 14);
  const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Each month: $ in, $ out, running total' });
  svg.append(sv('line', { x1: padL, x2: W - padL, y1: sc(0), y2: sc(0), stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1 }));
  rows.forEach((r, i) => {
    const x = padL + i * bw + bw * 0.18, w = bw * 0.64;
    if (up[i] > 0) svg.append(sv('rect', { x, y: sc(up[i]), width: w / 2 - 1, height: Math.max(1, sc(0) - sc(up[i])), rx: 2, fill: '#7f8a52' }, null));
    if (dn[i] > 0) svg.append(sv('rect', { x: x + w / 2, y: sc(0), width: w / 2 - 1, height: Math.max(1, sc(-dn[i]) - sc(0)), rx: 2, fill: '#c96a4a' }));
    svg.append(sv('text', { x: padL + i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle' }, C.monthName(r.ym)));
  });
  svg.append(sv('polyline', { points: rows.map((r, i) => `${padL + i * bw + bw / 2},${sc(r.cum)}`).join(' '), fill: 'none', stroke: '#c8a24a', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  rows.forEach((r, i) => svg.append(sv('circle', { cx: padL + i * bw + bw / 2, cy: sc(r.cum), r: 2.6, fill: '#c8a24a' })));
  return svg;
}
function heatChart(map, today) {
  const weeks = 14, cell = 20, gap = 2, W = weeks * (cell + gap), H = 7 * (cell + gap) + 14;
  const wd = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;                     // Monday = 0
  const start = C.addDays(today, -(weeks * 7 - 1) + (6 - wd));
  const max = Math.max(1, ...Object.values(map).map((v) => Math.abs(v)));
  const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Each day: green = more in, red = more out' });
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const date = C.addDays(start, w * 7 + d);
    if (date > today) continue;
    const v = map[date], a = v == null ? 0.07 : 0.25 + 0.75 * Math.min(1, Math.abs(v) / max);
    const r = sv('rect', { x: w * (cell + gap), y: 12 + d * (cell + gap), width: cell, height: cell, rx: 4, fill: v == null ? 'rgba(255,255,255,0.07)' : v > 0 ? `rgba(127,138,82,${a})` : `rgba(255,90,102,${a})`, 'data-date': date });
    r.append(sv('title', {}, `${date}: ${v == null ? 'nothing' : C.moneyS(v)}`)); svg.append(r);
  }
  ['M', 'W', 'F'].forEach((l, i) => svg.append(sv('text', { x: 0, y: 8, opacity: 0 }, l)));
  return svg;
}
function calGrid(month, m) {
  const pay = C.payouts(m.list, S.rules, m.today), up = C.upcoming(S.st.entries, m.today, 400);
  const first = month + '-01', wd = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7, dim = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const g = h('div', 'cal');
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => g.append(h('b', '', d)));
  for (let i = 0; i < wd; i++) g.append(h('span'));
  for (let d = 1; d <= dim; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`, c = h('span', '', d);
    const rq = pay.requested.filter((e) => e.date === date), gt = pay.received.filter((e) => e.date === date);
    if (gt.length) c.classList.add('got'); else if (rq.length) c.classList.add('req');
    if (date === m.today) c.classList.add('today');
    if (up.some((e) => e.date === date)) c.classList.add('rec');
    c.title = [...rq.map((e) => `requested ${C.money(e.amount, 0)}`), ...gt.map((e) => `received ${C.money(e.amount, 0)}`)].join(', ');
    g.append(c);
  }
  return g;
}
function cashView() {
  const m = S.model, t = m.totals, out = [];
  const leg = h('div', 'legend'); [['#7f8a52', 'money in'], ['#c96a4a', 'money out'], ['#c8a24a', 'running total']].forEach(([c, l]) => { const s = h('span'); const i = h('i'); i.style.background = c; s.append(i, document.createTextNode(l)); leg.append(s); });
  out.push(card('Monthly waterfall', barsChart(m.months), leg, h('p', '', 'Each month: what came in, what went out, and the running total of your net profit. Kalshi counts by the bot\'s own daily results.')));
  const map = C.daily(m.list, m.feed, C.addDays(m.today, -98), m.today);
  out.push(card('Cash flow by day', heatChart(map, m.today), h('p', '', 'Green = more came in than went out that day, red = the opposite. Empty = nothing happened. Last 14 weeks.')));
  // the payout calendar
  const cm = S.calMonth || C.ym(m.today), pay = C.payouts(m.list, S.rules, m.today);
  const nav = h('div', 'mnav'), prev = h('button', 'btn sm', '‹'), next = h('button', 'btn sm', '›'), lab = h('b', '', `${C.monthName(cm).replace("'", '20')}`.replace(/(\w{3}) 20(\d\d)/, (a, b, c) => `${b} 20${c}`));
  prev.type = 'button'; prev.dataset.act = 'cal'; prev.dataset.d = '-1'; prev.setAttribute('aria-label', 'Previous month'); next.type = 'button'; next.dataset.act = 'cal'; next.dataset.d = '1'; next.setAttribute('aria-label', 'Next month'); nav.append(prev, lab, next);
  const pc = card('Payout calendar', nav, calGrid(cm, m), h('div', 'legend', null));
  const lg2 = pc.lastChild; for (const [c, l] of [['rgba(224, 176, 96,.6)', 'requested'], ['rgba(224, 176, 96,.6)', 'received'], ['rgba(75, 122, 153,.8)', 'a repeating cost is due']]) { const s = h('span'); const i = h('i'); i.style.background = c; s.append(i, document.createTextNode(l)); lg2.append(s); }
  if (pay.pending.length) pc.append(kv(pay.pending.map((p) => [`${acctName(p.acct)} · asked ${p.date}`, `${C.money(p.amount)} · waiting ${p.waiting} day${p.waiting === 1 ? '' : 's'}`, p.waiting > 7 ? 'neg' : ''])), h('p', '', 'MFFU\'s payout time is not in the rulebook, so Ledger only shows how long each request has waited. Check your MFFU dashboard if it feels long.'));
  else pc.append(h('p', '', pay.requested.length ? 'No payout is waiting: every request has a matching payout received.' : 'No payout requested yet.'));
  const plans = pay.plans;
  if (plans.length) {
    const sel = h('select'); sel.id = 'calcPlan'; sel.setAttribute('aria-label', 'Plan'); plans.forEach((p, i) => { const o = h('option', '', p.name); o.value = String(i); sel.append(o); });
    const inp = h('input'); inp.id = 'calcAmt'; inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = 'Request amount'; inp.setAttribute('aria-label', 'Payout request amount');
    const res = h('p', 'strong'); res.id = 'calcOut'; res.textContent = 'Type an amount to see what you would receive.';
    const upd = () => { const r = C.payoutMath(inp.value, plans[+sel.value]); res.textContent = r ? `Request ${C.money(r.request)} → you receive about ${C.money(r.receive)} (${Math.round(r.split * 100)}% split, ${C.money(r.kept)} stays with MFFU).${r.warn ? ' ' + r.warn : ''}` : 'Type an amount to see what you would receive.'; };
    inp.addEventListener('input', upd); sel.addEventListener('change', upd);
    const ir = h('div', 'input-row'); ir.append(sel, inp);
    pc.append(h('h3', '', 'MFFU payout rules'), kv(plans.flatMap((p) => [[`${p.name}: request`, `${C.money(p.min, 0)} to ${C.money(p.max, 0)}`], [`${p.name}: split`, `${Math.round(p.split * 100)}% to you`], [`${p.name}: cycle`, `every ${p.cycle_days} days, at most ${p.max_payouts} sim payouts`], [`${p.name}: buffer`, `${C.money(p.buffer, 0)} above start`]])), ir, res,
      h('p', '', 'Rules are MFFU\'s as read from its help pages on 2026-10-18 (one-time plans). They change: check MFFU before you request.'));
  }
  out.push(pc);
  return out;
}
function taxView() {
  const m = S.model, x = C.tax(m.list, m.feed, S.st.settings.taxPct, m.today), out = [];
  const inp = h('input'); inp.id = 'taxPct'; inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = String(S.st.settings.taxPct); inp.setAttribute('aria-label', 'Tax set-aside percent');
  const ir = h('div', 'input-row'); ir.append(h('span', 'dim', 'Set aside'), inp, h('span', 'dim', '% of net profit'));
  out.push(card(`Tax set-aside, ${x.year}`, kv([['Income this year', C.money(x.income), 'pos'], ['Costs this year', C.money(-x.costs), 'neg'], m.feed ? ['Kalshi this year', C.moneyS(x.kalshi), sign(x.kalshi)] : null, ['Net profit this year', C.moneyS(x.base), sign(x.base), 'tot'],
    [`Set aside (${x.pct}%)`, C.money(x.setAside), ''], ['Tax you recorded as paid', C.money(x.paid), 'dim'], ['Still to set aside', C.money(x.left), x.left > 0 ? 'neg' : 'pos', 'tot']]), ir,
    x.losing ? h('p', '', 'You are below zero this year, so nothing is set aside. Losses may matter for your taxes: ask an accountant.') : null));
  out.push(card('By quarter', kv(x.quarters.map((q) => [`Q${q.q}`, C.moneyS(q.net), sign(q.net)])), h('p', '', 'Estimated tax in some countries is paid by quarter. This only shows your net profit in each quarter.')));
  out.push(card('Not tax advice', h('p', 'warn', 'This is an estimate from the numbers you entered, with a rate you choose. It is NOT tax advice. How payouts, fees, expenses and Kalshi results are taxed depends on where you live and on your situation; some costs may not be deductible. Ask an accountant before you rely on it.'),
    h('div', 'row2')));
  const b = h('button', 'btn gold', 'Download CSV for my accountant'); b.type = 'button'; b.dataset.act = 'csv'; out[out.length - 1].lastChild.append(b);
  const r = h('button', 'btn', 'Record a tax payment'); r.type = 'button'; r.dataset.act = 'addtax'; out[out.length - 1].lastChild.append(r);
  return out;
}
const FILTERS = { all: 'All', fees: 'Fees', payouts: 'Payouts', expenses: 'Expenses', kalshi: 'Kalshi', tax: 'Tax' };
const FKINDS = { fees: ['fee', 'reset', 'activation'], payouts: ['payout_in', 'payout_req'], expenses: ['expense', 'income'], kalshi: ['deposit', 'withdrawal'], tax: ['tax'] };
function listView() {
  const out = [], f = S.filter, st = S.st;
  const fl = h('div', 'filters');
  for (const k of Object.keys(FILTERS)) { const b = h('button', '', FILTERS[k]); b.type = 'button'; b.dataset.act = 'filter'; b.dataset.f = k; b.setAttribute('aria-pressed', String(f === k)); fl.append(b); }
  const ul = h('ul', 'list');
  const rows = S.demo ? [] : st.entries.filter((e) => f === 'all' || FKINDS[f].indexOf(e.kind) >= 0).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  for (const e of rows) {
    const li = h('li'), b = h('button', 'erow'); b.type = 'button'; b.dataset.act = 'edit'; b.dataset.id = e.id;
    const k = C.KINDS[e.kind], d = k.dir;
    const t = h('div', 't'); t.append(document.createTextNode(`${k.label}${e.cat && e.cat !== k.cat ? ' · ' + e.cat : ''}`), h('small', '', `${acctName(e.acct)}${e.note ? ' · ' + e.note : ''}${e.rec ? ' · repeats every ' + e.rec.every : ''}`));
    b.append(h('div', 'd', e.date.slice(5)), t, h('div', `a ${d > 0 ? 'pos' : d < 0 ? 'neg' : 'dim'}`, `${d < 0 ? '-' : d > 0 ? '+' : ''}${C.money(e.amount)}`));
    li.append(b); ul.append(li);
  }
  const body = [fl];
  if (S.demo) body.push(h('p', 'strong', 'These are example numbers, so there is nothing to edit. Tap the gold + to add your first real entry.'));
  else if (!rows.length) body.push(h('p', '', st.entries.length ? 'Nothing under this filter.' : 'No entries yet. Tap the gold + to add one.'));
  else body.push(ul);
  out.push(card('Your entries', ...body));
  const a = h('article', 'card'); a.setAttribute('data-oly-fx', 'glassSpecular'); a.append(h('h2', '', 'Your data'));
  a.append(h('p', '', `Kept on this phone only (${st.entries.length} ${st.entries.length === 1 ? 'entry' : 'entries'}). Export it to keep a copy or to move it to another phone; import adds the entries from a file you exported.`));
  const rw = h('div', 'row2');
  for (const [act, label, cls] of [['json', 'Export JSON', 'btn gold'], ['import', 'Import JSON', 'btn'], ['csv', 'CSV for my accountant', 'btn'], ['clear', S.clearArmed ? 'Tap again to clear everything' : 'Clear everything', 'btn']]) { const b = h('button', cls, label); b.type = 'button'; b.dataset.act = act; rw.append(b); }
  a.append(rw, h('p', '', 'Clear everything can be undone for a few seconds. Auto entries from the site are not stored here: they come back from the site.'));
  out.push(a);
  return out;
}
const VIEWS = { over: ['p-over', overView], acct: ['p-acct', acctView], cash: ['p-cash', cashView], tax: ['p-tax', taxView], list: ['p-list', listView] };
function renderPanels() { for (const k of Object.keys(VIEWS)) { const [id, fn] = VIEWS[k]; const el = $(id); if (!el.hidden || k === S.tab) kids(el, fn()); } }
function renderAll() { recalc(); renderHero(); renderPanels(); postCard(); }
function setTab(k) {
  if (!VIEWS[k]) k = 'over';
  S.tab = k;
  document.querySelectorAll('#tabs button').forEach((b) => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  for (const key of Object.keys(VIEWS)) $(VIEWS[key][0]).hidden = key !== k;
  kids($(VIEWS[k][0]), VIEWS[k][1]());
  try { history.replaceState(null, '', k === 'over' ? location.pathname + location.search : '#' + k); } catch (_) { /* framed */ }
}

// ------------------------------------------------------------------------------------------------ changes with Undo
function toast(text, undo) {
  const t = $('toast'); $('toastText').textContent = text; $('toastUndo').hidden = !undo; t.hidden = false;
  clearTimeout(S.undoTimer); S.undoTimer = setTimeout(() => { t.hidden = true; S.prev = null; }, 15000);
}
function commit(next, msg, burst) {
  if (!next) return false;
  S.prev = S.st; S.st = next; S.saveOk = store.write(next);
  $('foot').textContent = S.saveOk ? 'What you enter stays on this phone. Ledger reads the site\'s accounts file and the public Kalshi feed; it never sends anything.' : 'Could not save on this phone (private browsing or no space). Export your ledger now or it will be lost when you close the page.';
  renderAll();
  if (burst && S.scene) S.scene.burst(burst);
  toast(msg, true);
  return true;
}
function undo() {
  if (!S.prev) return;
  S.st = S.prev; S.prev = null; S.saveOk = store.write(S.st);
  $('toast').hidden = true; clearTimeout(S.undoTimer); renderAll();
}

// ------------------------------------------------------------------------------------------------ the quick add / edit sheet
function fillSelect(sel, opts, val) { sel.replaceChildren(...opts.map(([v, l]) => { const o = h('option', '', l); o.value = v; return o; })); if (val != null) sel.value = val; }
function accountOptions() {
  const m = S.model, ids = [];
  const add = (id) => { if (id && ids.indexOf(id) < 0) ids.push(id); };
  (S.demo ? [] : m.known).forEach((a) => add(a.id)); S.st.entries.forEach((e) => add(e.acct)); add('kalshi'); add('general');
  return ids.map((id) => [id, acctName(id)]);
}
function catOptions(kind) { return kind === 'expense' ? C.EXPENSE_CATS.map((c) => [c, c]) : [[C.KINDS[kind].cat, C.KINDS[kind].cat]]; }
function defaultAcct(kind) {
  if (kind === 'deposit' || kind === 'withdrawal') return 'kalshi';
  if (kind === 'expense' || kind === 'income' || kind === 'tax') return 'general';
  const k = (S.demo ? [] : S.model.known).find((a) => a.id !== 'kalshi');
  return k ? k.id : 'general';
}
function openSheet(entry, preset) {
  S.editing = entry ? entry.id : null;
  const e = entry || { kind: (preset && preset.kind) || 'expense', amount: '', date: S.today, cat: '', acct: '', note: '', rec: null };
  $('sheetTitle').textContent = entry ? 'Edit entry' : 'Add';
  fillSelect($('fKind'), C.KIND_ORDER.map((k) => [k, C.KINDS[k].label]), e.kind);
  fillSelect($('fCat'), catOptions(e.kind), e.cat || catOptions(e.kind)[0][0]);
  fillSelect($('fAcct'), accountOptions(), e.acct || defaultAcct(e.kind));
  $('fAmount').value = e.amount === '' ? '' : String(e.amount); $('fDate').value = e.date; $('fNote').value = e.note || '';
  $('fRec').value = e.rec ? e.rec.every : ''; $('fUntil').value = e.rec && e.rec.until ? e.rec.until : '';
  $('more').open = !!(entry && (e.note || e.rec || e.cat !== C.KINDS[e.kind].cat));
  $('fErr').hidden = true; $('fDelete').hidden = !entry; $('sheet').hidden = false;
  setTimeout(() => { try { $('fAmount').focus(); } catch (_) { /* hidden */ } }, 50);
}
function closeSheet() { $('sheet').hidden = true; S.editing = null; }
function formEntry() {
  const amount = C.num($('fAmount').value), date = $('fDate').value, kind = $('fKind').value, every = $('fRec').value, until = $('fUntil').value;
  const err = (m) => { const el = $('fErr'); el.textContent = m; el.hidden = false; return null; };
  if (amount == null || amount <= 0) return err('Enter an amount above zero, like 91.80.');
  if (!C.isDate(date)) return err('Pick a date.');
  if (every && until && until < date) return err('"Until" is before the date.');
  return { kind, amount, date, cat: $('fCat').value, acct: $('fAcct').value, note: $('fNote').value, rec: every ? { every, until: until || null } : null };
}
function save(ev) {
  ev.preventDefault();
  const e = formEntry();
  if (!e) return;
  const next = S.editing ? C.updateEntry(S.st, S.editing, e) : C.addEntry(S.st, e);
  if (!next) { const el = $('fErr'); el.textContent = 'That entry could not be saved.'; el.hidden = false; return; }
  const burst = !S.editing && e.kind === 'payout_in' ? Math.min(60, Math.round(e.amount / 25)) : 0;
  closeSheet();
  commit(next, S.editing ? 'Saved' : `Added ${C.KINDS[e.kind].label.toLowerCase()} ${C.money(e.amount)}`, burst);
}

// ------------------------------------------------------------------------------------------------ downloads and import
function download(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type })), a = h('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
  } catch (_) { return false; }
}
function doCSV() { const m = S.model; if (S.demo) { toast('These are example numbers: add your first entry first.', false); return; } download(`ledger-${m.today}.csv`, C.toCSV(m.list), 'text/csv'); toast('CSV downloaded (every dated entry, with the site\'s auto entries marked).', false); }
function doJSON() { if (S.demo) { toast('Nothing to export yet: these are example numbers.', false); return; } const ok = download(`ledger-${S.model.today}.json`, C.exportJSON(S.st), 'application/json'); if (ok) { S.st = C.markExported(S.st, Date.now()); S.saveOk = store.write(S.st); } toast('Exported. Keep the file safe: it is your whole ledger.', false); }
function doImport() {
  let inp = $('importFile');
  if (!inp) { inp = h('input'); inp.type = 'file'; inp.id = 'importFile'; inp.accept = '.json,application/json'; inp.hidden = true; inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; if (!f) return; try { importText(await f.text()); } catch (_) { toast('Could not read that file.', false); } inp.value = ''; }); document.body.append(inp); }
  inp.click();
}
function importText(text) {
  const r = C.importJSON(text, S.st, 'merge');
  if (!r.ok) { toast(r.error, false); return r; }
  commit(r.state, `Imported ${r.added} ${r.added === 1 ? 'entry' : 'entries'}${r.skipped ? `, skipped ${r.skipped}` : ''}`);
  return r;
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card2() {
  const m = S.model, t = m.totals;
  return { v: 1, name: 'Ledger', status: { level: S.demo ? 'off' : t.net >= 0 ? 'ok' : 'warn', label: S.demo ? 'Demo data' : `Net ${C.moneyS(t.net, 0)}` },
    kpis: [{ label: 'Net all time', value: C.moneyS(t.net, 0) }, { label: 'This month', value: C.moneyS(t.month.net, 0) }, { label: 'Break-even', value: beText(m.be) }],
    lines: [`Costs ${C.money(t.costs, 0)}, income ${C.money(t.income, 0)}${t.pending ? `, pending payouts ${C.money(t.pending, 0)}` : ''}.`.slice(0, 120), 'Your real money, kept on this phone. Not tax advice.'],
    t: Math.floor(Date.now() / 1000), open: '#over', theme: '#13100d', stale_after: 604800 };
}
function postCard() {
  if (S.demo || !O || !O.framed || !S.model) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card2() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io')); } catch (_) { /* not inside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    const { createVault } = await import('./ledgerscene.js');
    S.scene = createVault($('vault'), { O });
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}
function wire() {
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('tabs').addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const ks = Object.keys(VIEWS), i = ks.indexOf(S.tab), n = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]; setTab(n); $('t-' + n).focus(); });
  $('add').addEventListener('click', () => openSheet(null, { kind: S.tab === 'tax' ? 'tax' : 'expense' }));
  $('sheetClose').addEventListener('click', closeSheet);
  $('form').addEventListener('submit', save);
  $('fKind').addEventListener('change', () => { const k = $('fKind').value; fillSelect($('fCat'), catOptions(k), catOptions(k)[0][0]); if (!S.editing) $('fAcct').value = defaultAcct(k); });
  $('fDelete').addEventListener('click', () => { const id = S.editing, e = S.st.entries.find((x) => x.id === id); if (!e) return; closeSheet(); commit(C.removeEntry(S.st, id), `Deleted ${C.KINDS[e.kind].label.toLowerCase()} ${C.money(e.amount)}`); });
  $('toastUndo').addEventListener('click', undo);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'taxPct') { const v = C.num(e.target.value); if (v != null) { const next = { ...S.st, settings: { ...S.st.settings, taxPct: Math.min(60, Math.max(0, v)) } }; S.st = next; S.saveOk = store.write(next); renderAll(); } }
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'edit') { const en = S.st.entries.find((x) => x.id === b.dataset.id); if (en) openSheet(en); }
    else if (a === 'filter') { S.filter = b.dataset.f; kids($('p-list'), listView()); }
    else if (a === 'keep') { const au = S.model.auto.find((x) => x.key === b.dataset.key); if (au) commit(C.keepAuto(S.st, au), `Kept: ${au.note.split(' (')[0]}`); }
    else if (a === 'hide') commit(C.hideAuto(S.st, b.dataset.key), 'Hidden: it will not count');
    else if (a === 'cal') { const cm = S.calMonth || C.ym(S.model.today); S.calMonth = C.ym(C.addMonths(cm + '-01', +b.dataset.d)); kids($('p-cash'), cashView()); }
    else if (a === 'json') doJSON();
    else if (a === 'csv') doCSV();
    else if (a === 'import') doImport();
    else if (a === 'addtax') openSheet(null, { kind: 'tax' });
    else if (a === 'clear') {
      if (!S.clearArmed) { S.clearArmed = 1; kids($('p-list'), listView()); setTimeout(() => { S.clearArmed = 0; if (S.tab === 'list') kids($('p-list'), listView()); }, 4000); }
      else { S.clearArmed = 0; commit(C.emptyState(), 'Everything cleared'); }
    }
  });
  const route = () => { const t = location.hash.slice(1); if (VIEWS[t]) setTab(t); };
  addEventListener('hashchange', route);
  return route;
}

async function main() {
  const p = new URLSearchParams(location.search), t = p.get('today');
  if (t && C.isDate(t)) S.today = t;
  S.st = store.read();
  const [home, rules, feed, fixture, roadmap, score] = await Promise.all([getJSON('../home.json'), getJSON('rules.json'), getFeed(7000), getJSON('fixture.json'), getJSON('../plutus/roadmap.json'), getJSON('../money/scoreboard.json')]);
  S.score = SB.ok(score) ? score : null;     // the Scoreboard card (read only); without the file the card says so
  S.roadmap = C.roadmapOk(roadmap) ? roadmap : null;       // the Money plan (read only); without it the tracker is as before
  S.home = home && typeof home === 'object' ? home : null; S.rules = rules && rules.plans ? rules : null; S.fixture = fixture && Array.isArray(fixture.entries) ? fixture : null;
  S.feed = feed && feed.kind === 'kalshi' ? feed : null;
  const route = wire();
  recalc();
  const scene = startScene();
  renderHero(); setTab('over'); route();
  await scene;
  renderHero();
  document.body.dataset.ready = '1';
  if (O && S.scene) O.ready();
  S.ready = true;
  // the PC's own status (0.5-3 s): its account list adds the evals the cloud copy does not know (their fees above)
  if (S.home) T.withPcFeed(S.home).then((h) => { const ex = T.extraOf(h); if (ex.length) { S.extra = ex; recalc(); renderHero(); setTab(S.tab); } }).catch(() => {});
}

window.LG = {
  state: () => ({ ready: S.ready, demo: S.demo, error: S.error, tab: S.tab, entries: S.st.entries.length, auto: S.model ? S.model.auto.length : 0, net: S.model ? S.model.totals.net : null, saveOk: S.saveOk, scene: S.scene ? S.scene.stats() : null, today: S.today, pendingUndo: !!S.prev }),
  model: () => S.model, st: () => S.st, score: () => SB.view(S.score, Date.now() / 1000), scene: () => S.scene, core: C, tab: setTab, open: openSheet, close: closeSheet, importText, undo, csv: () => C.toCSV(S.model.list), card: card2,
  add: (e) => commit(C.addEntry(S.st, e), 'Added'),
};
main();
