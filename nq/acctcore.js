// ACCOUNTS screen core (day-accounts 2026-11-23, owner: "ONE very clean way to see my accounts" + "no account ever forgets to trade in
// MFFU's 7 days"). Pure ES module: no DOM, no network, node-tested (tests/test_accounts_screen.py). The page (accounts.js) hands in:
//   accts  = nqdesk.accounts(home, biz, nowS)  (balance, room, today, to pass / payout, the PC's age; a new PC account shows by itself)
//   k7     = clock7.rows(lite, nowS)           (MFFU 7-day clock per PC account id: last fill, MFFU's last day, keep-alive on / off)
//   lite   = the PC's newest status post (pc_feed.js fetchLatest: "ar" on / armed per bot, mf rows with the last 4, k7 with the act day)
//   biz    = ../business/accounts.json (the owner's order, plan, stage, the PC ids of each account)
//   payday = ../business/payday.json (1,000-run estimates: funded day + first payout day per account kind)
// -> { pc: {ageS, text, level}, banner: {level, title, text} | null, cards: [card], counts }
// Never a broker id or name: only the last 4 digits (mf "l4"). Nothing here places, arms or changes anything.

import * as GM from './goals_model.js?v=1';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const day = (x) => { const s = String(x || '').slice(0, 10); return DAY_RX.test(s) ? s : null; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wdOf = (s) => new Date(s + 'T12:00:00Z').getUTCDay();

export const PC_FRESH_S = 20 * 60, PC_OLD_S = 60 * 60;        // the PC posts every 15 min (pc_feed.js FRESH_S; nqdesk AGE_LIMITS.pc)
export const MFFU_PAY = { '25K': { at: 2100, ask: 1000 }, '50K': { at: 4100, ask: 2000 } };   // the max request (CLAUDE.md: $1,000 on a 25K at $2,100)

export function money(v, sign) {
  const n = num(v); if (n === null) return '-';
  const a = Math.round(Math.abs(n)); if (a === 0) return '$0';
  return (n < 0 ? '-' : sign ? '+' : '') + '$' + a.toLocaleString('en-US');
}
export function ago(s) {
  const n = num(s); if (n === null) return 'never';
  if (n < 90) return 'just now';
  if (n < 3600) return `${Math.round(n / 60)} min ago`;
  if (n < 48 * 3600) { const m = Math.round(n / 60), h = Math.floor(m / 60); return m % 60 ? `${h} h ${m % 60} min ago` : `${h} h ago`; }
  return `${Math.round(n / 86400)} days ago`;
}
export const nice = (s) => { const d = day(s); if (!d) return ''; return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wdOf(d)]} ${+d.slice(5, 7)}/${+d.slice(8, 10)}`; };
const monDay = (s) => { const d = day(s); if (!d) return ''; return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`; };

