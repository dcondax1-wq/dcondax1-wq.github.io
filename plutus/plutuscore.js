// PLUTUS core (ES module, no DOM): the money plan as functions of the bot's measured numbers. Pure, so the test calls them in the page.
//   loadPlans(url)                       -> plans.json (tools/ares_plutus_build.py from research/lit/funded_firms.json), .src 'file' | 'embedded'
//   accountCurve(plan, span, months, h)  -> { mean[], med[], p10[], steady, fees[] }   one account, month 0..months, in dollars after fees
//   project(doc, counts, opts)           -> the whole plan: curves (mean / p10), first-6-month average, months 4-6 rate, up-front fees,
//                                           payback month, the chance of being under water at month 6, per-plan rows
//   siteFacts(site)                      -> the bot's published record (data.json: extras.trades, extras.two_week.money, hub.funded.trio)
// What the numbers are: the study bought the plan, passed the eval, got funded and took payouts, 1,500 paths x 126 sessions, with the
// bot's real LIT trades and costs; net = payouts - fees. Month k between the measured points is a straight line; after month 6 it
// continues at the months 4-6 rate (an extension, said so on screen). More accounts = the same trades on each (MFFU forbids long
// and short at once), so the accounts are 0.85 correlated and the bad case does not average out.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const SPANS = ['H2', 'H1', '2021-25'];
export const Z10 = 1.2816;
export const num = (x) => { const v = typeof x === 'string' ? parseFloat(x.replace(/[$,\s]/g, '')) : x; return Number.isFinite(v) ? v : null; };
export const usd = (v, d = 0) => (v == null || !Number.isFinite(v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the Jul-Oct 2026 numbers of plans.json, trimmed: the page still works when the file is missing (only that period is then offered)
const mk = (id, firm, name, cap, price, h2) => ({ id, firm, name, cap, price, note: '', spans: { H2: h2 } });
export const EMBEDDED = {
  v: 1, kind: 'olympus-plutus-plans', built: 'embedded', source: 'embedded copy of research/lit/funded_firms.json (2026-10-19), Jul-Oct only',
  spans: { H2: 'Jul-Oct 2026 (the honest check)' }, sessions_per_month: 21, corr: 0.85,
  plans: [
    mk('mffu_builder_50k', 'MFFU', 'Builder 50K', 1, 91.8, { net_6m: 4629, net_med_6m: 4708, net_p10_6m: 1247, per_month: 771, steady: 962, fees_6m: 141, evals: 1.54, neg_6m: 7.4, first_pay_sessions: 41.0, any_pay: 92.6, lost: 0.02 }),
    mk('mffu_builder_25k', 'MFFU', 'Builder 25K', 2, 63, { net_6m: 1978, net_med_6m: 2100, net_p10_6m: -63, per_month: 330, steady: 424, fees_6m: 102, evals: 1.63, neg_6m: 11.0, first_pay_sessions: 40.0, any_pay: 89.1, lost: 0.05 }),
    mk('lucid_pro_50k', 'Lucid', 'LucidPro 50K', 1, 115.4, { net_6m: 4211, net_med_6m: 3935, net_p10_6m: -115, per_month: 702, steady: 988, fees_6m: 134, evals: 1.16, neg_6m: 11.6, first_pay_sessions: 51.0, any_pay: 88.4, lost: 0.01 }),
    mk('fn_rapid_daily_50k', 'FundedNext', 'Rapid Daily 50K', 1, 169.99, { net_6m: 4042, net_med_6m: 4031, net_p10_6m: -170, per_month: 674, steady: 842, fees_6m: 322, evals: 1.89, neg_6m: 11.7, first_pay_sessions: 45.0, any_pay: 88.7, lost: 0.01 }),
  ],
  trio: { H2: { net_per_month: 2147, months4_6_per_month: 2792, neg_6m: 5.2 } },
};

export async function loadPlans(url = 'plans.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    const j = r.ok ? await r.json() : null;
    if (isObj(j) && j.kind === 'olympus-plutus-plans' && Array.isArray(j.plans) && j.plans.length) return { ...j, src: 'file' };
  } catch (_) { /* the embedded copy */ }
  return { ...EMBEDDED, src: 'embedded' };
}

/** One account bought today. h = how much worse than the study the payouts come out (0..0.6). */
export function accountCurve(plan, span, months, h = 0, spm = 21) {
  const s = plan.spans[span] || plan.spans.H2, M = Math.max(1, Math.round(months));
  const price = plan.price, fees6 = Math.max(price, s.fees_6m ?? price);
  const t1 = clamp((s.first_pay_sessions ?? 45) / spm, 0.5, 5);
  const pay6 = Math.max(0, (s.net_6m ?? 0) + fees6);                         // payouts in the first 6 months, mean
  const ratio = (v) => (pay6 > 0 ? clamp((v + fees6) / pay6, 0, 1.6) : 0);
  const r = s.steady ?? 0, rMed = r * clamp(ratio(s.net_med_6m), 0.25, 1.2), rLow = r * clamp(ratio(s.net_p10_6m), 0.25, 1);
  const fees = (k) => price + (fees6 - price) * Math.min(1, k / 3);
  const pay = (k) => (k <= t1 ? 0 : k <= 6 ? pay6 * ((k - t1) / (6 - t1)) : pay6 + r * (k - 6));
  const mean = [], med = [], p10 = [], fee = [];
  for (let k = 0; k <= M; k++) {
    const f = fee[k] = fees(k), p = pay(k) * (1 - h);
    const tail = k > 6 ? k - 6 : 0, base = k <= 6 ? p : pay6 * (1 - h);
    mean.push(p - f);
    med.push(k <= 6 ? p * ratio(s.net_med_6m) - f : base * ratio(s.net_med_6m) + rMed * (1 - h) * tail - f);
    p10.push(k <= 6 ? p * ratio(s.net_p10_6m) - f : base * ratio(s.net_p10_6m) + rLow * (1 - h) * tail - f);
  }
  return { mean, med, p10, fees: fee, steady: r * (1 - h), price, fees6, t1 };
}

const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

/** counts: { planId: n }.  opts: { span, months, haircut, tax, goal }. */
export function project(doc, counts, opts = {}) {
  const span = SPANS.includes(opts.span) ? opts.span : 'H2', M = clamp(Math.round(opts.months ?? 6), 1, 24), h = clamp(num(opts.haircut) ?? 0, 0, 0.9), tax = clamp(num(opts.tax) ?? 0, 0, 0.6);
  const rho = doc.corr ?? 0.85, spm = doc.sessions_per_month ?? 21;
  const rows = [], mean = Array(M + 1).fill(0), sig = Array(M + 1).fill(0);
  let steady = 0, upfront = 0, n6 = 0, accounts = 0, mean6 = 0, six = 0;
  const groupSig = [];
  for (const p of doc.plans) {
    const n = clamp(Math.round(num(counts[p.id]) ?? 0), 0, p.cap);
    if (!n) continue;
    const c = accountCurve(p, span, M, h, spm), s6 = accountCurve(p, span, Math.max(6, M), h, spm), sp = p.spans[span] || p.spans.H2;
    accounts += n; upfront += n * p.price; steady += n * c.steady;
    const gs = c.mean.map((m, k) => ((m - c.p10[k]) / Z10) * Math.sqrt(n + n * (n - 1) * rho));
    groupSig.push(gs);
    for (let k = 0; k <= M; k++) mean[k] += n * c.mean[k];
    six += n * s6.mean[6];
    rows.push({ id: p.id, name: p.name, firm: p.firm, n, price: p.price, upfront: n * p.price, six: s6.mean[6], steady: c.steady, at: c.mean[M], evals: sp.evals, any_pay: sp.any_pay, neg_6m: sp.neg_6m, lost: sp.lost, pass_med: sp.pass_med, p10: sp.p10 });
  }
  for (let k = 0; k <= M; k++) {
    let v = 0;
    for (const g of groupSig) v += g[k] * g[k];
    for (let a = 0; a < groupSig.length; a++) for (let b = a + 1; b < groupSig.length; b++) v += 2 * rho * groupSig[a][k] * groupSig[b][k];
    sig[k] = Math.sqrt(Math.max(0, v));
  }
  const after = (v) => (v > 0 ? v * (1 - tax) : v);
  const meanT = mean.map(after), p10T = mean.map((m, k) => after(m - Z10 * sig[k])), p90T = mean.map((m, k) => after(m + Z10 * sig[k]));
  let payback = null;
  for (let k = 1; k <= M && payback == null; k++) if (mean[k] >= 0 && mean[k - 1] < 0) payback = k - 1 + (0 - mean[k - 1]) / (mean[k] - mean[k - 1]);
  if (payback == null && mean[0] >= 0) payback = 0;
  const m6 = Math.min(6, M), sd6 = Math.sqrt(sig[m6] ** 2) || 0;
  const under6 = accounts ? (sd6 > 0 ? phi((0 - mean[m6]) / sd6) * 100 : (mean[m6] < 0 ? 100 : 0)) : null;
  return { span, months: M, accounts, upfront, mean: meanT, p10: p10T, p90: p90T, raw: mean, sig, rows, haircut: h, tax,
    avg6: accounts ? after(six) / 6 : 0,                                       // the study's own number: first 6 months, per month
    steady: after(steady), steady_raw: steady, atM: meanT[M], p10M: p10T[M], payback, under6,
    per_month_M: meanT[M] / M, goal: num(opts.goal), need: opts.goal && accounts && steady > 0 ? Math.ceil((num(opts.goal) / after(steady)) * accounts) : null };
}

/** What the published data.json adds. */
export function siteFacts(site) {
  const out = { trades: null, money: null, trio: null, built: null };
  if (!isObj(site)) return out;
  const ex = site.extras;
  if (isObj(ex) && Array.isArray(ex.trades) && Array.isArray(ex.tcols)) {
    const ip = ex.tcols.indexOf('pnl'), id = ex.tcols.indexOf('day');
    if (ip >= 0 && ex.trades.length) {
      const pn = ex.trades.map((t) => +t[ip]).filter(Number.isFinite), days = id >= 0 ? ex.trades.map((t) => String(t[id])).sort() : [];
      const wins = pn.filter((x) => x > 0).reduce((a, b) => a + b, 0), loss = -pn.filter((x) => x < 0).reduce((a, b) => a + b, 0);
      const wk = days.length ? Math.max(1, (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / 6048e5) : null;
      out.trades = { n: pn.length, net: pn.reduce((a, b) => a + b, 0), pf: loss > 0 ? wins / loss : null, win: pn.length ? (100 * pn.filter((x) => x > 0).length) / pn.length : null, tpw: wk ? pn.length / wk : null, from: days[0], to: days[days.length - 1] };
    }
  }
  const m = ex && ex.two_week && ex.two_week.money && ex.two_week.money['2026'];
  if (isObj(m)) out.money = m;
  const f = site.hub && site.hub.funded;
  if (isObj(f) && isObj(f.trio)) { out.trio = f.trio; out.built = f.built || null; }
  return out;
}

// ------------------------------------------------------------------------------------------------ 2026-11-04: goal tracker, payout calendar,
// monthly income waterfall, "what if I add an account" (pure, built on project() / accountCurve(); the screen is plutusfx.js)

/** First month (a fraction, straight line between months) at which the series reaches `target`; null if it does not inside the horizon. */
export function crossing(series, target) {
  if (!Array.isArray(series) || !Number.isFinite(target)) return null;
  if (series[0] >= target) return 0;
  for (let k = 1; k < series.length; k++) if (series[k] >= target && series[k - 1] < target) return k - 1 + (target - series[k - 1]) / (series[k] - series[k - 1]);
  return null;
}

/** The goal tracker: run-rate coverage of the $/month goal (months 4-6 rate, after tax) and the milestones on the way (month each is reached). */
export function milestones(P, goal) {
  const g = num(goal), out = { goal: g && g > 0 ? g : null, coverage: null, items: [], reached: 0 };
  const items = [{ id: 'profit', label: 'Back in profit', target: 0, month: P.accounts ? (P.payback == null ? null : P.payback) : null }];
  if (out.goal) {
    out.coverage = P.accounts ? Math.max(0, P.steady / out.goal) : 0;
    for (const [id, f, label] of [['q1', 0.25, '25% of a goal month banked'], ['m1', 1, 'One goal month banked'], ['m3', 3, 'A quarter of goal months banked'], ['m6', 6, 'Half a year of goal months banked']]) {
      const t = out.goal * f;
      items.push({ id, label, target: t, month: P.accounts ? crossing(P.mean, t) : null });
    }
  } else {
    for (const [id, t, label] of [['k1', 1000, 'First $1,000 banked'], ['k5', 5000, '$5,000 banked'], ['k10', 10000, '$10,000 banked']]) items.push({ id, label, target: t, month: P.accounts ? crossing(P.mean, t) : null });
  }
  out.items = items; out.reached = items.filter((i) => i.month != null).length;
  return out;
}

/** The payout calendar: for each month 1..M what the plan pays out (before fees), the fees due, the net, and which accounts pay for the first time. */
export function payoutCalendar(doc, counts, opts = {}) {
  const span = SPANS.includes(opts.span) ? opts.span : 'H2', M = clamp(Math.round(opts.months ?? 6), 1, 24), h = clamp(num(opts.haircut) ?? 0, 0, 0.9), spm = doc.sessions_per_month ?? 21;
  const rows = Array.from({ length: M }, (_, i) => ({ k: i + 1, payout: 0, fees: 0, net: 0, first: [] }));
  for (const p of doc.plans) {
    const n = clamp(Math.round(num(counts[p.id]) ?? 0), 0, p.cap);
    if (!n) continue;
    const c = accountCurve(p, span, M, h, spm);
    for (let k = 1; k <= M; k++) {
      const fee = c.fees[k] - c.fees[k - 1], net = c.mean[k] - c.mean[k - 1];
      rows[k - 1].fees += n * fee; rows[k - 1].net += n * net; rows[k - 1].payout += n * (net + fee);
      if (c.t1 > k - 1 && c.t1 <= k) rows[k - 1].first.push(`${p.firm} ${p.name}`);
    }
  }
  return rows;
}

/** The monthly income waterfall: month 0 (the evals bought), then month by month what moves the plan's balance (payouts up, fees down) and the running total. */
export function waterfall(doc, counts, opts = {}) {
  const cal = payoutCalendar(doc, counts, opts), tax = clamp(num(opts.tax) ?? 0, 0, 0.6), buy = project(doc, counts, opts).upfront;
  let total = -buy;
  const rows = [{ k: 0, payout: 0, fees: buy, delta: -buy, total, first: [] }];       // month 0: the evals are bought
  return rows.concat(cal.map((r) => {
    const pay = r.payout * (1 - tax), delta = pay - r.fees;
    total += delta;
    return { k: r.k, payout: pay, fees: r.fees, delta, total, first: r.first };
  }));
}

/** "What if I add an account": every plan that still has room, with what one more changes (per month, up front, bad case, chance under water). */
export function whatIf(doc, counts, opts = {}) {
  const base = project(doc, counts, opts), out = [];
  for (const p of doc.plans) {
    const n = clamp(Math.round(num(counts[p.id]) ?? 0), 0, p.cap);
    if (n >= p.cap) continue;
    const next = project(doc, { ...counts, [p.id]: n + 1 }, opts);
    out.push({ id: p.id, name: `${p.firm} ${p.name}`, price: p.price, dUpfront: next.upfront - base.upfront, dPerMonth: next.avg6 - base.avg6, dSteady: next.steady - base.steady,
      dP10M: next.p10M - base.p10M, dUnder6: base.under6 == null || next.under6 == null ? null : next.under6 - base.under6, base, next });
  }
  return out.sort((a, b) => b.dPerMonth - a.dPerMonth);
}

// ---------------------------------------------------------------------------------------------- JOB 4+5 follow-up (2026-11-04): four decisions
// rankPlans (which plan pays the most per dollar of fees), buyPlan (how many evals to buy for a funded account, in dollars and odds),
// payoutRace (who pays first and when), cashCushion (the deepest dip of the bad case and when it turns). Study numbers, not promises.

const WEEK_S = 5;                                  // trading sessions in a week

/** the plans ranked by what 6 months pay back per $1 of fees (net over fees), with the speed and the bad-case risk beside it */
export function rankPlans(doc, span = 'H2') {
  const sp = SPANS.includes(span) ? span : 'H2';
  const rows = (doc.plans || []).map((p) => {
    const s = p.spans[sp] || p.spans.H2 || {}, fees = Math.max(p.price, s.fees_6m ?? p.price), net = s.net_6m ?? 0;
    return { id: p.id, name: p.name, firm: p.firm, price: p.price, fees, net6: net, roi: fees > 0 ? net / fees : 0, perMonth: s.per_month ?? net / 6, firstPay: s.first_pay_sessions ?? null,
      firstWeeks: s.first_pay_sessions != null ? s.first_pay_sessions / WEEK_S : null, anyPay: s.any_pay ?? null, negPct: s.neg_6m ?? null, steady: s.steady ?? null, cap: p.cap };
  }).sort((a, b) => b.roi - a.roi);
  const best = rows[0] || null;
  return { span: sp, rows, best, plain: best ? `Per dollar of fees, ${best.name} (${best.firm}) pays back the most: ${usd(best.net6)} in 6 months on ${usd(best.fees)} of fees (${best.roi.toFixed(0)} dollars back for every dollar spent).` : 'No plan numbers.' };
}

/** buying evals one by one: the chance that at least one passes inside 60 sessions after n buys, and the fees spent (study: passing rate per eval) */
export function buyPlan(plan, span = 'H2', maxBuys = 4) {
  const s = plan.spans[span] || plan.spans.H2 || {}, p = Math.max(0, Math.min(1, (s.p60 ?? 0) / 100));
  const rows = [];
  for (let n = 1; n <= maxBuys; n++) rows.push({ n, fees: plan.price * n, atLeastOne: 1 - Math.pow(1 - p, n), expFees: plan.price * Math.min(n, 1 / Math.max(p, 0.05)) });
  const eEvals = p > 0 ? 1 / p : null;
  const need90 = p > 0 ? Math.ceil(Math.log(0.1) / Math.log(1 - Math.min(0.999, p))) : null;
  return { id: plan.id, name: plan.name, price: plan.price, pass: p, rows, eEvals, eFees: eEvals ? eEvals * plan.price : null, need90, fund90: need90 ? need90 * plan.price : null,
    plain: p > 0 ? `One ${plan.name} eval passes ${Math.round(p * 100)}% of the time inside 60 sessions: expect about ${eEvals.toFixed(1)} evals (${usd(eEvals * plan.price)} of fees) per funded account. Buy ${need90} (${usd(need90 * plan.price)}) to be 90% sure of at least one.` : `No pass rate for ${plan.name}.` };
}

/** who pays first: the plans ordered by the sessions to the first payout, in weeks and as a share of the 6 months */
export function payoutRace(doc, span = 'H2') {
  const sp = SPANS.includes(span) ? span : 'H2';
  const rows = (doc.plans || []).map((p) => { const s = p.spans[sp] || p.spans.H2 || {}; return { id: p.id, name: p.name, sessions: s.first_pay_sessions ?? null, weeks: s.first_pay_sessions != null ? s.first_pay_sessions / WEEK_S : null, funded: s.first_pay_funded ?? null, anyPay: s.any_pay ?? null }; })
    .filter((r) => r.sessions != null).sort((a, b) => a.sessions - b.sessions);
  const slow = rows.length ? rows[rows.length - 1].sessions : 1;
  rows.forEach((r) => { r.bar = slow > 0 ? r.sessions / slow : 0; });
  return { span: sp, rows, first: rows[0] || null, plain: rows[0] ? `${rows[0].name} pays first: about ${Math.round(rows[0].weeks)} weeks (${Math.round(rows[0].sessions)} sessions) to the first payout in the study's middle case.` : 'No payout timing.' };
}

/** the bad case's deepest dip: the lowest point of the p10 curve (after fees), the month it happens and the month it turns up for good */
export function cashCushion(P) {
  if (!P || !P.accounts) return { has: false, plain: 'Pick an account: the page then shows how deep the bad case dips before the plan pays.' };
  let low = Infinity, at = 0;
  P.p10.forEach((v, k) => { if (v < low) { low = v; at = k; } });
  let turn = null;
  for (let k = at; k < P.p10.length && turn == null; k++) if (P.p10[k] >= 0 && k > at) turn = k;
  const mid = P.mean[Math.min(P.mean.length - 1, at)];
  return { has: true, dip: Math.min(0, low), month: at, turn, upfront: P.upfront, cushion: Math.max(P.upfront, -Math.min(0, low)),
    plain: low >= 0 ? `Even the bad case (1 in 10) stays above zero after fees from month ${at || 1}. The fees you pay up front are ${usd(P.upfront)}.`
      : `In the bad case (1 in 10) the plan is down ${usd(-low)} at month ${at}${turn != null ? ` and back above zero by month ${turn}` : ' and not back above zero inside the horizon'}. Keep at least ${usd(Math.max(P.upfront, -low))} you can afford to lose.${mid != null ? ` The middle case at that month is ${usd(mid)}.` : ''}` };
}
