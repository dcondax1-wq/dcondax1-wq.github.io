// ARES core (ES module, no DOM): the MFFU Builder rules as functions. Pure, so the test can call them in the page.
//   loadRules(url)            -> rules (rules.json; the embedded copy when it is missing) with .src 'file' | 'embedded'
//   planOf(rules, id)         -> the plan's numbers
//   floorOf(plan, peakEod)    -> the trailing floor: min(best end-of-day balance - max loss, start + lock), start - max loss at first
//   etClock(date)             -> { dow, mod, hm, label } in New York time
//   sessionState(date, rules) -> { state: 'open' | 'break' | 'closed' | 'late', note }
//   sizeTrade(rules, inp)     -> the contracts, the real cost of a stop-out, the room after, the stops you can survive
//   judge(rules, inp, now)    -> { level: 'go' | 'wait' | 'halt', reasons[], size, checks }  (the war-room verdict)
// Money: a stop-out costs (stop points + 2 ticks of slip) x point value + the round-turn commission, per contract.
// Nothing here talks to a broker or a bot. Paper rules, a calculator for the human.

export const EMBEDDED = {
  v: 1, kind: 'olympus-ares-rules', source: 'embedded copy of research/lit/mffu_rules.json (2026-10-18)',
  plans: {
    '50k': { name: 'Builder 50K', start: 50000, target: 3000, mll: 2000, lock: 100, dll: 1000, max_micros: 40, max_minis: 4, buffer: 2100,
      pay_min: 500, pay_max: 2000, split: 0.8, cons: 0.5, max_payouts: 5, price: 91.8, list_price: 153 },
    '25k': { name: 'Builder 25K', start: 25000, target: 1500, mll: 1000, lock: 100, dll: 600, max_micros: 20, max_minis: 2, buffer: 1100,
      pay_min: 250, pay_max: 1000, split: 0.8, cons: 0.5, max_payouts: 5, price: 63, list_price: 105 },
  },
  flat_by: '16:10', open: '18:00', break: ['17:00', '18:00'], comm_rt: { MNQ: 1.9, NQ: 4.68 }, slip_ticks: 2,
  point_value: { MNQ: 2, NQ: 20 }, tick: 0.25,
  bot: { entry_from: '02:00', entry_to: '15:30', stop_min_pts: 8, stop_max_pts: 80, max_trades_day: 1, room_f_eval: 0.8, room_f_funded: 0.6 },
  rules: [],
};

