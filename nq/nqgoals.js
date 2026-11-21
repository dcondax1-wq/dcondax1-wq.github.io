// NQ v4 GOALS + NUMBERS (day-nqdash3 2026-11-20, owner 15:00 ET: "you should have goals on the NQ dashboard ... more data ... make it look cool").
// ES module, pure first (node-tested: tests/test_nq_goals.py), drawing second (createElement / createElementNS, text only through textContent).
//   goals(accts, pay, plan, nowS, eq)  -> each account's next money goal: [{ key, name, kind payout|pass|plan|fleet, goal, left, frac, big, unit,
//                                         lines[], chips[{label, ok}], when, level }]
//     ATLAS (funded 25K): the plan's first ask = $1,000 at a balance of $27,100 ($1,100 buffer + $1,000 max; $800 to you at the 80% split);
//       MFFU allows the minimum $250 ask at $26,350 (the payout coach's need_more, the "to payout" every page shows); 2 traded days and the
//       best day at most 50% of the cycle's profit (nq/payready.js model rows when the PC sent its tracker, the plan constants otherwise)
//     Zlarior 50K / 25K #2 evals: pass = the PC's to_target (+$3,807 / +$1,500); Rapid EOD 25K: +$1,500 in 4+ days, best day <= 30%, once it exists
//     The fleet: business/goals.json's $ a month goal (the 'spring' rung) and the funded slots filled (MFFU's limit: 5)
//     Dates: "about Dec 18-31 at today's pace (estimate)" from the account's end-of-day P&L points (the PC's mf eq), else the plan's date
//   numbers(accts, rows, nowS)  -> today's / this week's P&L per account, win rate + PF over the real fills, the last 10 (R and $)
//   clock(nowS)                 -> the session clock: London / New York windows, the next entry window and how long until it
//   vixLine(brief)              -> the VIX band and the LIT target size (one VIX day move, at least 1.5R, banked at 8R)
// Read only: it never trades, arms or fetches. The page (nq.js) hands in everything.
import { etParts, DAY } from './nqdesk.js?v=7';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const r2 = (v) => Math.round(v * 100) / 100;
export const usd = (v, sign) => { const n = num(v); if (n === null) return '-'; const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); return n < 0 && Math.round(n) ? '-' + a : (sign && Math.round(n) > 0 ? '+' + a : a); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const isWd = (d) => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay());
export function addTradingDays(d, n) { let x = d, k = 0; while (k < n) { x = addDays(x, 1); if (isWd(x)) k++; } return x; }
const md = (d) => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
/** "Dec 18-31" / "Dec 29 - Jan 6" */
export function span(a, b) { return a === b ? md(a) : a.slice(0, 7) === b.slice(0, 7) ? `${md(a)}-${+b.slice(8, 10)}` : `${md(a)} - ${md(b)}`; }

// MFFU's numbers (business/payoutcoach.js PLANS; docs/FUNDED_25K_PLAYBOOK.md): the eval target over the start, the funded buffer and asks
export const PLAN = {
  builder25k: { start: 25000, pass: 1500, mll: 1000, buffer: 1100, max: 1000, min: 250, split: 0.8, days: 2, best: 0.5 },
  builder50k: { start: 50000, pass: 3000, mll: 2000, buffer: 2100, max: 2000, min: 500, split: 0.8, days: 2, best: 0.5 },
  rapid25: { start: 25000, pass: 1500, minDays: 4, best: 0.3 },
};
const PLAN_OF = { zlarior: 'builder50k', fresh25: 'builder25k', atlas: 'builder25k', rapid1: 'rapid25' };
// the first payout date from the ATLAS cost study (research/writeups/atlas-costs-split-2026-11-20.md, day-atlasedge): about Dec 18 in a
// Jan-Jun-2026-like market, about Dec 31 in a Jul-Oct-like one. A simulation, shown as an estimate; it replaces a 3-day pace (lead 2026-11-20)
const STUDY = { atlas: 'about Dec 18-31 (estimate, 2026-like market)' };
const LADDER_OF = { zlarior: 'z50_pass', fresh25: 'z25_pass', rapid1: 'r25_pass', atlas: 'pay1' };

