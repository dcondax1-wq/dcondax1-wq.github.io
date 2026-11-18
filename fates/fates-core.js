// FATES core (no DOM, no WebGL): the data model of the page. fates.js draws it; tests import it in the browser.
//   data   = fates.json (tools/fates/build.py, schema in tools/fates/export.py), or fixture.json for the demo
//   route  = { scen: 'zlarior' | 'atlas' | 'money', period: '2026' | 'H2' | '2021-25', accts: 1..6, span: '6m' | '12m' }
//   nextSessions(data, s)            "your next 10 sessions": pass / fail / open by each session, the open futures' $ range
//   liveBot(live, bot, rules)        today's eval state from live.json (the PC's heartbeat publish)
//   liveOdds(s, state)               the odds re-weighted to that state (the threads nearest it)

export const BOTS = { zlarior: 'Zlarior', atlas: 'ATLAS' };
export const PERIODS = ['2026', 'H2', '2021-25'];
const PERIOD_OF = { '2026': '2026', h2: 'H2', '2021-25': '2021-25' };     // the #route is lower case
export const OUTCOME = {
  p: { key: 'pass', label: 'PASSED', color: 'gold' },
  f: { key: 'fail', label: 'FAILED at the floor', color: 'red' },
  s: { key: 'stuck', label: 'STUCK: too little room, the bot stops', color: 'red' },
  c: { key: 'closed', label: 'CLOSED: 7 days without a trade', color: 'red' },
  o: { key: 'open', label: 'Still open', color: 'violet' },
};
export const EV = { BUY: 0, PASS: 1, DEAD: 2, LOST: 3, PAY: 4, GRAD: 5 };
export const EV_TEXT = ['bought a new eval', 'eval PASSED', 'eval lost', 'funded account lost', 'payout', '5th payout: account done'];

// ------------------------------------------------------------------------------------------------ routes
export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#/, '').toLowerCase();
  const [a = '', b = ''] = h.split('/');
  const m = /^money(?:-(\d))?$/.exec(a);
  const r = { scen: 'zlarior', period: '2026', accts: 2, span: '12m' };
  if (a === 'zlarior' || a === 'atlas') r.scen = a;
  else if (m) { r.scen = 'money'; if (m[1]) r.accts = Math.min(6, Math.max(1, +m[1])); }
  if (PERIOD_OF[b]) r.period = PERIOD_OF[b];
  return r;
}
export function routeHash(r) {
  return '#' + (r.scen === 'money' ? `money-${r.accts}` : r.scen) + '/' + r.period;
}
export function scenKey(r) {
  return r.scen === 'money' ? `money:${r.period}` : `eval:${r.scen}:${r.period}`;
}

