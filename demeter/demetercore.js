// DEMETER core (ES module, no DOM, no network): account health. One risk dial per account (drawdown left, trailing floor, daily loss), the payout rules in plain words,
// the days to the typical first payout, and a what-if for the position size (0.5x to 2x). Pure, so the tests call it in node.
// Inputs are published files: home.json (accounts), ledger/rules.json (MFFU's rules, from research/lit/mffu_rules.json), plutus/roadmap.json (first-payout dates) and fixture.json (DEMO).
// Money words: "Drawdown left $X of $max loss"; every dollar result carries its R (1R = the account's average losing trade; ~ = a stand-in because there is no history yet).

export const ACCOUNTS = {
  zlarior: { key: 'zlarior', name: 'Zlarior', size: '50K', plan: 'builder_50k', road: 'lit50', bot: 'LIT', risk: 425, win: 640 },
  atlas: { key: 'atlas', name: 'ATLAS', size: '25K', plan: 'builder_25k', road: 'atlas25', bot: 'ATLAS', risk: 150, win: 210 },
  blitz: { key: 'blitz', name: 'BLITZ', size: '25K', plan: 'builder_25k', road: 'blitz25', bot: 'BLITZ', risk: 120, win: 150 },
};
export const ORDER = ['zlarior', 'atlas', 'blitz'];
export const MULTS = [0.5, 0.75, 1, 1.5, 2];
const DEFAULT_LIMITS = {
  builder_50k: { target: 3000, mll: 2000, lock: 100, dll: 1000, max_micros: 40, buffer: 2100, pay_min: 500, pay_max: 2000, split: 0.8, cons: 0.5, cycle_days: 2, max_payouts: 5, inactivity_days: 7 },
  builder_25k: { target: 1500, mll: 1000, lock: 100, dll: 600, max_micros: 20, buffer: 1100, pay_min: 250, pay_max: 1000, split: 0.8, cons: 0.5, cycle_days: 2, max_payouts: 5, inactivity_days: 7 },
};

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rText(usd, risk, est) {
  const u = num(usd), k = num(risk); if (u == null || !k) return '0.0R';
  const r = Math.round((u / k) * 10) / 10; return (est ? '~' : '') + (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R';
}
export const both = (usd, risk, est) => `${moneyS(usd)} (${rText(usd, risk, est)})`;
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;

// ------------------------------------------------------------------------------------------------ rules
/** MFFU's limits for a plan: ledger/rules.json "limits" when it is there, else the built-in copy (same numbers, research/lit/mffu_rules.json 2026-10-18). */
export function limitsFor(plan, rules) {
  const L = isObj(rules) && isObj(rules.limits) && isObj(rules.limits[plan]) ? rules.limits[plan] : {};
  const out = { ...DEFAULT_LIMITS[plan] || DEFAULT_LIMITS.builder_25k };
  for (const k of Object.keys(out)) { const v = num(L[k]); if (v != null && v > 0) out[k] = v; }
  return out;
}
export function ruleLines(L, stage) {
  const lines = [
    `Max loss ${money(L.mll)}. It trails your best end-of-day balance and stops once it reaches the start balance plus ${money(L.lock)}; it never moves down.`,
    `Daily loss ${money(L.dll)}. Hit it and trading pauses for that day; the account stays open.`,
    `Size limit ${L.max_micros} micro contracts. Flat by 16:10 ET; no weekend holds.`,
    `Quiet for ${L.inactivity_days} days in a row can close the account: the bot's trades keep it alive.`,
  ];
  if (stage === 'funded' || stage === 'both') {
    lines.push(`Payouts: ${money(L.pay_min)} to ${money(L.pay_max)} each, you keep ${Math.round(L.split * 100)}%. Needs profit above the ${money(L.buffer)} buffer.`);
    lines.push(`No single day may be more than ${Math.round(L.cons * 100)}% of the profit (consistency). A payout every ${L.cycle_days} winning days, up to ${L.max_payouts} payouts on a simulated funded account.`);
  }
  return lines;
}

// ------------------------------------------------------------------------------------------------ accounts (from home.json)
export function matchKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}
export function accountView(key, a, rules) {
  const P = ACCOUNTS[key], L = limitsFor(P.plan, rules);
  const base = { key, name: P.name, size: P.size, plan: P.plan, road: P.road, bot: P.bot, has: false, stage: 'eval', mll: L.mll, room: null, floor: null, balance: null, start: null, locked: false, today: 0, week: 0,
    progress: 0, toTarget: null, target: L.target, dll: L.dll, dllUsed: 0, risk: P.risk, win: P.win, est: true, L };
  if (!isObj(a)) return base;
  const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, st = isObj(a.stats) ? a.stats : {};
  const loss = num(st.avg_loss), win = num(st.avg_win), room = num(ev.room);
  return { ...base, has: true, stage: String(a.kind || '').toLowerCase() === 'funded' ? 'funded' : 'eval', mll: num(ev.mll) || L.mll, room: room == null ? null : Math.max(0, room), floor: num(ev.floor), balance: num(ev.balance), start: num(ev.start_balance),
    locked: !!ev.locked, today: num(pnl.today) != null ? num(pnl.today) : num(ev.today) || 0, week: num(pnl.week) || 0, progress: Math.max(0, Math.min(1, num(ev.progress) || 0)), toTarget: num(ev.to_target),
    dll: num(ev.dll) || L.dll, dllUsed: num(ev.dll_used) || 0, risk: loss ? Math.abs(loss) : P.risk, win: win ? Math.abs(win) : P.win, est: !loss, status: str(ev.clock_text || ev.status, 140) };
}
// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the real home.json says "hidden_bots" (top or
// board); a hidden BLITZ has no card (the DEMO keeps its three)
const hiddenIn = (h, k) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : [];
  return L.map(String).includes(k); };
