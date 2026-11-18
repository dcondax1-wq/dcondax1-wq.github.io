// ARENA trading desk (ES module, JOB 47, 2026-11-04): the money side of discipline, read from the trade events the ledger already holds.
// Arena never sees dollars (no event carries $, size or R), so every number here is a count of trades, days or rule breaks: the things
// that decide whether an eval is passed and a payout is kept. The dollars live on Plutus; this page keeps the habits that earn them.
//   tradeLog(events, R)                  -> [{ day, t, acct, label, clean, rule }]  every clean trade and every broken rule, in order
//   mainAccount(trades, today)           -> { acct, label }  the account that trades most lately (the one the 2-4 plan is about)
//   weeklyRhythm(trades, today, n)       -> { weeks:[{mon,n,clean,state}], cur:{...}, inPlan, run }  trades per week against the 2-4 plan
//   quietClock(trades, today, limit)     -> [{ acct, label, last, quiet, left, state }]  days without a trade against the 7-day inactivity rule
//   brokenBoard(trades, today)           -> { rate, rate30, broken, byRule:[{rule,n,last}], cleanSince }  what was broken and how often
//   moneyPath(events, R, today)          -> { steps:[{key,label,day,done}], days, next }  eval passed -> payout
//   desk(events, R, today)               -> DOM section (textContent only)
// Pure functions first (no DOM, no clock: `today` is passed in), then the renderer. Nothing here changes a score.
import { cleanEvents, addDays, weekday, dayNumber, isMarketDay } from './rules.js';

export const PLAN = Object.freeze({ min: 2, max: 4, quiet: 7, warn: 2 });
const weekStart = (day) => addDays(day, -((weekday(day) + 6) % 7));

export function tradeLog(events, R) {
  const out = [];
  for (const e of cleanEvents(events, R)) {
    if (e.kind !== 'clean_trade' && e.kind !== 'rule_broken') continue;
    const m = /^trade:([^:]+):/.exec(e.id), label = (e.note.split(':')[0] || 'Account').trim();
    const rule = e.kind === 'rule_broken' ? ((/broke\s+(.+?)\.?$/i.exec(e.note) || [])[1] || 'a rule').trim() : '';
    out.push({ day: e.day, t: e.t, acct: m ? m[1] : label.toLowerCase(), label, clean: e.kind === 'clean_trade', rule });
  }
  return out;
}

export function mainAccount(trades, today) {
  const from = addDays(today, -56), n = new Map();
  for (const t of trades) if (t.day >= from) n.set(t.acct, { acct: t.acct, label: t.label, n: ((n.get(t.acct) || {}).n || 0) + 1 });
  const best = [...n.values()].sort((a, b) => b.n - a.n)[0];
  return best ? { acct: best.acct, label: best.label } : { acct: '', label: 'Your account' };
}

export function weeklyRhythm(all, today, n = 8, acct) {
  const trades = acct ? all.filter((t) => t.acct === acct) : all, cur = weekStart(today), weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const mon = addDays(cur, -7 * i), end = addDays(mon, 6), inW = trades.filter((t) => t.day >= mon && t.day <= end);
    const c = inW.length, state = c < PLAN.min ? 'under' : c > PLAN.max ? 'over' : 'plan';
    weeks.push({ mon, n: c, clean: inW.filter((t) => t.clean).length, state, now: i === 0 });
  }
  const now = weeks[weeks.length - 1];
  let left = 0; for (let d = today; d <= addDays(cur, 4); d = addDays(d, 1)) if (isMarketDay(d)) left++;   // market days still open this week, today included
  const need = Math.max(0, PLAN.min - now.n), room = Math.max(0, PLAN.max - now.n);
  const done = weeks.slice(0, -1);                                                                         // finished weeks only
  let run = 0; for (let i = done.length - 1; i >= 0 && done[i].state === 'plan'; i--) run++;
  const inPlan = done.filter((w) => w.state === 'plan').length;
  let verdict;
  if (now.n > PLAN.max) verdict = 'over';
  else if (now.n >= PLAN.max) verdict = 'full';
  else if (now.n >= PLAN.min) verdict = 'plan';
  else if (left < need) verdict = 'miss';
  else verdict = 'need';
  return { weeks, cur: { ...now, need, room, left, verdict }, inPlan, finished: done.length, run };
}

