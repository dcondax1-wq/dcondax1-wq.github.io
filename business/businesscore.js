// BUSINESS core (pure, node-tested): checks the published file and turns it into rows. No DOM, no network.
export const money = (n) => '$' + Math.round(+n || 0).toLocaleString('en-US');
export const range = (r) => (Array.isArray(r) && r.length === 2 ? `${money(r[0])}-${money(r[1]).slice(1)}` : '-');

const str = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');
const pair = (v) => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(+x) && +x >= 0) ? [+v[0], +v[1]] : [0, 0]);
const list = (v, n = 12) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, n).map((x) => x.slice(0, 300)) : []);

// a business.json / fixture.json -> a safe doc, or null when it is not one
export function clean(doc) {
  if (!doc || typeof doc !== 'object' || doc.kind !== 'business' || !Array.isArray(doc.models)) return null;
  const models = doc.models.filter((m) => m && typeof m === 'object' && str(m.id, 40) && str(m.name, 60)).map((m) => ({
    id: str(m.id, 40), name: str(m.name, 60), what: str(m.what), next: str(m.next), why: str(m.why), doc: str(m.doc, 80),
    paused: !!m.paused, built: list(m.built), first_dollar: list(m.first_dollar), usd_m1: pair(m.usd_m1), usd_m3: pair(m.usd_m3),
    hours: pair(m.hours), real: Number.isFinite(+m.real_usd_month) ? +m.real_usd_month : 0,
  }));
  const t = doc.total || {};
  return {
    sample: !!doc.sample, asof: str(doc.asof, 40), note: str(doc.note), models,
    total: { usd_m1: pair(t.usd_m1), usd_m3: pair(t.usd_m3), hours: pair(t.hours), real: Number.isFinite(+t.real_usd_month) ? +t.real_usd_month : 0 },
    prices: (Array.isArray(doc.prices) ? doc.prices : []).filter((p) => p && str(p.name, 40)).map((p) => ({ name: str(p.name, 40), setup: +p.setup || 0, monthly: +p.monthly || 0 })),
    week: (Array.isArray(doc.week) ? doc.week : []).filter((d) => d && Number.isFinite(+d.day)).slice(0, 7).map((d) => ({ day: +d.day, title: str(d.title, 80), tasks: list(d.tasks, 6) })),
    rules: list(doc.rules, 8),
    prop: cleanProp(doc.prop),
  };
}

const numN = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// the prop accounts' payout plan (tools/money/payout_plan.py via biz_publish): null when absent or not one
export function cleanProp(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.table)) return null;
  const table = p.table.filter((r) => r && Number.isFinite(+r.accounts) && +r.accounts > 0).slice(0, 8).map((r) => ({
    accounts: +r.accounts, y1: numN(r.usd_month_y1), steady: numN(r.usd_month_m7_12), worst: numN(r.month_worst),
    empty: numN(r.months_no_income_pct), p10: numN(r.y1_p10), ref: numN(r.ref_usd_month),
  }));
  if (!table.length) return null;
  const z = p.zlarior && typeof p.zlarior === 'object' ? p.zlarior : null;
  return {
    span: str(p.span, 80), table, rules: list(p.rules, 6), notes: list(p.notes, 6),
    plan: str((p.new_account || {}).plan, 60), price: numN((p.new_account || {}).price),
    zlarior: z ? { pass_median: day(z.pass_median), pass_earliest: day(z.pass_earliest), pass_10: numN(z.pass_10), fail_10: numN(z.fail_10),
      pay_earliest: day(z.first_payout_earliest), pay_median: day(z.first_payout_median), bank_median: day(z.first_payout_in_bank_median),
      pay_usd: numN(z.first_payout_usd_median) } : null,
    buy: (Array.isArray(p.buy) ? p.buy : []).filter((x) => x && str(x.n, 4)).slice(0, 6).map((x) => ({
      n: str(x.n, 4), median: day(x.median), p25: day(x.p25), p75: day(x.p75), pct: numN(x.pct_12m) })),
  };
}