// ------------------------------------------------------------------------------------------------ formats
export const fmtPct = (x) => (x == null || !Number.isFinite(+x) ? '—' : `${Math.round(+x)}%`);
export function fmtUsd(x, sign = false) {
  if (x == null || !Number.isFinite(+x)) return '—';
  const v = Math.round(+x), s = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${s}$${Math.abs(v).toLocaleString('en-US')}`;
}
export function fmtK(x) {
  if (x == null || !Number.isFinite(+x)) return '—';
  const v = +x, a = Math.abs(v), s = v < 0 ? '−' : '';
  return a >= 10000 ? `${s}$${(a / 1000).toFixed(0)}K` : a >= 1000 ? `${s}$${(a / 1000).toFixed(1)}K` : `${s}$${Math.round(a)}`;
}
export const fmtDays = (x) => (x == null || !Number.isFinite(+x) ? '—' : `${Math.round(+x)} ${Math.round(+x) === 1 ? 'day' : 'days'}`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function fmtDate(iso) {
  const d = new Date(String(iso) + 'T12:00:00Z');
  return Number.isNaN(+d) ? String(iso) : `${WD[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ------------------------------------------------------------------------------------------------ the HUD
// Every number on the HUD comes straight from the scenario's summary (the build computes them; the page only formats).
export function hud(data, r) {
  const s = data && data.scenarios && data.scenarios[scenKey(r)];
  if (!s) return null;
  const per = (data.periods && data.periods[r.period]) || {};
  const weak = r.period === '2021-25';
  if (s.kind === 'eval') {
    const m = s.summary, mm = (m.money && m.money[r.span]) || {}, st = s.start || {};
    return {
      mode: 'eval', title: `${s.name} · ${s.rules.name}`,
      tiles: [
        { id: 'pass', label: 'Pass', value: fmtPct(m.pass), sub: `${fmtPct(m.p10)} in 10 days`, tone: 'gold' },
        { id: 'fail', label: 'Fail', value: fmtPct(m.fail), sub: `${fmtPct(m.f10)} in 10 days`, tone: 'red' },
        { id: 'days', label: 'Days to pass', value: m.pass_med == null ? '—' : String(Math.round(m.pass_med)), sub: 'median, trading' },
        { id: 'money', label: `$ a month · ${r.span === '6m' ? '6' : '12'} mo`, value: `${fmtUsd(mm.pm_p50)}`,
          sub: `p10 ${fmtUsd(mm.pm_p10)} · p90 ${fmtUsd(mm.pm_p90)}`, p10: mm.pm_p10, p50: mm.pm_p50, p90: mm.pm_p90 },
        { id: 'pay30', label: 'Payout ≤ 30 days', value: fmtPct(m.money && m.money.pay30), sub: 'calendar days' },
      ],
      caption: `From today: session ${st.session + 1} · ${fmtUsd(st.to_target)} to go · room ${fmtUsd(st.room)} · ` +
        `${Number(data.paths).toLocaleString('en-US')} futures`,
      note: m.no_keepalive && m.no_keepalive.closed > 0 ?
        `Assumes your 1-MNQ keep-alive on quiet day 6; without it ${fmtPct(m.no_keepalive.closed)} close (7 quiet days).` : '',
      period: per.label || r.period, weak,
    };
  }
  const b = s.books && s.books[String(r.accts)];
  if (!b) return null;
  const mm = b[r.span] || {};
  return {
    mode: 'money', title: `${r.accts} account${r.accts > 1 ? 's' : ''} · eval → funded → payouts`,
    tiles: [
      { id: 'pass', label: 'Ahead · 12 mo', value: fmtPct(b.ahead), sub: `${fmtPct(b.goal_pct)} reach ${fmtK(b.goal)}`, tone: 'gold' },
      { id: 'fail', label: 'Behind · 12 mo', value: fmtPct(b.behind), sub: 'fees > payouts', tone: 'red' },
      { id: 'days', label: 'To 1st payout', value: b.first_pay_med == null ? '—' : String(Math.round(b.first_pay_med)), sub: 'median, trading' },
      { id: 'money', label: `$ a month · ${r.span === '6m' ? '6' : '12'} mo`, value: `${fmtUsd(mm.pm_p50)}`,
        sub: `p10 ${fmtUsd(mm.pm_p10)} · p90 ${fmtUsd(mm.pm_p90)}`, p10: mm.pm_p10, p50: mm.pm_p50, p90: mm.pm_p90 },
      { id: 'pay30', label: 'Payout ≤ 30 days', value: fmtPct(b.pay30), sub: 'any account' },
    ],
    caption: (s.slots || []).slice(0, r.accts).map((x) => x.label).join(' + '),
    note: 'Net of every eval bought; 80% of each payout to you; today\'s two evals already paid.',
    period: per.label || r.period, weak,
  };
}

// ------------------------------------------------------------------------------------------------ eval threads
// The trailing floor after each session, replayed from the balances (tools/fates/export.floors, same rule).
export function floorsOf(hist, start, rules) {
  let peak = +start.peak, floor = start.floor == null ? -rules.mll : +start.floor;
  return hist.map((b) => {
    if (b > floor + 1e-9) { peak = Math.max(peak, b); floor = Math.min(Math.max(floor, peak - rules.mll), rules.lock); }
    return floor;
  });
}
// progress: 0 = the floor (abyss), 1 = the target (golden gate)
export function evalThreads(s) {
  const t = s.threads || { o: '', b: [] }, st = s.start, R = s.rules;
  const f0 = st.floor == null ? -R.mll : +st.floor;
  const p0 = (st.profit - f0) / (R.target - f0);
  return t.b.map((hist, i) => {
    const fl = floorsOf(hist, st, R);
    const prog = [p0].concat(hist.map((b, k) => Math.max(0, (b - fl[k]) / Math.max(1e-9, R.target - fl[k]))));
    const o = t.o[i] || 'o';
    return { id: i, o, color: OUTCOME[o].color, hist, floors: fl, pts: prog.map((y, k) => [k, y]), end: hist.length };
  });
}

// ------------------------------------------------------------------------------------------------ money threads
// One thread = the book's $ to the owner (net of evals), a step at each money event of its first `accts` slots.
export function moneyEvents(flat, accts) {
  const ev = [];
  for (let i = 0; i + 3 < flat.length; i += 4) if (flat[i + 1] < accts) ev.push({ k: flat[i], slot: flat[i + 1], code: flat[i + 2], usd: flat[i + 3] });
  ev.sort((a, b) => a.k - b.k || a.slot - b.slot);
  return ev;
}
export function moneyThreads(s, accts) {
  const H = s.horizon, goal = s.goal;
  return ((s && s.threads && s.threads.ev) || []).map((flat, i) => {      // a scenario with no money threads (or one mid-switch) draws none, never throws
    const ev = moneyEvents(flat, accts);
    const pts = [[0, 0]];
    let v = 0;
    for (const e of ev) {
      if (!e.usd) continue;
      const k = e.k + 1;                                 // the cash moves at the close of session e.k
      if (pts[pts.length - 1][0] < k - 0.6) pts.push([k - 0.6, v]);
      v += e.usd;
      pts.push([k, v]);
    }
    if (pts[pts.length - 1][0] < H) pts.push([H, v]);
    const peak = Math.max(...pts.map((p) => p[1]));
    const color = peak >= goal ? 'gold' : v < 0 ? 'red' : 'violet';
    return { id: i, o: color === 'gold' ? 'p' : color === 'red' ? 'f' : 'o', color, pts, end: H, net: v, ev };
  });
}

// ------------------------------------------------------------------------------------------------ follow one future
export function followEval(data, s, th) {
  if (!th || !Array.isArray(th.hist)) return { title: 'Future', end: 'No detail for this thread', tone: '', rows: [] };       // a tap from the other kind of scenario
  const cal = data.calendar || [], R = s.rules, rows = [];
  let prev = s.start.profit;
  th.hist.forEach((b, k) => {
    const d = b - prev; prev = b;
    rows.push({ k, day: cal[k] || `session ${k + 1}`, text: fmtDate(cal[k]),
      move: Math.abs(d) < 0.5 ? 'no trade' : fmtUsd(d, true), tone: d > 0.5 ? 'up' : d < -0.5 ? 'dn' : '',
      bal: fmtUsd(b, true), room: fmtUsd(b - th.floors[k]) });
  });
  const o = OUTCOME[th.o];
  const n = th.hist.length;
  const end = th.o === 'p' ? `PASSED on day ${n} (${fmtDate(cal[n - 1])}): ${fmtUsd(R.target)} reached` :
    th.o === 'o' ? `Still open after ${n} trading days` : `${o.label} on day ${n} (${fmtDate(cal[n - 1])})`;
  return { title: `Future #${th.id + 1}`, end, tone: o.color, rows };
}
export function followMoney(data, s, th) {
  const cal = data.calendar || [], slots = s.slots || [];
  let v = 0;
  if (!th || !Array.isArray(th.ev)) return { title: 'Future', end: 'No detail for this thread', tone: '', rows: [] };       // a tap from the other kind of scenario
  const rows = th.ev.map((e) => {
    v += e.usd;
    const what = e.code === EV.PAY ? `payout ${fmtUsd(e.usd, true)} to you` : EV_TEXT[e.code] + (e.usd ? ` (${fmtUsd(e.usd, true)})` : '');
    return { k: e.k, day: cal[e.k], text: fmtDate(cal[e.k]), move: `${(slots[e.slot] || {}).label || 'slot ' + (e.slot + 1)}: ${what}`,
      tone: e.code === EV.PAY ? 'up' : e.code === EV.PASS ? 'gold' : e.usd < 0 || e.code === EV.DEAD || e.code === EV.LOST ? 'dn' : '',
      bal: fmtUsd(v, true), room: '' };
  });
  const end = `${fmtUsd(th.net, true)} after 12 months` + (th.color === 'gold' ? ` · reached ${fmtK(s.goal)}` : th.color === 'red' ? ' · behind' : '');
  return { title: `Future #${th.id + 1}`, end, tone: th.color, rows };
}

// ------------------------------------------------------------------------------------------------ Jarvis
// docs/JARVIS_APPS.md: the card the page posts to Jarvis while it is open (jarvis.json carries the same at build time).
export function jarvisCard(data, nowS = Math.floor(Date.now() / 1000)) {
  const S = (data && data.scenarios) || {};
  const z = S['eval:zlarior:2026'], a = S['eval:atlas:2026'];
  if (!z || !a) return null;
  const zp = z.summary.pass, lvl = zp >= 50 ? 'ok' : zp >= 30 ? 'warn' : 'bad';
  const zr = S['eval:zlarior:2021-25'];
  return {
    v: 1, name: 'FATES', status: { level: lvl, label: `Zlarior pass odds ${Math.round(zp)}%` },
    kpis: [{ label: 'Zlarior pass', value: fmtPct(zp) }, { label: 'ATLAS pass', value: fmtPct(a.summary.pass) }],
    lines: [`Pass odds this eval: ${Math.round(zp)}% (Zlarior, 2026 sample${zr ? `; 2021-25: ${Math.round(zr.summary.pass)}%` : ''})`.slice(0, 120)],
    t: nowS, open: '#zlarior/2026', theme: '#14110e',
  };
}

// ------------------------------------------------------------------------------------------------ your next 10 sessions
// From the scenario's drawn threads (400 of the 1,000 futures): after each of the next n sessions, the share already passed /
// failed / still open, and the p10 / p50 / p90 of the open futures' profit ($ vs the eval's start). Row n's pass / fail
// match summary.p10 / f10 within the sampling error of 400 threads; the summary's own numbers ride along for the caption.
export function nextSessions(data, s, n = 10) {
  const t = (s && s.threads) || { o: '', b: [] }, N = t.b.length, cal = (data && data.calendar) || [];
  const q = (xs, f) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(f * (xs.length - 1) + 0.5))] : null);
  const rows = [];
  for (let k = 1; k <= n; k++) {
    let p = 0, f = 0;
    const open = [];
    for (let i = 0; i < N; i++) {
      const h = t.b[i], o = t.o[i] || 'o';
      if (o !== 'o' && h.length <= k) { if (o === 'p') p++; else f++; } else open.push(h.length ? h[Math.min(k, h.length) - 1] : s.start.profit);
    }
    open.sort((a, b) => a - b);
    rows.push({ k, day: cal[k - 1] || null, text: cal[k - 1] ? fmtDate(cal[k - 1]) : `session ${k}`,
      pass: N ? 100 * p / N : 0, fail: N ? 100 * f / N : 0, open: N ? 100 * (N - p - f) / N : 0,
      p10: q(open, 0.1), p50: q(open, 0.5), p90: q(open, 0.9) });
  }
  const m = (s && s.summary) || {};
  return { rows, threads: N, paths: data && data.paths, p10: m.p10, f10: m.f10, target: s && s.rules ? s.rules.target : null };
}