// ------------------------------------------------------------------------------------------------ CME days (engine/cme_calendar twin)
// Only for the keep-alive's act day when the PC's k7 row has none (an older post or a cut one): full closures (Jan 1, Dec 25 observed)
// and early halts (holidays, the day after Thanksgiving, Dec 24, Jul 3, Good Friday). A test runs it against the Python on 2 years of days.
const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12)).toISOString().slice(0, 10);
function nth(y, m, wd, n) {
  if (n > 0) { const f = new Date(Date.UTC(y, m - 1, 1, 12)); const d = 1 + ((wd - ((f.getUTCDay() + 6) % 7)) + 7) % 7 + (n - 1) * 7; return ymd(y, m, d); }
  const last = new Date(Date.UTC(y, m, 0, 12)); const d = last.getUTCDate() - ((((last.getUTCDay() + 6) % 7) - wd) + 7) % 7; return ymd(y, m, d);
}
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mon = Math.floor((h + l - 7 * m + 114) / 31); return ymd(y, mon, ((h + l - 7 * m + 114) % 31) + 1);
}
const pyWd = (s) => (wdOf(s) + 6) % 7;                         // Monday 0 .. Sunday 6, as Python
export function fullClosure(s) {
  const y = +s.slice(0, 4);
  for (const [m, dd] of [[1, 1], [12, 25]]) {
    let h = ymd(y, m, dd);
    if (pyWd(h) === 6) h = addDays(h, 1); else if (pyWd(h) === 5 && m === 12) h = addDays(h, -1);
    if (s === h) return true;
  }
  return false;
}
export function earlyClose(s) {
  if (fullClosure(s)) return null;
  const y = +s.slice(0, 4), obs = (h) => (pyWd(h) === 6 ? addDays(h, 1) : pyWd(h) === 5 ? addDays(h, -1) : h);
  const jul4 = obs(ymd(y, 7, 4)), jun19 = obs(ymd(y, 6, 19)), thanks = nth(y, 11, 3, 4);
  const hol = new Set([nth(y, 1, 0, 3), nth(y, 2, 0, 3), nth(y, 5, 0, -1), jun19, jul4, nth(y, 9, 0, 1), thanks, addDays(thanks, 1), ymd(y, 12, 24)]);
  if (s === addDays(thanks, 1) || s === ymd(y, 12, 24)) return 13 * 60 + 15;
  if (s === ymd(y, 7, 3) && pyWd(ymd(y, 7, 4)) >= 1 && pyWd(ymd(y, 7, 4)) <= 4) return 13 * 60 + 15;
  if (hol.has(s)) return 13 * 60;
  if (s === addDays(easter(y), -2)) return 9 * 60 + 15;
  return null;
}
const hasSession = (s) => pyWd(s) < 5 && !fullClosure(s);

/** engine/keepalive.plan act_day (lead 1): the last FULL session on or before the cautious deadline (base + 6), else the first half day,
 *  else (late) the next session. `today` = the CME trading day; a session of today counts while its 15:48 ET window is still open. */
//  The evening after 18:00 ET (the trading day is already tomorrow, its session not begun) counts tomorrow as open; engine/keepalive.plan
//  does not (LEAD_WIRES.md 3: display only, the live tick is untouched), so the two are compared in the daytime only.
export function actDay(base, today, minuteET, etDate) {
  const b = day(base), t = day(today); if (!b || !t) return null;
  const ahead = day(etDate) && day(etDate) < t;
  const deadline = addDays(b, 6), open = (d) => hasSession(d) && (d !== t || ahead || minuteET == null || minuteET < (earlyClose(d) != null ? earlyClose(d) - 15 - 2 : 15 * 60 + 48));
  const sess = []; for (let d = t, i = 0; d <= deadline && i < 30; d = addDays(d, 1), i++) if (open(d)) sess.push(d);
  const full = sess.filter((d) => earlyClose(d) == null);
  if (full.length) return full[full.length - 1];
  if (sess.length) return sess[0];
  for (let d = t, i = 0; i < 14; d = addDays(d, 1), i++) if (open(d)) return d;
  return null;
}

// ------------------------------------------------------------------------------------------------ which PC ids, bots and payday row an account is
const PLAN_IDS = { zlarior: ['mffu50k_eval', 'lit'], fresh25: ['b25k_2'], atlas: ['atlas', 'acct_b'], rapid1: ['rapid'] };
const PAYDAY_OF = { zlarior: 'Z50', fresh25: 'N25', atlas: 'A25', rapid1: 'R25' };
function idsOf(card, biz) {
  const p = arr(isObj(biz) ? biz.accounts : null).find((a) => isObj(a) && a.key === card.key);
  const ids = arr(p && p.pc).map(String);
  return ids.length ? ids : PLAN_IDS[card.key] || [String(card.key)];
}
const isRapid = (card, ids) => ids.some((i) => /^rapid/.test(i)) || /rapid/i.test(`${card.name} ${card.plan}`);
const sizeOf = (card) => (/50\s*k/i.test(`${card.name} ${card.plan}`) || (card.mll || 0) >= 2000 ? '50K' : '25K');

