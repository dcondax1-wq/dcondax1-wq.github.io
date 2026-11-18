// COLOSSEUM core (pure maths and words, no DOM, no network): where strategies fight. Two stored runs of the Archive duel over seven rounds on their REAL stored numbers, money first.
// Rows come from ../archive/index.json (+ runs-<k>.json shards), ./extra.json (max drawdown, dec10, pass_med: tools/colosseum_build.py), ../home.json (the three bots) or fixture.json (DEMO).
// A run row is the Archive's array [id, title, family, strategy, verdict, status, built, periods, m26, mold, writeup, note]; m26 / mold = [n, trades a week, PF, net $, $ a month, pass10 %, fail10 %] or 0.
// RULE: a number that is not stored is null and its round is "no contest". Nothing is guessed, ever. Same input, same result (no clock, no random).
// Safari 16 safe: no lookbehind, no .at().

export const ROUNDS = [
  { key: 'net', name: 'Net profit', plain: 'Money made after costs', better: 'more' },
  { key: 'pm', name: 'Dollars a month', plain: 'What it paid in an average month', better: 'more' },
  { key: 'pf', name: 'Profit factor', plain: 'Dollars won for every dollar lost', better: 'more' },
  { key: 'dd', name: 'Max drawdown', plain: 'The worst drop from a high, in dollars', better: 'less' },
  { key: 'tpw', name: 'Trades a week', plain: 'The rule is 2 to 4 trades a week', better: 'inside 2-4' },
  { key: 'eval', name: 'Eval speed', plain: 'MFFU eval: passed or failed within 10 sessions', better: 'more passes, fewer fails' },
  { key: 'both', name: 'Holds in both periods', plain: 'Makes money in 2026 AND in 2021-25', better: 'both periods positive' },
];
export const TPW_BAND = [2, 4];
export const N_FLOOR = 30;            // fewer trades than this is too few to seed a tournament or to trust a win
export const PERIOD_WORD = { 26: '2026', old: '2021-25', live: 'live so far' };
export const LABEL = 'Stored backtests, not a forecast. Money is after costs; 1 MNQ micro = $2 a point. A better number in one backtest is not proof.';
export const VERDICT_WORD = ['Adopted', 'Rejected', 'Open'];
const SAFE_ID = /^[A-Za-z0-9_.\-]{1,90}$/;

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (a) => (Array.isArray(a) ? a : []);
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// ------------------------------------------------------------------------------------------------ words
export const usd = (x) => { const v = num(x); if (v === null) return 'n/a'; const r = Math.round(v); return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-US'); };
export const usdS = (x) => { const v = num(x); if (v === null) return 'n/a'; return (Math.round(v) > 0 ? '+' : '') + usd(v); };
export const pf = (x) => (num(x) === null ? 'n/a' : (Math.round(x * 100) / 100).toFixed(2));
export const dec = (x, k) => { if (num(x) === null) return 'n/a'; const p = Math.pow(10, k == null ? 1 : k); return String(Math.round(x * p) / p); };
export const pct = (x) => (num(x) === null ? 'n/a' : dec(x, 1) + '%');

// ------------------------------------------------------------------------------------------------ the family crest
const CREST = { 'LIT research': '#c8a24a', 'LIT headquarters': '#e0b060', ATLAS: '#4b7a99', BLITZ: '#c96a4a', risk: '#b4552f', filters: '#7f8a52', management: '#9c6b3c', sessions: '#b98a6a', timing: '#8a7a5a',
  targets: '#a6573a', stops: '#8c4a3a', bias: '#6f8296', winrate: '#a9b07a', baseline: '#e9e3d5', 'other tests': '#9a8f7d', LIT: '#c8a24a' };
const CREST_SPARE = ['#c8a24a', '#7f8a52', '#c96a4a', '#4b7a99', '#9c6b3c', '#e0b060'];
/** the colour of a family's helmet crest: a fixed warm colour for each known family, a stable pick for an unknown one */
export function crest(family) {
  const f = String(family || '');
  if (CREST[f]) return CREST[f];
  let h = 0; for (let i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) % 9973;
  return CREST_SPARE[h % CREST_SPARE.length];
}

// ------------------------------------------------------------------------------------------------ rows -> fighters
const period = (a) => (Array.isArray(a) && num(a[0]) ? { n: num(a[0]), tpw: num(a[1]), pf: num(a[2]), net: num(a[3]), pm: num(a[4]), p10: num(a[5]), f10: num(a[6]), dd: null, dec10: null, pass_med: null } : null);
/** one Archive row -> a fighter; text is cleaned, numbers are numbers or null, a missing period is null (never zeros) */
export function rowObj(r) {
  if (!Array.isArray(r) || typeof r[0] !== 'string' || !SAFE_ID.test(r[0])) return null;
  const o = { id: r[0], kind: 'run', name: clean(r[1], 100) || r[0], family: clean(r[2], 40) || 'other tests', lit: r[3] === 1, verdict: r[4] === 0 || r[4] === 1 ? r[4] : 2, status: clean(r[5], 20), built: clean(r[6], 10),
    m26: period(r[8]), mold: period(r[9]), mlive: null, writeup: /^[a-z0-9-]{0,70}$/.test(String(r[10] || '')) ? String(r[10] || '') : '', note: clean(r[11], 140) };
  o.hay = (o.id + ' ' + o.name + ' ' + o.family).toLowerCase();
  return o;
}
/** lay the extras (max drawdown $, dec10, pass_med) of extra.json over the runs; returns how many runs gained a number */
export function addExtra(v, extra) {
  if (!v || !isObj(extra) || !isObj(extra.runs)) return 0;
  const cols = arr(extra.cols), iD = cols.indexOf('dd'), iC = cols.indexOf('dec10'), iP = cols.indexOf('pass_med');
  let k = 0;
  for (const r of v.runs) {
    const e = Object.prototype.hasOwnProperty.call(extra.runs, r.id) ? extra.runs[r.id] : null;
    if (!Array.isArray(e)) continue;
    let hit = false;
    [[r.m26, e[0]], [r.mold, e[1]]].forEach(([m, x]) => { if (m && Array.isArray(x)) { if (iD >= 0) m.dd = num(x[iD]); if (iC >= 0) m.dec10 = num(x[iC]); if (iP >= 0) m.pass_med = num(x[iP]); hit = true; } });
    if (hit) k++;
  }
  v.extra = true;
  return k;
}
export function normIndex(idx) {
  if (!isObj(idx) || !Array.isArray(idx.runs) || !idx.runs.length) return null;
  const runs = idx.runs.map(rowObj).filter(Boolean);
  if (!runs.length) return null;
  const rej = arr(idx.rejected).map((x) => ({ title: clean(x && x.title, 110), text: clean(x && x.text, 700), writeups: arr(x && x.writeups).filter((s) => /^[a-z0-9-]{1,70}$/.test(String(s))) })).filter((x) => x.title);
  const c = isObj(idx.counts) ? idx.counts : {};
  const v = { runs, rejected: rej, shards: arr(idx.shards).filter((s) => /^runs-\d{1,3}\.json$/.test(String(s))), built: clean(idx.built, 10), demo: idx.demo === true, extra: false, total: num(c.runs) || runs.length, adopted: num(c.adopted) };
  if (isObj(idx.extra)) addExtra(v, idx.extra);       // the fixture carries its own extras
  return v;
}
/** the real index wins; a missing, empty or broken one falls back to the labelled demo; null when both are unusable */
export function chooseData(real, fx) {
  const r = normIndex(real); if (r) return r.demo ? { src: 'demo', v: r } : { src: 'file', v: r };
  const f = normIndex(fx); if (!f) return null;
  for (const x of f.runs) x.demo = true;                // every duel of a demo fighter says so in its caveats
  return { src: 'demo', v: { ...f, demo: true } };
}
/** add the runs of a shard (never twice) */
export function addShard(v, shard) {
  if (!v || !isObj(shard) || !Array.isArray(shard.runs)) return 0;
  const have = new Set(v.runs.map((r) => r.id)); let k = 0;
  for (const raw of shard.runs) { const o = rowObj(raw); if (o && !have.has(o.id)) { v.runs.push(o); have.add(o.id); k++; } }
  return k;
}
export const byId = (v, id) => { if (!v) return null; for (const r of v.runs) if (r.id === id) return r; return null; };

// ------------------------------------------------------------------------------------------------ the three bots (home.json)
export const BOTS = [{ key: 'lit', name: 'LIT', account: 'Builder 50K', family: 'LIT' }, { key: 'atlas', name: 'ATLAS', account: 'Builder 25K', family: 'ATLAS' }, { key: 'blitz', name: 'BLITZ', account: 'Builder 25K', family: 'BLITZ' }];
export function botKey(a) {
  if (!isObj(a)) return null;
  const s = [a.key, a.id, a.name, a.strategy, a.plan, a.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c|acctc/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'lit';
  return null;
}
/** one bot row from a home.json account (stats / pnl as engine/accounts.py writes them); a number that is not there stays null */
function botRow(B, a, demo) {
  const st = isObj(a && a.stats) ? a.stats : {}, pnl = isObj(a && a.pnl) ? a.pnl : {};
  const n = num(st.n), net = num(st.net) !== null ? num(st.net) : num(pnl.traded);
  const has = !!a && (n !== null || net !== null);
  const m = has ? { n: n || 0, tpw: null, pf: num(st.pf), net, pm: null, p10: null, f10: null, dd: num(st.max_dd), dec10: null, pass_med: null } : null;
  return { id: 'bot:' + B.key, kind: 'bot', key: B.key, name: B.name, account: B.account, family: B.family, lit: B.key === 'lit', verdict: 2, has, demo: !!demo, m26: null, mold: null, mlive: m && m.n > 0 ? m : null,
    n: has ? (n || 0) : null, net: has ? net : null, pfv: has ? num(st.pf) : null, dd: has ? num(st.max_dd) : null, win: has ? num(st.win_pct) : null, week: has ? num(pnl.week) : null, today: has ? num(pnl.today) : null, hay: B.name.toLowerCase() };
}
/** the league of LIT / ATLAS / BLITZ: live rows from home.json; when none of the three is there, the fixture's rows, labelled DEMO. Sorted by net $ (a bot with no number goes last). */
export function league(home, fixture) {
  const list = isObj(home) ? arr(home.accounts) : [], fxl = isObj(fixture) ? arr(fixture.bots) : [];
  const find = (L, key) => { for (const a of L) if (botKey(a) === key) return a; return null; };
  const live = BOTS.some((B) => { const a = find(list, B.key); return !!a && (isObj(a.stats) || isObj(a.pnl)); });
  const rows = BOTS.map((B) => (live ? botRow(B, find(list, B.key), false) : botRow(B, find(fxl, B.key), true)));
  rows.sort((x, y) => (x.net === null ? 1 : 0) - (y.net === null ? 1 : 0) || (y.net || 0) - (x.net || 0) || x.name.localeCompare(y.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { demo: !live, rows };
}

// ------------------------------------------------------------------------------------------------ the duel
/** the period both fighters have a result for: 2026 first, then 2021-25, then live (two bots); null = nothing to compare */
export function commonPeriod(a, b) {
  if (!a || !b) return null;
  if (a.m26 && b.m26) return '26';
  if (a.mold && b.mold) return 'old';
  if (a.mlive && b.mlive) return 'live';
  return null;
}
const mOf = (f, per) => (per === '26' ? f.m26 : per === 'old' ? f.mold : per === 'live' ? f.mlive : null);
const short = (f) => (f.kind === 'bot' ? f.name : f.id);
const tpwDist = (v) => (v < TPW_BAND[0] ? TPW_BAND[0] - v : v > TPW_BAND[1] ? v - TPW_BAND[1] : 0);
/** does a run hold in both periods: money made and PF at least 1 in 2026 AND in 2021-25 */
export function holds(f) { return !!(f && f.m26 && f.mold && num(f.m26.net) !== null && num(f.mold.net) !== null && f.m26.net > 0 && f.mold.net > 0 && (f.m26.pf === null || f.m26.pf >= 1) && (f.mold.pf === null || f.mold.pf >= 1)); }

function side(key, f, m) {
  // -> { v: the number that is compared (null = not stored), text: what the owner reads, miss: what is missing }
  const none = (what) => ({ v: null, text: 'not stored', miss: what });
  if (key === 'both') {
    if (!f.m26 || !f.mold) return none(f.kind === 'bot' ? 'a 2021-25 history' : !f.m26 ? 'a 2026 result' : 'a 2021-25 result');
    if (f.m26.pm === null || f.mold.pm === null) return none('dollars a month in both periods');
    const weak = Math.min(f.m26.pm, f.mold.pm), h = holds(f);
    return { v: weak, hold: h, text: `${h ? 'holds' : 'does not hold'}: weaker period ${usdS(weak)} a month`, big: `${usdS(weak)}/mo`, sub: h ? 'holds in both' : 'does not hold' };
  }
  if (!m) return none('a result for this period');
  if (key === 'net') return m.net === null ? none('net dollars') : { v: m.net, text: usdS(m.net), big: usdS(m.net), sub: `${m.n} trades` };
  if (key === 'pm') return m.pm === null ? none('dollars a month') : { v: m.pm, text: `${usdS(m.pm)} a month`, big: usdS(m.pm), sub: 'a month' };
  if (key === 'pf') return m.pf === null ? none('a profit factor') : { v: m.pf, text: `PF ${pf(m.pf)}`, big: pf(m.pf), sub: `$${pf(m.pf)} won per $1 lost` };
  if (key === 'dd') return m.dd === null ? none('a max drawdown') : { v: Math.abs(m.dd), text: `worst drop ${usd(-Math.abs(m.dd))}`, big: usd(-Math.abs(m.dd)), sub: 'worst drop' };
  if (key === 'tpw') { if (m.tpw === null) return none('trades a week'); const d = tpwDist(m.tpw); return { v: d, raw: m.tpw, text: `${dec(m.tpw, 1)} a week (${d === 0 ? 'inside' : 'outside'} 2-4)`, big: dec(m.tpw, 1), sub: d === 0 ? 'a week, inside 2-4' : 'a week, outside 2-4' }; }
  if (key === 'eval') {
    if (m.p10 === null || m.f10 === null) return none('eval pass and fail rates');
    const bits = [`pass ${pct(m.p10)} / fail ${pct(m.f10)} in 10 sessions`];
    if (m.dec10 !== null) bits.push(`decided ${pct(m.dec10)}`);
    if (m.pass_med !== null) bits.push(`median pass ${dec(m.pass_med, 1)} sessions`);
    return { v: Math.round((m.p10 - m.f10) * 10) / 10, dec10: m.dec10, pass_med: m.pass_med, text: bits.join(', '), big: `${pct(m.p10)} / ${pct(m.f10)}`, sub: 'pass / fail in 10 sessions' };
  }
  return none('this number');
}
function judge(key, A, B) {
  // -> 'a' | 'b' | 'draw' (both sides have a number here)
  const hi = (x, y) => (x > y ? 'a' : y > x ? 'b' : 'draw');
  if (key === 'dd' || key === 'tpw') return hi(B.v, A.v);                           // less is better
  if (key === 'both') { if (A.hold !== B.hold) return A.hold ? 'a' : 'b'; return hi(A.v, B.v); }
  if (key === 'eval') {
    let w = hi(A.v, B.v);
    if (w === 'draw' && A.dec10 !== null && B.dec10 !== null) w = hi(A.dec10, B.dec10);
    if (w === 'draw' && A.pass_med !== null && B.pass_med !== null) w = hi(B.pass_med, A.pass_med);
    return w;
  }
  return hi(A.v, B.v);
}
function roundLine(R, a, b, A, B, w) {
  if (w === 'none') { const who = [A.v === null ? `${short(a)} has no ${String(A.miss).replace(/^an? /, '')}` : '', B.v === null ? `${short(b)} has no ${String(B.miss).replace(/^an? /, '')}` : ''].filter(Boolean).join(' and '); return `No contest: ${who} stored. Nothing is guessed.`; }
  if (w === 'draw') return R.key === 'tpw' && A.v === 0 ? `Level: both trade inside the 2 to 4 a week rule.` : `Level: the same on ${R.name.toLowerCase()}.`;
  const W = w === 'a' ? a : b;
  if (R.key === 'net' || R.key === 'pm') return `${short(W)} takes it by ${usd(Math.abs(A.v - B.v))}${R.key === 'pm' ? ' a month' : ''}.`;
  if (R.key === 'pf') return `${short(W)} takes it: more dollars won for each dollar lost.`;
  if (R.key === 'dd') return `${short(W)} takes it: its worst drop was ${usd(Math.abs(A.v - B.v))} smaller.`;
  if (R.key === 'tpw') return `${short(W)} takes it: ${(w === 'a' ? A : B).v === 0 ? 'it trades inside the 2 to 4 a week rule' : 'it is closer to the 2 to 4 a week rule'}.`;
  if (R.key === 'eval') return `${short(W)} takes it: more evals passed than failed within 10 sessions.`;
  return `${short(W)} takes it: ${(w === 'a' ? A : B).hold && !(w === 'a' ? B : A).hold ? 'it makes money in both periods and the other does not' : 'its weaker period is the better one'}.`;
}
/** the seven rounds of a against b -> { period, rounds, score, winner, decidedBy, why[3], caveats[], share }. Pure and deterministic. opts.demo labels invented numbers. */
export function duel(a, b, opts) {
  const o = opts || {};
  if (!a || !b) return null;
  const per = commonPeriod(a, b), ma = mOf(a, per), mb = mOf(b, per);
  const rounds = ROUNDS.map((R, i) => {
    const A = side(R.key, a, ma), B = side(R.key, b, mb), w = A.v === null || B.v === null ? 'none' : judge(R.key, A, B);
    return { i: i + 1, key: R.key, name: R.name, plain: R.plain, a: A, b: B, winner: w, vs: `${A.text} vs ${B.text}`, line: roundLine(R, a, b, A, B, w) };
  });
  const score = { a: 0, b: 0, draw: 0, none: 0 };
  for (const r of rounds) score[r.winner]++;
  let winner = score.a > score.b ? 'a' : score.b > score.a ? 'b' : 'draw', decidedBy = winner === 'draw' ? 'none' : 'rounds';
  if (winner === 'draw' && ma && mb) {                // level on rounds: money decides, dollars a month first, then net
    for (const k of ['pm', 'net']) if (winner === 'draw' && ma[k] !== null && mb[k] !== null && ma[k] !== mb[k]) { winner = ma[k] > mb[k] ? 'a' : 'b'; decidedBy = 'money'; }
  }
  const W = winner === 'b' ? b : a, L = winner === 'b' ? a : b, sw = winner === 'b' ? score.b : score.a, sl = winner === 'b' ? score.a : score.b, mw = winner === 'b' ? mb : ma, ml = winner === 'b' ? ma : mb;
  const pw = PERIOD_WORD[per] || 'no shared period';
  const names = (side_) => rounds.filter((r) => r.winner === side_).map((r) => r.name.toLowerCase());
  const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const why = [];
  if (!per) why.push(`No winner: ${short(a)} and ${short(b)} have no period in common, so their numbers cannot be compared.`);
  else if (winner === 'draw') why.push(`A draw: ${score.a} round${score.a === 1 ? '' : 's'} each, and the money is level too.`);
  else if (decidedBy === 'money') why.push(`${short(W)} wins on money: the rounds were level at ${sw} each, so dollars decided.`);
  else why.push(`${short(W)} beat ${short(L)} by ${sw} round${sw === 1 ? '' : 's'} to ${sl}.`);
  if (mw && ml && mw.net !== null && ml.net !== null) why.push(`On money (${pw}) ${winner === 'draw' ? short(a) : 'it'} made ${usdS(mw.net)}${mw.pm !== null ? ` (${usd(mw.pm)} a month)` : ''} against ${usdS(ml.net)}${ml.pm !== null ? ` (${usd(ml.pm)} a month)` : ''}.`);
  else why.push('The money could not be compared: a net dollar figure is not stored for both.');
  const wonOn = names(winner === 'b' ? 'b' : 'a'), lostOn = names(winner === 'b' ? 'a' : 'b');
  if (winner === 'draw') why.push(`${short(a)} was better on ${list(wonOn) || 'no round'}; ${short(b)} was better on ${list(lostOn) || 'no round'}.`);
  else why.push(`It won on ${list(wonOn) || 'no single round'}; ${short(L)} was better on ${list(lostOn) || 'no round'}.`);

  const cav = [];
  if (o.demo || a.demo || b.demo) cav.push('DEMO numbers: invented examples, not real results.');
  cav.push(per === 'live' ? 'Live account numbers so far (paper or Sim): a short record, not a promise of what comes next.' : `Stored backtests of ${pw}: history, not live results and not a promise.`);
  cav.push(per === 'live' ? 'Costs: these are the fills the account recorded.' : 'Costs are in: money is after costs (1 MNQ micro = $2 a point).');
  if (ma && mb) { const few = [a, b].filter((f) => mOf(f, per).n < N_FLOOR).map(short); cav.push(`Sample size: ${short(a)} n = ${ma.n} trades, ${short(b)} n = ${mb.n} trades.${few.length ? ` Under ${N_FLOOR} trades (${few.join(', ')}) is too few to trust.` : ''}`); }
  if (score.none) cav.push(`${score.none} round${score.none === 1 ? ' was' : 's were'} no contest because a number is not stored (${rounds.filter((r) => r.winner === 'none').map((r) => r.name.toLowerCase()).join(', ')}). Nothing was guessed.`);
  if ((a.lit || b.lit) && a.kind === 'run') cav.push('LIT is tuned and judged on 2026; its 2021-25 line is a reference, not a gate.');
  if (winner !== 'draw' && W.kind === 'run' && W.verdict === 1) cav.push(`${short(W)} is a REJECTED run: read why in the Archive before trusting this win.`);
  cav.push('A better number in one backtest is not proof. A duel changes nothing the bots do.');
  const share = !per ? `COLOSSEUM: ${short(a)} vs ${short(b)}: no period in common, no contest.`
    : `COLOSSEUM: ${winner === 'draw' ? `${short(a)} drew with ${short(b)} ${score.a}-${score.b}` : `${short(W)} beat ${short(L)} ${sw}-${sl}${decidedBy === 'money' ? ' (level on rounds, money decided)' : ''}`} (${pw}${per === 'live' ? '' : ' backtest, after costs'}).`
      + (mw && ml && mw.net !== null && ml.net !== null ? ` Net ${usdS(mw.net)} vs ${usdS(ml.net)}.` : '') + ' History, not a promise.';
  return { a, b, period: per, periodWord: pw, rounds, score, winner, decidedBy, why, caveats: cav, share };
}

// ------------------------------------------------------------------------------------------------ the tournament
const twin = (m) => `${m.n}|${m.pf}|${m.net}|${m.pm}`;
/** the adopted runs that may enter: a 2026 result with $ a month and n >= floor; runs with identical numbers count once (the first id); best $ a month first */
export function contenders(runs, floor) {
  const fl = num(floor) === null ? N_FLOOR : floor, seen = new Set(), out = [];
  const pool = arr(runs).filter((r) => r && r.kind === 'run' && r.verdict === 0 && r.m26 && r.m26.pm !== null && r.m26.n >= fl).slice().sort((x, y) => x.id.localeCompare(y.id));
  for (const r of pool) { const k = twin(r.m26); if (!seen.has(k)) { seen.add(k); out.push(r); } }
  out.sort((x, y) => y.m26.pm - x.m26.pm || (y.m26.net || 0) - (x.m26.net || 0) || x.id.localeCompare(y.id));
  return out;
}
/** the first-round pairs of a seeded bracket of n (a power of two): [[1, n], ...] laid out so seeds 1 and 2 can only meet in the final */
export function bracketPairs(n) {
  let order = [1];
  while (order.length < n) { const m = order.length * 2 + 1, next = []; for (const s of order) { next.push(s); next.push(m - s); } order = next; }
  const pairs = []; for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}
/** a seeded knockout of the top `size` adopted runs, auto-played. A level match goes to the higher seed (said in its note). */
export function tournament(runs, opts) {
  const o = opts || {}, floor = num(o.floor) === null ? N_FLOOR : o.floor, pool = contenders(runs, floor);
  let size = Math.min(num(o.size) || 16, 16); while (size > pool.length) size /= 2;
  if (size < 2) return { ok: false, floor, size: 0, eligible: pool.length, field: [], rounds: [], champion: null, share: `COLOSSEUM tournament: fewer than two adopted runs with ${floor} trades or more. No tournament.` };
  const field = pool.slice(0, size).map((f, i) => ({ seed: i + 1, f }));
  const NAMES = { 16: 'Round of 16', 8: 'Quarter-finals', 4: 'Semi-finals', 2: 'Final' };
  const rounds = []; let alive = bracketPairs(size).map(([x, y]) => [field[x - 1], field[y - 1]]);
  for (;;) {
    const matches = alive.map(([x, y]) => {
      const d = duel(x.f, y.f, { demo: o.demo }), level = d.winner === 'draw', w = level ? (x.seed < y.seed ? x : y) : d.winner === 'a' ? x : y;
      return { a: x, b: y, score: [d.score.a, d.score.b], winner: w, loser: w === x ? y : x, decidedBy: level ? 'seed' : d.decidedBy,
        note: level ? 'Level on rounds and money: the higher seed goes through.' : d.decidedBy === 'money' ? 'Level on rounds: money decided.' : '' };
    });
    rounds.push({ name: NAMES[matches.length * 2] || `Round of ${matches.length * 2}`, matches });
    if (matches.length === 1) break;
    const next = []; for (let i = 0; i < matches.length; i += 2) next.push([matches[i].winner, matches[i + 1].winner]);
    alive = next;
  }
  const fin = rounds[rounds.length - 1].matches[0], ch = fin.winner, m = ch.f.m26;
  const share = `COLOSSEUM tournament${o.demo ? ' (DEMO numbers)' : ''}: ${ch.f.id} (seed ${ch.seed}) is champion of the top ${size} adopted runs, beating ${fin.loser.f.id} ${Math.max(fin.score[0], fin.score[1])}-${Math.min(fin.score[0], fin.score[1])} in the final. `
    + `2026: ${usdS(m.net)} net, ${usd(m.pm)} a month, PF ${pf(m.pf)}, n = ${m.n}. Stored backtests after costs: history, not a promise.`;
  return { ok: true, floor, size, eligible: pool.length, field, rounds, champion: ch, runnerUp: fin.loser, share };
}

// ------------------------------------------------------------------------------------------------ the hall and the fallen
/** the adopted runs as statues: best $ a month first, twins once */
export function hall(runs, n) { return contenders(runs, 1).slice(0, n || 12); }
/** notable rejected ideas with the reason: those with numbers or a write-up first, in the Archive's order */
export function fallen(rejected, n) {
  const tidy = (x) => { const t = x.title.replace(/\s*\(.*$/, '').trim() || x.title; let r = x.text; if (r.indexOf(x.title) === 0) r = r.slice(x.title.length).replace(/^[\s:.,;-]+/, ''); return { t, r: r ? r.charAt(0).toUpperCase() + r.slice(1) : x.text }; };
  const xs = arr(rejected).filter((x) => x && x.title && x.text).map((x, i) => ({ title: tidy(x).t, reason: tidy(x).r, writeup: (x.writeups && x.writeups[0]) || '', w: ((x.writeups && x.writeups.length) ? 2 : 0) + (/\$|\bPF\b/.test(x.text) ? 1 : 0), i }));
  xs.sort((p, q) => q.w - p.w || p.i - q.i);
  return xs.slice(0, n || 12).map(({ title, reason, writeup }) => ({ title, reason, writeup }));
}

// ------------------------------------------------------------------------------------------------ search and links
export function search(runs, q, limit) {
  const toks = String(q || '').toLowerCase().split(/[^a-z0-9$.+_-]+/).filter(Boolean), ql = String(q || '').trim().toLowerCase();
  const hit = arr(runs).filter((r) => { for (const t of toks) if (r.hay.indexOf(t) < 0) return false; return true; });
  const pm = (r) => { const m = r.m26 || r.mold; return m && m.pm !== null ? m.pm : -1e12; };
  hit.sort((x, y) => (y.id === ql ? 1 : 0) - (x.id === ql ? 1 : 0) || (x.verdict === 0 ? 0 : x.verdict === 2 ? 1 : 2) - (y.verdict === 0 ? 0 : y.verdict === 2 ? 1 : 2) || pm(y) - pm(x) || x.id.localeCompare(y.id));
  return hit.slice(0, limit || 8);
}
const LINK_ID = /^(?:bot:)?[A-Za-z0-9_.\-]{1,90}$/;
/** '#a=<runId>&b=<runId>' -> { a, b } (an id that is not a safe id is dropped) */
export function parseHash(hash) {
  const out = { a: '', b: '' };
  for (const part of String(hash || '').replace(/^#/, '').split('&')) {
    const i = part.indexOf('='); if (i < 1) continue;
    const k = part.slice(0, i); let v = part.slice(i + 1); try { v = decodeURIComponent(v); } catch (_) { v = ''; }
    if ((k === 'a' || k === 'b') && LINK_ID.test(v)) out[k] = v;
  }
  return out;
}
export function makeHash(a, b) { const p = []; if (a && LINK_ID.test(a)) p.push('a=' + encodeURIComponent(a)); if (b && LINK_ID.test(b)) p.push('b=' + encodeURIComponent(b)); return p.length ? '#' + p.join('&') : ''; }
/** one line for a fighter's plate: money first */
export function plate(f) {
  if (!f) return 'Empty';
  const per = f.m26 ? '26' : f.mold ? 'old' : f.mlive ? 'live' : null, m = mOf(f, per);
  if (!m) return 'No result stored';
  return `${PERIOD_WORD[per]}: ${usdS(m.net)}${m.pm !== null ? `, ${usd(m.pm)} a month` : ''}${m.pf !== null ? `, PF ${pf(m.pf)}` : ''}, n = ${m.n}`;
}
/** the Jarvis helper card (<= 3 kpis, <= 3 lines) */
export function card(v, t) {
  const T = v ? tournament(v.runs, { demo: v.demo }) : null, ch = T && T.ok ? T.champion.f : null;
  return { v: 1, name: 'Colosseum', status: { level: v && !v.demo ? 'ok' : 'off', label: v && !v.demo ? 'Stored backtests' : 'Demo data' },
    kpis: [{ label: 'Runs', value: (v ? v.total : 0).toLocaleString('en-US') }, { label: 'Contenders', value: String(T ? T.eligible : 0) }, { label: 'Champion', value: ch ? usd(ch.m26.pm) + '/mo' : 'n/a' }],
    lines: [ch ? `Champion: ${ch.id}.`.slice(0, 120) : 'No tournament yet.', 'Duels use stored numbers only. Not a promise.'], t: t || 0, open: '#', theme: '#14110e', stale_after: 604800 };
}

// ------------------------------------------------------------------------------------------------ every champion is a person (docs/PERSONA_API.md)
// The shared People kit opens its own chat for these ids; without the kit the page shows this fallback: five questions answered ONLY from the stored numbers, always with $ and n.
export const personId = (f) => (!f ? '' : f.kind === 'bot' ? f.id : 'champion:' + f.id);
export const QUESTIONS = [['win', 'How did you win?'], ['weak', 'What is your weakness?'], ['trades', 'How many trades?'], ['eval', 'Would you pass an eval?'], ['rejected', 'Why were you rejected?']];
const NOT_PROMISE = 'Backtest, not a promise.';
function mainPeriod(f) { const per = f.m26 ? '26' : f.mold ? 'old' : f.mlive ? 'live' : null; return { per, m: mOf(f, per), word: PERIOD_WORD[per] || '' }; }
/** the line every answer ends with: the money, the sample size and the honest label */
function tail(f) { const { per, m, word } = mainPeriod(f); if (!m) return 'No result is stored for me, so I have no dollars and no trade count to show. ' + NOT_PROMISE; return `(${word}: ${m.net === null ? 'no dollars stored' : usdS(m.net)}, n = ${m.n} trades. ${per === 'live' ? 'A short live record, not a promise.' : NOT_PROMISE})`; }
/** one answer in the champion's own voice. d = the finished duel it fought in, if any. Never a number that is not stored. */
export function answer(f, key, d) {
  if (!f) return '';
  const { per, m, word } = mainPeriod(f);
  if (!m) return tail(f);
  let s = '';
  if (key === 'win') {
    const mine = d && (d.a === f || d.b === f) ? (d.a === f ? 'a' : 'b') : null;
    if (!mine) s = `I have not finished a duel yet. My record: ${m.net === null ? 'no dollars stored' : usdS(m.net)}${m.pm !== null ? `, ${usd(m.pm)} a month` : ''}${m.pf !== null ? `, PF ${pf(m.pf)}` : ''}.`;
    else {
      const ok = mine === 'a' ? 'b' : 'a', other = mine === 'a' ? d.b : d.a, won = d.rounds.filter((r) => r.winner === mine).map((r) => r.name.toLowerCase());
      if (!d.period) s = `Nobody won: ${short(other)} and I have no period in common.`;
      else if (d.winner === mine) s = `I beat ${short(other)} ${d.score[mine]} to ${d.score[ok]}${d.decidedBy === 'money' ? ' on money, the rounds were level' : ''}. I took ${won.join(', ') || 'no single round'}.`;
      else if (d.winner === 'draw') s = `I did not: it was a draw with ${short(other)}, ${d.score[mine]} to ${d.score[ok]}.`;
      else s = `I did not win: ${short(other)} beat me ${d.score[ok]} to ${d.score[mine]}. I was better only on ${won.join(', ') || 'no round'}.`;
    }
  } else if (key === 'weak') {
    const w = [];
    if (m.n < N_FLOOR) w.push(`only ${m.n} trades stand behind me, too few to trust`);
    if (f.m26 && f.mold && f.mold.net !== null && f.mold.net <= 0) w.push(`in 2021-25 I made ${usdS(f.mold.net)} over ${f.mold.n} trades, so I do not hold in both periods`);
    if (m.tpw !== null && tpwDist(m.tpw) > 0) w.push(`I trade ${dec(m.tpw, 1)} times a week, outside the 2 to 4 rule`);
    if (m.f10 !== null && m.p10 !== null && m.f10 > m.p10) w.push(`more of my evals failed (${pct(m.f10)}) than passed (${pct(m.p10)}) within 10 sessions`);
    if (m.pf !== null && m.pf < 1) w.push(`I lose money: PF ${pf(m.pf)}`);
    if (m.dd !== null) w.push(`my worst drop was ${usd(-Math.abs(m.dd))}`);
    if (f.kind === 'run' && !f.mold) w.push('I have no 2021-25 result at all');
    s = w.length ? `My weak spots: ${w.slice(0, 4).join('; ')}.` : 'Nothing weak is stored for me, which only means it was not measured.';
  } else if (key === 'trades') {
    s = `${m.n} trades in ${word}${m.tpw !== null ? `, ${dec(m.tpw, 1)} a week (${tpwDist(m.tpw) === 0 ? 'inside' : 'outside'} the 2 to 4 rule)` : ''}.`;
    if (per === '26' && f.mold) s += ` And ${f.mold.n} trades in 2021-25.`;
    if (m.n < N_FLOOR) s += ` Under ${N_FLOOR} trades is too few to trust.`;
  } else if (key === 'eval') {
    if (m.p10 === null || m.f10 === null) s = 'No eval pass or fail rate is stored for me, so I cannot say. I will not guess.';
    else s = `In the backtest ${pct(m.p10)} of MFFU evals passed within 10 sessions and ${pct(m.f10)} failed${m.dec10 !== null ? `; ${pct(m.dec10)} were decided by then` : ''}${m.pass_med !== null ? `; a pass took ${dec(m.pass_med, 1)} sessions in the middle case` : ''}. Whether the next eval passes, nobody knows.`;
  } else if (key === 'rejected') {
    if (f.kind === 'bot') s = 'I am a live bot, not a run of the Archive, so there is no verdict on me.';
    else if (f.verdict === 1) s = `I was rejected.${f.note ? ` The Archive's note: ${f.note}` : ' The Archive stores no note with the reason.'}`;
    else if (f.verdict === 0) s = 'I was not rejected: I am an adopted run.';
    else s = 'I am still open: neither adopted nor rejected.';
  } else return '';
  return s + ' ' + tail(f);
}
/** after a duel the winner and the loser each say one honest line -> [{ id, who, role, line }] (a, then b) */
export function afterLines(d) {
  if (!d) return [];
  return [['a', d.a, d.b], ['b', d.b, d.a]].map(([k, f, other]) => {
    const ok = k === 'a' ? 'b' : 'a', m = mOf(f, d.period), won = d.rounds.filter((r) => r.winner === k).map((r) => r.name.toLowerCase()), lost = d.rounds.filter((r) => r.winner === ok).map((r) => r.name.toLowerCase());
    const money = m && m.net !== null ? `${usdS(m.net)} over n = ${m.n} trades` : 'no stored dollars';
    const end = d.period === 'live' ? 'a short live record, not a promise.' : 'a backtest, not a promise.';
    const role = !d.period ? 'none' : d.winner === 'draw' ? 'draw' : d.winner === k ? 'winner' : 'loser';
    const line = role === 'none' ? `We could not be compared: no period in common. I have ${money}: ${end}`
      : role === 'draw' ? `Level with ${short(other)} at ${d.score[k]} each. I have ${money}: ${end}`
      : role === 'winner' ? `I won ${d.score[k]} to ${d.score[ok]}, but ${lost.length ? `${short(other)} was better on ${lost.join(' and ')}` : 'one duel proves little'}. ${money}: ${end}`
      : `I lost ${d.score[k]} to ${d.score[ok]}${won.length ? `, though I was better on ${won.join(' and ')}` : ' and was better on no round'}. My record: ${money}: ${end}`;
    return { id: personId(f), who: short(f), role, line };
  });
}