// ------------------------------------------------------------------------------------------------ live odds
// live.json (the PC's heartbeat publish, the file Jarvis reads): board.lit = Zlarior, board.atlas = ATLAS, each with room,
// to_target, session, quiet_days (tools/fates/live.py bot_state reads the same card at build time).
export const BOARD = { zlarior: 'lit', atlas: 'atlas' };
const num = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x);
export function liveBot(live, bot, rules) {
  const c = live && live.board && live.board[BOARD[bot]];
  if (!c || !rules) return null;
  const room = num(c.room), toT = num(c.to_target);
  if (room == null || toT == null) return null;
  const profit = rules.target - toT;
  return { bot, profit, floor: profit - room, room, toTarget: toT, session: num(c.session), quiet: num(c.quiet_days),
    status: String(c.status || 'open').toLowerCase(), t: num(live.t) };
}
// The odds from today's live state. Same state as the build (same session, profit within $1): the build's own odds.
// Moved on: the futures still open after the sessions traded since the build, the K nearest to today's profit (K = 20%,
// at least 30), and how they end. An estimate (a rebuild runs the exact Monte Carlo); null when too few threads are left.
export function liveOdds(s, st) {
  if (!s || s.kind !== 'eval' || !st) return null;
  const S0 = s.start, m = s.summary;
  if (st.status === 'passed' || st.status === 'failed') return { sync: false, done: st.status, pass: st.status === 'passed' ? 100 : 0, fail: st.status === 'failed' ? 100 : 0, open: 0 };
  const n = Math.max(0, (st.session == null ? S0.session : st.session) - S0.session);
  if (n === 0 && Math.abs(st.profit - S0.profit) < 1) return { sync: true, n: 0, k: m.paths, pass: m.pass, fail: m.fail, open: m.open, pass_med: m.pass_med };
  const t = s.threads, near = [];
  t.b.forEach((h, i) => {
    if (n > 0 && h.length <= n) return;                      // decided before today: not one of today's futures
    near.push({ i, d: Math.abs((n > 0 ? h[n - 1] : S0.profit) - st.profit), h });
  });
  if (near.length < 30) return null;
  near.sort((a, b) => a.d - b.d || a.i - b.i);
  const pick = near.slice(0, Math.max(30, Math.round(near.length * 0.2)));
  let p = 0, f = 0;
  const days = [];
  for (const x of pick) {
    const o = t.o[x.i] || 'o';
    if (o === 'p') { p++; days.push(x.h.length - n); } else if (o !== 'o') f++;
  }
  days.sort((a, b) => a - b);
  return { sync: false, n, k: pick.length, pass: 100 * p / pick.length, fail: 100 * f / pick.length, open: 100 * (pick.length - p - f) / pick.length,
    pass_med: days.length ? days[Math.floor((days.length - 1) / 2)] : null, within: pick[pick.length - 1].d };
}
// The eval gauge: the real MFFU numbers behind the threads (rules from the build: Builder 50K = $3,000 target, $2,000 trailing
// drawdown that locks at +$100, $1,000 daily loss limit, $91.80 fee) and the live state. Pure: the page only draws it.
export function gaugeOf(s, st, odds) {
  if (!s || s.kind !== 'eval' || !st || !s.rules) return null;
  const R = s.rules, room = Math.max(0, +st.room || 0), profit = +st.profit || 0, toT = Math.max(0, +st.toTarget || 0);
  const floor = st.floor != null ? +st.floor : profit - room, locked = floor >= R.lock - 1e-9;
  const done = odds && odds.done ? odds.done : null;
  const pass = done ? (done === 'passed' ? 100 : 0) : odds ? odds.pass : null, fail = done ? (done === 'failed' ? 100 : 0) : odds ? odds.fail : null;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  return {
    name: R.name, ddLeft: room, ddOf: R.mll, ddPct: clamp01(room / R.mll), ddWarn: room / R.mll < 0.35, locked,
    dailyLeft: Math.min(room, R.dll), dll: R.dll,
    profit, target: R.target, toTarget: toT, tgtPct: clamp01(profit / R.target),
    pass, fail, passMed: odds && odds.pass_med != null ? odds.pass_med : null, fee: R.price,
    costPerPass: pass != null && pass > 0 && R.price ? R.price / (pass / 100) : null, done,
  };
}
export function ago(tSec, nowMs = Date.now()) {
  if (!tSec) return '';
  const m = Math.max(0, Math.round((nowMs / 1000 - tSec) / 60));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

// ------------------------------------------------------------------------------------------------ JOB 4+5 (2026-11-04): the Lab
// A scenario picker table, the pass-odds timeline by day, "cut a thread" (the worst day removed), a fan chart with percentiles, the size
// what-if and the eval cost per pass. All of it is read from the drawn threads and the scenario's summary: nothing is fetched, nothing is
// sent, nothing touches the bot. The threads stop when their eval is decided, so a what-if that would change a decided thread can only say
// "open: the drawn days ran out" (never a made-up ending): the numbers are a lower bound on passes, an estimate, never a forecast.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const pctOf = (n, d) => (d ? (100 * n) / d : 0);
const quant = (xs, f) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))]; };

