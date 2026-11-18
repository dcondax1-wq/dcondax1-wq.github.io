// HESTIA core (ES module, no DOM, no network): "what should I do right now?" for the three accounts. Pure, so the tests call it in node.
// Inputs are published files only: home.json (accounts, live), odeon/trades.json (the bot's trades) and fixture.json (DEMO). Dates are New York time (the market's clock).
// Money words: drawdown is always "Drawdown left $X of $max loss"; every dollar result carries its R (1R = the account's average losing trade, so the R is marked ~ when it is an estimate).

export const PLANS = {
  zlarior: { key: 'zlarior', name: 'Zlarior', bot: 'LIT', size: '50K', label: 'MFFU Builder 50K', mll: 2000, target: 3000, risk: 425 },
  atlas: { key: 'atlas', name: 'ATLAS', bot: 'ATLAS', size: '25K', label: 'MFFU Builder 25K', mll: 1000, target: 1500, risk: 150 },
  blitz: { key: 'blitz', name: 'BLITZ', bot: 'BLITZ', size: '25K', label: 'MFFU Builder 25K', mll: 1000, target: 1500, risk: 120 },
};
export const ORDER = ['zlarior', 'atlas', 'blitz'];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);

export function money(x) {
  const v = num(x); if (v == null) return '$0';
  const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US');
}
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
/** R next to a dollar result. est = the risk is a stand-in (an average loss or a plan default), shown with a ~. */
export function rText(usd, risk, est) {
  const u = num(usd), k = num(risk);
  if (u == null || !k) return '0.0R';
  const r = Math.round((u / k) * 10) / 10, s = (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R';
  return (est ? '~' : '') + s;
}
export const both = (usd, risk, est) => `${moneyS(usd)} (${rText(usd, risk, est)})`;
export function drawdownLine(room, mll) { return `Drawdown left ${money(room)} of ${money(mll)} max loss`; }

// ------------------------------------------------------------------------------------------------ accounts
export function matchKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}

/** one account card from a home.json account (or null -> a "no data yet" card). */
export function accountView(key, a) {
  const P = PLANS[key], base = { key, name: P.name, size: P.size, label: P.label, bot: P.bot, mll: P.mll, target: P.target, has: false, kind: 'eval', room: null, floor: null, balance: null,
    today: 0, week: 0, progress: 0, toTarget: null, dllUsed: 0, dll: key === 'zlarior' ? 1000 : 600, status: '', risk: P.risk, est: true, connected: null, position: null, stage: 'eval', paused: false };
  if (!isObj(a)) return base;
  const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, st = isObj(a.stats) ? a.stats : {}, conn = isObj(a.conn) ? a.conn : {};
  const loss = num(st.avg_loss), funded = String(a.kind || '').toLowerCase() === 'funded';
  const mll = num(ev.mll) || P.mll, room = num(ev.room);
  return { ...base, has: true, kind: funded ? 'funded' : 'eval', stage: funded ? 'funded' : 'eval', mll, room: room == null ? null : Math.max(0, room), floor: num(ev.floor), balance: num(ev.balance),
    today: num(pnl.today) != null ? num(pnl.today) : num(ev.today) || 0, week: num(pnl.week) || 0, progress: Math.max(0, Math.min(1, num(ev.progress) || 0)), toTarget: num(ev.to_target),
    target: num(ev.target) || (num(ev.target_balance) != null && num(ev.start_balance) != null ? num(ev.target_balance) - num(ev.start_balance) : P.target),
    dllUsed: num(ev.dll_used) || 0, dll: num(ev.dll) || base.dll, status: str(ev.clock_text || ev.status, 140), risk: loss ? Math.abs(loss) : P.risk, est: !loss,
    connected: typeof conn.connected === 'boolean' ? conn.connected : null, position: isObj(a.position) ? a.position : null, paused: !!a.paused, session: num(ev.session), sessions: num(ev.sessions) || 10 };
}

