// ARGO core (ES module, no DOM, no network): the voyage. The owner's money goals as a ladder of islands, with progress computed ONLY from published numbers
// (home.json: funded accounts and payouts[] {usd, date}; ledger/rules.json: the payout rules) and honest ETA ranges from the real monthly rate (slowest / base / fastest month, n shown, "not a promise").
// Goals are editable (localStorage in the page, export / import JSON here). A number that is not published is "not yet", never a guess. Pure, so tests/test_argo_page.py calls it in node.

export const TYPES = {
  payouts: { label: 'Number of payouts', unit: 'payouts' },
  paid: { label: 'Total paid out ($)', unit: '$ paid' },
  funded: { label: 'Funded accounts', unit: 'accounts' },
  month: { label: 'Paid per month ($)', unit: '$ a month' },
};
export const DEFAULT_GOALS = [
  { id: 'g1', name: 'First payout', type: 'payouts', target: 1 },
  { id: 'g2', name: '$1,000 paid out', type: 'paid', target: 1000 },
  { id: 'g3', name: '$5,000 paid out', type: 'paid', target: 5000 },
  { id: 'g4', name: 'Fund 3 accounts', type: 'funded', target: 3 },
  { id: 'g5', name: '$10,000 a month', type: 'month', target: 10000 },
];
export const MAX_GOALS = 12, WINDOW = 6, MIN_N = 2;
const DEF_RULES = { buffer: 2100, min: 500, max: 2000, split: 0.8, max_payouts: 5 };

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, n) : '');
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export const pct = (x) => `${Math.round(Math.max(0, Math.min(1, num(x) || 0)) * 100)}%`;
export function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export function monthKey(ymd) { return ymd.slice(0, 7); }
export function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
export function monthText(ym) { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
export function etaMonth(today, months) { return monthText(addMonths(monthKey(today), Math.max(1, Math.ceil(months - 1e-9)))); }

// ---- goals: clean, export, import ----
export function cleanGoal(g, i) {
  if (!isObj(g)) return null;
  const type = TYPES[g.type] ? g.type : null, target = num(g.target), name = str(g.name, 40);
  if (!type || target == null || !(target > 0) || target > 1e7 || !name) return null;
  const id = /^[A-Za-z0-9_-]{1,24}$/.test(String(g.id || '')) ? String(g.id) : 'g' + (i + 1);
  return { id, name, type, target: type === 'paid' || type === 'month' ? Math.round(target) : Math.max(1, Math.round(target)) };
}
export function normGoals(arr) {
  const out = [], seen = new Set();
  (Array.isArray(arr) ? arr : []).forEach((g, i) => { const c = cleanGoal(g, i); if (c && out.length < MAX_GOALS) { let id = c.id, k = 1; while (seen.has(id)) id = `${c.id}_${k++}`; seen.add(id); out.push({ ...c, id }); } });
  return out;
}
export const exportJson = (goals) => JSON.stringify({ v: 1, kind: 'argo-goals', goals: normGoals(goals) }, null, 1);
export function parseImport(text) {
  let j; try { j = JSON.parse(String(text || '')); } catch (_) { return { ok: false, error: 'That is not valid JSON. Paste the exported text exactly.' }; }
  const arr = Array.isArray(j) ? j : isObj(j) ? j.goals : null;
  if (!Array.isArray(arr)) return { ok: false, error: 'No goals found in that text.' };
  const goals = normGoals(arr);
  if (!goals.length) return { ok: false, error: 'None of those goals could be read (name, type and a target above zero are needed).' };
  return { ok: true, goals, dropped: arr.length - goals.length };
}
export function nextId(goals) { let n = goals.length + 1; while (goals.some((g) => g.id === 'g' + n)) n++; return 'g' + n; }

// ---- the real numbers ----
export function rulesFrom(rules) {
  const R = { ...DEF_RULES }, p = isObj(rules) && isObj(rules.plans) && isObj(rules.plans.builder_50k) ? rules.plans.builder_50k.payout : null;
  if (isObj(p)) { for (const k of ['buffer', 'min', 'max', 'split']) if (num(p[k]) > 0) R[k] = num(p[k]); if (num(p.max_payouts) > 0) R.max_payouts = Math.round(num(p.max_payouts)); }
  return R;
}
function cleanPayouts(arr) {
  return (Array.isArray(arr) ? arr : []).filter(isObj).map((p) => ({ usd: num(p.usd != null ? p.usd : p.amount), date: YMD.test(String(p.date || '')) ? p.date : '' })).filter((p) => p.usd != null && p.usd > 0 && p.date).slice(0, 200);
}
export function normHome(home) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts.filter(isObj) : [];
  const funded = list.filter((a) => String(a.kind || '').toLowerCase() === 'funded').length;
  const pays = cleanPayouts(isObj(home) ? home.payouts : []).concat(...list.map((a) => cleanPayouts(a.payouts))).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { has: !!list.length || (isObj(home) && Array.isArray(home.payouts)), accounts: list.length, funded, payouts: pays };
}
/** the completed calendar months from the first payout's month up to last month (at most WINDOW), each with the dollars and the number of payouts */
export function monthly(payouts, today) {
  const cur = monthKey(today);
  if (!payouts.length) return [];
  const first = monthKey(payouts[0].date);
  let start = first; if (start >= cur) return [];
  const span = []; for (let m = start; m < cur; m = addMonths(m, 1)) span.push(m);
  const use = span.slice(-WINDOW);
  return use.map((m) => { const inM = payouts.filter((p) => monthKey(p.date) === m); return { ym: m, usd: inM.reduce((s, p) => s + p.usd, 0), count: inM.length }; });
}
export function facts(home, rules, today) {
  const H = isObj(home) && 'funded' in home && Array.isArray(home.payouts) ? home : normHome(home), R = rulesFrom(rules), months = monthly(H.payouts, today), n = months.length;
  const usd = months.map((m) => m.usd), cnt = months.map((m) => m.count), mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    R, paid: Math.round(H.payouts.reduce((s, p) => s + p.usd, 0) * 100) / 100, payouts: H.payouts.length, funded: H.funded, accounts: H.accounts, n, months,
    low: n ? Math.min(...usd) : null, base: n ? mean(usd) : null, high: n ? Math.max(...usd) : null, cLow: n ? Math.min(...cnt) : null, cBase: n ? mean(cnt) : null, cHigh: n ? Math.max(...cnt) : null, firstPayout: H.payouts.length ? H.payouts[0].date : '',
  };
}