/** replay one drawn thread at k x the size, optionally with one session removed ("cut a thread"): { o: 'p' | 'f' | 'o', day, bal } */
export function replayThread(s, hist, k = 1, drop = -1, orig = 'o') {
  const st = s.start, R = s.rules;
  let prevOrig = st.profit, bal = st.profit, peak = +st.peak, floor = st.floor == null ? -R.mll : +st.floor, day = 0;
  for (let j = 0; j < hist.length; j++) {
    const d = hist[j] - prevOrig; prevOrig = hist[j];
    if (j === drop) continue;
    day++;
    bal += k * d;
    if (bal > floor + 1e-9) { peak = Math.max(peak, bal); floor = Math.min(Math.max(floor, peak - R.mll), R.lock); }
    if (bal <= floor + 1e-9) return { o: 'f', day, bal, floor };
    if (bal >= R.target) return { o: 'p', day, bal, floor };
  }
  // the drawn days ran out. A future that ENDED badly as drawn (the bot stopped for too little room, the eval closed) still ends badly at the same
  // size or bigger; with a session cut or a smaller size we cannot know the ending, so it stays open
  if (orig !== 'o' && orig !== 'p' && k >= 1 && drop < 0) return { o: 'f', day, bal, floor };
  return { o: 'o', day, bal, floor };
}