// "$1,049" / "-$227" / "-"
export function signed(n) { return n === null || n === undefined ? '-' : (n < 0 ? '-' + money(-n) : money(n)); }

// the first model that is not paused = what to do now
export function firstAction(doc) {
  const m = (doc && doc.models || []).find((x) => !x.paused && x.next);
  return m ? `${m.name}: ${m.next}` : 'Nothing to do.';
}

export function priceLine(p) {
  return p.setup > 0 ? `${money(p.setup)} + ${money(p.monthly)} a month` : `${money(p.monthly)} a month, no setup fee`;
}

export function taskKey(day, i) { return `d${day}t${i}`; }

// ------------------------------------------------------------------------------------------------ THE ONE MONEY PLACE (night team B, 2026-11-16)
// the new sections of business.json / fixture.json (trading, costs, ready, ideas, moves), cleaned; missing parts become empty
const num = (v, d = 0) => (v !== null && v !== '' && Number.isFinite(+v) ? +v : d);
const ymd = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : null);
const ident = (v) => str(v, 40).replace(/[^\w-]/g, '');

export function cleanExtra(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const c = d.costs && typeof d.costs === 'object' ? d.costs : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    trading: cleanPlan(d.trading),
    costs: {
      bought: arr(c.bought).filter((x) => x && str(x.what)).slice(0, 20).map((x) => ({ what: str(x.what, 80), usd: num(x.usd) })),
      spent: num(c.spent), monthly: num(c.monthly), note: str(c.note),
      subscriptions: arr(c.subscriptions).filter((x) => x && str(x.what)).slice(0, 20).map((x) => ({ what: str(x.what, 80), usd_month: num(x.usd_month) })),
      next_buys: arr(c.next_buys).filter((x) => x && str(x.what)).slice(0, 6).map((x) => ({ what: str(x.what, 80), usd: pair(x.usd), when: str(x.when, 160) })),
    },
    ready: arr(d.ready).filter((r) => r && ident(r.id) && str(r.name)).slice(0, 16).map((r) => ({
      id: ident(r.id), kind: str(r.kind, 20), name: str(r.name, 80), usd: num(r.usd), minutes: num(r.minutes), where: str(r.where, 80), file: str(r.file, 120), steps: list(r.steps, 10) })),
    moves: arr(d.moves).filter((m) => m && ident(m.id) && str(m.what)).slice(0, 7).map((m) => ({
      id: ident(m.id), what: str(m.what), minutes: num(m.minutes), usd: pair(m.usd), where: str(m.where, 80) })),
    ideas: cleanIdeas(d.ideas),
    door_rules: list(d.door_rules, 6),
  };
}

function cleanIdeas(v) {
  const d = v && typeof v === 'object' ? v : {};
  const rows = (Array.isArray(d.rows) ? d.rows : []).filter((r) => r && str(r.name)).slice(0, 10).map((r) => ({
    rank: num(r.rank), id: str(r.id, 40), name: str(r.name, 100), usd_hour: pair(r.usd_hour), month: pair(r.month), first_dollar: str(r.first_dollar, 120),
    risk: str(r.risk), fits: str(r.fits), model: !!r.model }));
  const kits = {};
  for (const [k, x] of Object.entries(d.kits && typeof d.kits === 'object' ? d.kits : {}).slice(0, 4)) {
    if (x && str(x.title)) kits[str(k, 40)] = { title: str(x.title, 80), steps: list(x.steps, 8), rules: list(x.rules, 6), money: str(x.money) };
  }
  return { searched: ymd(d.searched), how: str(d.how), rows, kits };
}