/** the bots that trade an account (LIT = Zlarior's rules, ATLAS, BLITZ = paper only, never armed, on evals) with on / armed from the PC */
export function botsOf(card, ids, lite, glance) {
  const ar = isObj(lite) && isObj(lite.ar) ? lite.ar : {};
  const gl = arr(isObj(glance) ? glance.bots : null).filter(isObj);
  const gid = ids.includes('mffu50k_eval') || ids.includes('lit') ? 'lit' : ids.includes('atlas') || ids.includes('acct_b') ? 'atlas' : ids[0];
  const st = () => {
    const a = arr(ar[gid]); if (a.length >= 2) return a[1] ? 'armed' : a[0] ? 'on' : 'off';
    const g = gl.find((b) => b.id === gid); if (g) return g.armed ? 'armed' : g.on ? 'on' : 'off';
    return 'unknown';
  };
  const s = card.has ? st() : 'unknown';
  const names = gid === 'atlas' ? ['ATLAS'] : isRapid(card, ids) ? ['LIT', 'ATLAS'] : ['LIT'];
  const out = names.map((n) => ({ name: n, state: s }));
  if (card.stage !== 'Funded') out.push({ name: 'BLITZ', state: 'paper' });
  return out;
}
export const BOT_WORD = { armed: 'ARMED', on: 'ON, not armed', off: 'OFF', unknown: 'not reported', paper: 'paper only' };

function paydayRow(card, ids, payday) {
  const rows = isObj(payday) && isObj(payday.rows) ? payday.rows : {}, m = isObj(rows.H2) ? rows.H2 : isObj(rows[Object.keys(rows)[0]]) ? rows[Object.keys(rows)[0]] : {};
  const A = isObj(m.accounts) ? m.accounts : {};
  let code = PAYDAY_OF[card.key], like = false;
  if (!code) { like = true; code = card.stage === 'Funded' ? 'A25' : isRapid(card, ids) ? (sizeOf(card) === '25K' ? 'R25' : null) : sizeOf(card) === '50K' ? 'Z50' : 'N25'; }
  const r = code && isObj(A[code]) ? A[code] : null;
  return r ? { ...r, like: like ? String(r.name || code).replace(/\s*\(.*\)$/, '') : '' } : null;
}

// ------------------------------------------------------------------------------------------------ one card
export function clockOf(r, today, minuteET, rawAct, etDate) {
  if (!r) return null;
  const base = addDays(r.hard, -(r.lim || 7));
  // computed here for NOW (the post can be from last night: its act day is from then); the PC's own act day only when this cannot say
  let act = actDay(base, today, minuteET, etDate);
  if (!act && day(rawAct) && day(rawAct) >= today) act = day(rawAct);
  const left = r.left, lvl = left <= 1 ? 'bad' : left <= 3 ? 'warn' : 'ok';   // owner: green 4+ days, gold 2-3, red 0-1
  return { lf: r.lf, hard: r.hard, left, ses: r.ses, on: r.on, act, lvl: r.lvl === 'bad' ? 'bad' : lvl === 'ok' && r.lvl === 'warn' ? 'warn' : lvl,
    ka: r.ka === true,
    lastText: r.lf ? (r.ka === true ? `Keep-alive filled ${nice(r.lf)}` : `Last trade ${nice(r.lf)}`) : `No trade yet (counts from ${nice(addDays(base, 1))})`,
    leftText: left < 0 ? `${-left} day${left === -1 ? '' : 's'} PAST` : left === 0 ? 'LAST DAY TODAY' : `${left} day${left === 1 ? '' : 's'} left`,
    hardText: `MFFU's last day ${nice(r.hard)}` + (r.ka === true && r.lf ? ` (keep-alive filled ${monDay(r.lf)})` : ''),
    kaText: r.on === true ? 'Keep-alive ON' : r.on === false ? 'Keep-alive OFF' : 'Keep-alive not reported',
    actText: act ? (r.on === true ? `acts ${nice(act)} 3:33 PM ET if nothing trades` : `would act ${nice(act)}`) : '' };
}

/** an account's name in the owner's words, never a broker id (a run of 5+ digits or an MFFU id shape becomes its last 4) */
export function safeName(s) {
  const t = String(s || '').replace(/\b(?:MFFU|MFF)?[A-Z]{0,6}\d{5,}\b/gi, (m) => `··${m.slice(-4)}`).trim();
  return t.slice(0, 40) || 'Account';
}

