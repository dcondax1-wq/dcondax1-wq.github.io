// PNYX core (ES module, no DOM, no network): the assembly. A prop-firm rules and risk calculator for MFFU Builder 50K / 25K. Type the stop in points and get the micros allowed,
// the dollars at risk, the daily loss left, the trailing drawdown floor and the distance to the target. Pure, so tests/test_pnyx_page.py calls it in node.
// Inputs are published files (home.json for the live balance, ledger/rules.json for MFFU's limits) or fixture.json (DEMO). Every number is computed here, nothing is fetched per keystroke.
// Money words: "Drawdown left $X of $max loss"; every dollar result carries its R (1R = the planned risk of the trade on screen). Paper / eval planning only: it never places or changes an order.

export const MICRO_PT = 2;      // one MNQ micro = $2 a point
export const PLANS = {
  b50: { key: 'b50', name: 'Builder 50K', short: '50K', plan: 'builder_50k', id: 'mffu50k_eval', start: 50000, price: 91.8, list: 153, note: 'Zlarior, the LIT account' },
  b25: { key: 'b25', name: 'Builder 25K', short: '25K', plan: 'builder_25k', id: 'acctb', start: 25000, price: 63, list: 105, note: 'a Builder 25K at your $63 price' },
  atlas: { key: 'atlas', name: 'ATLAS 25K', short: '25K', plan: 'builder_25k', id: 'acctb', start: 25000, price: 43, list: 105, note: 'the ATLAS 25K of 2026-10-26 at your $43 price' },
};
export const ORDER = ['b50', 'b25', 'atlas'];
export const SHARES = [0.4, 0.6, 0.8];
export const LADDER = [10, 15, 20, 30, 40, 60];
export const TARGET_RS = [1.5, 3, 8];
// the same numbers as research/lit/mffu_rules.json 2026-10-18 (a test keeps them equal); ledger/rules.json overrides good values only
const DEFAULT_LIMITS = {
  builder_50k: { target: 3000, mll: 2000, lock: 100, dll: 1000, max_micros: 40, buffer: 2100, pay_min: 500, pay_max: 2000, split: 0.8, cons: 0.5, cycle_days: 2, max_payouts: 5, inactivity_days: 7, comm_rt_micro: 1.9 },
  builder_25k: { target: 1500, mll: 1000, lock: 100, dll: 600, max_micros: 20, buffer: 1100, pay_min: 250, pay_max: 1000, split: 0.8, cons: 0.5, cycle_days: 2, max_payouts: 5, inactivity_days: 7, comm_rt_micro: 1.9 },
};

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function price(x) { const v = num(x); return v == null ? '$0' : '$' + v.toFixed(2); }
export function rText(usd, risk, est) {
  const u = num(usd), k = num(risk); if (u == null || !k) return '0.0R';
  const r = Math.round((u / k) * 10) / 10; return (est ? '~' : '') + (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R';
}
export const both = (usd, risk, est) => `${moneyS(usd)} (${rText(usd, risk, est)})`;
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const levelOf = (f) => (f < 0.25 ? 'bad' : f < 0.5 ? 'warn' : 'ok');
const LEVEL_WORD = { ok: 'Safe distance', warn: 'Getting close', bad: 'Very close', off: 'No numbers yet' };

/** MFFU's limits for a plan: ledger/rules.json "limits" when it is there (good values only), else the built-in copy. */
export function limitsFor(plan, rules) {
  const L = isObj(rules) && isObj(rules.limits) && isObj(rules.limits[plan]) ? rules.limits[plan] : {};
  const out = { ...(DEFAULT_LIMITS[plan] || DEFAULT_LIMITS.builder_25k) };
  for (const k of Object.keys(out)) { const v = num(L[k]); if (v != null && v > 0) out[k] = v; }
  return out;
}

/** The trailing floor of a MFFU Builder: best end-of-day balance minus the max loss, never above the start balance plus the lock ($100). */
export function trailingFloor(start, best, mll, lock) { return Math.min(Math.max(best, start) - mll, start + lock); }

/**
 * The calculator. inp = { stop (points), balance, best (best end-of-day balance), lost (daily loss used today), share (0.1-1: the part of the drawdown left one trade may risk) }.
 * Size = floor(budget / (stop x $2 + commission)), budget = the smaller of share x drawdown left and the daily loss left; never above the plan's micro limit.
 */
export function calc(planKey, inp, rules) {
  const P = PLANS[planKey] || PLANS.b50, L = limitsFor(P.plan, rules), i = isObj(inp) ? inp : {};
  const stop = clamp(num(i.stop) ?? 20, 0.25, 500);
  const balance = clamp(num(i.balance) ?? P.start, 0, P.start * 3);
  const best = Math.max(num(i.best) ?? balance, balance, P.start);
  const lost = clamp(num(i.lost) ?? 0, 0, L.dll * 3);
  const share = clamp(num(i.share) ?? 0.6, 0.1, 1);
  const comm = L.comm_rt_micro, perMicro = stop * MICRO_PT + comm;
  const floor = trailingFloor(P.start, best, L.mll, L.lock), locked = floor >= P.start + L.lock - 1e-9;
  const room = Math.max(0, balance - floor), roomFrac = clamp(room / L.mll, 0, 1);
  const dllLeft = Math.max(0, L.dll - lost);
  const byRoom = share * room, budget = Math.max(0, Math.min(byRoom, dllLeft));
  const raw = Math.floor(budget / perMicro + 1e-9);
  const micros = Math.max(0, Math.min(raw, L.max_micros));
  const limiter = micros === 0 ? 'none' : raw > L.max_micros ? 'cap' : dllLeft < byRoom ? 'daily' : 'room';
  const risk = micros * perMicro;
  const widest1 = budget > comm ? Math.floor(((budget - comm) / MICRO_PT) * 4) / 4 : 0;
  const roomAfter = Math.max(0, room - risk), dllAfter = Math.max(0, dllLeft - risk);
  const profit = balance - P.start, toTarget = Math.max(0, L.target - profit);
  const ptsToTarget = micros ? toTarget / (micros * MICRO_PT) : null;
  const wins = TARGET_RS.map((r) => { const usd = r * risk; return { r, usd, wins: usd > 0 ? Math.ceil(toTarget / usd - 1e-9) : null }; });
  const level = micros === 0 ? 'bad' : levelOf(roomFrac);
  const o = { plan: P.key, name: P.name, L, stop, balance, best, lost, share, comm, perMicro, floor, locked, room, roomFrac, mll: L.mll, dll: L.dll, dllLeft, budget, micros, limiter, risk, widest1,
    roomAfter, dllAfter, profit, toTarget, target: L.target, ptsToTarget, wins, level, maxMicros: L.max_micros, passed: toTarget === 0, dead: room === 0 };
  o.lines = lines(o);
  return o;
}

function lines(o) {
  const out = [];
  if (o.dead) return ['The trailing floor has been reached: this account is over. Nothing can be sized.'];
  if (o.micros === 0) {
    out.push(`No room for even 1 micro at a ${fmtPts(o.stop)}-point stop (1 micro risks ${money(o.perMicro)}).`);
    out.push(o.widest1 > 0 ? `The widest stop that fits 1 micro today is ${fmtPts(o.widest1)} points. A wider stop means no trade, never a bigger risk.` : 'Today there is no room for any size. Stand down until the drawdown or the daily loss resets.');
    return out;
  }
  const why = { room: `${Math.round(o.share * 100)}% of the drawdown left (${money(o.budget)})`, daily: `the daily loss left (${money(o.dllLeft)})`, cap: `the plan's ${o.maxMicros}-micro limit` }[o.limiter];
  out.push(`${o.micros} micro${o.micros === 1 ? '' : 's'} at a ${fmtPts(o.stop)}-point stop risks ${money(o.risk)} (1R). The size is held by ${why}.`);
  out.push(`A wider stop means fewer micros, a tighter one more: the stop sits beyond the sweep extreme and the size follows it.`);
  out.push(`After one full stop-out: ${drawdownLine(o.roomAfter, o.mll)}, and ${money(o.dllAfter)} of the ${money(o.dll)} daily loss left.`);
  return out;
}
export const fmtPts = (p) => (Math.round(p * 4) / 4).toString();

/** The micros for each stop of the ladder (the same account state), so the table shows how the size follows the stop. */
export function ladder(planKey, inp, rules, stops) {
  return (stops || LADDER).map((s) => { const c = calc(planKey, { ...inp, stop: s }, rules); return { stop: s, micros: c.micros, risk: c.risk, level: c.level }; });
}

/** What the plan costs, in the owner's real prices, one-time, $0 activation. */
export function priceLines(planKey, rules) {
  const P = PLANS[planKey] || PLANS.b50, L = limitsFor(P.plan, rules), keep = L.pay_min * L.split;
  return [
    `Your price ${price(P.price)}, one time, $0 activation (list price ${price(P.list)}).`,
    `A failed eval costs one fee: ${price(P.price)}. That is why the size is held back at the drawdown floor.`,
    `A first payout of ${money(L.pay_min)} to ${money(L.pay_max)}: you keep ${Math.round(L.split * 100)}% (${money(keep)} at the minimum), which pays the fee back ${(keep / P.price).toFixed(1)} times.`,
  ];
}
export function ruleLines(planKey, rules) {
  const L = limitsFor((PLANS[planKey] || PLANS.b50).plan, rules);
  return [
    `Max loss ${money(L.mll)}. It trails your best end-of-day balance and stops once it reaches the start balance plus ${money(L.lock)}; it never moves down.`,
    `Daily loss ${money(L.dll)}. Hit it and trading pauses for that day; the account stays open.`,
    `Profit target ${money(L.target)}. Size limit ${L.max_micros} micro contracts. Flat by 16:10 ET; no weekend holds.`,
    `Payouts ${money(L.pay_min)} to ${money(L.pay_max)}, you keep ${Math.round(L.split * 100)}%, above the ${money(L.buffer)} buffer; no single day above ${Math.round(L.cons * 100)}% of the profit.`,
    `Quiet for ${L.inactivity_days} days in a row can close the account: the bot's trades keep it alive.`,
  ];
}

// ------------------------------------------------------------------------------------------------ the live account (home.json) and the fixture
/** The live numbers of a plan's account from home.json, or null. balance + floor (or room) must be there; best is rebuilt from the floor. */
export function liveFor(planKey, home) {
  const P = PLANS[planKey]; if (!P || !isObj(home) || !Array.isArray(home.accounts) || planKey === 'b25') return null;
  const a = home.accounts.find((x) => isObj(x) && (x.id === P.id || (planKey === 'atlas' && /atlas/i.test(String(x.name || '')))));
  const e = a && isObj(a.eval) ? a.eval : null; if (!e) return null;
  const L = limitsFor(P.plan, null), bal = num(e.balance), room = num(e.room), fl = num(e.floor);
  const floor = fl != null ? fl : bal != null && room != null ? bal - room : null;
  if (bal == null || floor == null) return null;
  const mll = num(e.mll) || L.mll;
  return { balance: bal, best: Math.max(floor + mll, P.start), lost: Math.max(0, num(e.dll_used) ?? 0), room: bal - floor, mll };
}
export function defaults(planKey, home, fx) {
  const P = PLANS[planKey] || PLANS.b50, live = liveFor(planKey, home), dm = !live ? liveFor(planKey, fx && fx.home) : null, src = live || dm;
  return { inp: { stop: 20, share: 0.6, balance: src ? src.balance : P.start, best: src ? src.best : P.start, lost: src ? src.lost : 0 }, live: !!live, demo: !live && !!dm };
}

export function jarvisCard(c) {
  const w = c.level;
  return { v: 1, name: 'Pnyx', status: { level: w, label: `${c.name}: ${LEVEL_WORD[w]}`.slice(0, 48) }, kpis: [{ label: 'Micros', value: String(c.micros) }, { label: 'Risk (1R)', value: money(c.risk) }, { label: 'Stop', value: `${fmtPts(c.stop)} pts` }],
    lines: [`${drawdownLine(c.room, c.mll)} on ${c.name}.`.slice(0, 118)], t: 1793394000, theme: '#14110e' };
}