// ---- the payout planner: the same math as engine/payout_plan.py (tests.test_money_door runs both on the same accounts)
export const PLANS = {
  builder50k: { label: 'MFFU Builder 50K', mll: 2000, buffer: 2100, pay_min: 500, pay_max: 2000, split: 0.8, cycle_days: 2, first_wait_h: 48, ask_above: 2000, typical_day: 300,
    target: 3000, eval_day: Math.round((3000 / 9) * 100) / 100, funded_month: 546, price: 91.8, bot: 'Zlarior (LIT)' },
  builder25k: { label: 'MFFU Builder 25K', mll: 1000, buffer: 1100, pay_min: 250, pay_max: 1000, split: 0.8, cycle_days: 2, first_wait_h: 48, ask_above: 1000, typical_day: 150,
    target: 1500, eval_day: 150, funded_month: 338, price: 63, bot: 'ATLAS' },
};
const SLOW = 2;
const BANK_DAYS = 4;
const CLOSED = new Set(['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-04-02', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
// the next buys (owner 2026-11-20, Decide card drop-lucid-account4: YES, "MFFU only"): the Rapid EOD 25K now, then the Rapid EOD 50K from the first
// payout (business/fleet_plan.json next_buy: $165 with code CLUB, about $1,969 a month Jul-Oct-like), then a fresh Builder 50K. Was a LucidPro 50K.
export const ACCOUNT4 = { name: 'Rapid EOD 50K', now: 'Rapid EOD 25K', then: 'a fresh Builder 50K', price: [165, 165], code: 'CLUB', adds_month: 1969, sale: null, doc: 'business/fleet_plan.json' };
const isoDay = (d) => d.toISOString().slice(0, 10);
const noon = (s) => new Date(s + 'T12:00:00Z');
const up = (x) => Math.ceil(x - 1e-9);
const whole = (v) => Math.round(v).toLocaleString('en-US');

export function sessionsAfter(s, n) {
  const d = noon(s);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6 && !CLOSED.has(isoDay(d))) n -= 1; }
  return isoDay(d);
}
export function businessAfter(s, n) {
  const d = noon(s);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n -= 1; }
  return isoDay(d);
}

// home.json -> [{name, plan, stage, to_target, room, profit, status}] (bot names only, never a broker id)
export function accountsFromHome(home) {
  const out = [];
  if (!home || typeof home !== 'object') return out;
  for (const a of Array.isArray(home.accounts) ? home.accounts : []) {
    if (!a || typeof a !== 'object' || !['eval', 'funded'].includes(a.kind) || a.source === 'cloud') continue;
    const e = a.eval || {};
    const plan = Math.abs(num(e.start_balance, 50000) - 25000) < 1 ? 'builder25k' : 'builder50k';
    out.push({ name: PLANS[plan].bot, plan, stage: a.kind, to_target: num(e.to_target, PLANS[plan].target), room: num(e.room, PLANS[plan].mll), profit: num(e.profit), status: String(e.status || 'open') });
  }
  const b = (home.second || {}).account_b;
  if (b && typeof b === 'object' && b.eval && b.enabled !== false) {
    const e = b.eval;
    const plan = String(b.plan || '25').includes('25') ? 'builder25k' : 'builder50k';
    out.push({ name: 'ATLAS', plan, stage: String(b.stage || '') === 'funded' ? 'funded' : 'eval', to_target: num(e.to_target, PLANS[plan].target), room: num(e.room, PLANS[plan].mll), profit: num(e.profit), status: String(e.status || 'open') });
  }
  return out;
}

