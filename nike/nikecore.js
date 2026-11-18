// NIKE core (ES module, no DOM, no network): the trophy hall. Milestones and wins from PUBLISHED files only, each with an unlocked / locked state, a date and one plain sentence.
// Inputs (all optional, never invented): home.json (accounts[]: kind funded or eval.passed / progress for the first eval; payouts[] {usd, date} on the account or at the top),
// ledger/rules.json (the target and payout rules), odeon/trades.json (the bot's trades {id, day, usd, r}), the journal's ratings ('journal.v1' entries {rating}, this phone only),
// kalshicity/edges.json (book.total, book.days). A number that is not published is a "not yet" placeholder, never a guess. Fixture = DEMO, labelled, used only when home.json is missing.
// Pure, so tests/test_nike_page.py calls it in node. Dates are Y-M-D (UTC date maths, no time zone).

export const DEFAULTS = { target: 3000, payoutMin: 500, payoutGoal: 1000, maxPayouts: 5, dll: 1000, planGoal: 5, keptGoal: 10, kalshiGoal: 100, kalshiStreakGoal: 5 };
export const SHAPES = ['cup', 'laurel', 'owl', 'shield'];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, n) : '');
const r2 = (x) => Math.round(x * 100) / 100;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rText(r) { const v = num(r); if (v == null) return ''; const k = Math.round(v * 10) / 10; return (k > 0 ? '+' : k < 0 ? '-' : '') + Math.abs(k).toFixed(1) + 'R'; }
export function both(usd, r) { const t = rText(r); return t ? `${moneyS(usd)} (${t})` : moneyS(usd); }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateText(ymd) { if (!YMD.test(String(ymd || ''))) return ''; const [y, m, d] = ymd.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; }
export function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export function monday(ymd) { const [y, m, d] = ymd.split('-').map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(ymd, -((wd + 6) % 7)); }

// ---- the inputs, cleaned ----
export function limitsFrom(rules) {
  const L = { ...DEFAULTS }, p = isObj(rules) && isObj(rules.plans) ? rules.plans.builder_50k : null;
  if (isObj(p)) {
    if (num(p.target) > 0) L.target = num(p.target);
    if (isObj(p.payout)) { if (num(p.payout.min) > 0) L.payoutMin = num(p.payout.min); if (num(p.payout.max_payouts) > 0) L.maxPayouts = Math.round(num(p.payout.max_payouts)); }
  }
  return L;
}
function cleanPayouts(arr) {
  return (Array.isArray(arr) ? arr : []).filter(isObj).map((p) => ({ usd: num(p.usd != null ? p.usd : p.amount), date: YMD.test(String(p.date || '')) ? p.date : '' })).filter((p) => p.usd != null && p.usd > 0).slice(0, 40);
}
export function normHome(home) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts.filter(isObj) : [];
  const accounts = list.map((a) => {
    const ev = isObj(a.eval) ? a.eval : {}, funded = String(a.kind || '').toLowerCase() === 'funded';
    const to = num(ev.to_target != null ? ev.to_target : ev.toTarget), prog = num(ev.progress != null ? ev.progress : a.progress);
    const passed = funded || a.passed === true || ev.passed === true || to === 0 || (prog != null && prog >= 1);
    return { name: str(a.name || a.id, 40) || 'Account', funded, passed, passedOn: YMD.test(String(a.passed_on || ev.passed_on || '')) ? (a.passed_on || ev.passed_on) : '', toTarget: to, progress: prog == null ? null : Math.max(0, Math.min(1, prog)), payouts: cleanPayouts(a.payouts) };
  });
  const payouts = cleanPayouts(isObj(home) ? home.payouts : []).concat(...accounts.map((a) => a.payouts)).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { has: !!list.length || (isObj(home) && Array.isArray(home.payouts)), accounts, payouts };
}
export function normTrades(odeon) {
  const list = isObj(odeon) && Array.isArray(odeon.trades) ? odeon.trades : [];
  const out = [];
  for (const t of list) {
    if (!isObj(t) || !YMD.test(String(t.day || ''))) continue;
    const usd = num(t.usd != null ? t.usd : t.pnl); if (usd == null) continue;
    const tt = num(t.entry && t.entry.t != null ? t.entry.t : t.t);
    out.push({ id: str(String(t.id == null ? '' : t.id), 80), day: t.day, usd: r2(usd), r: num(t.r), t: tt != null ? tt : Date.parse(t.day + 'T14:00:00Z') / 1000 });
  }
  return out.sort((a, b) => a.t - b.t);
}
export function normRatings(store) {
  const e = isObj(store) && isObj(store.entries) ? store.entries : {}, out = {};
  for (const k of Object.keys(e).slice(0, 4000)) if (isObj(e[k]) && typeof e[k].rating === 'string') out[k] = e[k].rating;
  return out;
}
export function normKalshi(edges) {
  const b = isObj(edges) && isObj(edges.book) ? edges.book : null;
  if (!b || num(b.total) == null) return null;
  const days = (Array.isArray(b.days) ? b.days : []).filter((d) => Array.isArray(d) && YMD.test(String(d[0])) && num(d[1]) != null).map((d) => [d[0], r2(num(d[1]))]).slice(-90);
  return { total: r2(num(b.total)), days };
}

