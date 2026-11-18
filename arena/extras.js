// ARENA extras (ES module, JOB 10+11, 2026-11-04): the record of your progress, drawn from the events the ledger already holds.
//   xpByDay(events, R)            -> Map day -> { xp, clean, broken, bot, kinds }   the same per-kind daily cap as score()
//   weekBoard(B, R)               the weekly quest board: this week's four bosses as one line each (hits, state)
//   calendar(events, R, today)    the discipline calendar: 10 weeks, one square per day (clean day / quiet day / rule broken / nothing)
//   xpHistory(events, R, today)   XP per day for the last 28 days (bars) with the best day
//   versusYou(events, R, today)   this week's XP against your previous weeks (a ladder: you against your past self)
//   shelf(trophies)               the trophy room: what is on the shelves by tier, the next one to win and how far it is
// DOM only, text through textContent. Nothing here changes a score: it only reads.
import { cleanEvents, addDays, weekday } from './rules.js';
import { weekStart } from './bosses.js';

const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');

export function xpByDay(events, R) {
  const evs = cleanEvents(events, R), used = new Map(), days = new Map();
  for (const e of evs) {
    const rule = R.xp[e.kind], key = e.kind + '|' + e.day, n = used.get(key) || 0;
    used.set(key, n + 1);
    const d = days.get(e.day) || { xp: 0, clean: 0, broken: 0, bot: 0, kinds: {} };
    if (n < rule.cap_day) d.xp += rule.xp;
    d.kinds[e.kind] = (d.kinds[e.kind] || 0) + 1;
    if (e.kind === 'clean_trade') d.clean++;
    else if (e.kind === 'rule_broken') d.broken++;
    else if (e.kind === 'bot_day') d.bot++;
    days.set(e.day, d);
  }
  return days;
}

export function weekBoard(B, R) {
  const box = h('section', 'wkboard');
  box.append(h('h3', '', 'This week\'s board'));
  const list = (B && B.cur) || [];
  if (!list.length) { box.append(h('p', 'sweep', 'No boss this week yet.')); return box; }
  for (const b of list) {
    const row = h('div', 'wkrow ' + b.state);
    row.style.setProperty('--bc', b.color || '#c96a4a');
    const pips = h('span', 'pips');
    for (let i = 0; i < b.max; i++) pips.append(h('i', i < b.hits ? 'on' : ''));
    row.append(h('b', '', b.title || b.name), pips, h('span', 'st', { slain: 'Slain', escaped: 'Escaped', locked: 'Locked', fighting: `${b.hits} of ${b.max}` }[b.state] || b.state));
    row.title = b.name;
    box.append(row);
  }
  const slain = list.filter((b) => b.state === 'slain').length;
  box.append(h('p', 'sweep' + (slain === list.length ? ' done' : ''), `${slain} of ${list.length} bosses slain this week. Each one is +${R.xp.boss.xp} XP and a trophy step.`));
  return box;
}

export function calendar(events, R, today) {
  const days = xpByDay(events, R), box = h('section', 'rec cal');
  box.append(h('h3', '', 'Discipline calendar'));
  const mon = weekStart(today), grid = h('div', 'calgrid'), head = h('div', 'calhead');
  for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) head.append(h('span', '', d));
  box.append(head);
  let clean = 0, broken = 0, run = 0, best = 0;
  for (let w = 9; w >= 0; w--) {
    for (let i = 0; i < 7; i++) {
      const day = addDays(mon, -7 * w + i), d = days.get(day), future = day > today;
      let st = 'none';
      if (d) st = d.broken ? 'broken' : d.clean ? 'clean' : d.bot || d.xp ? 'quiet' : 'none';
      if (future) st = 'future';
      const wd = weekday(day), isWk = wd >= 1 && wd <= 5;
      if (!future && isWk) { if (st === 'clean') { clean++; run++; best = Math.max(best, run); } else if (st === 'broken') { broken++; run = 0; } }
      const sq = h('i', `sq ${st}${day === today ? ' today' : ''}`);
      sq.title = `${day}: ${st === 'clean' ? `${d.clean} clean trade${d.clean > 1 ? 's' : ''}, ${d.xp} XP` : st === 'broken' ? 'a rule was broken' : st === 'quiet' ? `a quiet day, ${d.xp} XP` : st === 'future' ? '' : 'nothing recorded'}`;
      sq.dataset.day = day; sq.dataset.state = st;
      grid.append(sq);
    }
  }
  box.append(grid);
  const legend = h('p', 'legend'); legend.append(h('i', 'sq clean'), 'clean day ', h('i', 'sq quiet'), 'quiet ', h('i', 'sq broken'), 'rule broken ', h('i', 'sq none'), 'nothing');
  box.append(legend, h('p', 'sweep', `Last 10 weeks: ${clean} clean day${clean === 1 ? '' : 's'}, ${broken} broken, longest clean run ${best}.`));
  return box;
}