/** the pace: $ a traded day from end-of-day P&L points (oldest first), null under 3 points */
export function pace(eq) {
  const e = arr(eq).map(num).filter((x) => x !== null);
  if (e.length < 3) return null;
  return { per: r2((e[e.length - 1] - e[0]) / (e.length - 1)), days: e.length - 1 };
}
/** "about Dec 18-31 at today's pace (estimate)": n trading days at the pace, to 1.6x (a pace is never a promise) */
export function when(left, pc, today, ladderWhen) {
  if (left !== null && left <= 0) return { text: 'reached', date: today };
  if (pc && pc.per > 0 && left !== null) {
    const n = Math.max(1, Math.ceil(left / pc.per)), a = addTradingDays(today, n), b = addTradingDays(today, Math.ceil(n * 1.6) + 1);
    return { text: `about ${span(a, b)} at today's pace (estimate)`, date: a, n };
  }
  if (ladderWhen) return { text: `plan: ${ladderWhen.replace(/^~/, 'about ')} (estimate)`, date: null };
  return { text: pc ? `not at the recent pace (${usd(pc.per)} a day)` : 'not enough days yet for a pace', date: null };
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function goals(accts, pay, plan, nowS, eq, mffu) {
  const today = etParts(nowS).day, A = arr(accts).filter(isObj), P = arr(pay).filter(isObj), G = isObj(plan) ? plan : {};
  const ladder = (id) => { const r = arr(G.ladder).find((x) => isObj(x) && x.id === id); return r ? String(r.when || '') : ''; };
  const eqOf = (k) => (isObj(eq) ? eq[k] : null);
  const out = [];
  for (const a of A) {
    const pk = PLAN_OF[a.key] || (/50k/i.test(a.name) ? 'builder50k' : 'builder25k'), C = PLAN[pk];
    if (a.stage === 'Funded') {
      // MFFU's own terms (owner 2026-11-20): a sim-FUNDED account starts at $0 and MFFU shows its profit as the balance (ATLAS "$401", not $25,401);
      // the floor is -$1,000 end-of-day trailing (locks at +$100); earliest = the $1,100 buffer + the $250 minimum ($1,350); the GOAL = the buffer +
      // the full $1,000 ask ($2,100, $800 to you). PC_FEED.mffuView (pc_feed.js, day-archive) when the page has it, else the same arithmetic here.
      const pr = P.find((x) => x.has && (x.id === 'atlas' || x.id === 'acct_b' || /atlas/i.test(x.name || ''))) || null;
      const raw = num(pr && pr.balance) ?? num(a.balance);
      const mv = typeof mffu === 'function' ? mffu({ kind: 'funded', size: pk === 'builder50k' ? '50K' : '25K', name: a.name, balance: raw, start: C.start, room: a.room }) : null;
      const prof = mv && num(mv.balance) !== null ? num(mv.balance) : raw === null ? null : r2(raw > C.start / 2 ? raw - C.start : raw);
      const goalAt = mv && mv.goal ? mv.goal.at : C.buffer + C.max, earlyAt = mv && mv.earliest ? mv.earliest.at : C.buffer + C.min;
      const floor = mv && num(mv.floor) !== null ? num(mv.floor) : prof !== null && num(a.room) !== null ? Math.min(r2(prof - a.room), 100) : -C.mll;
      const left = prof === null ? null : Math.max(0, r2(goalAt - prof), pr && pr.need ? num(pr.need.plan) || 0 : 0);
      const allow = pr && pr.need ? num(pr.need.allow) : prof === null ? null : Math.max(0, r2(earlyAt - prof));
      const ck = pr ? Object.fromEntries(arr(pr.checks).map((c) => [c.k, c])) : {};
      const chips = [
        { label: ck.days ? `Traded days ${ck.days.text}` : `${C.days} traded days a cycle`, ok: ck.days ? !!ck.days.ok : null },
        { label: ck.cons ? `Best day <= 50%: ${ck.cons.ok ? 'ok' : 'not yet'}` : 'Best day <= 50% of the cycle', ok: ck.cons ? !!ck.cons.ok : null },
      ];
      out.push({ key: a.key, name: a.name, kind: 'payout', goal: `Ask ${usd(C.max)} at ${usd(goalAt)}`, left, frac: prof === null ? 0 : clamp01(prof / goalAt),
        big: left === null ? '-' : left <= 0 ? 'Ready' : usd(left), unit: left !== null && left > 0 ? `to ${usd(goalAt)}` : '', short: `first ask ${usd(C.max)}`,
        lines: [`MFFU shows this funded account as its profit: ${prof === null ? '-' : usd(prof)} (max-loss floor ${usd(floor)}, end-of-day trailing, it stops at +$100).`,
          `Goal: ask ${usd(C.max)} once MFFU shows ${usd(goalAt)} (${usd(C.buffer)} buffer + ${usd(C.max)}); ${usd(C.max * C.split)} to you at the 80% split.`,
          allow === null ? `Earliest: the minimum ${usd(C.min)} ask at ${usd(earlyAt)}.` : allow > 0 ? `Earliest: the minimum ${usd(C.min)} ask at ${usd(earlyAt)}: ${usd(allow)} more.` : `Earliest: MFFU allows an ask now (minimum ${usd(C.min)}).`],
        chips, when: STUDY[a.key] || (ladder(LADDER_OF[a.key]) ? `plan: ${ladder(LADDER_OF[a.key]).replace(/^~/, 'about ')} (estimate)` : ''),
        level: left !== null && left <= 0 ? 'ok' : 'go', has: prof !== null, balance: prof, floor, earliest: earlyAt, goalAt });
      continue;
    }
    if (a.dot === 'plan' || !a.has) {
      out.push({ key: a.key, name: a.name, kind: 'plan', goal: `Pass: +${usd(C.pass)}`, left: null, frac: 0, big: `+${usd(C.pass)}`, unit: 'to pass',
        lines: pk === 'rapid25' ? [`Not on the PC yet. Pass: +${usd(C.pass)} in ${C.minDays}+ days, no day over 30% (${usd(C.pass * C.best)}).`]
          : [`No PC numbers yet. Pass: +${usd(C.pass)}.`],
        chips: pk === 'rapid25' ? [{ label: `${C.minDays}+ trading days`, ok: null }, { label: 'Best day <= 30%', ok: null }] : [],
        when: ladder(LADDER_OF[a.key]) ? `plan: ${ladder(LADDER_OF[a.key]).replace(/^~/, 'about ')} (estimate)` : '', level: 'plan', has: false, balance: null });
      continue;
    }
    const left = num(a.goal) !== null ? Math.max(0, num(a.goal)) : null, bal = num(a.balance);
    const tgt = bal !== null && left !== null ? bal + left : C.start + C.pass;
    const w = when(left, null, today, ladder(LADDER_OF[a.key]));   // the plan's simulated date (goals.json), never a pace from a few days (it over-promised)
    out.push({ key: a.key, name: a.name, kind: 'pass', goal: `Pass at ${usd(tgt)}`, left, frac: bal === null ? 0 : clamp01((bal - C.start) / (tgt - C.start)),
      big: left === null ? '-' : left <= 0 ? 'Passed' : `+${usd(left)}`, unit: left !== null && left > 0 ? 'to pass' : '',
      lines: [`Eval pass: a balance of ${usd(tgt)} (+${usd(C.pass)} over ${usd(C.start)}).${num(a.room) !== null ? ` Drawdown left ${usd(a.room)}.` : ''}`],
      chips: num(a.room) !== null && num(a.mll) ? [{ label: `Room ${Math.round(clamp01(a.room / a.mll) * 100)}% of the max loss`, ok: a.room / a.mll > 0.35 }] : [],
      when: w.text, level: left !== null && left <= 0 ? 'ok' : 'go', has: true, balance: bal });
  }
  // the fleet: the $ a month goal (goals.json 'spring') and the funded slots
  const spring = arr(G.ladder).find((x) => isObj(x) && x.id === 'spring');
  const funded = A.filter((a) => a.stage === 'Funded').length, paid = P.reduce((s, x) => s + (num(x.paid) || 0), 0);
  const per = spring ? num(spring.usd) : null;
  out.push({ key: 'fleet', name: 'The fleet', kind: 'fleet', goal: per ? `${usd(per)} a month` : '5 funded slots', left: null, frac: clamp01(funded / 5),
    big: `${funded} of 5`, unit: 'funded',
    lines: [per ? `Goal: about ${usd(per)} a month to you by ${String(spring.when || '').replace(/^~/, '')} with all 5 funded slots (after fees, MFFU's cut and the 30% tax pot; estimate).` : 'Goal: all 5 funded slots.',
      paid > 0 ? `Paid out to you so far: ${usd(paid)}.` : 'No payout taken yet: ATLAS is the first.'],
    chips: [{ label: `${funded} funded`, ok: funded > 0 }, { label: `${A.filter((a) => a.stage !== 'Funded' && a.has).length} evals running`, ok: null }],
    when: spring ? `plan: about ${String(spring.when || '').replace(/^~/, '')} (estimate)` : '', level: 'fleet', has: true });
  const ORDER = { payout: 0, pass: 1, plan: 2, fleet: 3 };
  return out.map((g, i) => [g, i]).sort((x, y) => ORDER[x[0].kind] - ORDER[y[0].kind] || x[1] - y[1]).map((x) => x[0]);
}

// ------------------------------------------------------------------------------------------------ the numbers
const ACCT_OF = { z50k: 'zlarior', zlarior: 'zlarior', lit: 'zlarior', mffu50k_eval: 'zlarior', z25k2: 'fresh25', b25k_2: 'fresh25', atlas25f: 'atlas', atlas: 'atlas', acct_b: 'atlas', rapid25: 'rapid1', rapid: 'rapid1' };
/** one list of REAL fills (no paper, no backtest): the trade file's live rows + the PC's chart post closed trades, one per account and exit minute */
// a funded account starts at $0 (MFFU's own view): its trades that closed before it was funded are the EVAL's (finder round 2026-11-20: ATLAS's
// passed-eval +$1,792 was counted in the funded account's week). since = { atlas: { day, t } } from the PC (life.acc.since / mf sd): fundedSince()
export const FUNDED_SINCE = { atlas: { day: '2026-11-17', t: null } };
export function fundedSince(lite) {
  const L = isObj(lite) ? lite : {}, life = isObj(L.life) && isObj(L.life.acc) ? L.life.acc : {}, mf = arr(isObj(L.mf) ? L.mf.a : null);
  const out = { atlas: { ...FUNDED_SINCE.atlas } }, li = ['atlas', 'acct_b'].map((i) => life[i]).find((x) => isObj(x) && /funded/i.test(String(x.stage || '')));
  const m = mf.find((x) => isObj(x) && ['atlas', 'acct_b'].includes(String(x.id)) && isObj(x.f));
  if (li && num(li.since) !== null) out.atlas = { day: etParts(num(li.since)).day, t: num(li.since) };
  else if (m && /^\d{4}-\d{2}-\d{2}$/.test(String(m.sd || ''))) out.atlas = { day: m.sd, t: null };
  return out;
}
export function realRows(file, chart, since) {
  const out = [], seen = new Set();
  const add = (k, xt, day, usdV, r, side) => {
    const key = ACCT_OF[k] || k, id = `${key}:${Math.round((num(xt) || 0) / 60)}`;
    if (num(usdV) === null || seen.has(id)) return;
    seen.add(id); out.push({ key, xt: num(xt), day: day || (num(xt) ? etParts(num(xt)).day : ''), usd: num(usdV), r: num(r), side });
  };
  for (const t of arr(isObj(file) ? file.trades : file)) if (isObj(t) && t.src === 'live') add(t.ak || t.acct, t.xt || t.t, t.day, t.usd, t.r, t.side);
  for (const t of arr(isObj(chart) ? chart.closed : null)) if (isObj(t)) add(t.k, t.xt, '', t.usd, t.r, num(t.s) < 0 ? 'SHORT' : 'LONG');
  const S = isObj(since) ? since : FUNDED_SINCE;
  for (const r of out) {
    const f = S[r.key]; if (!f) continue;
    const before = f.t !== null && f.t !== undefined && r.xt ? r.xt < f.t : r.day && r.day <= f.day;
    if (before) { r.key = r.key + '_eval'; r.era = 'eval'; }
  }
  return out.sort((a, b) => (a.xt || 0) - (b.xt || 0));
}
/** the Monday of the ET week of day d */
const monday = (d) => { let x = d; for (let i = 0; i < 6 && new Date(x + 'T12:00:00Z').getUTCDay() !== 1; i++) x = addDays(x, -1); return x; };
export function numbers(accts, rows, nowS) {
  const today = etParts(nowS).day, mon = monday(today), R = arr(rows).slice().sort((a, b) => String(a.day).localeCompare(String(b.day)) || (a.xt || 0) - (b.xt || 0));
  const per = arr(accts).filter((a) => isObj(a) && a.has).map((a) => {
    const mine = R.filter((r) => r.key === a.key);
    const todayT = mine.filter((r) => r.day === today).reduce((s, r) => s + r.usd, 0), before = mine.filter((r) => r.day >= mon && r.day < today).reduce((s, r) => s + r.usd, 0);
    const t = num(a.today) ?? r2(todayT);                // the PC's own today (its trade may not be in the file yet) + the week's earlier days
    return { key: a.key, name: a.name, today: t, week: r2(before + t), n: mine.length };
  });
  const wins = R.filter((r) => r.usd > 0.5), losses = R.filter((r) => r.usd < -0.5);
  const gw = wins.reduce((s, r) => s + r.usd, 0), gl = -losses.reduce((s, r) => s + r.usd, 0);
  return { per, n: R.length, wr: R.length ? Math.round((wins.length / R.length) * 100) : null, pf: gl > 0 ? r2(gw / gl) : gw > 0 ? Infinity : null,
    net: r2(gw - gl), last: R.slice(-10).reverse(), week: r2(per.reduce((s, p) => s + p.week, 0)), from: R.length ? R[0].day : '' };
}

/** the open trades with their live $ and R (the PC's chart post: entry, stop, last price; 1 MNQ point = $2) */
export function opens(accts) {
  return arr(accts).filter((a) => isObj(a) && isObj(a.open)).map((a) => {
    const o = a.open, risk = num(o.entry) !== null && num(o.stop) !== null && !o.stopMoved ? Math.abs(o.entry - o.stop) * (o.qty || 1) * 2 : null;
    const r = risk && num(o.now) !== null ? r2(o.now / risk) : null;
    return { key: a.key, name: a.name, side: o.side, qty: o.qty, entry: o.entry, now: num(o.now), r, target: num(o.target_usd), locked: num(o.locked), moved: !!o.stopMoved,
      text: `${o.side} ${o.qty} @ ${num(o.entry) !== null ? o.entry.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}`,
      sub: o.stopMoved ? `stop moved: ${num(o.locked) !== null ? usd(o.locked, true) + ' locked in' : 'at break-even or better'}` : num(o.target_usd) !== null ? `target ${usd(o.target_usd, true)}` : '' };
  });
}

// ------------------------------------------------------------------------------------------------ the session clock and the VIX band
const ENTRY = [{ id: 'london', label: 'London', from: 120, to: 480 }, { id: 'ny', label: 'New York', from: 480, to: 930 }];
export function clock(nowS) {
  const p = etParts(nowS), mod = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3), wd = p.wd, weekend = wd === 'Sat' || (wd === 'Sun' && mod < 1080) || (wd === 'Fri' && mod >= 1020);
  const ph = DAY.find((d) => (d.from < d.to ? mod >= d.from && mod < d.to : mod >= d.from || mod < d.to)) || null;
  const inW = !weekend && ENTRY.find((w) => mod >= w.from && mod < w.to);
  const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  let next = null;
  if (inW) next = { text: `${inW.label} window open until ${hm(inW.to)} ET (${dur(inW.to - mod)} left)`, open: true, frac: (mod - inW.from) / (inW.to - inW.from) };
  else {
    let addMin = mod < 120 ? 120 - mod : 1440 - mod + 120;
    if (wd === 'Fri' && mod >= 930) addMin += 2 * 1440; else if (wd === 'Sat') addMin += 1440;
    next = { text: `Next entry window: London 02:00 ET${addMin < 1440 ? ` (in ${dur(addMin)})` : wd === 'Fri' || wd === 'Sat' || wd === 'Sun' ? ' on Monday' : ''}`, open: false, frac: 0 };
  }
  return { now: `${p.hm} ET`, phase: weekend ? 'Weekend: no trading' : ph ? ph.label : '', who: weekend ? 'The CME opens Sunday 18:00 ET' : ph ? ph.who : '',
    windows: ENTRY.map((w) => ({ ...w, text: `${w.label} ${hm(w.from)}-${hm(w.to)}`, on: !!inW && inW.id === w.id })), next, dayFrac: mod / 1440 };
}
export function vixLine(brief) {
  const v = isObj(brief) && isObj(brief.market) && isObj(brief.market.vix) ? brief.market.vix : null;
  if (!v || num(v.value) === null) return null;
  const mv = num(v.day_move_pts);
  return { value: num(v.value), band: String(v.band || ''), date: String(v.date || ''), move: mv,
    text: `VIX ${num(v.value).toFixed(1)} (${String(v.band || 'band unknown')})`, target: mv !== null ? `LIT target: the 18:00 open +/- ${Math.round(mv)} pts (one VIX day move, at least 1.5R, banked at 8R)` : '' };
}

