// AEGIS core (ES module, no DOM, no network): the shield. A risk-guard for the three MFFU accounts (Zlarior 50K, ATLAS 25K, BLITZ 25K): the real rules in plain words, "Drawdown left $X of $max loss",
// a what-if "if the next trade is a full stop: you will have $Y left" and a lock-out list (when to stop for the day). Pure, so tests/test_aegis_page.py calls it in node.
// Inputs are published files only: home.json (the live accounts), ledger/rules.json (MFFU's limits) and fixture.json (DEMO). Planning and warning only: it never places, changes or blocks an order.
// Every dollar of risk carries its R (1R = the planned loss of one full stop; the R wears a ~ when the stop is a stand-in).

export const PLANS = {
  zlarior: { key: 'zlarior', name: 'Zlarior', bot: 'LIT', size: '50K', label: 'MFFU Builder 50K', plan: 'builder_50k', risk: 425 },
  atlas: { key: 'atlas', name: 'ATLAS', bot: 'ATLAS', size: '25K', label: 'MFFU Builder 25K', plan: 'builder_25k', risk: 150 },
  blitz: { key: 'blitz', name: 'BLITZ', bot: 'BLITZ', size: '25K', label: 'MFFU Builder 25K', plan: 'builder_25k', risk: 120 },
};
export const ORDER = ['zlarior', 'atlas', 'blitz'];
// the same numbers as research/lit/mffu_rules.json 2026-10-18 (a test keeps them equal); ledger/rules.json overrides good values only
const DEFAULT_LIMITS = {
  builder_50k: { target: 3000, mll: 2000, lock: 100, dll: 1000, max_micros: 40, flat_by_mod: 970, buffer: 2100, pay_min: 500, pay_max: 2000, split: 0.8, cons: 0.5, inactivity_days: 7 },
  builder_25k: { target: 1500, mll: 1000, lock: 100, dll: 600, max_micros: 20, flat_by_mod: 970, buffer: 1100, pay_min: 250, pay_max: 1000, split: 0.8, cons: 0.5, inactivity_days: 7 },
};
export { DEFAULT_LIMITS };

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);

export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rText(usd, risk, est) {
  const u = num(usd), k = num(risk);
  if (u == null || !k) return '0.0R';
  const r = Math.round((u / k) * 10) / 10, s = (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R';
  return (est ? '~' : '') + s;
}
export const both = (usd, risk, est) => `${moneyS(usd)} (${rText(usd, risk, est)})`;
export function drawdownLine(room, mll) { return `Drawdown left ${money(room)} of ${money(mll)} max loss`; }
export function clock(mod) { const m = num(mod); if (m == null) return '16:10'; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

/** the limits of a plan: the built-in numbers, with good numbers from ledger/rules.json laid over them (junk is ignored) */
export function limitsFor(plan, rules) {
  const base = { ...(DEFAULT_LIMITS[plan] || DEFAULT_LIMITS.builder_50k) };
  const o = isObj(rules) && isObj(rules.limits) && isObj(rules.limits[plan]) ? rules.limits[plan] : null;
  if (o) for (const k of Object.keys(base)) { const v = num(o[k]); if (v != null && v > 0) base[k] = v; }
  return base;
}

// ------------------------------------------------------------------------------------------------ accounts
export function matchKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}

/** one account view. a = the home.json account (or a fixture row), rules = ledger/rules.json. Never throws; a missing account gives has = false. */
export function accountView(key, a, rules) {
  const P = PLANS[key], L = limitsFor(P.plan, rules);
  const base = { key, name: P.name, size: P.size, label: P.label, bot: P.bot, has: false, kind: 'eval', mll: L.mll, dll: L.dll, target: L.target, room: null, floor: null, balance: null, today: 0, week: 0, dllUsed: 0, risk: P.risk, est: true, limits: L, demo: false };
  if (!isObj(a)) return base;
  const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : a, pnl = isObj(a.pnl) ? a.pnl : {}, st = isObj(a.stats) ? a.stats : {};
  const loss = num(st.avg_loss) || num(a.risk), mll = num(ev.mll) || L.mll, room = num(ev.room);
  const kind0 = String(a.kind || '').toLowerCase(), funded = kind0 === 'funded';
  const today = num(pnl.today) != null ? num(pnl.today) : num(ev.today) != null ? num(ev.today) : num(a.today) || 0;
  return { ...base, has: true, kind: funded ? 'funded' : kind0 === 'paper' ? 'paper' : 'eval', mll, room: room == null ? null : Math.max(0, Math.min(mll, room)), floor: num(ev.floor), balance: num(ev.balance), today,
    week: num(pnl.week) != null ? num(pnl.week) : num(a.week) || 0, dll: num(ev.dll) || L.dll, dllUsed: Math.max(0, num(ev.dll_used) != null ? num(ev.dll_used) : num(a.dllUsed) || 0), risk: loss ? Math.abs(loss) : P.risk, est: !loss,
    target: num(ev.target) || L.target, toTarget: num(ev.to_target) != null ? num(ev.to_target) : num(a.toTarget), connected: isObj(a.conn) && typeof a.conn.connected === 'boolean' ? a.conn.connected : typeof a.connected === 'boolean' ? a.connected : null };
}

/** the three accounts, in order. Real accounts first; demo = true when none of the three is in home.json (the fixture's rows are used, labelled). */
// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the real home.json says "hidden_bots" (top or
// board); a hidden BLITZ has no card (the DEMO keeps its three)
const hiddenIn = (h, k) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : [];
  return L.map(String).includes(k); };