export function buildAccounts(home, rules, fixture) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [], found = {};
  for (const a of list) { const k = matchKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const real = Object.keys(found).length > 0, fx = isObj(fixture) && Array.isArray(fixture.accounts) ? fixture.accounts : [];
  return { demo: !real, accounts: ORDER.filter((k) => !(real && k === 'blitz' && hiddenIn(home, 'blitz'))).map((k) => {
    if (real) return accountView(k, found[k], rules);
    const f = fx.find((x) => x.key === k); return f ? { ...accountView(k, null, rules), ...f, has: true, demo: true } : accountView(k, null, rules);
  }) };
}

// ------------------------------------------------------------------------------------------------ the dial
export function levelOf(f) { return f < 0.25 ? 'bad' : f < 0.5 ? 'warn' : 'ok'; }
export const LEVEL_WORD = { ok: 'Safe distance', warn: 'Half the room used', bad: 'Close to the limit', off: 'No numbers yet' };
/** a half-circle gauge: 0 at the left, 1 at the right (viewBox 200 x 120, centre 100,100, radius 80). f = the share of the max loss still left. */
export function dial(f) {
  const v = Math.max(0, Math.min(1, num(f) == null ? 0 : f)), cx = 100, cy = 100, r = 80, a = Math.PI * (1 - v);
  const x = Math.round((cx + r * Math.cos(a)) * 100) / 100, y = Math.round((cy - r * Math.sin(a)) * 100) / 100;
  return { f: v, pct: Math.round(v * 100), track: `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`, arc: v <= 0 ? '' : `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${x} ${y}`, end: { x, y }, level: levelOf(v) };
}
export function health(a) {
  if (!a.has || a.room == null) return { level: 'off', text: a.has && a.stage === 'funded' ? 'Funded: see the payout rules' : LEVEL_WORD.off, f: null };
  const f = a.room / a.mll; return { level: levelOf(f), text: LEVEL_WORD[levelOf(f)], f };
}
/** the extra numbers of the dial card: floor, balance, daily loss left, target distance */
export function dialFacts(a) {
  const out = [];
  if (a.floor != null) out.push(['Trailing floor', money(a.floor), a.locked ? 'Locked: it cannot move down' : 'Moves up with your best day']);
  if (a.balance != null) out.push(['Balance', money(a.balance), '']);
  out.push(['Daily loss left', money(Math.max(0, a.dll - a.dllUsed)), `of ${money(a.dll)} today`]);
  if (a.stage === 'eval' && a.toTarget != null) out.push(['To the target', money(a.toTarget), `${Math.round(a.progress * 100)}% done`]);
  out.push(['Today', both(a.today, a.risk, a.est), '']);
  return out;
}

