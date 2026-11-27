// NQ DATA PORTS: the model (day-nqports 2026-11-27). Pure ES module (no DOM / fetch / storage): node-tested (tests/test_nq_ports.py).
// Input: nq/ports.json (tools/nq_ports.py) + the page's live state (the PC's chart bars since 18:00 ET, from nq.js window.NQ_HOME)
// + nq/news_week.json. Each card: plain words, $ where it fits, its own data age; never a trade signal, never a made-up number.
// API: vol(P, nowS), normal(P, bars, nowS), sweeps(P, bars, nowS), cot(P, nowS), clock(P, newsWeek, nowS), ageOf(dayIso, nowS)
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WDN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const usd = (v) => (num(v) === null ? '-' : (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'));
export const pts = (v) => (num(v) === null ? '-' : Math.round(Math.abs(v)).toLocaleString('en-US') + ' pts');
const n0 = (v) => (num(v) === null ? '-' : Math.round(v).toLocaleString('en-US'));
const px = (v) => (num(v) === null ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export function dayName(iso) { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || '')); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${WDN[d.getUTCDay()]} ${MON[+m[2] - 1]} ${+m[3]}`; }
function et(tS) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(tS * 1000)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, m: +p.hour * 60 + +p.minute, hm: `${p.hour}:${p.minute}` };
  } catch (_) { const d = new Date(tS * 1000); return { day: d.toISOString().slice(0, 10), m: d.getUTCHours() * 60 + d.getUTCMinutes(), hm: d.toISOString().slice(11, 16) }; }
}
const addDays = (iso, k) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
/** the CME trading day of a moment: after 18:00 ET it is tomorrow's; a weekend rolls to Monday */
export function tradeDay(tS) { const e = et(tS); let d = e.m >= 1080 ? addDays(e.day, 1) : e.day; const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 6) d = addDays(d, 2); if (wd === 0) d = addDays(d, 1); return d; }
/** the session before a CME day (skips the weekend) */
const prevDay = (iso) => { let d = addDays(iso, -1); const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 0) d = addDays(d, -2); if (wd === 6) d = addDays(d, -1); return d; };

/** a data stamp: 'Wed Nov 25 (2 days old)', level ok / warn / bad by the kind's normal lag */
export function ageOf(iso, nowS, warnDays = 3, badDays = 7) {
  if (!/^\d{4}-\d\d-\d\d/.test(String(iso || ''))) return { text: 'no date', lv: 'bad', days: null };
  const days = Math.max(0, Math.floor((Date.parse(et(nowS).day + 'T12:00:00Z') - Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z')) / 86400000));
  return { text: `${dayName(iso)}${days === 0 ? ' (today)' : days === 1 ? ' (yesterday)' : ` (${days} days old)`}`, lv: days > badDays ? 'bad' : days > warnDays ? 'warn' : 'ok', days };
}

// ------------------------------------------------------------------------------------------------ 1. volatility weather
export function vol(P, nowS) {
  const V = isObj(P) && isObj(P.vol) ? P.vol : null;
  if (!V || num(V.vix) === null) return { has: false, line: 'No volatility file in this build yet.' };
  const s = V.structure, word = s === 'backwardation' ? 'STRESS' : s === 'contango' ? 'CALM' : 'MIXED';
  const curve = s === 'backwardation' ? `Short-term fear is above long-term (VIX9D ${V.vix9d} > VIX ${V.vix} > VIX3M ${V.vix3m}): the market expects the next days to be rougher than the next months. Swings come bigger and faster.`
    : s === 'contango' ? `Normal curve (VIX9D ${V.vix9d} < VIX ${V.vix} < VIX3M ${V.vix3m}): no near-term panic priced in.`
      : `The curve is mixed (VIX9D ${V.vix9d} / VIX ${V.vix} / VIX3M ${V.vix3m}): no clear calm or stress.`;
  const g = num(V.gex), gp = num(V.gex_pct);
  const gamma = g === null ? '' : g <= 0 ? `Dealers are short gamma (${g.toFixed(2)}B): they chase moves, so moves can run further.`
    : gp !== null && gp <= 20 ? `Dealer gamma is low (${g.toFixed(2)}B, lower than ${100 - gp}% of the last year): little cushion against big moves.`
      : gp !== null && gp >= 80 ? `Dealer gamma is high (${g.toFixed(2)}B, top ${100 - gp}% of the year): dealers lean against moves, ranges tend to stay tighter.`
        : `Dealer gamma is middling (${g.toFixed(2)}B).`;
  const lit = num(V.move_pts) !== null ? `LIT's VIX band: ${String(V.band || '').toUpperCase()}. Its target is one VIX day move from the 18:00 open: about ${pts(V.move_pts)} today = about ${usd(V.move_usd_mnq)} per MNQ contract if it is hit.` : '';
  const vxn = num(V.vxn) !== null ? `NQ's own fear gauge (VXN) ${V.vxn}: a typical NQ day now ≈ ${pts(V.vxn_move)}.` : '';
  const vv = num(V.vvix) !== null ? `VVIX ${V.vvix}${num(V.vvix_pct) !== null ? ` (higher than ${V.vvix_pct}% of the year)` : ''}: how jumpy the VIX itself is.` : '';
  return { has: true, word, tone: s === 'backwardation' ? 'bad' : s === 'contango' ? 'ok' : 'warn', curve, gamma, lit, vxn, vv,
    nums: [['VIX9D', V.vix9d], ['VIX', V.vix], ['VIX3M', V.vix3m]], age: ageOf(V.date, nowS, 4, 8), hist: arr(V.vix_hist).filter((r) => Array.isArray(r) && r.length >= 4) };
}

// ------------------------------------------------------------------------------------------------ today's bars (the PC's chart, since 18:00 ET)
function today(bars, nowS) {
  const B = arr(bars).filter((b) => Array.isArray(b) && num(b[0]) !== null && num(b[2]) !== null && num(b[3]) !== null);
  if (!B.length) return null;
  const lastT = num(B[B.length - 1][0]);
  if (num(nowS) !== null && nowS - lastT > 3 * 3600) return null;              // the chart post is old: no live "today"
  const day = tradeDay(lastT), S = { day, lastT, hi: -Infinity, lo: Infinity, hiM: null, loM: null, aHi: null, aLo: null, pHi: null, pLo: null, onHi: null, onLo: null, last: num(B[B.length - 1][4]) };
  for (const b of B) {
    if (tradeDay(b[0]) !== day) continue;
    const m = et(b[0]).m, h = +b[2], l = +b[3];
    if (h > S.hi) { S.hi = h; S.hiM = m; } if (l < S.lo) { S.lo = l; S.loM = m; }
    if (m >= 1080 || m < 120) { S.aHi = S.aHi === null ? h : Math.max(S.aHi, h); S.aLo = S.aLo === null ? l : Math.min(S.aLo, l); }
    else { S.pHi = S.pHi === null ? h : Math.max(S.pHi, h); S.pLo = S.pLo === null ? l : Math.min(S.pLo, l); }
    if (m >= 1080 || m < 570) { S.onHi = S.onHi === null ? h : Math.max(S.onHi, h); S.onLo = S.onLo === null ? l : Math.min(S.onLo, l); }
  }
  if (S.hiM === null) return null;
  S.nowM = et(lastT).m; S.asiaDone = !(S.nowM >= 1080 || S.nowM < 120); S.onDone = !(S.nowM >= 1080 || S.nowM < 570);
  return S;
}
const WIN = (m) => (m >= 1080 || m < 120 ? 'asia' : m < 480 ? 'london' : m < 660 ? 'nyopen' : m < 840 ? 'midday' : 'late');
const plain = (l) => String(l || '').replace(/ \((.*)\)$/, ' $1');
const hmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ------------------------------------------------------------------------------------------------ 2. today vs normal
export function normal(P, bars, nowS) {
  const N = isObj(P) && isObj(P.normal) ? P.normal : null;
  if (!N || num(N.day) === null) return { has: false, line: 'No session statistics in this build yet.' };
  const T = today(bars, nowS), rows = [];
  if (T) {
    const rng = T.hi - T.lo, f = rng / N.day;
    rows.push({ k: 'Range so far', v: pts(rng), sub: `${Math.round(f * 100)}% of a normal day (${pts(N.day)})`, lv: f >= 1 ? 'warn' : 'ok' });
    if (T.aHi !== null) { const a = T.aHi - T.aLo; rows.push({ k: T.asiaDone ? 'Asia range' : 'Asia so far', v: pts(a), sub: `normal ${pts(N.asia)}${T.asiaDone ? (a > N.asia * 1.3 ? ': wide, London may run out of room' : a < N.asia * 0.7 ? ': tight, a break is likelier' : '') : ''}`, lv: a > N.asia * 1.3 ? 'warn' : 'ok' }); }
    if (T.onHi !== null) { const o = T.onHi - T.onLo; rows.push({ k: T.onDone ? 'Overnight range' : 'Overnight so far', v: pts(o), sub: `normal ${pts(N.overnight)} (18:00-09:30)`, lv: o > N.overnight * 1.3 ? 'warn' : 'ok' }); }
  }
  const hiW = arr(N.high_at), loW = arr(N.low_at), top = (L) => L.slice().sort((a, b) => b.pct - a.pct)[0];
  const th = top(hiW), tl = top(loW);
  const where = T ? `Today's high so far ${hmOf(T.hiM)} ET (${plain((hiW.find((w) => w.id === WIN(T.hiM)) || {}).label)}), low ${hmOf(T.loM)} ET.` : '';
  const base = th && tl ? `Last ${N.n_at} sessions: the high came most often in ${plain(th.label)} (${th.pct}%), the low in ${plain(tl.label)} (${tl.pct}%).` : '';
  const E = isObj(N.esnq) ? N.esnq : null;
  const esnq = E && num(E.nq_1d) !== null ? `${dayName(E.day)}: NQ ${E.nq_1d > 0 ? '+' : ''}${E.nq_1d}% vs ES ${E.es_1d > 0 ? '+' : ''}${E.es_1d}%; 5 days NQ ${E.nq_5d > 0 ? '+' : ''}${E.nq_5d}% vs ES ${E.es_5d > 0 ? '+' : ''}${E.es_5d}%: ${Math.abs(E.nq_5d - E.es_5d) < 0.5 ? 'moving together' : E.nq_5d < E.es_5d ? 'tech is weaker than the broad market' : 'tech is leading the broad market'}.` : '';
  return { has: true, live: !!T, rows, where, base, esnq, hiW, loW, nowWin: T ? WIN(T.nowM) : null,
    line: T ? '' : "No live bars from the PC's chart right now: the normal sizes below, today's numbers when the chart is live.",
    age: ageOf(N.date, nowS, 4, 8), liveAge: T ? `live: last bar ${hmOf(T.nowM)} ET` : '' };
}

// ------------------------------------------------------------------------------------------------ 3. sweep odds (the levels LIT trades)
export function sweeps(P, bars, nowS) {
  const W = isObj(P) && isObj(P.sweeps) ? P.sweeps : null;
  if (!W || !isObj(W.all)) return { has: false, line: 'No sweep statistics in this build yet.' };
  const T = today(bars, nowS), L = isObj(W.levels) ? W.levels : null;
  const ok = T && L && prevDay(T.day) === L.day;                // the file's last session is today's prior day: its levels are today's PDH / PDL
  const st = (taken, lvl, dir) => (!ok ? '' : taken ? 'taken today' : T.last === null ? 'not yet' : `not yet (${pts(dir > 0 ? lvl - T.last : T.last - lvl)} away)`);
  const rows = [
    { k: "Prior day's high taken", all: W.all.pdh, recent: W.recent.pdh, now: ok ? st(T.hi > L.pdh, L.pdh, 1) : '', lvl: L ? px(L.pdh) : '' },
    { k: "Prior day's low taken", all: W.all.pdl, recent: W.recent.pdl, now: ok ? st(T.lo < L.pdl, L.pdl, -1) : '', lvl: L ? px(L.pdl) : '' },
    { k: 'Asia high taken after 02:00', all: W.all.asia_hi, recent: W.recent.asia_hi, now: T && T.asiaDone && T.aHi !== null ? (T.pHi !== null && T.pHi > T.aHi ? 'taken today' : `not yet (${pts(T.aHi - T.last)} away)`) : '', lvl: T && T.asiaDone && T.aHi !== null ? px(T.aHi) : '' },
    { k: 'Asia low taken after 02:00', all: W.all.asia_lo, recent: W.recent.asia_lo, now: T && T.asiaDone && T.aLo !== null ? (T.pLo !== null && T.pLo < T.aLo ? 'taken today' : `not yet (${pts(T.last - T.aLo)} away)`) : '', lvl: T && T.asiaDone && T.aLo !== null ? px(T.aLo) : '' },
  ];
  return { has: true, rows, both: W.all.both, neither: W.all.neither, n: W.all.n, nRecent: W.recent.n, since: W.since,
    note: `Out of ${n0(W.all.n)} sessions since ${dayName(W.since)}: ${W.all.both}% took both of the prior day's high and low, ${W.all.neither}% took neither. These are base rates, not a forecast.`,
    age: ageOf(W.date, nowS, 4, 8), live: !!ok };
}

// ------------------------------------------------------------------------------------------------ 4. who is positioned how (CFTC)
export function cot(P, nowS) {
  const C = isObj(P) && isObj(P.cot) ? P.cot : null;
  if (!C || !isObj(C.lev)) return { has: false, line: "No CFTC positioning in this build yet (the weekly report could not be fetched and there is no saved copy)." };
  const side = (n) => (n >= 0 ? 'net long' : 'net short');
  const row = (g) => ({ name: g.name, net: g.net, chg: g.chg, pct: g.pct, line: `${side(g.net)} ${n0(Math.abs(g.net))} contracts (${g.chg >= 0 ? 'bought' : 'sold'} ${n0(Math.abs(g.chg))} that week)`, frac: g.max === g.min ? 0.5 : (g.net - g.min) / (g.max - g.min) });
  const lev = row(C.lev), rows = [lev, row(C.am), row(C.dl)];
  const L = C.lev, rel = L.pct === null ? '' : ` That is more bullish than ${L.pct}% of the last ${C.weeks} weeks.`;
  const read = `Hedge funds are ${side(L.net)} ${n0(Math.abs(L.net))} contracts.${rel}`
    + (L.pct !== null && L.pct >= 85 && L.net > 0 ? ' Crowded longs can unwind fast on bad news.'
      : L.pct !== null && L.pct <= 15 && L.net < 0 ? ' Crowded shorts: covering can fuel sharp rallies.'
        : L.pct !== null && L.pct >= 85 && L.net < 0 ? ' They have covered most of their usual short: less fuel left for a squeeze up.'
          : L.pct !== null && L.pct <= 15 && L.net > 0 ? ' They have sold most of their usual long: less fuel left for a flush down.' : '');
  return { has: true, rows, read, oi: C.oi, spark: arr(C.lev_spark), src: C.src,
    note: 'NASDAQ MINI (CME), CFTC Traders in Financial Futures: positions as of Tuesday, published Friday. A slow backdrop for the week, never an entry signal.',
    age: ageOf(C.date, nowS, 10, 17) };
}

// ------------------------------------------------------------------------------------------------ 5. what is coming (countdowns)
function inWords(s) {
  if (s < 60) return 'now';
  const m = Math.round(s / 60), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `in ${d} d ${h} h` : h ? `in ${h} h ${mm} min` : `in ${mm} min`;
}
function etEpoch(day, hm) {                     // ET wall clock -> epoch (DST-safe: the offset of that very moment)
  const [h, m] = String(hm || '00:00').split(':').map(Number), guess = Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) / 1000;
  const e = et(guess), off = ((e.m - (h * 60 + m)) + (e.day < day ? -1440 : e.day > day ? 1440 : 0)) * 60;
  return guess - off;
}
export function clock(P, newsWeek, nowS) {
  const C = isObj(P) && isObj(P.cal) ? P.cal : null, ev = [];
  for (const e of arr(C && C.events)) if (isObj(e) && /^\d{4}-\d\d-\d\d$/.test(String(e.day))) ev.push({ day: e.day, t: e.t || '', kind: String(e.kind || ''), what: String(e.what || '') });
  for (const e of arr(isObj(newsWeek) ? newsWeek.events : null)) {
    if (!isObj(e) || !/high/i.test(String(e.impact || '')) || !/^\d{4}-\d\d-\d\d$/.test(String(e.date))) continue;
    if (ev.some((x) => x.kind === 'news' && x.day === e.date && x.t === e.time)) continue;
    ev.push({ day: e.date, t: String(e.time || ''), kind: 'news', what: `${e.title} ${e.time} ET: LIT flat by 5 min before; Rapid lanes pause 2 min either side` });
  }
  const list = ev.map((e) => ({ ...e, at: etEpoch(e.day, e.kind === 'closed' ? '00:00' : e.t || '00:00') }))
    .filter((e) => (e.kind === 'closed' || e.kind === 'half' ? e.day >= et(nowS).day : e.at > nowS - 300))
    .sort((a, b) => a.at - b.at).slice(0, 6)
    .map((e) => ({ ...e, when: e.day === et(nowS).day ? (e.kind === 'closed' ? 'today' : e.at <= nowS ? 'today, passed' : `today ${inWords(e.at - nowS)}`) : `${dayName(e.day)} · ${inWords(e.at - nowS)}`,
      icon: e.kind === 'news' ? '!' : e.kind === 'roll' ? '↻' : e.kind === 'half' ? '½' : '×' }));
  return { has: list.length > 0, list, line: list.length ? '' : 'Nothing flagged in the next 45 days.', age: C ? ageOf(C.from, nowS, 6, 13) : { text: 'no calendar', lv: 'bad', days: null } };
}