export function planAccount(a, today) {
  const plan = PLANS[a.plan] ? a.plan : 'builder50k';
  const P = PLANS[plan];
  const name = String(a.name || P.bot).slice(0, 40);
  const room = num(a.room, P.mll);
  const stage = a.stage || 'eval';
  const status = String(a.status || 'open').toLowerCase();
  const goal = P.buffer + P.ask_above;
  const req = Math.min(P.pay_max, P.ask_above);
  const r = { name, plan, label: P.label, stage, room: Math.round(room * 100) / 100, price: P.price, request: req, to_you: Math.round(req * P.split * 100) / 100, funded_month: P.funded_month };
  if (room <= 0 || ['failed', 'breached', 'lost'].includes(status)) return { ...r, state: 'lost', text: `${name}: the eval is gone. Buy a new ${P.label} eval at $${P.price.toFixed(2)} when you want it back.` };
  if (stage === 'funded') {
    const toAsk = Math.max(0, goal - num(a.profit));
    const n = toAsk > 0 ? Math.max(P.cycle_days, up(toAsk / P.typical_day)) : 0;
    const typ = sessionsAfter(today, n);
    Object.assign(r, { state: 'funded', pass_typical: null, pass_slow: null, payout_typical: typ, payout_slow: sessionsAfter(today, up(n * SLOW)), bank_typical: businessAfter(typ, BANK_DAYS), sessions_to_payout: n });
  } else {
    const left = Math.max(0, num(a.to_target, P.target));
    const n = left > 0 ? up(left / P.eval_day) : 0;
    const pTyp = sessionsAfter(today, n);
    const pSlow = sessionsAfter(today, up(n * SLOW));
    const nf = Math.max(P.cycle_days, up(goal / P.typical_day));
    const wait = up(P.first_wait_h / 24);
    const typ = sessionsAfter(pTyp, 1 + Math.max(nf, wait));
    Object.assign(r, { state: left <= 0 || status === 'passed' ? 'passed' : 'eval', pass_typical: pTyp, pass_slow: pSlow, sessions_to_pass: n, payout_typical: typ,
      payout_slow: sessionsAfter(pSlow, 1 + up(Math.max(nf, wait) * SLOW)), bank_typical: businessAfter(typ, BANK_DAYS), sessions_to_payout: nf });
  }
  const when = r.pass_typical ? `passes about ${r.pass_typical} (slow ${r.pass_slow}), ` : '';
  r.text = `${name}: ${when}first payout about ${r.payout_typical} (slow ${r.payout_slow}): ask $${whole(req)}, $${whole(r.to_you)} to you, in the bank about ${r.bank_typical}.`;
  return r;
}

export function planPayouts(accounts, today) {
  const rows = (Array.isArray(accounts) ? accounts : []).filter((a) => a && typeof a === 'object').map((a) => planAccount(a, today));
  const alive = rows.filter((r) => r.state !== 'lost');
  const first = alive.length ? alive.reduce((m, r) => (r.bank_typical < m.bank_typical ? r : m)) : null;
  const buy = first ? first.bank_typical : null;
  const inSale = !!(buy && ACCOUNT4.sale && ACCOUNT4.sale[0] <= buy && buy <= ACCOUNT4.sale[1]);
  const month = Math.round(alive.reduce((s, r) => s + r.funded_month, 0) * 100) / 100;
  return {
    today, accounts: rows, label: 'ESTIMATE',
    account4: { ...ACCOUNT4, buy_on: buy, in_sale: inSale, after: first ? first.name : null,
      text: first ? `Next buys (MFFU only): the ${ACCOUNT4.now} now (added today), then the ${ACCOUNT4.name} about ${buy}, the day ${first.name}'s first payout is in your bank ($${ACCOUNT4.price[0]} with code ${ACCOUNT4.code}; adds about $${whole(ACCOUNT4.adds_month)} a month, estimate), then ${ACCOUNT4.then}.`
        + (inSale ? ' That is inside the sale: buy in the sale.' : '') : `Next buys (MFFU only): the ${ACCOUNT4.now} now; the ${ACCOUNT4.name} waits for a first payout.` },
    first_payout_to_you: Math.round(alive.reduce((s, r) => s + r.to_you, 0) * 100) / 100, funded_month: month,
    funded_month_with_4: Math.round((month + (alive.length ? ACCOUNT4.adds_month : 0)) * 100) / 100,
    first: first ? { name: first.name, bank: first.bank_typical, to_you: first.to_you } : null,
  };
}