export function buildAccounts(home, fixture, rules) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [];
  const found = {};
  for (const a of list) { const k = matchKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const real = Object.keys(found).length > 0;
  const fx = isObj(fixture) && Array.isArray(fixture.accounts) ? fixture.accounts : [];
  return { demo: !real, accounts: ORDER.filter((k) => !(real && k === 'blitz' && hiddenIn(home, 'blitz'))).map((k) => {
    if (real) return accountView(k, found[k], rules);
    const f = fx.find((x) => x && x.key === k); const v = accountView(k, f || null, rules); return f ? { ...v, demo: true } : v;
  }) };
}

/** how much of the max loss is still there (0..1); null without numbers */
export function rimFraction(a) { return a && a.has && a.room != null && a.mll > 0 ? Math.max(0, Math.min(1, a.room / a.mll)) : null; }

/** danger level: bad under 25% of the max loss left, warn under 50%, or the daily loss at 80%. */
export function health(a) {
  if (!a || !a.has) return { level: 'off', text: 'No numbers yet' };
  if (a.room == null) return { level: 'off', text: 'Waiting for the bot' };
  const f = a.room / a.mll, d = a.dll > 0 ? a.dllUsed / a.dll : 0;
  if (a.room <= 0) return { level: 'bad', text: 'The max loss is used up' };
  if (f < 0.25 || d >= 0.8) return { level: 'bad', text: f < 0.25 ? 'Very close to the floor' : 'Very close to the daily loss' };
  if (f < 0.5 || d >= 0.5) return { level: 'warn', text: f < 0.5 ? 'Getting close to the floor' : 'Half the daily loss is used' };
  return { level: 'ok', text: 'Safe distance' };
}

/** the daily loss left today (never below 0). The daily loss is "soft": reaching it ends the day, not the account. */
export function dllLeft(a) { return a && a.has ? Math.max(0, a.dll - a.dllUsed) : null; }

/** what if the next trade is a full stop: risk = the dollars lost at the stop (default the account's average loss). */
export function whatIf(a, risk) {
  const r = Math.abs(num(risk) != null ? num(risk) : a.risk), est = a.est;     // 1R = the account's own full stop, so a bigger typed stop shows as -2.0R, -6.0R
  if (!a || !a.has || a.room == null) return { ok: false, risk: r, level: 'off', text: 'No live numbers yet, so there is nothing to subtract from.', lines: [] };
  const left = Math.max(0, a.room - r), dl = dllLeft(a), dayAfter = Math.max(0, (dl == null ? a.dll : dl) - r);
  const lines = [];
  let level = 'ok';
  if (a.room - r <= 0) { level = 'bad'; lines.push(`This stop is bigger than the drawdown you have left: the account would be over the floor. Do not take it at this size.`); }
  else if (left / a.mll < 0.25) { level = 'bad'; lines.push('After a full stop you would be very close to the floor. Size down or stand aside.'); }
  else if (left / a.mll < 0.5) { level = 'warn'; lines.push('After a full stop you would be under half of the max loss. Take a smaller size.'); }
  else lines.push('After a full stop you would still be a safe distance from the floor.');
  if ((dl == null ? a.dll : dl) - r <= 0) { if (level === 'ok') level = 'warn'; lines.push(`A full stop would use up the daily loss of ${money(a.dll)}: the day would be over.`); }
  return { ok: true, risk: r, est, left, dayAfter, level,
    text: `If the next trade is a full stop (${both(-r, a.risk, est)}): you will have ${money(left)} left of ${money(a.mll)} max loss, and ${money(dayAfter)} of the ${money(a.dll)} daily loss.`, lines };
}