export function card(a, ctx) {
  const { lite, biz, payday, k7, today, minuteET, etDate, pcAge } = ctx;
  const ageS = num(a.ageS) ?? (a.has ? num(pcAge) : null);      // an added account's row (nqdesk's 2nd loop) carries no age: the post's
  const ids = idsOf(a, biz), mf = arr(isObj(lite) && isObj(lite.mf) ? lite.mf.a : null).find((r) => isObj(r) && ids.includes(String(r.id))) || null;
  const l4 = mf && /^\d{4}$/.test(String(mf.l4 || '')) ? String(mf.l4) : '';
  const funded = a.stage === 'Funded', size = sizeOf(a);
  const rawK = arr(isObj(lite) && isObj(lite.k7) ? lite.k7.a : null).find((r) => isObj(r) && ids.includes(String(r.id)));
  const clock = a.has || a.dot !== 'plan' ? clockOf(arr(k7).find((r) => ids.includes(String(r.id))) || null, today, minuteET, rawK && rawK.act, etDate) : null;
  const roomLvl = a.roomFrac === null ? 'none' : a.roomFrac < 0.25 ? 'bad' : a.roomFrac < 0.5 ? 'warn' : 'ok';
  // QA #4: ONE goals model for nq/ and nq/accounts (goals_model.js, night-nq-main): to pass = the plan's target; to payout = the max ask
  // above the buffer (Builder 25K $1,000 at $2,100, 50K $2,000 at $4,100, Rapid $500 at $2,100 incl. the bot's $500 keep), earliest ask too
  const G = GM.goal({ key: a.key, name: a.name, plan: a.plan, stage: a.stage, balance: a.has ? a.balance : null });
  const goal = funded
    ? { label: 'To first payout', text: G.left === null ? '-' : G.left <= 0 ? 'Payout ready' : `+${money(G.left)}`,
      sub: G.ask !== null ? `ask the max ${money(G.ask)} at ${money(G.goalAt)}` : `the first ask at ${money(G.goalAt)}`, frac: G.frac,
      note: G.earliestAt !== null && G.earliestAt < (G.goalAt || 0) && G.earliestLeft !== null ? (G.earliestLeft > 0 ? `MFFU allows the first ${money(G.earliestAt - (G.goalAt - G.ask))} ask at ${money(G.earliestAt)} (${money(G.earliestLeft)} to go)` : 'MFFU already allows a smaller first ask') : '' }
    : { label: 'To pass', text: G.left === null ? '-' : G.left <= 0 ? 'Target reached' : money(G.left), sub: `target +${money(G.goalAt)}`, frac: G.frac,
      note: G.profit !== null && G.profit < 0 ? `${money(-G.profit)} below the start: ${money(G.left)} to make back and reach +${money(G.goalAt)}` : '' };
  const P = paydayRow(a, ids, payday);
  // QA #4: the date from the forecast, the $ from the ONE goals model (the plan's ask x the split: $800 on a Builder 25K), never two different $
  const eta = P ? (funded ? `1st payout ~${monDay(P.first_pay_med) || 'not in 6 months'} (${money(G.toYou ?? P.first_pay_usd)} to you)`
    : `Funded ~${monDay(P.funded_med) || '?'} · 1st payout ~${monDay(P.first_pay_med) || 'not in 6 months'}`) + (P.like ? ` (like ${P.like})` : '') : '';
  return {
    key: String(a.key), name: safeName(PLAN_IDS[a.key] || !mf || !mf.nm ? a.name : mf.nm), plan: a.plan || '', stage: funded ? 'Funded' : 'Eval', l4, has: !!a.has, dot: a.dot, ageS,
    planned: a.dot === 'plan', fresh: a.dot === 'live',
    balance: a.has ? (funded ? `${money(a.balance, true)}` : money(a.balance)) : '-', balanceNote: funded && a.has ? 'MFFU shows funded as profit from $0' : '',
    todayN: a.has ? num(a.today) : null, balanceN: a.has ? num(a.balance) : null, roomN: a.has ? num(a.room) : null,
    today: a.has ? money(a.today, true) : '-', todayLvl: num(a.today) === null ? 'none' : a.today > 0 ? 'ok' : a.today < 0 ? 'bad' : 'none',
    room: a.has ? money(a.room) : '-', roomOf: a.mll ? money(a.mll) : '', roomFrac: a.roomFrac, roomLvl,
    goal, eta, etaNote: P ? 'estimate from 1,000 replays, not a promise' : '',
    bots: botsOf(a, ids, lite, isObj(lite) && isObj(lite.pc) ? lite.pc.glance : null), clock,
    ageText: a.has ? `PC ${ago(ageS)}` : a.dot === 'plan' ? 'plan only: no PC numbers yet' : 'no PC numbers yet',
  };
}