/** the three cards, in order. Real accounts first; demo = true when none of the three was found (the fixture's numbers are used, labelled). */
// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the real home.json says "hidden_bots" (top or
// board); a hidden BLITZ has no card (the DEMO keeps its three)
const hiddenIn = (h, k) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : [];
  return L.map(String).includes(k); };
export function buildAccounts(home, fixture) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [];
  const found = {};
  for (const a of list) { const k = matchKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const real = Object.keys(found).length > 0;
  const fx = isObj(fixture) && Array.isArray(fixture.accounts) ? fixture.accounts : [];
  return { demo: !real, accounts: ORDER.filter((k) => !(real && k === 'blitz' && hiddenIn(home, 'blitz'))).map((k) => {
    if (real) return accountView(k, found[k]);
    const f = fx.find((x) => x.key === k); return f ? { ...accountView(k, null), ...f, has: true, demo: true } : accountView(k, null);
  }) };
}

export function totals(accts) {
  const have = accts.filter((a) => a.has);
  return { today: r2(have.reduce((s, a) => s + a.today, 0)), week: r2(have.reduce((s, a) => s + a.week, 0)), n: have.length,
    worst: have.filter((a) => a.room != null).sort((x, y) => x.room / x.mll - y.room / y.mll)[0] || null };
}

/** danger level of one account: bad under 25% of the max loss left, warn under 50%, daily loss at 80%. */
export function health(a) {
  if (!a.has) return { level: 'off', text: 'No numbers yet' };
  if (a.room == null) return { level: 'off', text: a.stage === 'funded' ? 'Funded: payout rules apply' : 'Waiting for the bot' };
  const f = a.room / a.mll;
  if (a.toTarget === 0 || a.progress >= 1) return { level: 'ok', text: 'Target reached' };
  if (f < 0.25) return { level: 'bad', text: 'Close to the limit' };
  if (a.dll && a.dllUsed / a.dll >= 0.8) return { level: 'warn', text: 'Daily loss nearly used' };
  if (f < 0.5) return { level: 'warn', text: 'Half the room used' };
  return { level: 'ok', text: 'Safe distance' };
}