// a published plan (business.json / fixture.json "trading") -> a safe plan, or null
export function cleanPlan(t) {
  if (!t || typeof t !== 'object' || !Array.isArray(t.accounts)) return null;
  const accounts = t.accounts.filter((r) => r && str(r.name)).slice(0, 8).map((r) => ({
    name: str(r.name, 40), label: str(r.label, 40), state: str(r.state, 12), room: num(r.room), request: num(r.request), to_you: num(r.to_you), funded_month: num(r.funded_month),
    pass_typical: ymd(r.pass_typical), pass_slow: ymd(r.pass_slow), payout_typical: ymd(r.payout_typical), payout_slow: ymd(r.payout_slow), bank_typical: ymd(r.bank_typical), text: str(r.text) }));
  const a4 = t.account4 && typeof t.account4 === 'object' ? t.account4 : {};
  return { today: ymd(t.today), demo: !!t.demo, accounts, funded_month: num(t.funded_month), funded_month_with_4: num(t.funded_month_with_4), first_payout_to_you: num(t.first_payout_to_you),
    first: t.first && ymd(t.first.bank) ? { name: str(t.first.name, 40), bank: ymd(t.first.bank), to_you: num(t.first.to_you) } : null,
    account4: { text: str(a4.text), buy_on: ymd(a4.buy_on), in_sale: !!a4.in_sale, price: pair(a4.price), adds_month: num(a4.adds_month) } };
}

// the front door's numbers
export function summary(doc, plan, costs) {
  const t = (doc && doc.total) || { usd_m3: [0, 0], real: 0 };
  return {
    firstPayout: plan && plan.first ? `${money(plan.first.to_you)} about ${plan.first.bank}` : 'no eval running',
    funded: plan ? `${money(plan.funded_month)} a month` : '-',
    business: `${range(t.usd_m3)} a month`,
    spent: `${money(costs ? costs.spent : 0)}${costs && costs.monthly ? ` + ${money(costs.monthly)}/mo` : ''}`,
    real: `${money(t.real)} a month`,
  };
}

// the phone's own date as YYYY-MM-DD (the planner's "today")
export function localDay(d) { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }

// What the page's numbers are (night-bugsweep 2026-11-19), said plainly at the top:
//   demo     = the committed example (fixture.json). business.json is private (never on the public site), so the public site is ALWAYS this:
//              its to-dos, buy advice and account #4 date are an example's, never shown as the owner's
//   snapshot = the PC's own business.json, but older than SNAP_H hours (the PC has not sent a newer copy)
//   fresh    = the PC's own business.json, newer than that
//   dataState(doc, nowMs) -> { kind, asof, hours, text }
export const SNAP_H = 36;
export function dataState(doc, nowMs) {
  const t = Date.parse(doc && doc.asof ? doc.asof : '');
  const hours = Number.isFinite(t) && Number.isFinite(+nowMs) ? Math.max(0, (+nowMs - t) / 3600e3) : null;
  const when = Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'an unknown time';
  if (!doc || doc.sample) {
    return { kind: 'demo', asof: doc ? doc.asof : '', hours,
      text: 'Example numbers (DEMO), not yours. Your own business file stays private on your PC, so this site shows an example: its to-do list and buy advice are hidden. To see yours: open this page from the PC (run AGENCY_DAY.bat there).' };
  }
  if (hours === null || hours > SNAP_H) {
    const age = hours === null ? 'age unknown' : hours < 48 ? `${Math.round(hours)} hours old` : `${Math.round(hours / 24)} days old`;
    return { kind: 'snapshot', asof: doc.asof, hours,
      text: `Snapshot from ${when} (${age}): the PC has not sent a newer copy, so the to-dos, dates and buy advice may be out of date. Fresh copy: run AGENCY_DAY.bat on the PC.` };
  }
  return { kind: 'fresh', asof: doc.asof, hours, text: `Updated ${String(doc.asof).replace('T', ' ').slice(0, 16)}.` };
}