// ------------------------------------------------------------------------------------------------ the screen
export function build(accts, k7, ctx) {
  const c = isObj(ctx) ? ctx : {}, nowS = num(c.nowS) || 0;
  const lite = isObj(c.lite) ? c.lite : null, rt = lite ? num((isObj(lite.reporter) && lite.reporter.t) || lite.t) : null;
  const ageS = rt ? Math.max(0, nowS - rt) : null;
  const pc = { ageS, level: ageS === null ? 'bad' : ageS > PC_OLD_S ? 'bad' : ageS > PC_FRESH_S ? 'warn' : 'ok',
    text: ageS === null ? 'PC not heard from' : `PC ${ago(ageS)}` };
  const cards = arr(accts).filter(isObj).map((a) => card(a, { ...c, k7, pcAge: ageS }));
  // a 7-day row of an account the plan file and the accounts list both miss (it traded, the mf row exists): still its own card
  const seen = new Set(cards.flatMap((x) => idsOf({ key: x.key }, c.biz)));
  for (const r of arr(k7)) {
    if (!isObj(r) || seen.has(String(r.id)) || r.id === 'blitz') continue;
    cards.push(card({ key: String(r.id), name: String(r.nm || 'Added account'), plan: '', stage: /funded/i.test(r.nm || '') ? 'Funded' : 'Eval', has: false, dot: 'off',
      roomFrac: null }, { ...c, k7 }));
  }
  const risk = cards.filter((x) => x.clock && x.clock.lvl === 'bad');
  const warn = cards.filter((x) => x.clock && x.clock.lvl === 'warn');
  let banner = null;
  if (risk.length) {
    const w = risk.map((x) => `${x.name} (${x.clock.left <= 0 ? (x.clock.left === 0 ? 'last day TODAY' : 'PAST its last day') : `last day ${nice(x.clock.hard)}`})`).join(', ');
    banner = { level: 'bad', title: `7-DAY RULE: ${risk.length === 1 ? '1 account' : risk.length + ' accounts'} at risk`,
      text: `${w}. One filled trade resets it: let the bot trade${risk.some((x) => x.clock.on !== true) ? ' and turn the keep-alive ON (START BOT + your phrase)' : ''}, or place 1 MNQ by hand before 3:50 PM ET while every account is flat.`
        + (pc.level !== 'ok' ? ` Your PC last reported ${pc.ageS === null ? 'never' : ago(pc.ageS)}: turn it on.` : '') };
  } else if (pc.level === 'bad') {
    banner = { level: 'warn', title: pc.ageS === null ? 'No report from your PC yet' : `PC silent: last report ${ago(pc.ageS)}`,
      text: 'The numbers below are from the last report. The bots and the keep-alive only run while the PC and NinjaTrader are on.' };
  }
  return { pc, banner, cards, counts: { all: cards.length, risk: risk.length, warn: warn.length, live: cards.filter((x) => x.fresh).length } };
}

// ------------------------------------------------------------------------------------------------ night-nq-accounts 2026-11-27: the premium card's extra numbers
// All pure, all honest: a field the PC or the site did not send is null and the page says so; nothing is made up.

/** the PC account row (lite.accounts[]) of a card: its eval block carries dll / dll_used / today */
function pcRow(ids, lite) { return arr(isObj(lite) ? lite.accounts : null).find((a) => isObj(a) && ids.includes(String(a.id))) || null; }