export function xpHistory(events, R, today) {
  const days = xpByDay(events, R), box = h('section', 'rec hist'), N = 28, vals = [];
  box.append(h('h3', '', 'XP per day · last 4 weeks'));
  for (let i = N - 1; i >= 0; i--) { const day = addDays(today, -i), d = days.get(day); vals.push({ day, xp: d ? d.xp : 0 }); }
  const max = Math.max(40, ...vals.map((v) => v.xp)), W = 300, H = 84, bw = W / N;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H + 14}`, class: 'xpchart', role: 'img', 'aria-label': 'XP per day for the last 28 days' });
  vals.forEach((v, i) => {
    const bh = Math.max(1.5, (v.xp / max) * H), r = sv('rect', { x: i * bw + 1, y: H - bh, width: bw - 2, height: bh, rx: 1.5, class: v.day === today ? 'bar now' : v.xp ? 'bar' : 'bar zero' });
    const t = sv('title', {}); t.textContent = `${v.day}: ${v.xp} XP`; r.append(t); svg.append(r);
  });
  box.append(svg);
  const total = vals.reduce((s, v) => s + v.xp, 0), top = vals.reduce((a, v) => (v.xp > a.xp ? v : a), vals[0]);
  box.append(h('p', 'sweep', `${fmt(total)} XP in 28 days, ${fmt(total / 28)} a day. Best day ${top.day.slice(5)} with ${fmt(top.xp)} XP.`));
  return box;
}

export function versusYou(events, R, today) {
  const days = xpByDay(events, R), box = h('section', 'rec vs'), cur = weekStart(today), rows = [];
  box.append(h('h3', '', 'You against your past self'));
  for (let w = 0; w < 7; w++) {
    const mon = addDays(cur, -7 * w); let xp = 0;
    for (let i = 0; i < 7; i++) { const d = days.get(addDays(mon, i)); if (d) xp += d.xp; }
    rows.push({ mon, xp, now: w === 0 });
  }
  const sorted = rows.slice().sort((a, b) => b.xp - a.xp), rank = sorted.findIndex((r) => r.now) + 1, max = Math.max(1, sorted[0].xp);
  const list = h('ol', 'vslist');
  sorted.forEach((r, i) => {
    const li = h('li', r.now ? 'me' : ''), bar = h('span', 'vbar'), fill = h('i'); fill.style.width = `${Math.max(3, Math.round((r.xp / max) * 100))}%`; bar.append(fill);
    li.append(h('span', 'pos', String(i + 1)), h('span', 'wk', r.now ? 'This week (you)' : `Week of ${r.mon.slice(5)}`), bar, h('span', 'xp', fmt(r.xp)));
    list.append(li);
  });
  const best = sorted[0], gap = best.now ? 0 : best.xp - rows[0].xp;
  box.append(list, h('p', 'sweep' + (rank === 1 ? ' done' : ''), rank === 1 ? 'This is your best week of the last seven. Keep the lead.' : `This week is #${rank} of 7. Your best week had ${fmt(best.xp)} XP: ${fmt(gap)} XP to beat it.`));
  return box;
}

export function shelf(list) {
  const box = h('section', 'rec shelf'), tiers = ['bronze', 'silver', 'gold', 'legend'], by = {};
  for (const t of tiers) by[t] = list.filter((x) => x.tier === t);
  box.append(h('h3', '', 'On the shelves'));
  const row = h('div', 'shelfrow');
  for (const t of tiers) {
    const n = by[t].filter((x) => x.earned).length, c = h('div', `shelfcell ${t}`);
    c.append(h('b', '', `${n}/${by[t].length}`), h('span', '', t));
    row.append(c);
  }
  box.append(row);
  const next = list.filter((x) => !x.earned && x.goal).sort((a, b) => (b.value / b.goal) - (a.value / a.goal))[0];
  if (next) {
    const bar = h('div', 'bar'), fill = h('i'); fill.style.width = `${Math.round((next.value / next.goal) * 100)}%`; bar.append(fill);
    box.append(h('p', 'next', `Closest: ${next.name}, ${fmt(next.value)} of ${fmt(next.goal)}`), bar);
  } else box.append(h('p', 'next', 'Every trophy is on the shelf.'));
  return box;
}