/** the worst session of a thread (the biggest one-session loss) as an index, or -1 when it never lost */
export function worstDay(s, hist) {
  let prev = s.start.profit, w = -1, wd = 0;
  for (let j = 0; j < hist.length; j++) { const d = hist[j] - prev; prev = hist[j]; if (d < wd) { wd = d; w = j; } }
  return w;
}

function tally(s, results) {
  const n = results.length, p = results.filter((r) => r.o === 'p'), f = results.filter((r) => r.o === 'f');
  const days = p.map((r) => r.day).sort((a, b) => a - b);
  const within = (arr, k) => pctOf(arr.filter((r) => r.day <= k).length, n);
  return { n, pass: pctOf(p.length, n), fail: pctOf(f.length, n), open: pctOf(n - p.length - f.length, n), p10: within(p, 10), f10: within(f, 10),
    passMed: days.length ? days[Math.floor((days.length - 1) / 2)] : null };
}

/** all drawn threads at k x the size (an estimate over the drawn futures: see the note at the top) */
export function resize(s, k = 1) {
  const t = (s && s.threads) || { b: [] };
  return tally(s, t.b.map((h, i) => replayThread(s, h, k, -1, (t.o && t.o[i]) || 'o')));
}
/** the size what-if: rows for each multiplier and a plain verdict against the 1x row */
export function sizeTable(s, ks = [1, 1.25, 1.5, 2]) {
  const rows = ks.map((k) => ({ k, ...resize(s, k) })), base = rows[0];
  const best = rows.reduce((a, b) => (b.pass - 1.5 * b.fail > a.pass - 1.5 * a.fail ? b : a), rows[0]);
  const x = (k) => `${k}x`;
  const plain = best.k === base.k ? `Bigger size does not pay here: every step up adds more floor hits than passes (${fmtPct(base.pass)} pass, ${fmtPct(base.fail)} fail at 1x).`
    : `${x(best.k)} passes ${fmtPct(best.pass)} against ${fmtPct(base.pass)} at 1x, and fails ${fmtPct(best.fail)} against ${fmtPct(base.fail)}: more passes, ${best.fail > base.fail ? 'but more floor hits too' : 'and no more floor hits'}.`;
  return { rows, plain, threads: base.n };
}