/** daily loss used today: { used, of, frac, text, lvl } | null (the PC sends eval.dll + eval.dll_used; a soft day stop, never a fail) */
export function dllOf(ids, lite, todayUsd) {
  const r = pcRow(ids, lite), ev = r && isObj(r.eval) ? r.eval : null;
  const of = num(ev && ev.dll);
  if (!of || of <= 0) return null;
  let used = num(ev.dll_used);
  if (used === null) { const t = num(ev.today ?? todayUsd); used = t === null ? null : Math.max(0, -t); }
  if (used === null) return null;
  const frac = Math.max(0, Math.min(1, used / of));
  return { used, of, frac, text: `${money(used)} of ${money(of)}`, lvl: frac >= 0.75 ? 'bad' : frac >= 0.4 ? 'warn' : 'ok' };
}

/** the pass / payout forecast (../business/forecast.json, tools/forecast.py: 1,000 replays from TODAY's balance) */
export function forecastOf(key, fc, funded) {
  const A = isObj(fc) && isObj(fc.accounts) ? fc.accounts : {}, r = isObj(A[key]) ? A[key] : null;
  if (!r) return null;
  const g = isObj(r['2026-like']) ? r['2026-like'] : {}, b = isObj(r['2021-25-like']) ? r['2021-25-like'] : {};
  const made = String((fc && fc.made) || '').slice(0, 10);
  if (funded) {
    const p = num(g.first_payout_pct); if (p === null) return null;
    return { pct: p, bad: num(b.first_payout_pct), label: '1st payout in 6 months', lost: num(g.lost_pct), made };
  }
  const p = num(g.pass_pct); if (p === null) return null;
  return { pct: p, bad: num(b.pass_pct), label: 'Pass chance', med: num(g.pass_med_sessions), made };
}

/** the account's end-of-day P&L points (the PC's mf eq, oldest first) for the history sparkline: { pts, min, max, last, first } | null */
export function historyOf(ids, lite) {
  const r = arr(isObj(lite) && isObj(lite.mf) ? lite.mf.a : null).find((x) => isObj(x) && ids.includes(String(x.id)));
  const pts = arr(r && r.eq).map(num).filter((x) => x !== null).slice(-60);
  if (pts.length < 2) return null;
  return { pts, min: Math.min(...pts), max: Math.max(...pts), last: pts[pts.length - 1], first: pts[0], n: pts.length };
}

/** an SVG polyline "x,y x,y" for points in a w x h box (pad px), the zero line's y (or null when 0 is outside) */
export function sparkPath(pts, w, h, pad) {
  const p = pad || 4, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1;
  const X = (i) => p + (i * (w - 2 * p)) / Math.max(1, pts.length - 1), Y = (v) => p + ((hi - v) * (h - 2 * p)) / span;
  return { line: pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), zero: Y(0), lastX: X(pts.length - 1), lastY: Y(pts[pts.length - 1]) };
}

/** a ring gauge: stroke-dasharray for a fraction of a circle of radius r ("<on> <off>") */
export function ringDash(frac, r) {
  const c = 2 * Math.PI * r, f = frac === null || frac === undefined || !Number.isFinite(+frac) ? 0 : Math.max(0, Math.min(1, +frac));
  return { dash: `${(c * f).toFixed(2)} ${(c * (1 - f) + 0.01).toFixed(2)}`, c };
}

/** the 7-day clock as 7 segments: lit = days left (0..7), the rest spent; lvl from the clock */
export function k7Segments(clock) {
  if (!clock) return null;
  const left = Math.max(0, Math.min(7, num(clock.left) ?? 0));
  return Array.from({ length: 7 }, (_, i) => (i < left ? clock.lvl : 'spent'));
}