// ---- the maths ----
export function dayTotals(trades) {
  const m = new Map();
  for (const t of trades) { const c = m.get(t.day) || { day: t.day, usd: 0, r: 0, hasR: false, n: 0 }; c.usd += t.usd; if (t.r != null) { c.r += t.r; c.hasR = true; } c.n++; m.set(t.day, c); }
  return [...m.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}
export function bestWeek(days) {
  const w = new Map();
  for (const d of days) { const k = monday(d.day), c = w.get(k) || { start: k, usd: 0, r: 0, hasR: false }; c.usd += d.usd; if (d.hasR) { c.r += d.r; c.hasR = true; } w.set(k, c); }
  let best = null; for (const c of w.values()) if (!best || c.usd > best.usd) best = c;
  return best ? { start: best.start, usd: r2(best.usd), r: best.hasR ? Math.round(best.r * 100) / 100 : null } : null;
}
export function planStreak(trades, ratings) {
  let best = 0, cur = 0, end = '', curEnd = '';
  for (const t of trades) { if (ratings[t.id] === 'plan') { cur++; curEnd = t.day; if (cur > best) { best = cur; end = curEnd; } } else cur = 0; }
  return { best, current: cur, end, rated: trades.filter((t) => ratings[t.id]).length };
}
export function keptStreak(days, dll) {
  let best = 0, cur = 0, end = '', breaches = 0;
  for (const d of days) { if (d.usd > -dll) { cur++; if (cur > best) { best = cur; end = d.day; } } else { cur = 0; breaches++; } }
  return { best, end, breaches, days: days.length };
}
export function greenStreak(days) {
  let best = 0, cur = 0, end = '';
  for (const d of days) { if (d[1] > 0) { cur++; if (cur > best) { best = cur; end = d[0]; } } else cur = 0; }
  return { best, end };
}
export function crossDate(days, total, goal) {          // the day the running total first reached the goal; only when the days add up to the total (else unknown)
  if (!days.length || Math.abs(days.reduce((s, d) => s + d[1], 0) - total) > 1) return '';
  let s = 0; for (const d of days) { s += d[1]; if (s >= goal) return d[0]; } return '';
}

// ---- the trophies ----
const prog = (v, goal) => (goal > 0 ? Math.max(0, Math.min(1, v / goal)) : 0);
export function build(inp) {
  const L = limitsFrom(inp.rules), H = inp.home || normHome(null), T = inp.trades || [], R = inp.ratings || {}, K = inp.kalshi || null;
  const days = dayTotals(T), out = [];
  const add = (o) => out.push({ date: '', value: null, goal: null, progress: 0, ...o });

  const passedA = H.accounts.find((a) => a.passed);
  const behind = H.accounts.filter((a) => !a.passed && a.progress != null).sort((a, b) => b.progress - a.progress)[0];
  add(passedA ? { id: 'first_eval', shape: 'cup', name: 'First eval passed', state: 'unlocked', date: passedA.passedOn, progress: 1, value: money(L.target), sentence: `${passedA.name} has passed its first test: the ${money(L.target)} profit target is met.${passedA.passedOn ? '' : ' The date was not published.'}` }
    : { id: 'first_eval', shape: 'cup', name: 'First eval passed', state: 'locked', progress: behind ? behind.progress : 0, goal: money(L.target), sentence: `Not yet. An eval needs ${money(L.target)} of profit${behind && behind.toTarget != null ? `; ${money(behind.toTarget)} to go on ${behind.name}` : ''}.` });

  const pay = H.payouts, paid = r2(pay.reduce((s, p) => s + p.usd, 0));
  add(pay.length ? { id: 'payout_first', shape: 'laurel', name: 'First payout', state: 'unlocked', date: pay[0].date, progress: 1, value: money(pay[0].usd), sentence: `Your first payout: ${money(pay[0].usd)}${pay[0].date ? ' on ' + dateText(pay[0].date) : ''}. A real payout, not a backtest.` }
    : { id: 'payout_first', shape: 'laurel', name: 'First payout', state: 'locked', goal: money(L.payoutMin), sentence: `Not yet. No payout has been published. A first payout needs about ${money(L.payoutMin)} of profit above the buffer.` });

  let run = 0, hit = '';
  for (const p of pay) { run += p.usd; if (!hit && run >= L.payoutGoal) hit = p.date; }
  add(paid >= L.payoutGoal ? { id: 'payout_1k', shape: 'laurel', name: `${money(L.payoutGoal)} paid out`, state: 'unlocked', date: hit, progress: 1, value: money(paid), sentence: `${money(paid)} paid out in total over ${pay.length} payout${pay.length === 1 ? '' : 's'}.` }
    : { id: 'payout_1k', shape: 'laurel', name: `${money(L.payoutGoal)} paid out`, state: 'locked', progress: prog(paid, L.payoutGoal), goal: money(L.payoutGoal), sentence: `Not yet. ${money(paid)} of ${money(L.payoutGoal)} paid out so far.` });

  const bw = bestWeek(days);
  add(bw && bw.usd > 0 ? { id: 'best_week', shape: 'cup', name: 'Best week', state: 'unlocked', date: bw.start, progress: 1, value: moneyS(bw.usd), sentence: `${both(bw.usd, bw.r)} in the week of ${dateText(bw.start)}, from the bot's published trades.` }
    : { id: 'best_week', shape: 'cup', name: 'Best week', state: 'locked', sentence: T.length ? 'Not yet. No winning week in the published trades.' : 'Not yet. No trades are published.' });

  const ps = planStreak(T, R);
  add(ps.best >= L.planGoal ? { id: 'plan_streak', shape: 'owl', name: 'Followed the plan', state: 'unlocked', date: ps.end, progress: 1, value: `${ps.best} in a row`, sentence: `${ps.best} trades in a row marked "followed plan" in your journal. The longest run so far.` }
    : { id: 'plan_streak', shape: 'owl', name: 'Followed the plan', state: 'locked', progress: prog(ps.best, L.planGoal), goal: `${L.planGoal} in a row`, sentence: ps.rated ? `Not yet. ${ps.best} in a row so far, ${L.planGoal} needed.` : `Not yet. Mark trades "followed plan" in Mnemosyne to start the count (${L.planGoal} in a row).` });

  const ks = keptStreak(days, L.dll);
  add(ks.best >= L.keptGoal ? { id: 'rules_kept', shape: 'shield', name: 'Rules kept', state: 'unlocked', date: ks.end, progress: 1, value: `${ks.best} days`, sentence: `${ks.best} trading days in a row inside the ${money(L.dll)} daily loss limit (the bot's published trades only).` }
    : { id: 'rules_kept', shape: 'shield', name: 'Rules kept', state: 'locked', progress: prog(ks.best, L.keptGoal), goal: `${L.keptGoal} days`, sentence: ks.days ? `Not yet. ${ks.best} trading days in a row inside the ${money(L.dll)} daily loss limit, ${L.keptGoal} needed.` : 'Not yet. No trading days are published.' });

  add(K && K.total >= L.kalshiGoal ? { id: 'kalshi_100', shape: 'shield', name: 'Kalshi in the green', state: 'unlocked', date: crossDate(K.days, K.total, L.kalshiGoal), progress: 1, value: moneyS(K.total), sentence: `The Kalshi bot is ${moneyS(K.total)} up in total (paper or live as published).` }
    : { id: 'kalshi_100', shape: 'shield', name: 'Kalshi in the green', state: 'locked', progress: K ? prog(Math.max(0, K.total), L.kalshiGoal) : 0, goal: money(L.kalshiGoal), sentence: K ? `Not yet. The Kalshi bot is ${moneyS(K.total)} in total, ${money(L.kalshiGoal)} needed.` : 'Not yet. No Kalshi numbers are published.' });

  const gs = K ? greenStreak(K.days) : { best: 0, end: '' };
  add(gs.best >= L.kalshiStreakGoal ? { id: 'kalshi_streak', shape: 'owl', name: 'Kalshi green run', state: 'unlocked', date: gs.end, progress: 1, value: `${gs.best} days`, sentence: `${gs.best} winning Kalshi days in a row.` }
    : { id: 'kalshi_streak', shape: 'owl', name: 'Kalshi green run', state: 'locked', progress: prog(gs.best, L.kalshiStreakGoal), goal: `${L.kalshiStreakGoal} days`, sentence: K ? `Not yet. ${gs.best} winning days in a row, ${L.kalshiStreakGoal} needed.` : 'Not yet. No Kalshi days are published.' });
  return out;
}
export function summary(list) {
  const n = list.filter((t) => t.state === 'unlocked').length;
  return { n, total: list.length, text: n ? `${n} of ${list.length} trophies earned. The rest say plainly what is still missing.` : `No trophy earned yet, and that is fine: ${list.length} are waiting, each with what it needs.` };
}
// the fixture stores trades as day offsets from today, like Hestia's
export function demoInputs(fx, today) {
  const f = isObj(fx) ? fx : {};
  const trades = (Array.isArray(f.trades) ? f.trades : []).filter(isObj).map((t, i) => ({ id: 'demo.' + (i + 1), day: addDays(today, -Math.abs(num(t.off) || 0)), usd: t.usd, r: t.r, entry: { t: Date.parse(addDays(today, -Math.abs(num(t.off) || 0)) + 'T14:00:00Z') / 1000 + i } }));
  const rated = {}; trades.forEach((t, i) => { if ((Array.isArray(f.plan_not) ? f.plan_not : []).indexOf(i) < 0) rated[t.id] = { rating: 'plan' }; });
  const k = isObj(f.kalshi) ? f.kalshi : {};
  const pay = (Array.isArray(f.payouts) ? f.payouts : []).filter(isObj).map((p) => ({ usd: p.usd, date: addDays(today, -Math.abs(num(p.off) || 0)) }));
  return { home: { accounts: (Array.isArray(f.accounts) ? f.accounts : []).filter(isObj).map((a) => (num(a.passed_off) != null ? { ...a, passed_on: addDays(today, -Math.abs(num(a.passed_off))) } : a)), payouts: pay }, trades: { trades }, store: { entries: rated }, kalshi: { book: { total: k.total, days: (Array.isArray(k.days) ? k.days : []).map((d) => [addDays(today, -Math.abs(num(d[0]) || 0)), d[1]]) } }, rules: null };
}
export function jarvisCard(list, nowSec, demo) {
  const s = summary(list), next = list.filter((t) => t.state === 'locked').sort((a, b) => b.progress - a.progress)[0];
  return { v: 1, name: 'Nike', status: { level: demo ? 'off' : s.n ? 'ok' : 'warn', label: demo ? 'Demo data' : `${s.n} of ${s.total} earned` },
    kpis: [{ label: 'Trophies', value: `${s.n} of ${s.total}` }, { label: 'Next', value: next ? next.name.slice(0, 24) : 'All earned' }, { label: 'Progress', value: next ? `${Math.round(next.progress * 100)}%` : '100%' }],
    lines: [s.text.slice(0, 118), next ? next.sentence.slice(0, 118) : 'Every trophy is earned.'], t: Math.round(nowSec), open: '#', theme: '#14110e', stale_after: 604800 };
}