/** "cut a thread": every drawn future with its worst session removed. cut = the odds with it gone, base = as drawn */
export function cutWorst(s) {
  const t = (s && s.threads) || { b: [] };
  const base = resize(s, 1), cut = tally(s, t.b.map((h, i) => replayThread(s, h, 1, worstDay(s, h), (t.o && t.o[i]) || 'o')));
  const od = Math.round(cut.open - base.open);
  const plain = `Cut each future's worst session: passes ${fmtPct(base.pass)} to ${fmtPct(cut.pass)}, fails ${fmtPct(base.fail)} to ${fmtPct(cut.fail)}.` +
    (od > 0 ? ` ${od}% of the futures were decided by that one session: without it they end undecided inside the drawn days (they would need more days to show an ending, so none is guessed).` : ' No future was decided by one session alone.');
  return { base, cut, plain };
}
/** one future with its worst session removed: the original ending, the new ending, which session went */
export function cutOne(s, th) {
  const w = worstDay(s, th.hist), r = replayThread(s, th.hist, 1, w, th.o), a = replayThread(s, th.hist, 1, -1, th.o);
  return { drop: w, was: a.o, now: r.o, day: r.day, plain: w < 0 ? 'This future never lost a session.' : `Without session ${w + 1} (${fmtUsd(th.hist[w] - (w ? th.hist[w - 1] : s.start.profit), true)}) this future ${r.o === 'p' ? `passes on day ${r.day}` : r.o === 'f' ? `still fails on day ${r.day}` : 'is still open when the drawn days end'}.` };
}