/** the business view: the 12-month planner range (nq/plan12.json) + the buy light (the PC's "bg": only when its show switch is on) */
export function business(plan, lite) {
  const rows = arr(isObj(plan) ? plan.rows : null).filter((r) => isObj(r) && num(r.p50) !== null);
  const bg = isObj(lite) && isObj(lite.bg) && (lite.bg.s === 'OK' || lite.bg.s === 'STOP') ? lite.bg : null;
  // each row on its OWN scale ($0 always inside it): one shared scale made the 2021-25 rows a few pixels wide next to the 2026 one
  return {
    rows: rows.map((r) => { const lo = Math.min(0, num(r.p10)) * 1.08, hi = Math.max(0, num(r.p90)) * 1.08, pos = (v) => Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1)));
      return { m: String(r.m), label: String(r.label || r.m), p10: num(r.p10), p50: num(r.p50), p90: num(r.p90),
      text: `${money(r.p50, true)} middle · ${money(r.p10, true)} to ${money(r.p90, true)}`, a: pos(num(r.p10)), b: pos(num(r.p90)), mid: pos(num(r.p50)), zero: pos(0),
      // the band split at $0: the losing part red, the winning part mint (never a red tint on a range that is all profit)
      neg: num(r.p10) < 0 ? [pos(num(r.p10)), pos(Math.min(0, num(r.p90)))] : null, posb: num(r.p90) > 0 ? [pos(Math.max(0, num(r.p10))), pos(num(r.p90))] : null,
      cash: num(r.cash), fees: num(r.fees), loss: num(r.loss), plan: r.m === 'M25' }; }),
    made: String((plan && plan.made) || ''), note: String((plan && plan.note) || ''),
    light: bg ? { stop: bg.s === 'STOP', word: bg.s === 'STOP' ? 'STOP buying new evals' : 'OK to buy new evals',
      line: String(bg.l || '').replace(/^Buy gate:[^·]*·\s*/, '').slice(0, 200) } : null,
  };
}

/** the extras for one card (the page calls it next to card()) */
export function extras(c, ctx) {
  const ids = idsOf({ key: c.key }, ctx.biz);
  const funded = c.stage === 'Funded';
  return { ids, live: c.has ? liveOf(ids, ctx.lite) : { state: 'none', icon: '', line: '', pos: null }, dll: c.has ? dllOf(ids, ctx.lite, null) : null, fc: forecastOf(c.key, ctx.forecast, funded), hist: historyOf(ids, ctx.lite),
    seg: k7Segments(c.clock), ring: ringDash(c.roomFrac, 34) };
}

/** QA #4: the ONE payout / funded date forecast both nq/ and nq/accounts show (business/payday.json, 1,000 replays, the Jul-Oct-like row).
 *  key = the account key (zlarior | fresh25 | atlas | rapid1 | a new one: matched by plan like card()), acct = {name, plan, stage}.
 *  -> { firstPay: 'YYYY-MM-DD' | null, firstPayText: 'Dec 17', toYou: $ to you at the first payout | null, funded: 'YYYY-MM-DD' | null,
 *       fundedText, like: '' | 'Rapid EOD 25K' (a new account read off a like one), note: 'estimate from 1,000 replays, not a promise' } | null */
export function payoutEta(key, acct, biz, payday) {
  const a = { key: String(key), name: (acct && acct.name) || '', plan: (acct && acct.plan) || '', stage: (acct && acct.stage) || '', mll: acct && acct.mll };
  const P = paydayRow(a, idsOf(a, biz), payday);
  if (!P) return null;
  return { firstPay: day(P.first_pay_med), firstPayText: monDay(P.first_pay_med), toYou: num(P.first_pay_usd), funded: day(P.funded_med), fundedText: monDay(P.funded_med),
    like: P.like || '', note: 'estimate from 1,000 replays, not a promise' };
}

/** the strip on top: today's $ over every account the PC reported, the room left in all, how many accounts are live */
export function totals(cards) {
  const live = arr(cards).filter((c) => isObj(c) && c.has);
  const t = live.map((c) => c.todayN).filter((v) => v !== null), r = live.map((c) => c.roomN).filter((v) => v !== null);
  const today = t.length ? t.reduce((a, b) => a + b, 0) : null, room = r.length ? r.reduce((a, b) => a + b, 0) : null;
  return { n: live.length, today, todayText: today === null ? '-' : money(today, true), todayLvl: today === null ? 'none' : today > 0 ? 'ok' : today < 0 ? 'bad' : 'none',
    room, roomText: room === null ? '-' : money(room), funded: live.filter((c) => c.stage === 'Funded').length };
}