// ---- progress and ETA ----
export function current(g, F) {
  return g.type === 'payouts' ? F.payouts : g.type === 'paid' ? F.paid : g.type === 'funded' ? F.funded : F.base == null ? 0 : F.base;
}
export function progress(g, F) { const v = current(g, F); return { value: v, frac: Math.max(0, Math.min(1, v / g.target)), done: v >= g.target }; }
export function valueText(g, v) { return g.type === 'paid' ? money(v) : g.type === 'month' ? money(v) + ' a month' : `${Math.round(v * 10) / 10}`; }
export function goalText(g) { return g.type === 'paid' ? money(g.target) : g.type === 'month' ? money(g.target) + ' a month' : `${g.target}`; }
export function eta(g, F, today) {
  const pr = progress(g, F);
  if (pr.done) return { kind: 'done', text: 'Reached.' };
  if (g.type === 'funded') return { kind: 'none', text: 'No pace is published for new funded accounts, so there is no date. It is a step you choose to take.' };
  if (g.type === 'month') return { kind: 'none', text: F.n >= MIN_N ? `This is a pace, not a pile. Your base month is ${money(F.base)} over the last ${F.n} months; the slowest was ${money(F.low)} and the fastest ${money(F.high)}.` : 'This is a pace, not a pile, and fewer than 2 full months of payouts are published, so there is no rate yet.' };
  if (F.n < MIN_N) return { kind: 'none', n: F.n, text: F.payouts ? `Only ${F.n} full month${F.n === 1 ? '' : 's'} of payouts so far. A date needs at least ${MIN_N}, so none is shown yet.` : 'No payout has been published, so there is no rate and no date yet.' };
  const rem = g.target - pr.value, lo = g.type === 'payouts' ? F.cLow : F.low, ba = g.type === 'payouts' ? F.cBase : F.base, hi = g.type === 'payouts' ? F.cHigh : F.high;
  const when = (r) => (r > 0 ? etaMonth(today, rem / r) : null), mo = (r) => (r > 0 ? Math.round((rem / r) * 10) / 10 : null);
  const out = { kind: 'range', n: F.n, rem, fast: when(hi), base: when(ba), slow: when(lo), fastM: mo(hi), baseM: mo(ba), slowM: mo(lo), rates: { low: lo, base: ba, high: hi } };
  const unit = g.type === 'payouts' ? (r) => `${Math.round(r * 10) / 10} a month` : (r) => `${money(r)} a month`;
  out.text = ba > 0
    ? `Fastest about ${out.fast} (at ${unit(hi)}), base about ${out.base} (at ${unit(ba)})${out.slow ? `, slowest about ${out.slow} (at ${unit(lo)})` : `, and at your slowest month (${unit(lo)}) it does not arrive`}. From the last ${F.n} full months. An estimate, not a promise.`
    : `Your last ${F.n} full months paid nothing, so no date can be shown. An estimate would be a guess.`;
  return out;
}

