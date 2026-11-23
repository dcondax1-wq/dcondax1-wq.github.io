// ACCOUNTS screen core (day-accounts 2026-11-23, owner: "ONE very clean way to see my accounts" + "no account ever forgets to trade in
// MFFU's 7 days"). Pure ES module: no DOM, no network, node-tested (tests/test_accounts_screen.py). The page (accounts.js) hands in:
//   accts  = nqdesk.accounts(home, biz, nowS)  (balance, room, today, to pass / payout, the PC's age; a new PC account shows by itself)
//   k7     = clock7.rows(lite, nowS)           (MFFU 7-day clock per PC account id: last fill, MFFU's last day, keep-alive on / off)
//   lite   = the PC's newest status post (pc_feed.js fetchLatest: "ar" on / armed per bot, mf rows with the last 4, k7 with the act day)
//   biz    = ../business/accounts.json (the owner's order, plan, stage, the PC ids of each account)
//   payday = ../business/payday.json (1,000-run estimates: funded day + first payout day per account kind)
// -> { pc: {ageS, text, level}, banner: {level, title, text} | null, cards: [card], counts }
// Never a broker id or name: only the last 4 digits (mf "l4"). Nothing here places, arms or changes anything.

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
    lastText: r.lf ? `Last trade ${nice(r.lf)}` : `No trade yet (counts from ${nice(addDays(base, 1))})`,
    leftText: left < 0 ? `${-left} day${left === -1 ? '' : 's'} PAST` : left === 0 ? 'LAST DAY TODAY' : `${left} day${left === 1 ? '' : 's'} left`,
    hardText: `MFFU's last day ${nice(r.hard)}`,
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
  let goal;
  if (funded) {
    const P = MFFU_PAY[size], b = num(a.balance), need = b === null ? null : Math.max(0, Math.ceil(P.at - b));
    goal = { label: 'To first payout', text: need === null ? '-' : need === 0 ? 'Payout ready' : `+${money(need)}`,
      sub: `ask the max ${money(P.ask)} at ${money(P.at)}`, frac: b === null ? null : Math.max(0, Math.min(1, b / P.at)) };
  } else {
    const tgt = size === '50K' ? 3000 : 1500, g = num(a.goal);
    goal = { label: 'To pass', text: g === null ? '-' : g <= 0 ? 'Target reached' : money(g), sub: `target +${money(tgt)}`,
      frac: g === null ? null : Math.max(0, Math.min(1, 1 - g / tgt)) };
  }
  const P = paydayRow(a, ids, payday);
  const eta = P ? (funded ? `1st payout ~${monDay(P.first_pay_med) || 'not in 6 months'} (~${money(P.first_pay_usd)} to you)`
    : `Funded ~${monDay(P.funded_med) || '?'} · 1st payout ~${monDay(P.first_pay_med) || 'not in 6 months'}`) + (P.like ? ` (like ${P.like})` : '') : '';
  return {
    key: String(a.key), name: safeName(PLAN_IDS[a.key] || !mf || !mf.nm ? a.name : mf.nm), plan: a.plan || '', stage: funded ? 'Funded' : 'Eval', l4, has: !!a.has, dot: a.dot, ageS,
    planned: a.dot === 'plan', fresh: a.dot === 'live',
    balance: a.has ? (funded ? `${money(a.balance, true)}` : money(a.balance)) : '-', balanceNote: funded && a.has ? 'MFFU shows funded as profit from $0' : '',
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