// ------------------------------------------------------------------------------------------------ day-healthqa 2026-11-27: live, today, hands steps
const GLANCE_ID = { mffu50k_eval: 'lit', lit: 'lit', atlas: 'atlas', acct_b: 'atlas', rapid: 'rapid', b25k_2: 'b25k_2' };
/** the PC's glance row of an account (lite.pc.glance.bots[]: per account id: on, armed, wait, stage, pos when in a trade) */
function glanceOf(ids, lite) {
  const bots = arr(isObj(lite) && isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance.bots : null).filter(isObj);
  const want = ids.map((i) => GLANCE_ID[i] || i);
  return bots.find((b) => want.includes(String(b.id))) || null;
}
/** one account's "now": { state: 'in' | 'setup' | 'wait' | 'off' | 'none', icon, line, pos: {side, qty, entry, stop, target, risk, now, tgt, r} | null }
 *  in = the PC sent an open position (glance pos); setup = a setup is forming (a stage like "Displacement (4/10)" or "setup forming");
 *  wait = on and waiting; off = the bot is off for this account; none = the PC sent nothing for it. Never made up. */
export function liveOf(ids, lite) {
  const g = glanceOf(ids, lite);
  if (!g) return { state: 'none', icon: '', line: '', pos: null };
  const p = isObj(g.pos) ? g.pos : null;
  if (p && (num(p.qty) || p.side)) {
    const risk = num(p.risk_usd), now = num(p.now_usd);
    const pos = { side: String(p.side || '').toUpperCase(), qty: num(p.qty), entry: num(p.entry), stop: num(p.stop), target: num(p.target), risk, now,
      tgt: num(p.tgt_usd), r: risk && now !== null ? Math.round((now / risk) * 100) / 100 : null };
    return { state: 'in', icon: '\u{1F7E2}', line: `In a trade: ${pos.side} ${pos.qty ?? ''}`.trim(), pos };
  }
  const wait = String(g.wait || '').trim(), stage = String(g.stage || '').trim();
  if (g.on === false) return { state: 'off', icon: '⏸️', line: 'Bot off for this account', pos: null };
  if (stage || /setup forming|armed \((long|short)\)/i.test(wait)) {
    return { state: 'setup', icon: '\u{1F440}', line: (stage ? `Setup forming: ${stage}` : 'Setup forming') + (wait ? ` · ${wait}` : ''), pos: null };
  }
  return { state: 'wait', icon: '⏸️', line: wait ? `Waiting: ${wait}` : 'Waiting for a setup', pos: null };
}

/** the owner's hands steps that are open RIGHT NOW (only from the PC's own post):
 *   NinjaTrader 'Connect on startup' OFF = ck.nt[2] === 0 (engine/pc_checklist reads it from NinjaTrader's config.xml);
 *   the order-flow recorder needs one F5 = a self-heal Board event "still runs the old LE_TickRec" under 7 days old with no newer
 *   event saying NinjaTrader runs it (engine/ns_sync). -> [{ k, title, how }] (empty = nothing to do) */
export function handsSteps(lite, nowS) {
  const L = isObj(lite) ? lite : {}, out = [];
  const nt = isObj(L.ck) && Array.isArray(L.ck.nt) ? L.ck.nt : null;
  if (nt && nt[2] === 0) out.push({ k: 'nt_auto', title: "NinjaTrader: tick 'Connect on startup'", how: 'Connections > Configure > your MFFU connection > tick Connect on startup > OK (once). Without it a restart leaves NinjaTrader disconnected: no trades, no 7-day keep-alive fill.' });
  const ev = arr(isObj(L.brd) ? L.brd.ev : null).filter(Array.isArray), now = num(nowS) || 0;
  const tick = ev.filter((e) => /LE_TickRec/.test(String(e[3] || ''))).sort((a, b) => (+b[0] || 0) - (+a[0] || 0))[0];
  if (tick && /still runs the old LE_TickRec/.test(String(tick[3])) && (!now || now - (+tick[0] || 0) < 7 * 86400)) {
    out.push({ k: 'f5', title: 'NinjaTrader: press F5 once', how: 'New > NinjaScript Editor > F5, then close the editor, while every account is flat (it reloads the charts’ feed for a moment). Only the order-flow recorder needs it; LIT and ATLAS do not.' });
  }
  return out;
}