export function quietClock(trades, today, limit = PLAN.quiet) {
  const by = new Map();
  for (const t of trades) { const c = by.get(t.acct); if (!c || t.day >= c.last) by.set(t.acct, { acct: t.acct, label: t.label, last: t.day }); }
  return [...by.values()].map((c) => {
    const quiet = Math.max(0, dayNumber(today) - dayNumber(c.last)), left = limit - quiet;
    return { ...c, quiet, left, state: left <= 0 ? 'lapsed' : left <= PLAN.warn ? 'warn' : 'ok' };
  }).sort((a, b) => a.left - b.left);
}

export function brokenBoard(trades, today) {
  const clean = trades.filter((t) => t.clean).length, broken = trades.length - clean, from = addDays(today, -30);
  const r30 = trades.filter((t) => t.day >= from), c30 = r30.filter((t) => t.clean).length;
  const rules = new Map();
  for (const t of trades) if (!t.clean) { const r = rules.get(t.rule) || { rule: t.rule, n: 0, last: '' }; r.n++; if (t.day > r.last) r.last = t.day; rules.set(t.rule, r); }
  let cleanSince = 0; for (let i = trades.length - 1; i >= 0 && trades[i].clean; i--) cleanSince++;
  return { total: trades.length, clean, broken, rate: trades.length ? clean / trades.length : null, rate30: r30.length ? c30 / r30.length : null, n30: r30.length,
    byRule: [...rules.values()].sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1)), cleanSince };
}

export function moneyPath(events, R, today) {
  const evs = cleanEvents(events, R), first = (k) => evs.find((e) => e.kind === k), all = (k) => evs.filter((e) => e.kind === k);
  const pass = first('eval_passed'), pays = all('payout'), trades = tradeLog(events, R);
  const after = pass ? trades.filter((t) => t.day >= pass.day) : trades;
  const steps = [
    { key: 'trade', label: 'First clean trade', day: (trades.find((t) => t.clean) || {}).day || '', done: trades.some((t) => t.clean) },
    { key: 'pass', label: 'Eval passed', day: pass ? pass.day : '', done: !!pass },
    { key: 'pay', label: 'First payout', day: pays[0] ? pays[0].day : '', done: pays.length > 0 },
  ];
  const days = pass && pays[0] ? dayNumber(pays[0].day) - dayNumber(pass.day) : null;
  let next;
  if (!steps[0].done) next = 'Next: your first trade that keeps every rule.';
  else if (!pass) next = 'Next: pass the eval. Two to four clean trades a week gets there; a broken rule costs the account, not only XP.';
  else if (!pays.length) next = `Next: the first payout. ${after.filter((t) => t.clean).length} clean trades since the pass.`;
  else next = `${pays.length} payout${pays.length > 1 ? 's' : ''} recorded. Keep the same weekly rhythm to get the next one.`;
  return { steps, days, payouts: pays.length, passes: all('eval_passed').length, next, since: dayNumber(today) };
}

// ------------------------------------------------------------------------------------------------ DOM
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const pct = (x) => (x == null ? 'no trades yet' : `${Math.round(x * 100)}%`);
const dd = (n) => `${n} day${n === 1 ? '' : 's'}`;