/** the fan chart: percentiles of the profit across the drawn threads, per session (a decided thread holds its last value) */
export function fanChart(s, n = 40) {
  const t = (s && s.threads) || { b: [] }, QS = [10, 25, 50, 75, 90], R = s.rules, series = Object.fromEntries(QS.map((q) => [q, []]));
  const floorMed = [];
  const fl = t.b.map((h) => floorsOf(h, s.start, R));
  for (let k = 0; k <= n; k++) {
    const vals = t.b.map((h) => (k === 0 ? s.start.profit : h.length ? h[Math.min(k, h.length) - 1] : s.start.profit));
    for (const q of QS) series[q].push(quant(vals, q / 100));
    floorMed.push(quant(fl.map((f, i) => (k === 0 ? (s.start.floor == null ? -R.mll : s.start.floor) : f.length ? f[Math.min(k, f.length) - 1] : -R.mll)), 0.5));
  }
  return { n, q: QS, series, floorMed, target: R.target, floor0: s.start.floor == null ? -R.mll : s.start.floor, start: s.start.profit, threads: t.b.length };
}

/** the pass-odds timeline by day: the cumulative share that has passed by session k, from the build's histogram of all the futures */
export function passTimeline(s, n = 40) {
  const m = (s && s.summary) || {}, H = m.pass_hist, total = m.paths || 0, rows = [];
  let cum = 0;
  if (Array.isArray(H) && total) {
    for (let k = 1; k <= Math.min(n, H.length); k++) { cum += H[k - 1]; rows.push({ k, day: pctOf(H[k - 1], total), cum: pctOf(cum, total) }); }   // the histogram's total is the build's pass count
  } else {
    const t = (s && s.threads) || { o: '', b: [] }, N = t.b.length;
    for (let k = 1; k <= n; k++) { const c = t.b.filter((h, i) => (t.o[i] || 'o') === 'p' && h.length <= k).length; rows.push({ k, day: 0, cum: pctOf(c, N) }); }
  }
  const half = rows.find((r) => r.cum >= (m.pass || 0) / 2);
  return { rows, pass: m.pass, half: half ? half.k : null, p10: m.p10, p15: m.p15, med: m.pass_med };
}

/** what a pass costs: the eval fee over the pass rate (a failed eval is bought again), and over the calendar */
export function costPerPass(s, fresh = false) {
  const m = fresh && s.summary.fresh ? s.summary.fresh : s.summary, price = s.rules && s.rules.price, p = (m.pass || 0) / 100;
  if (!price || p <= 0) return { price: price || null, perPass: null, attempts: null, plain: 'No pass rate to price yet.' };
  const attempts = 1 / p, perPass = price * attempts;
  return { price, pass: m.pass, attempts, perPass, med: m.pass_med,
    plain: `One eval costs ${fmtUsd(price)}. At ${fmtPct(m.pass)} pass, you buy about ${attempts.toFixed(1)} evals per pass: about ${fmtUsd(perPass)} for each pass${m.pass_med != null ? `, ${Math.round(m.pass_med)} trading days to pass at the median` : ''}.` };
}

/** the scenario picker: every eval scenario side by side (Zlarior / ATLAS x the three samples), for a one-tap switch */
export function scenarioTable(data) {
  const rows = [];
  for (const bot of Object.keys(BOTS)) for (const per of PERIODS) {
    const s = data && data.scenarios && data.scenarios[`eval:${bot}:${per}`];
    if (!s || s.kind !== 'eval') continue;
    const c = costPerPass(s);
    rows.push({ key: `eval:${bot}:${per}`, bot, period: per, label: `${BOTS[bot]} · ${per === 'H2' ? 'Jul-Oct' : per}`, name: s.rules.name, pass: s.summary.pass, fail: s.summary.fail, med: s.summary.pass_med, p10: s.summary.p10, cost: c.perPass });
  }
  return rows;
}