/** the lock-out list: when to stop for the day. Each rule says whether it is hit right now. [{id, level: ok|warn|bad, hit, title, why}] */
export function lockouts(a) {
  if (!a || !a.has) return [];
  const f = a.room == null ? 1 : a.room / a.mll, d = a.dll > 0 ? a.dllUsed / a.dll : 0, day = a.today, r = a.risk || 1;
  const L = [];
  const rule = (id, hit, hardHit, title, why) => L.push({ id, hit, level: hardHit ? 'bad' : hit ? 'warn' : 'ok', title, why });
  rule('dll', d >= 0.6, d >= 1, `Stop for the day when ${money(a.dll * 0.6)} of the ${money(a.dll)} daily loss is used`, `Used so far today: ${money(a.dllUsed)} (${Math.round(d * 100)}%). At 100% the day ends by itself; stopping at 60% keeps a second chance for tomorrow.`);
  rule('two', day <= -2 * r && r > 0, day <= -3 * r, `Stop after two full stops in a day (${both(-2 * r, r, a.est)})`, `Today so far ${both(day, r, a.est)}. Two full stops in a row means the day is not working: wait for tomorrow.`);
  rule('floor', f < 0.5, f < 0.25, 'Trade half size when less than half of the max loss is left; stop at a quarter', `${a.room == null ? 'No live number yet' : drawdownLine(a.room, a.mll)}. A smaller size keeps the account alive while it recovers.`);
  rule('late', false, false, `No new trades after 15:30 ET; everything flat by ${clock(a.limits.flat_by_mod)} ET`, `MFFU closes positions at ${clock(a.limits.flat_by_mod)} ET and late orders can disqualify the account. The bot enters 02:00-15:30 only.`);
  const prog = a.target > 0 && a.toTarget != null ? 1 - a.toTarget / a.target : 0;
  rule('target', a.toTarget != null && a.toTarget <= 0, false, 'Stop for the day when the target is reached', a.toTarget != null ? `${money(Math.max(0, a.toTarget))} still to make (${Math.round(Math.max(0, Math.min(1, prog)) * 100)}% done). The target ends the eval; extra risk after it only adds a chance to give it back.` : 'The target distance is not published yet.');
  const best = Math.max(day, 0);
  rule('cons', a.kind === 'funded' && a.week > 0 && best > a.limits.cons * a.week, false, `Funded: stop when today is more than ${Math.round(a.limits.cons * 100)}% of the cycle's profit`, `MFFU's consistency rule at a payout: the best day may not be more than ${Math.round(a.limits.cons * 100)}% of the cycle's profit. Today ${moneyS(day)}, week ${moneyS(a.week)}.`);
  return L;
}

/** the rules of the account in plain words (the real MFFU numbers) */
export function ruleLines(a) {
  const L = a.limits, pay = `${money(L.pay_min)} to ${money(L.pay_max)}`;
  return [
    `Max loss ${money(L.mll)}. It trails your best end-of-day balance and stops moving once it is $${L.lock} above the start balance (a locked floor).`,
    `Daily loss ${money(L.dll)} (soft): reaching it ends the day, it does not close the account.`,
    `Flat by ${clock(L.flat_by_mod)} ET every day: no overnight or weekend holds. Late orders can disqualify the account.`,
    `Contract limit ${L.max_micros} micros at once.`,
    `Target ${money(L.target)} to pass the eval. No time limit, but a trade at least every ${L.inactivity_days} days.`,
    `Payouts (funded): ${pay} each, ${Math.round(L.split * 100)}% to you, and the best day may not be more than ${Math.round(L.cons * 100)}% of the cycle's profit. Rules checked 2026-10-18: re-check before a payout.`,
  ];
}

/** the shield: how much gold rim is left. */
export function shieldOf(a) {
  const f = rimFraction(a), h = health(a);
  return { rim: f == null ? 0 : f, level: h.level, text: h.text, sword: a && a.has ? a.name : '' };
}

/** the one-line answer for the status */
export function sayLine(a) {
  if (!a.has || a.room == null) return `${a.name}: no live numbers yet.`;
  return `${a.name} ${a.size}: ${drawdownLine(a.room, a.mll)}. ${health(a).text}.`;
}

export function jarvisCard(a, risk) {
  const w = a && a.has && a.room != null ? whatIf(a, risk) : null, h = health(a);
  return { name: 'Aegis', level: h.level, room: a && a.room != null ? money(a.room) : '-', mll: a ? money(a.mll) : '-', line: w ? w.text : 'No live numbers yet.' };
}