// ------------------------------------------------------------------------------------------------ drawing (browser only)
const NS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const sv = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

/** a number that rolls up to its value (once per element and value; reduced motion: at once) */
export function roll(el, to, fmt, ms) {
  const n = num(to); if (n === null) { el.textContent = fmt(to); return; }
  const from = num(el.dataset.v) ?? 0; el.dataset.v = String(n);
  if (reduced() || from === n || typeof requestAnimationFrame !== 'function') { el.textContent = fmt(n); return; }
  const t0 = performance.now(), d = ms || 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (n - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function ring(frac, kind) {
  const s = sv('svg', { viewBox: '0 0 64 64', class: 'gl-ring', 'aria-hidden': 'true' });
  s.appendChild(sv('circle', { cx: 32, cy: 32, r: 27, class: 'gl-track' }));
  const c = 2 * Math.PI * 27;
  for (const cls of ['gl-arc glow ' + kind, 'gl-arc ' + kind + (frac >= 1 ? ' done' : '')]) {
    const arc = sv('circle', { cx: 32, cy: 32, r: 27, class: cls, 'stroke-dasharray': `${c.toFixed(1)}`, 'stroke-dashoffset': `${c.toFixed(1)}`, transform: 'rotate(-90 32 32)' });
    arc.style.setProperty('--to', `${(c * (1 - clamp01(frac))).toFixed(1)}`);
    s.appendChild(arc);
  }
  return s;
}

/** the goals strip: a glowing ring per goal with its $ left rolling up; a tap opens its lines below */
export function drawGoals(box, list, detail, opts) {
  clear(box);
  const o = opts || {}; let open = o.open || null;
  const show = (g, btn) => {
    clear(detail);
    for (const b of box.querySelectorAll('.gl-tile')) b.setAttribute('aria-expanded', String(b === btn && open === g.key));
    if (open !== g.key) { detail.hidden = true; return; }
    detail.hidden = false;
    detail.appendChild(h('p', 'gl-dh', `${g.name}: ${g.goal}`));
    for (const l of g.lines) detail.appendChild(h('p', 'gl-dl', l));
    if (g.chips.length) { const u = h('ul', 'gl-chips'); for (const c of g.chips) u.appendChild(h('li', c.ok === true ? 'ok' : c.ok === false ? 'no' : '', c.label)); detail.appendChild(u); }
    if (g.when) detail.appendChild(h('p', 'gl-when', g.when));
  };
  for (const g of list) {
    const b = h('button', `gl-tile ${g.kind}${g.has ? '' : ' dim'}`); b.type = 'button'; b.dataset.key = g.key; b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', `${g.name}: ${g.goal}. ${g.big} ${g.unit}. ${Math.round(g.frac * 100)} percent. ${g.when}`);
    const r = h('span', 'gl-rw'); r.appendChild(ring(g.frac, g.kind)); const pct = h('b', 'gl-pct ag-num'); r.appendChild(pct); b.appendChild(r);
    const t = h('span', 'gl-txt'); t.appendChild(h('span', 'gl-name', g.name));
    const br = h('span', 'gl-bigrow'), big = h('span', 'gl-big ag-num'); br.appendChild(big); br.appendChild(h('span', 'gl-unit', g.unit)); t.appendChild(br); t.appendChild(h('span', 'gl-goal', g.short || g.goal));
    b.appendChild(t);
    b.addEventListener('click', () => { open = open === g.key ? null : g.key; show(g, b); if (o.onOpen) o.onOpen(open); });
    box.appendChild(b);
    roll(pct, Math.round(g.frac * 100), (v) => `${Math.round(v)}%`);
    if (g.left !== null && g.left > 0 && /^\+?\$/.test(g.big)) roll(big, g.left, (v) => (g.kind === 'pass' ? '+' : '') + usd(v), 1100); else big.textContent = g.big;
  }
  const cur = list.find((g) => g.key === open); if (cur) show(cur, box.querySelector(`[data-key="${cur.key}"]`)); else { detail.hidden = true; clear(detail); }
  // the arcs sweep in on the next frame (CSS transition to --to); reduced motion: CSS sets them at once
  requestAnimationFrame(() => box.classList.add('gl-on'));
}

export function drawNumbers(box, N, CL, VX, OP) {
  clear(box);
  for (const o of arr(OP)) {
    const d = h('div', 'nm-open ' + (o.now > 0.5 ? 'pos' : o.now < -0.5 ? 'neg' : ''));
    d.appendChild(h('span', 'nm-otag', 'OPEN')); d.appendChild(h('b', 'nm-oname', `${o.name}: ${o.text}`));
    const v = h('b', 'nm-onow ag-num'); d.appendChild(v); roll(v, o.now ?? 0, (x) => usd(x, true));
    d.appendChild(h('span', 'nm-or ag-num', o.r !== null ? `${o.r >= 0 ? '+' : ''}${o.r.toFixed(2)}R live` : ''));
    if (o.sub) d.appendChild(h('small', 'nm-osub', o.sub));
    box.appendChild(d);
  }
  const grid = h('div', 'nm-grid');
  for (const p of N.per) {
    const c = h('div', 'nm-acct'); c.appendChild(h('span', 'nm-name', p.name));
    const t = h('b', 'nm-v ag-num ' + (p.today > 0.5 ? 'pos' : p.today < -0.5 ? 'neg' : '')); c.appendChild(h('span', 'nm-k', 'Today')); c.appendChild(t);
    const w = h('b', 'nm-v ag-num ' + (p.week > 0.5 ? 'pos' : p.week < -0.5 ? 'neg' : '')); c.appendChild(h('span', 'nm-k', 'This week')); c.appendChild(w);
    grid.appendChild(c);
    roll(t, p.today, (v) => usd(v, true)); roll(w, p.week, (v) => usd(v, true));
  }
  box.appendChild(grid);
  const st = h('div', 'nm-stats');
  const stat = (k, v, cls) => { const d = h('div', 'nm-stat ' + (cls || '')); d.appendChild(h('b', 'ag-num', v)); d.appendChild(h('span', '', k)); st.appendChild(d); };
  stat('win rate', N.wr === null ? '-' : `${N.wr}%`, N.wr !== null && N.wr >= 50 ? 'pos' : '');
  stat('profit factor', N.pf === null ? '-' : N.pf === Infinity ? 'all wins' : N.pf.toFixed(2), N.pf !== null && N.pf >= 1 ? 'pos' : N.pf !== null ? 'neg' : '');
  stat('real fills', String(N.n));
  stat('net, real fills', usd(N.net, true), N.net > 0.5 ? 'pos' : N.net < -0.5 ? 'neg' : '');
  box.appendChild(st);
  if (N.last.length) {
    const bars = h('div', 'nm-last'); bars.setAttribute('role', 'img');
    bars.setAttribute('aria-label', `The last ${N.last.length} real trades, newest first: ` + N.last.map((r) => `${usd(r.usd, true)}${r.r !== null ? ` (${r.r >= 0 ? '+' : ''}${r.r.toFixed(1)}R)` : ''}`).join(', '));
    const mx = Math.max(1, ...N.last.map((r) => Math.abs(r.r ?? r.usd / 150)));
    for (const r of N.last) {
      const v = r.r ?? r.usd / 150, col = h('span', 'nm-bar ' + (r.usd > 0.5 ? 'pos' : r.usd < -0.5 ? 'neg' : ''));
      col.style.setProperty('--h', `${Math.max(8, Math.round((Math.abs(v) / mx) * 100))}%`);
      col.appendChild(h('i')); col.appendChild(h('em', 'ag-num', usd(r.usd, true))); col.appendChild(h('small', 'ag-num', r.r !== null ? `${r.r >= 0 ? '+' : ''}${r.r.toFixed(1)}R` : ''));
      bars.appendChild(col);
    }
    box.appendChild(h('p', 'nm-h', `The last ${N.last.length} real trades (newest first)`));
    box.appendChild(bars);
  }
  box.appendChild(h('p', 'note', N.n ? `Real fills only (no paper, no backtest), since ${N.from}. Win rate and PF need many more trades to mean much.` : 'No real fills yet.'));
  // the session clock
  const ck = h('div', 'nm-clock');
  const dial = h('div', 'nm-dial'); dial.style.setProperty('--p', `${Math.round(CL.dayFrac * 1000) / 10}%`); dial.appendChild(h('b', 'ag-num', CL.now)); ck.appendChild(dial);
  const ct = h('div', 'nm-ct'); ct.appendChild(h('p', 'nm-ph', CL.phase)); ct.appendChild(h('p', 'nm-who', CL.who));
  const ws = h('p', 'nm-ws'); for (const w of CL.windows) ws.appendChild(h('span', 'nm-w' + (w.on ? ' on' : ''), w.text)); ct.appendChild(ws);
  ct.appendChild(h('p', 'nm-next' + (CL.next.open ? ' on' : ''), CL.next.text));
  ck.appendChild(ct); box.appendChild(ck);
  if (VX) { const v = h('p', 'nm-vix'); v.appendChild(h('b', 'nm-band ' + VX.band, VX.text)); if (VX.target) v.appendChild(h('span', '', ' ' + VX.target)); v.appendChild(h('small', '', ` (VIX of ${VX.date})`)); box.appendChild(v); }
}

/** a one-shot burst of cyan / violet sparks (green on a win) from an element (a goal reached, a winning trade). Canvas over the page, removed at the end. */
export function burst(at, kind) {
  if (reduced() || !at || typeof document === 'undefined') return false;
  const r = at.getBoundingClientRect(), cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  cv.className = 'gl-burst'; cv.width = W * dpr; cv.height = H * dpr; cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const g = cv.getContext('2d'); if (!g) { cv.remove(); return false; }
  g.scale(dpr, dpr);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, cols = kind === 'win' ? ['#77db89', '#b7f0c2', '#f1c14b'] : ['#9d59ee', '#dacbf0', '#f1c14b'];
  const P = Array.from({ length: 70 }, () => { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5; return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, c: cols[(Math.random() * cols.length) | 0], z: 1 + Math.random() * 2.2 }; });
  const t0 = performance.now();
  const step = (t) => {
    g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    let alive = 0;
    for (const p of P) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.985; p.life -= 0.016;
      if (p.life <= 0) continue; alive++;
      g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.z, 0, Math.PI * 2); g.fill();
    }
    if (alive && t - t0 < 2200) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
  return true;
}