function rhythmBlock(trades, today) {
  const main = mainAccount(trades, today), r = weeklyRhythm(trades, today, 8, main.acct), box = h('section', 'rec desk-rhythm');
  box.append(h('h3', '', `Weekly rhythm · ${main.label} · plan 2 to 4`));
  const W = 320, H = 70, bw = W / r.weeks.length, max = Math.max(5, ...r.weeks.map((w) => w.n)), y = (v) => H - (v / max) * H;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H + 16}`, class: 'rhythm', role: 'img', 'aria-label': 'Trades per week for the last 8 weeks against the 2 to 4 plan' });
  svg.append(sv('rect', { x: 0, y: y(PLAN.max), width: W, height: y(PLAN.min) - y(PLAN.max), class: 'band' }));
  r.weeks.forEach((w, i) => {
    const bh = w.n ? (w.n / max) * H : 1.5, rc = sv('rect', { x: i * bw + 6, y: H - bh, width: bw - 12, height: bh, rx: 2, class: `wk ${w.state}${w.now ? ' now' : ''}` });
    const t = sv('title', {}); t.textContent = `Week of ${w.mon}: ${w.n} trade${w.n === 1 ? '' : 's'}`; rc.append(t); svg.append(rc);
    const lab = sv('text', { x: i * bw + bw / 2, y: H + 12, 'text-anchor': 'middle', class: 'lab' }); lab.textContent = w.n + ''; svg.append(lab);
  });
  box.append(svg);
  const c = r.cur, say = {
    need: `This week: ${c.n} of ${PLAN.min} trades so far. ${c.need} more clean trade${c.need === 1 ? '' : 's'} in ${dd(c.left)} keeps the plan.`,
    miss: `This week: ${c.n} trade${c.n === 1 ? '' : 's'} and only ${dd(c.left)} left. The plan of ${PLAN.min} will be missed; do not force a trade.`,
    plan: `This week: ${c.n} trades, inside the plan. Room for ${c.room} more.`,
    full: `This week: ${c.n} trades, the plan is full. Stop here and keep the week green.`,
    over: `This week: ${c.n} trades, over the plan of ${PLAN.max}. No more trades this week.`,
  }[c.verdict];
  const p = h('p', 'say ' + c.verdict, say); p.dataset.verdict = c.verdict;
  box.append(p, h('p', 'sweep', `${r.inPlan} of the last ${r.finished} finished weeks were inside 2 to 4 trades${r.run > 1 ? `, ${r.run} in a row now` : ''}.`));
  return box;
}

function quietBlock(trades, today) {
  const list = quietClock(trades, today), box = h('section', 'rec desk-quiet');
  box.append(h('h3', '', 'Quiet clock · 7 days without a trade'));
  if (!list.length) { box.append(h('p', 'sweep', 'No trade recorded yet. The clock starts with the first one.')); return box; }
  for (const q of list) {
    const row = h('div', 'qrow ' + q.state), bar = h('span', 'qbar'), fill = h('i');
    fill.style.width = `${Math.min(100, Math.round((q.quiet / PLAN.quiet) * 100))}%`; bar.append(fill);
    const txt = q.state === 'lapsed' ? `lapsed: ${dd(q.quiet)} quiet` : `${dd(q.left)} left`;
    row.append(h('b', '', q.label), bar, h('span', 'st', txt)); row.title = `Last trade ${q.last}`;
    box.append(row);
  }
  const worst = list[0];
  box.append(h('p', 'sweep' + (worst.state === 'ok' ? '' : ' warnline'), worst.state === 'lapsed' ? `${worst.label} went ${dd(worst.quiet)} without a trade. One clean trade starts the clock again.`
    : worst.state === 'warn' ? `${worst.label} has ${dd(worst.left)} left. Take the next clean setup.` : 'Every account has time. Nothing to chase.'));
  return box;
}

function brokenBlock(trades, today) {
  const b = brokenBoard(trades, today), box = h('section', 'rec desk-broken');
  box.append(h('h3', '', 'Discipline rate'));
  const row = h('div', 'rates');
  const cell = (big, small) => { const c = h('div', 'rate'); c.append(h('b', '', big), h('span', '', small)); return c; };
  row.append(cell(pct(b.rate30), `last 30 days (${b.n30} trade${b.n30 === 1 ? '' : 's'})`), cell(pct(b.rate), `all time (${b.total})`), cell(String(b.cleanSince), 'clean in a row'));
  box.append(row);
  if (!b.broken) box.append(h('p', 'sweep done', 'No rule broken on record.'));
  else {
    const ul = h('ul', 'brk');
    for (const r of b.byRule) ul.append(h('li', '', `${r.rule}: broken ${r.n} time${r.n === 1 ? '' : 's'}, last ${r.last.slice(5)}`));
    box.append(ul, h('p', 'sweep', `${b.clean} clean trades against ${b.broken} broken. A broken rule is the one thing that can end an eval, so it is the number to keep at zero.`));
  }
  return box;
}

function pathBlock(events, R, today) {
  const m = moneyPath(events, R, today), box = h('section', 'rec desk-path');
  box.append(h('h3', '', 'Money path · eval to payout'));
  const ol = h('ol', 'mpath');
  for (const s of m.steps) {
    const li = h('li', s.done ? 'done' : ''); li.append(h('i', 'dot'), h('b', '', s.label), h('span', '', s.done ? s.day.slice(5) : 'not yet'));
    ol.append(li);
  }
  box.append(ol, h('p', 'sweep', (m.days != null ? `Eval to payout took ${dd(m.days)}. ` : '') + m.next),
    h('p', 'sweep dim', 'Arena counts rules and days, not dollars. The dollars and the loss limit are on Plutus.'));
  return box;
}

export function desk(events, R, today) {
  const trades = tradeLog(events, R), box = h('div', 'desk');
  box.append(h('h2', 'deskh', 'Trading desk'));
  for (const f of [() => rhythmBlock(trades, today), () => quietBlock(trades, today), () => brokenBlock(trades, today), () => pathBlock(events, R, today)]) {
    try { box.append(f()); } catch (e) { /* one block failing never hides the others */ }
  }
  return box;
}