// ---- plain words: what it takes and the next three actions ----
export function takes(g, F) {
  const R = F.R;
  if (g.type === 'payouts') return `Each payout is a request on a funded account once it has ${money(R.min)} or more of profit above the buffer (${money(R.buffer)}). You are at ${F.payouts} of ${g.target}. A plan allows up to ${R.max_payouts} payouts per account.`;
  if (g.type === 'paid') return `${money(g.target)} paid out in total, counted from the payouts that are published: ${money(F.paid)} so far, ${money(Math.max(0, g.target - F.paid))} to go. You keep ${Math.round(R.split * 100)}% of each payout (the rest is the firm's split).`;
  if (g.type === 'funded') return `Funded accounts are eval accounts that passed. ${F.funded} funded now (of ${F.accounts} accounts published), ${Math.max(0, g.target - F.funded)} more to reach ${g.target}. Each needs its own eval pass and costs its own fee.`;
  return `A pace: ${money(g.target)} paid out in a month. Your base month is ${F.base == null ? 'not known yet (fewer than 2 full months published)' : money(F.base)}. It takes several funded accounts paying out in the same month.`;
}
export function actions(g, F) {
  const R = F.R, pr = progress(g, F);
  if (pr.done) return ['Keep the rules that got you here: nothing to add for this one.', 'Look at the next island on the map.', 'Write down what worked in your journal.'];
  if (g.type === 'payouts') return [F.funded ? `Let your funded account build ${money(R.min)} above the buffer of ${money(R.buffer)}.` : 'Pass an eval so an account reaches the funded stage.', 'Stay inside the daily loss and drawdown limits: a breach resets the climb.', `Request the payout once the balance clears ${money(R.buffer + R.min)}, then record its date so this page can see it.`];
  if (g.type === 'paid') return [`Plan for payouts of about ${money(R.min)} to ${money(R.max)} each; ${money(Math.max(0, g.target - F.paid))} is still to be paid.`, F.n >= MIN_N ? `At your base month of ${money(F.base)} the steps are in the ETA above: check it monthly.` : 'Publish each payout with its date so a monthly pace can appear.', 'Keep position size small: size follows the stop, so one bad day does not erase a month.'];
  if (g.type === 'funded') return [F.funded ? `You have ${F.funded} funded. Pick the next eval to pass.` : 'Pass your first eval.', 'Pay each eval fee only when the last one is on track, not before.', 'Keep the rules the same on every account so they behave alike.'];
  return ['Get a second funded account paying out in the same month.', 'Keep each account inside its own drawdown limit.', 'Check the pace here after each full month.'];
}

// ---- the map ----
export function layout(n) {
  const pts = [], W = 360, H = 440;
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); pts.push({ x: Math.round(W * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(i * 1.7 + 0.6)))), y: Math.round(H - 70 - t * (H - 150)) }); }
  return { W, H, harbour: { x: 60, y: H - 22 }, pts };
}
/** where the ship sits: between the last reached island (or the harbour) and the next one, by the next goal's progress */
export function shipAt(goals, F, lay) {
  const prs = goals.map((g) => progress(g, F)), ni = prs.findIndex((p) => !p.done);
  if (ni < 0) { const p = lay.pts[lay.pts.length - 1] || lay.harbour; return { x: p.x, y: p.y, next: -1, frac: 1 }; }
  const a = ni === 0 ? lay.harbour : lay.pts[ni - 1], b = lay.pts[ni], f = prs[ni].frac;
  return { x: Math.round(a.x + (b.x - a.x) * f), y: Math.round(a.y + (b.y - a.y) * f), next: ni, frac: f };
}
export function summary(goals, F) {
  const prs = goals.map((g) => progress(g, F)), done = prs.filter((p) => p.done).length, ni = prs.findIndex((p) => !p.done);
  return { done, total: goals.length, next: ni, text: !goals.length ? 'No goals yet. Add one below.' : ni < 0 ? `All ${goals.length} islands reached. Time to chart new waters.` : `${done} of ${goals.length} islands reached. Next: ${goals[ni].name}.` };
}
export function jarvisCard(goals, F, today, nowSec, demo) {
  const s = summary(goals, F), g = s.next >= 0 ? goals[s.next] : null, e = g ? eta(g, F, today) : null, pr = g ? progress(g, F) : null;
  return { v: 1, name: 'Argo', status: { level: demo ? 'off' : s.next < 0 ? 'ok' : 'warn', label: demo ? 'Demo data' : `${s.done} of ${s.total} reached` },
    kpis: [{ label: 'Islands', value: `${s.done} of ${s.total}` }, { label: 'Next', value: g ? g.name.slice(0, 24) : 'All reached' }, { label: 'Progress', value: pr ? pct(pr.frac) : '100%' }],
    lines: [s.text.slice(0, 118), e && e.kind === 'range' && e.base ? `Base ETA about ${e.base} (estimate, not a promise).`.slice(0, 118) : 'No date shown without 2 full months of payouts.'], t: Math.round(nowSec), open: '#', theme: '#14110e', stale_after: 604800 };
}
export function demoHome(fx, today) {
  const f = isObj(fx) ? fx : {};
  return { accounts: (Array.isArray(f.accounts) ? f.accounts : []).filter(isObj), payouts: (Array.isArray(f.payouts) ? f.payouts : []).filter(isObj).map((p) => ({ usd: p.usd, date: addDays(today, -Math.abs(num(p.off) || 0)) })) };
}