// ------------------------------------------------------------------------------------------------ what if the size were different
/** mult 0.5..2: one stop-out costs risk x mult. How many stops in a row end the account (or hit the day's limit), what a bad day does to the room, what one win pays. */
export function whatIf(a, mult) {
  const m = Math.max(0.25, Math.min(4, num(mult) || 1)), loss = a.risk * m, win = a.win * m;
  const stops = a.room != null && loss > 0 ? Math.max(0, Math.ceil(a.room / loss - 1e-9)) : null;
  const dayStops = a.dll && loss > 0 ? Math.max(1, Math.ceil((a.dll - a.dllUsed) / loss - 1e-9)) : null;
  const twoR = loss * 2, share = a.room ? Math.min(1, twoR / a.room) : null;
  const winsToTarget = a.toTarget != null && win > 0 ? Math.ceil(a.toTarget / win - 1e-9) : null;
  const level = stops == null ? 'off' : stops <= 2 ? 'bad' : stops <= 4 ? 'warn' : 'ok';
  const lines = [];
  if (stops != null) lines.push(`${stops} stops in a row (${money(loss)} each) use up the whole ${money(a.room)} of drawdown.`);
  if (share != null) lines.push(`A bad day of two losses costs ${money(twoR)}, which is ${Math.round(share * 100)}% of the drawdown left.`);
  if (dayStops != null) lines.push(`The ${money(a.dll)} daily limit stops the day after ${dayStops} loss${dayStops === 1 ? '' : 'es'}.`);
  if (winsToTarget != null) lines.push(`${winsToTarget} win${winsToTarget === 1 ? '' : 's'} of ${money(win)} reach the target.`);
  return { mult: m, loss, win, lossR: rText(-loss, a.risk, a.est), winR: rText(win, a.risk, a.est), stops, dayStops, share, winsToTarget, level, lines, note: m > 1 ? 'A bigger size wins faster and loses faster. The wide stop already sets the size, so this is only a thought experiment: the bot never changes size because of this page.' : m < 1 ? 'A smaller size gives you more stops of room and a slower climb.' : 'This is the size the bot trades now.' };
}

// ------------------------------------------------------------------------------------------------ payouts
export function daysBetween(a, b) {
  const x = Date.parse(a + 'T12:00:00Z'), y = Date.parse(b + 'T12:00:00Z');
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null;
}
export function firstPayout(roadmap, roadId, today) {
  const acc = isObj(roadmap) && Array.isArray(roadmap.accounts) ? roadmap.accounts.find((x) => x && x.id === roadId) : null;
  const ver = acc && (acc[roadmap.conservative || 'H2'] || acc.H2), f = ver && Array.isArray(ver.first) ? ver.first.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (f.length < 3) return null;
  const [early, typical, late] = f, dt = daysBetween(today, typical);
  return { early, typical, late, days: dt, daysEarly: daysBetween(today, early), daysLate: daysBetween(today, late), passed: dt != null && dt <= 0,
    text: dt == null ? '' : dt <= 0 ? `The typical first payout date (${typical}) is here: request it when the account reaches the buffer.` : `Typical first payout in ${dt} days (${typical}); a quick run could be ${Math.max(0, daysBetween(today, early))} days, a slow one ${daysBetween(today, late)}.` };
}
/** what an eval account must do before it can pay: pass the target, then profit above the buffer */
export function payoutPath(a) {
  const L = a.L, firstBal = L.buffer + L.pay_min;
  const steps = [];
  if (a.stage === 'eval') steps.push(`Pass the eval: reach the ${money(L.target)} profit target${a.toTarget != null ? ` (${money(a.toTarget)} to go)` : ''}.`);
  steps.push(`On the funded account, earn ${money(firstBal)} of profit: the ${money(L.buffer)} buffer plus ${money(L.pay_min)}.`);
  steps.push(`Request a payout of ${money(L.pay_min)} to ${money(L.pay_max)}; you keep ${Math.round(L.split * 100)}% (${money(L.pay_min * L.split)} to ${money(L.pay_max * L.split)}).`);
  return steps;
}
export function jarvisCard(accts) {
  const have = accts.filter((a) => a.has && a.room != null), w = have.sort((x, y) => x.room / x.mll - y.room / y.mll)[0];
  const lvl = w ? levelOf(w.room / w.mll) : 'off';
  return { v: 1, name: 'Demeter', status: { level: lvl, label: w ? `${w.name}: ${LEVEL_WORD[lvl]}`.slice(0, 48) : 'No numbers yet' },
    kpis: accts.slice(0, 3).map((a) => ({ label: a.name.slice(0, 20), value: a.room != null ? `${money(a.room)} left` : 'n/a' })), lines: [w ? str(`${drawdownLine(w.room, w.mll)} on ${w.name}.`, 118) : 'Waiting for the accounts to report.'], t: 1793394000, theme: '#14110e' };
}