// ------------------------------------------------------------------------------------------------ the clock (New York) and the windows
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function etParts(date) {
  const o = {}; for (const p of fmt.formatToParts(date)) o[p.type] = p.value;
  const h = parseInt(o.hour, 10) % 24, m = parseInt(o.minute, 10);
  return { wd: WD[o.weekday], h, m, mod: h * 60 + m, ymd: `${o.year}-${o.month}-${o.day}`, hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

export const PHASES = {
  closed: { label: 'Market closed', entries: false, tone: 'off' },
  break: { label: 'Daily break', entries: false, tone: 'off' },
  overnight: { label: 'Overnight, bot waits for 02:00', entries: false, tone: 'info' },
  london: { label: 'London morning', entries: true, tone: 'ok' },
  ny: { label: 'New York day', entries: true, tone: 'ok' },
  winddown: { label: 'Last call passed', entries: false, tone: 'warn' },
  flat: { label: 'Time to be flat', entries: false, tone: 'warn' },
};
/** which phase is it at this moment (ET)? Weekend: Fri 16:10 -> Sun 18:00. */
export function phaseAt(wd, mod) {
  if (wd === 6 || (wd === 0 && mod < 1080) || (wd === 5 && mod >= 970)) return 'closed';
  if (mod >= 970 && mod < 1080) return 'break';
  if (mod >= 1080 || mod < 120) return 'overnight';
  if (mod < 480) return 'london';
  if (mod < 930) return 'ny';
  if (mod < 955) return 'winddown';
  return 'flat';
}
export function sessionState(date) {
  const e = etParts(date), id = phaseAt(e.wd, e.mod), P = PHASES[id];
  let next = null, mins = null;
  const t0 = Math.floor(date.getTime() / 300000) * 300000;          // every boundary is a multiple of 5 minutes
  for (let i = 1; i <= 8 * 24 * 12; i++) {
    const t = t0 + i * 300000, q = etParts(new Date(t)), pid = phaseAt(q.wd, q.mod);
    if (pid !== id) { next = pid; mins = Math.max(1, Math.ceil((t - date.getTime()) / 60000)); break; }
  }
  return { id, label: P.label, entries: P.entries, tone: P.tone, et: e, next, nextLabel: next ? PHASES[next].label : '', mins };
}
export function duration(mins) {
  if (mins == null) return '';
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'} ${h} h`;
  return h ? `${h} h ${m} min` : `${m} min`;
}
/** the six marks of the trading day, in minutes since midnight ET, for the timeline */
export const MARKS = [[120, '02:00', 'London opens'], [480, '08:00', 'New York'], [930, '15:30', 'Last entry']];

/** what the bot does next, in words */
export function botNext(sess, position, live) {
  if (position) return 'A trade is open. The stop and the target are placed; the bot manages it. Nothing for you to do.';
  const say = isObj(live) ? str(live.model_state, 140) : '';
  const base = {
    closed: 'The market is closed. The bot sleeps and wakes when the market opens.',
    break: 'Daily break. The bot waits for the market to reopen at 18:00 ET.',
    overnight: 'The bot sleeps until 02:00 ET, then starts watching the key levels.',
    london: 'The bot watches for price to run past a key high or low and snap back. If it sees that, it enters by itself with the stop and target set.',
    ny: 'The bot keeps watching until 15:30 ET. Most trades come early (02:00 to 08:00 ET), so the afternoon is usually quiet.',
    winddown: 'No new trades after 15:30 ET. Anything still open is closed at 15:55.',
    flat: 'Everything should be flat now. MFFU needs the accounts flat by 16:10 ET.',
  }[sess.id];
  return say && /\w/.test(say) && sess.entries ? `${base} Right now: ${say}` : base;
}

// ------------------------------------------------------------------------------------------------ the answer
/** advice(m) -> { level: ok | warn | bad | info, title, why, doNow }. m = { sess, accounts[], position, connected, ageMin }. The first rule that fires wins. */
export function advice(m) {
  const A = (m.accounts || []).filter((a) => a.has), sess = m.sess;
  const crit = A.filter((a) => a.room != null && a.room / a.mll < 0.25);
  const done = A.filter((a) => a.stage === 'eval' && (a.progress >= 1 || a.toTarget === 0));
  if (m.connected === false || (m.ageMin != null && m.ageMin > 30)) {
    return { level: 'warn', title: 'Check the PC', why: `The bot has not reported for ${m.ageMin != null ? Math.round(m.ageMin) + ' minutes' : 'a while'}. It may be off or offline. Orders already placed stay protected by their stops.`, doNow: 'Open the PC, look at STATUS.bat, and tell me if it is red.' };
  }
  if (crit.length) {
    const a = crit[0];
    return { level: 'bad', title: `Hands off ${a.name}`, why: `${drawdownLine(a.room, a.mll)}. One more bad trade could end this account. Do not add size or take a manual trade.`, doNow: 'Let the bot run its plan, or pause it if you are unsure.' };
  }
  if (done.length) {
    const a = done[0];
    return { level: 'ok', title: `${a.name} hit its target`, why: `${a.name} reached the profit target. Stop trading it and follow MFFU's pass steps.`, doNow: 'Pause that bot and open the account page on MFFU.' };
  }
  const dl = A.filter((a) => a.dll && a.dllUsed / a.dll >= 0.8);
  if (dl.length) return { level: 'warn', title: `${dl[0].name}: daily loss nearly used`, why: `${moneyS(-dl[0].dllUsed)} today of a ${money(dl[0].dll)} daily limit. The account pauses itself at the limit.`, doNow: 'No manual trades today. Resume tomorrow.' };
  if (m.position) return { level: 'info', title: 'A trade is open', why: 'The stop and the target are set. Moving them by hand has cost money before.', doNow: 'Leave it alone.' };
  if (sess.id === 'closed' || sess.id === 'break') return { level: 'info', title: 'Nothing to do', why: `${sess.label}. ${sess.nextLabel ? 'Next: ' + sess.nextLabel + ' in ' + duration(sess.mins) + '.' : ''}`, doNow: 'Rest. Check back later.' };
  if (sess.id === 'overnight') return { level: 'info', title: 'Sleep. The bot starts at 02:00', why: `The bot starts watching in ${duration(Math.max(0, (sess.et.mod < 120 ? 120 : 1560) - sess.et.mod))}. No account is in danger.`, doNow: 'Nothing. Check the first thing after your coffee.' };
  if (sess.id === 'winddown' || sess.id === 'flat') return { level: 'warn', title: 'Check that you are flat', why: 'No new entries now; the bot closes everything at 15:55 and MFFU needs flat by 16:10.', doNow: 'Look once: no open trade? Then you are done for the day.' };
  return { level: 'ok', title: 'Leave the bot alone', why: `The bot is watching and ${A.length ? 'every account is at a safe distance' : 'waiting for numbers'}. Entries stop at 15:30 ET.`, doNow: 'Nothing. Touching it by hand has cost money before.' };
}

// ------------------------------------------------------------------------------------------------ the bot's trades (odeon/trades.json)
export function normTrades(odeon) {
  const list = isObj(odeon) && Array.isArray(odeon.trades) ? odeon.trades : [];
  const out = [];
  for (const t of list) {
    if (!isObj(t) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.day || ''))) continue;
    const usd = num(t.usd); if (usd == null) continue;
    out.push({ id: str(t.id, 80), day: t.day, side: str(t.side, 8).toUpperCase(), qty: num(t.qty), usd: r2(usd), r: num(t.r), risk: num(t.risk_usd), t: num(t.entry && t.entry.t), exit: str(t.exit && t.exit.kind, 12), bot: str(t.bot || t.strat, 12) });
  }
  return out.sort((a, b) => (b.t || 0) - (a.t || 0));
}
/** today's trades; when there are none today, the most recent trading day (labelled as such) */
export function tradesFor(trades, ymd) {
  const today = trades.filter((t) => t.day === ymd);
  if (today.length) return { day: ymd, label: 'Today', list: today };
  const last = trades.length ? trades[0].day : null;
  return { day: last, label: last ? 'Last trading day' : 'No trades yet', list: last ? trades.filter((t) => t.day === last) : [] };
}
export function rOfTrade(t) { return t.r != null ? `${t.r > 0 ? '+' : t.r < 0 ? '-' : ''}${Math.abs(t.r).toFixed(1)}R` : rText(t.usd, t.risk || 425, true); }

// ------------------------------------------------------------------------------------------------ the Jarvis card
export function jarvisCard(accts, a, sess, nowSec) {
  const tt = totals(accts), w = tt.worst;
  return { v: 1, name: 'Hestia', status: { level: a.level === 'info' ? 'ok' : a.level, label: str(a.title, 48) }, kpis: [{ label: 'Today', value: moneyS(tt.today) }, { label: 'Closest to limit', value: w ? `${w.name} ${money(w.room)}` : 'n/a' }, { label: 'Market', value: sess.label.slice(0, 24) }],
    lines: [str(a.why, 118)], t: Math.floor(nowSec), theme: '#14110e' };
}

/** the fixture's trades are stored as day offsets from today (0 = today); this makes real dates (UTC date maths on the Y-M-D, no time zone involved) */
export function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function demoTrades(fixture, ymd) {
  const list = isObj(fixture) && Array.isArray(fixture.trades) ? fixture.trades : [];
  return normTrades({ trades: list.map((t, i) => ({ ...t, day: addDays(ymd, -Math.abs(t.off || 0)), id: 'demo.' + (i + 1), entry: { t: t.t || 1793000000 - i * 3600 } })) });
}