export const CHECKS = [
  { id: 'level', text: 'My stop sits 1 tick beyond a real level (the sweep extreme), not a random number of points.', must: true },
  { id: 'calm', text: 'I am calm. This is not revenge, not boredom, not catching up on a loss.', must: true },
  { id: 'plan', text: 'I wrote down my entry, stop and target before I clicked anything.', must: false },
  { id: 'target', text: 'One clear target. No greed: I take it or my stop takes me out.', must: false },
  { id: 'size', text: 'My size is the number above, not a feeling. A wide stop means fewer micros.', must: true },
  { id: 'news', text: 'I checked the news times. No surprise at 08:30 or 14:00 ET.', must: false },
  { id: 'flat', text: 'I can be flat before 16:10 ET without rushing.', must: false },
  { id: 'chase', text: 'I am entering at my level, not chasing a move that already ran.', must: false },
];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (x) => { const v = typeof x === 'string' ? parseFloat(x.replace(/[$,\s]/g, '')) : x; return Number.isFinite(v) ? v : null; };
export const usd = (v, d = 0) => (v == null || !Number.isFinite(v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

export async function loadRules(url = 'rules.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    const j = r.ok ? await r.json() : null;
    if (isObj(j) && j.kind === 'olympus-ares-rules' && isObj(j.plans) && j.plans['50k'] && j.plans['25k']) return { ...j, src: 'file' };
  } catch (_) { /* the embedded copy */ }
  return { ...EMBEDDED, src: 'embedded' };
}

export const planOf = (rules, id) => rules.plans[id] || rules.plans['50k'];

export function floorOf(plan, peakEod) {
  const peak = Math.max(plan.start, num(peakEod) ?? plan.start);
  return Math.min(peak - plan.mll, plan.start + plan.lock);
}

const FMT = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null;
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function etClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  let dow = d.getUTCDay(), h = d.getUTCHours(), m = d.getUTCMinutes();
  if (FMT) {
    const p = Object.fromEntries(FMT.formatToParts(d).map((x) => [x.type, x.value]));
    dow = DOW[p.weekday]; h = +p.hour % 24; m = +p.minute;
  }
  return { dow, mod: h * 60 + m, hm: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') };
}

/** CME equity futures week in ET: open Sun 18:00, daily break 17:00-18:00, closed Fri 17:00 -> Sun 18:00. 'late' = 16:00-17:00:
 *  MFFU flattens at 16:10, so a new trade then is a rule break. */
export function sessionState(date, rules) {
  const c = etClock(date), flat = hm(rules.flat_by), b0 = hm(rules.break[0]), b1 = hm(rules.break[1]);
  if (c.dow === 6 || (c.dow === 5 && c.mod >= b0) || (c.dow === 0 && c.mod < b1)) return { state: 'closed', note: 'The market is closed for the weekend (it opens Sunday 18:00 ET).', clock: c };
  if (c.mod >= b0 && c.mod < b1) return { state: 'break', note: 'The daily break (17:00-18:00 ET). Nothing trades.', clock: c };
  if (c.mod >= flat - 10 && c.mod < b0) return { state: 'late', note: `Too late: MFFU flattens every account at ${rules.flat_by} ET.`, clock: c };
  return { state: 'open', note: '', clock: c };
}

export function sizeTrade(rules, inp) {
  const plan = planOf(rules, inp.plan), inst = inp.inst === 'NQ' ? 'NQ' : 'MNQ';
  const pv = rules.point_value[inst], comm = rules.comm_rt[inst], slip = (rules.slip_ticks || 2) * (rules.tick || 0.25);
  const bal = num(inp.balance) ?? plan.start, floor = floorOf(plan, inp.peak);
  const today = num(inp.today) ?? 0;
  const room = bal - floor, dllLeft = plan.dll > 0 ? plan.dll - Math.max(0, -today) : Infinity;
  const entry = num(inp.entry), stop = num(inp.stop);
  const out = { plan, inst, pv, comm, slip, bal, floor, room, dllLeft, today, target_bal: plan.start + plan.target, valid: false, n: 0, why: '' };
  if (entry == null || stop == null || entry <= 0 || stop <= 0) { out.why = 'Enter your entry and your stop.'; return out; }
  const side = inp.side === 'short' ? 'short' : 'long';
  const pts = side === 'long' ? entry - stop : stop - entry;
  out.side = side;
  if (!(pts > 0)) { out.why = side === 'long' ? 'A long needs the stop BELOW the entry.' : 'A short needs the stop ABOVE the entry.'; return out; }
  out.valid = true; out.pts = pts;
  out.loss1 = (pts + slip) * pv + comm;                                   // one contract, stopped out, everything counted
  const frac = Math.min(1, Math.max(0.05, (num(inp.riskPct) ?? 40) / 100));
  const cap = num(inp.riskCap);
  out.budget = Math.max(0, Math.min(room * frac, dllLeft, cap != null && cap > 0 ? cap : Infinity));
  out.maxC = inst === 'NQ' ? Math.floor(plan.max_micros / 10) : plan.max_micros;
  out.by_budget = Math.floor(out.budget / out.loss1);
  out.n = Math.max(0, Math.min(out.by_budget, out.maxC));
  out.capped = out.by_budget > out.maxC;
  out.risk = out.n * out.loss1;
  out.nominal = out.n * pts * pv;                                          // the plain stop distance in dollars
  out.after = bal - out.risk;
  out.room_after = out.after - floor;
  out.stops_left = out.n > 0 ? Math.floor(room / out.risk) : 0;           // full stop-outs of this size until the floor
  out.rooms_pct = room > 0 ? out.risk / room : 1;
  out.R = [1, 2, 3].map((r) => ({ r, pts: pts * r, usd: out.n * pts * r * pv - out.n * comm }));
  out.to_target = Math.max(0, out.target_bal - bal);
  out.micros_hint = inst === 'NQ' && out.n === 0 ? Math.min(plan.max_micros, Math.floor(out.budget / ((pts + slip) * rules.point_value.MNQ + rules.comm_rt.MNQ))) : null;
  return out;
}

/** The verdict. 'halt' = the rules (or your own two-stops rule) say do not trade; 'wait' = allowed, but the list is not done;
 *  'go' = every box ticked and nothing in the way. Warnings never block, they are listed. */
export function judge(rules, inp, now = new Date()) {
  const r = sizeTrade(rules, inp), plan = r.plan, bot = rules.bot || {}, S = sessionState(now, rules);
  const reasons = [], halt = (id, text) => reasons.push({ id, level: 'halt', text }), warn = (id, text) => reasons.push({ id, level: 'warn', text });
  if (S.state !== 'open') halt('clock', S.note);
  else if (S.clock.mod >= hm(bot.entry_to || '15:30')) warn('late', `After ${bot.entry_to || '15:30'} ET the bot takes no new entries. Be flat by ${rules.flat_by}.`);
  if (r.room <= 0) halt('dead', 'The balance is at or under the floor. The account is over. Start a new evaluation.');
  else if (inp.stage === 'eval' && r.bal >= r.target_bal) halt('passed', `Target reached (${usd(r.target_bal)}). Stop trading this eval and ask MFFU for the funded account.`);
  if (plan.dll > 0 && r.today <= -plan.dll) halt('dll', `Daily loss limit hit (${usd(-r.today)} of ${usd(plan.dll)}). MFFU pauses the account for the day; so do you.`);
  const maxT = num(inp.maxTrades) ?? 2, tt = num(inp.tradesToday) ?? 0, ll = num(inp.lossesToday) ?? 0, stopAfter = num(inp.stopAfter) ?? 2;
  if (tt >= maxT) halt('count', `You set ${maxT} trade${maxT === 1 ? '' : 's'} a day and you have taken ${tt}. Done for today.`);
  if (ll >= stopAfter) halt('losses', `${ll} stop-outs today. Your own rule: close the screen. Tomorrow has the same edge.`);
  if (inp.hedge) halt('hedge', 'You hold the opposite side in another account. MFFU forbids long and short at once, also across accounts.');
  if (!r.valid) halt('input', r.why);
  else {
    if (r.n === 0 && r.room > 0 && !reasons.some((x) => x.id === 'dll' || x.id === 'passed')) {
      const need = r.loss1, have = r.budget;
      halt('wide', `The stop is too wide for the room: one ${r.inst} stop-out costs ${usd(need)}, your risk budget is ${usd(have)}.${r.micros_hint ? ` ${r.micros_hint} MNQ would fit.` : ' Skip it or wait for a closer level.'}`);
    }
    if (r.pts < (bot.stop_min_pts || 8)) warn('tight', `A ${r.pts.toFixed(2)}-point stop is tighter than the bot's 8-point minimum: noise can take it.`);
    if (r.pts > (bot.stop_max_pts || 80)) warn('far', `A ${r.pts.toFixed(1)}-point stop is wider than the bot's 80-point maximum.`);
    if (r.n > 0 && r.rooms_pct > 0.6) warn('big', `This stop-out eats ${Math.round(r.rooms_pct * 100)}% of the room you have left. The bot uses at most ${Math.round((inp.stage === 'funded' ? bot.room_f_funded : bot.room_f_eval) * 100) || 60}%.`);
    if (r.n > 0 && r.stops_left <= 2) warn('thin', `Only ${r.stops_left} full stop-out${r.stops_left === 1 ? '' : 's'} until the floor. Trade smaller.`);
    if (r.capped) warn('cap', `The budget allows more, but the account limit is ${r.maxC} ${r.inst === 'NQ' ? 'minis' : 'micros'}.`);
  }
  if (inp.news) warn('news', 'High-impact news is near. Spreads jump and stops slip. Half size or wait.');
  if (ll === 1) warn('loss1', 'One stop-out already today. The next trade must be your best level, not a make-up trade.');
  const done = CHECKS.filter((c) => inp.checks && inp.checks[c.id]).length;
  const mustMiss = CHECKS.filter((c) => c.must && !(inp.checks && inp.checks[c.id])).length;
  const level = reasons.some((x) => x.level === 'halt') ? 'halt' : done < CHECKS.length ? 'wait' : 'go';
  return { level, reasons, size: r, session: S, checks: { done, total: CHECKS.length, mustMiss } };
}

/** Prefill from the site's data.json: the first account with a numeric eval balance + floor. */
export function accountFromSite(site) {
  const list = Array.isArray(site && site.accounts) ? site.accounts : [];
  for (const a of list) {
    const e = a && a.eval;
    if (isObj(e) && Number.isFinite(+e.balance) && Number.isFinite(+e.floor)) {
      return { name: String(a.name || a.id || 'Eval').slice(0, 40), balance: +e.balance, floor: +e.floor, today: Number.isFinite(+e.today) ? +e.today : 0,
        start: Number.isFinite(+e.start_balance) ? +e.start_balance : null, mll: Number.isFinite(+e.mll) ? +e.mll : null };
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ 2026-11-04: scenarios, the journal, the
// "rules you broke" tracker, the live drawdown tie-in and the share card (pure; aresdesk.js is the screen)

/** Scenario presets for the Account tab: what the account looks like at a moment of a Builder 50K / 25K life (numbers from the plan). */
export const SCENARIOS = [
  { id: 'e50', plan: '50k', label: 'Eval 50K · day one' }, { id: 'e25', plan: '25k', label: 'Eval 25K · day one' },
  { id: 'e50m', plan: '50k', label: 'Eval 50K · 40% there' }, { id: 'e25m', plan: '25k', label: 'Eval 25K · 40% there' },
  { id: 'd50', plan: '50k', label: 'Eval 50K · after a stop-out' }, { id: 'd25', plan: '25k', label: 'Eval 25K · after a stop-out' },
  { id: 'f50', plan: '50k', label: 'Funded 50K · buffer built' }, { id: 'f25', plan: '25k', label: 'Funded 25K · buffer built' },
];
/** The state patch of a scenario (the page merges it into its own state; trades / stop-outs of the day reset). */
export function scenarioPatch(rules, id) {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) return null;
  const p = planOf(rules, sc.plan), kind = id[0], base = { plan: sc.plan, stage: kind === 'f' ? 'funded' : 'eval', today: '', tradesToday: 0, lossesToday: 0, checks: {}, news: false, hedge: false, botBalance: false };
  let bal = p.start, peak = p.start;
  if (id.endsWith('m')) { bal = peak = p.start + Math.round(p.target * 0.4); }
  if (kind === 'd') { const loss = Math.round(p.mll * 0.45); bal = p.start - loss; peak = p.start; base.today = String(-loss); base.tradesToday = 1; base.lossesToday = 1; }
  if (kind === 'f') { bal = peak = p.start + p.buffer; }
  return { ...base, balance: String(bal), peak: String(peak) };
}

const REASON_LABEL = { clock: 'Traded outside the market hours', dead: 'Traded a dead account', passed: 'Kept trading after the target', dll: 'Traded after the daily loss limit', count: 'Took more trades than my own cap',
  losses: 'Traded after my own stop-out limit', hedge: 'Held both sides', input: 'Traded with no stop written', wide: 'Took a stop too wide for the room', list: 'Went before finishing the checklist' };
const WARN_LABEL = { big: 'Risked more than 60% of the room', thin: 'Traded with two stop-outs left', news: 'Traded into the news', tight: 'Used a stop tighter than the bot\'s', far: 'Used a stop wider than the bot\'s', loss1: 'Made up for a loss' };

/** One journal line from a verdict (what the war room said), whether you took the trade, and the ritual flag. */
export function journalEntry(R, st, now = new Date(), taken = false, ritual = false) {
  const z = R.size, halts = R.reasons.filter((x) => x.level === 'halt').map((x) => x.id), warns = R.reasons.filter((x) => x.level === 'warn').map((x) => x.id);
  return { t: (now instanceof Date ? now : new Date(now)).toISOString(), level: R.level, plan: st.plan, stage: st.stage, inst: z.inst, side: z.side || st.side, pts: z.valid ? Math.round(z.pts * 100) / 100 : null,
    n: z.valid ? z.n : 0, risk: z.valid ? Math.round(z.risk * 100) / 100 : null, room: Math.round(z.room), checks: R.checks.done, of: R.checks.total, halts, warns, taken: !!taken, ritual: !!ritual };
}

/** "Rules you broke": from the journal, the taken trades that the war room had stopped (HALT), sent to WAIT (list unfinished), or warned about.
 *  Self-reported: nothing here sees a broker. Last `days` days. cleanDays = days since the last broken entry (null = none on record). */
export function brokenRules(list, now = new Date(), days = 30) {
  const from = +now - days * 864e5, rows = (Array.isArray(list) ? list : []).filter((e) => isObj(e) && Date.parse(e.t) >= from);
  const broke = new Map(), warned = new Map();
  let last = null, brokenEntries = 0;
  for (const e of rows) {
    if (!e.taken) continue;
    const ids = e.level === 'halt' ? (e.halts || []) : e.level === 'wait' ? ['list'] : [];
    if (ids.length) { brokenEntries++; last = Math.max(last ?? 0, Date.parse(e.t)); }
    for (const id of ids) broke.set(id, (broke.get(id) || 0) + 1);
    for (const id of e.warns || []) warned.set(id, (warned.get(id) || 0) + 1);
  }
  const by = (m, L) => [...m.entries()].map(([id, n]) => ({ id, n, label: L[id] || id })).sort((a, b) => b.n - a.n);
  return { days, entries: rows.length, taken: rows.filter((e) => e.taken).length, brokenEntries, by: by(broke, REASON_LABEL), warned: by(warned, WARN_LABEL),
    cleanDays: last == null ? null : Math.floor((+now - last) / 864e5), goClean: rows.filter((e) => e.taken && e.level === 'go').length,
    ritualShare: rows.length ? rows.filter((e) => e.ritual).length / rows.length : null };
}

/** The live drawdown left: room to the floor against the plan's max loss, a 0..1 share, and a tone (calm / watch / storm). */
export function drawdownLeft(rules, st, acct = null) {
  const p = planOf(rules, st.plan), bal = acct ? acct.balance : num(st.balance) ?? p.start, floor = acct ? acct.floor : floorOf(p, st.peak), room = bal - floor;
  const frac = Math.max(0, Math.min(1, p.mll > 0 ? room / p.mll : 0));
  return { room, mll: p.mll, frac, tone: room <= 0 ? 'dead' : frac < 0.25 ? 'storm' : frac < 0.55 ? 'watch' : 'calm', live: !!acct, floor, bal };
}

/** The account the Forum-style home.json describes: the first account with an eval block (balance, floor). */
export function accountFromHome(home) {
  const list = Array.isArray(home && home.accounts) ? home.accounts : [];
  for (const a of list) {
    const e = a && a.eval;
    if (isObj(e) && Number.isFinite(+e.balance) && Number.isFinite(+e.floor)) {
      return { name: String(a.name || a.id || 'Eval').slice(0, 40), balance: +e.balance, floor: +e.floor, today: Number.isFinite(+e.today) ? +e.today : 0, start: Number.isFinite(+e.start_balance) ? +e.start_balance : null, mll: null, from: 'home' };
    }
  }
  return null;
}

/** What the share card says: the verdict, the size and the money, in plain words (the page draws it). */
export function shareSpec(R, st) {
  const z = R.size, w = { go: 'GO', wait: 'WAIT', halt: 'HALT' }[R.level];
  const lines = z.valid ? [`${z.n} ${z.inst} ${z.side || ''}, stop ${z.pts.toFixed(1)} pts`, `A stop-out costs ${usd(z.risk)}`, `Room after it: ${usd(z.room_after)}`, `Checklist ${R.checks.done}/${R.checks.total}`] : ['Enter an entry and a stop', `Checklist ${R.checks.done}/${R.checks.total}`];
  const why = R.reasons.filter((x) => x.level === 'halt').slice(0, 2).map((x) => x.text);
  return { word: w, level: R.level, title: `${st.plan === '25k' ? 'Builder 25K' : 'Builder 50K'} · ${st.stage}`, lines: lines.concat(why), note: 'A calculator for the human. Paper rules, not advice.' };
}

/** The bot's real stops (extras.trades rows: tcols names the columns): median / p25 / p75 of risk_pts. */
export function botStops(site) {
  const ex = site && site.extras;
  if (!isObj(ex) || !Array.isArray(ex.trades) || !Array.isArray(ex.tcols)) return null;
  const i = ex.tcols.indexOf('risk_pts'), q = ex.tcols.indexOf('qty');
  if (i < 0) return null;
  const v = ex.trades.map((t) => +t[i]).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length < 5) return null;
  const at = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  const qs = q >= 0 ? ex.trades.map((t) => +t[q]).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b) : [];
  return { n: v.length, p25: at(0.25), med: at(0.5), p75: at(0.75), max: v[v.length - 1], qty_med: qs.length ? qs[Math.floor(qs.length / 2)] : null };
}

// ---------------------------------------------------------------------------------------------- JOB 4+5 follow-up (2026-11-04): money maths
// Five more pure functions for the owner's decisions: what a win must be worth (R and $), which stop width buys which size, how a losing
// streak eats the drawdown, how fast a pass has to go, the day's loss budget and a funded payout check. Every $ comes with its R.
// A calculator for the human: nothing here talks to a broker or a bot.

const pctTxt = (x) => `${Math.round(x * 100)}%`;
/** drawdown left as the page says it: "Drawdown left $1,400 of $2,000 max loss" */
export const ddText = (room, mll) => (room > mll ? `Drawdown left ${usd(room)} (floor locked, max loss ${usd(mll)})` : `Drawdown left ${usd(Math.max(0, room))} of ${usd(mll)} max loss`);

/** the odds maths for the trade on screen: what each R is worth in dollars (costs in), and the win rate each R needs to break even */
export function oddsPlan(rules, inp, rs = [1, 1.5, 2, 3, 5, 8]) {
  const z = sizeTrade(rules, inp);
  if (!z.valid) return { valid: false, why: z.why, rows: [] };
  const win1 = z.pts * z.pv - z.comm, loss = z.loss1;           // per contract: a 1R win (after the commission) and a stop-out (slippage + commission)
  const rows = rs.map((r) => {
    const win = z.pts * r * z.pv - z.comm, need = loss / (win + loss);
    return { r, pts: z.pts * r, usd: win * Math.max(1, z.n), perContract: win, need, needTxt: pctTxt(need), price: z.side === 'long' ? +(num(inp.entry) + z.pts * r).toFixed(2) : +(num(inp.entry) - z.pts * r).toFixed(2) };
  });
  const lossR = loss / Math.max(1e-9, z.pts * z.pv);              // the stop-out in R: slippage and commission make it a little over 1R
  return { valid: true, n: z.n, inst: z.inst, loss, lossR, win1, rows, lossAll: loss * Math.max(1, z.n), ref: 'The bot wins about 56% of its trades (2026) and banks 8R when it wins big: at 8R it needs only ' + pctTxt(rows.length ? loss / (z.pts * 8 * z.pv - z.comm + loss) : 0) + '.' };
}

/** the stop ladder: for the same risk budget, how many contracts each stop width allows ("a wide stop means fewer micros") */
export function stopLadder(rules, inp, stops = [8, 12, 16, 20, 30, 40, 60, 80]) {
  const z = sizeTrade(rules, { ...inp, entry: 1000, stop: inp.side === 'short' ? 1010 : 990 });   // only for the plan's numbers, budget and the instrument
  const budget = z.budget, out = [];
  for (const pts of stops) {
    const loss1 = (pts + z.slip) * z.pv + z.comm, by = Math.floor(budget / loss1), n = Math.max(0, Math.min(by, z.maxC));
    out.push({ pts, loss1, n, risk: n * loss1, roomAfter: z.room - n * loss1, win2: n * (pts * 2 * z.pv - z.comm), capped: by > z.maxC, fits: n > 0 });
  }
  return { inst: z.inst, budget, room: z.room, mll: z.plan.mll, rows: out };
}

/** a losing streak at the size on screen: after k stop-outs in a row, the balance, the drawdown left and whether the floor is gone */
export function streakTable(rules, inp, n = 5) {
  const z = sizeTrade(rules, inp);
  if (!z.valid || z.n < 1) return { valid: false, rows: [], why: z.valid ? 'No size fits this stop.' : z.why };
  const rows = []; let bal = z.bal;
  for (let k = 1; k <= n; k++) {
    bal -= z.risk;
    const room = bal - z.floor;                                    // the floor does not fall when you lose: it only trails the best end-of-day
    rows.push({ k, bal, room, dead: room <= 0, text: ddText(room, z.plan.mll), R: -k * (z.risk / Math.max(1, z.risk)) });
  }
  const first = rows.find((r) => r.dead);
  return { valid: true, risk: z.risk, mll: z.plan.mll, rows, bustAt: first ? first.k : null,
    plain: first ? `${first.k} stop-outs in a row at this size end the account.` : `${n} stop-outs in a row would still leave ${usd(rows[rows.length - 1].room)} of room.` };
}

/** how fast a pass has to go: the dollars to the target, per session over N sessions, and the winners that takes at the size on screen */
export function passPace(rules, inp, sessions = 10) {
  const z = sizeTrade(rules, inp), toT = Math.max(0, z.to_target);
  const win2 = z.valid && z.n ? z.n * (z.pts * 2 * z.pv - z.comm) : null;
  return { toTarget: toT, sessions, perSession: toT / sessions, winners2R: win2 ? Math.ceil(toT / win2) : null, win2, tradesAWeek: '2-4',
    plain: toT <= 0 ? 'The target is reached.' : `${usd(toT)} to go: about ${usd(toT / sessions)} a session to pass inside ${sessions} sessions (2 weeks).${win2 ? ` At this size a 2R winner pays ${usd(win2)}: ${Math.ceil(toT / win2)} of them.` : ''}` };
}

/** today's loss budget: the daily loss left and how many full stop-outs of this size fit inside it (the account's room is the other limit) */
export function dayBudget(rules, inp) {
  const z = sizeTrade(rules, inp), p = z.plan;
  if (!(p.dll > 0)) return { has: false, plain: 'This plan has no daily loss limit.' };
  const left = Math.max(0, z.dllLeft), outs = z.valid && z.risk > 0 ? Math.floor(left / z.risk) : null;
  return { has: true, dll: p.dll, left, used: p.dll - left, frac: p.dll > 0 ? left / p.dll : 0, outs, text: `Daily loss left ${usd(left)} of ${usd(p.dll)}`,
    plain: outs == null ? `Daily loss left ${usd(left)} of ${usd(p.dll)}.` : `${outs} full stop-out${outs === 1 ? '' : 's'} of this size fit in today's limit (${usd(left)} left).` };
}

/** a funded account's payout check: the profit above the buffer, what MFFU may pay and what reaches you after the split */
export function payoutCheck(rules, inp) {
  const p = planOf(rules, inp.plan), bal = num(inp.balance) ?? p.start, above = bal - (p.start + p.buffer);
  if (inp.stage !== 'funded') return { funded: false, plain: 'Payouts start once the evaluation is passed and the account is funded.' };
  const gross = above >= p.pay_min ? Math.min(p.pay_max, above) : 0, net = gross * p.split;
  return { funded: true, above, buffer: p.buffer, min: p.pay_min, gross, net, ok: above >= p.pay_min,
    plain: above >= p.pay_min ? `You may ask for ${usd(p.pay_min)} to ${usd(gross)} (the profit above the buffer, at most ${usd(p.pay_max)}); ${usd(net)} reaches you at ${usd(gross)} after the ${pctTxt(p.split)} split. Keep your best day under ${pctTxt(p.cons)} of the cycle's profit.`
      : `Not yet: ${usd(Math.max(0, p.pay_min - above))} more profit above the ${usd(p.buffer)} buffer before the first ${usd(p.pay_min)} payout.` };
}
