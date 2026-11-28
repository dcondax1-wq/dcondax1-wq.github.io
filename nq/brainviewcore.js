// STRATEGY BRAIN, the model (day-brains 2026-11-27; owner: "as the creator I want to see everything happening within the brain, each brain
// for each strategy"). Pure ES module (no DOM / fetch / storage): node-tested (tests/test_nq_brainview.py). One model per strategy:
//   lit      LIT (Zlarior): sweep -> depth -> inducement -> displacement -> 5m CISD -> limit -> 1m CISD -> entry -> manage
//   atlas    ATLAS: its routed lobes (EMA / MACD / S/R), each window -> its checks -> armed -> trade
//   blitz    BLITZ (PAPER): band ready -> band break -> paper trade
//   poseidon POSEIDON (order flow, PAPER): levels -> touched -> absorption read -> take / skip -> paper trade
// Sources (the PC's 15-minute post as the page already merged it; nothing made up, a missing field says so):
//   lite.pc.glance / home.live.pc.glance  stage n/10, waiting sentence, levels + distance, room / mll, armed, mode
//   lite.bx      engine/brain_xray (day-brains-feed): every gate's number vs the rule, the newest setups + why, the next trade's size
//   lite.glog    the thought stream (8 lines a bot); lite.bf the Brain feed (think / next / levels) when it rode the post
//   lite.ofp     POSEIDON's paper bot (levels + absorption read, decisions, open / taken / R)
//   lite.ab      ATLAS account B's skips today (why); lite.ar on / armed per bot; lite.t / lite.pc the post's and the PC's age
// API: brain(s, src, nowS) -> { s, name, what, mode, has, on, armed, stage, flow[], now{}, levels[], thoughts[], skipped[], risk[], health[], notes[] }
//      STRATS (ids + names), ageWords(s)
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 240);
const usd = (v) => (num(v) === null ? '-' : `${num(v) < 0 ? '-' : ''}$${Math.round(Math.abs(num(v))).toLocaleString('en-US')}`);
const pxs = (v) => (num(v) === null ? '-' : num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pts = (v) => (num(v) === null ? '' : `${Math.round(Math.abs(num(v)) * 100) / 100} pts`);
const MNQ = 2;
export const STRATS = [
  { s: 'lit', name: 'LIT', what: 'Liquidity sweeps: a level is swept, trapped traders, a strong move back, then a 5-minute change of state.', bot: 'lit', paper: false },
  { s: 'atlas', name: 'ATLAS', what: 'Three lobes: EMA trend pullback (London), MACD sweep divergence, S/R day-level reclaim (NY). Each 1 trade a day.', bot: 'atlas', paper: false },
  { s: 'blitz', name: 'BLITZ', what: "The opening-range band break. PAPER only: it never trades an account.", bot: 'blitz', paper: true },
  { s: 'poseidon', name: 'POSEIDON', what: 'Order flow: at a key level, does the tape absorb the push (a trap) or let it run? PAPER bot while it learns.', bot: 'of', paper: true },
];
export function ageWords(s) { const n = num(s); if (n === null) return 'age unknown'; if (n < 90) return 'just now'; if (n < 3600) return `${Math.round(n / 60)} min ago`; if (n < 172800) return `${Math.round(n / 3600)} h ago`; return `${Math.round(n / 86400)} days ago`; }
const lvOfAge = (s, warn, bad) => (num(s) === null ? 'bad' : s > bad ? 'bad' : s > warn ? 'warn' : 'ok');
function glanceOf(src) {
  const H = isObj(src) && isObj(src.home) ? src.home : {}, L = isObj(src) && isObj(src.lite) ? src.lite : {};
  const g = (isObj(H.live) && isObj(H.live.pc) && isObj(H.live.pc.glance) && H.live.pc.glance) || (isObj(L.pc) && isObj(L.pc.glance) && L.pc.glance) || (isObj(L.glance) && L.glance) || null;
  return g;
}
const botOf = (g, id) => arr(g && g.bots).find((b) => isObj(b) && b.id === id) || null;
export function stageN(t) { const m = /\((\d{1,2})\/10\)/.exec(String(t || '')); return m ? Math.max(1, Math.min(10, +m[1])) : null; }
const STAGE_KEY = { levels: 1, sweep: 2, inducement: 3, displacement: 4, cisd5: 5, limit: 6, cisd1m: 7, entry: 8, trade: 9, done: 10 };

// ------------------------------------------------------------------------------------------------ shared parts
function thoughtsOf(lite, bot) {
  const gl = isObj(lite) && isObj(lite.glog) ? arr(lite.glog[bot]) : [];
  const rows = gl.filter((x) => Array.isArray(x)).map(([hm, t]) => ({ hm: str(hm, 5), text: str(t, 220) })).reverse();   // oldest first
  return rows.map((r) => ({ ...r, tone: /✗|needs|reject|skip|no -/i.test(r.text) ? 'bad' : /✓|deep enough|armed|entered|filled|target/i.test(r.text) ? 'good' : 'calm' }));
}
function healthOf(lite, nowS, botId, extra) {
  const L = isObj(lite) ? lite : {}, pc = isObj(L.pc) ? L.pc : {}, h = [];
  const postAge = num(L.t) !== null && num(nowS) !== null ? nowS - num(L.t) : null;
  h.push({ k: 'PC report', v: postAge === null ? 'none on this page' : ageWords(postAge), lv: lvOfAge(postAge, 20 * 60, 60 * 60) });
  if (pc.running !== undefined) h.push({ k: 'Bot program', v: pc.running ? 'running' : 'not running', lv: pc.running ? 'ok' : 'bad' });
  if (pc.silent) h.push({ k: 'Silent', v: 'the PC went quiet', lv: 'bad' });
  const ar = isObj(L.ar) && Array.isArray(L.ar[botId]) ? L.ar[botId] : null;
  if (ar) h.push({ k: 'On / armed', v: `${ar[0] ? 'on' : 'off'} · ${ar[1] ? 'armed' : 'not armed'}`, lv: ar[0] && ar[1] ? 'ok' : 'warn' });
  for (const x of arr(extra)) h.push(x);
  return h;
}
const SKIP_WHY = { depth: 'the sweep was too shallow', disp: 'the move back was too weak', idm: 'no inducement (no trap move first)', window: 'outside its entry hours',
  stop: 'the stop size was outside its range', target: 'not enough room to the target', day: 'a trade already filled today', monday: "Monday's side rule", cisd: 'no 5-minute change of state' };

// ------------------------------------------------------------------------------------------------ LIT
function litBrain(src, nowS) {
  const L = isObj(src.lite) ? src.lite : {}, g = glanceOf(src), gb = botOf(g, 'lit'), X = isObj(L.bx) && isObj(L.bx.lit) ? L.bx.lit : null, notes = [];
  const R = X && Array.isArray(X.r) ? X.r : [0.5, 0.8, 1.5], atr = X ? num(X.a) : null;
  const n = stageN(gb && gb.stage) || (X && STAGE_KEY[X.st]) || null;
  const S = X ? arr(X.s).filter((s) => Array.isArray(s) && s.length >= 5) : [];
  const last = S.length ? S[S.length - 1] : null;
  const chk = (k) => (last ? arr(last[4]).find((c) => Array.isArray(c) && c[0] === k) : null);
  // a setup paints the pipeline green / red only while it is the news (within 30 minutes of the brain's numbers); an older one stays in "skipped"
  const hmM = (hm) => { const m = /^(\d\d):(\d\d)$/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : null; };
  let bxM = null; try { bxM = X && num(L.bx.t) ? hmM(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(num(L.bx.t) * 1000))) : null; } catch (_) { bxM = null; }
  const lm = last ? hmM(last[0]) : null, fresh = lm !== null && bxM !== null && Math.min(Math.abs(bxM - lm), 1440 - Math.abs(bxM - lm)) <= 30;
  const W = X ? arr(X.w).filter((w) => Array.isArray(w)) : [];
  const fw = W.slice().sort((a, b) => (STAGE_KEY[b[1]] || 0) - (STAGE_KEY[a[1]] || 0))[0] || null;   // the forming side furthest along
  const node = (k, key, label, rule, fromCheck, fromForm) => {
    let state = n === null ? 'wait' : k < n ? 'pass' : k === n ? 'now' : 'wait', value = '', src2 = '';
    const c = fromCheck ? chk(fromCheck) : null;
    if (fromForm && fw && num(fw[fromForm]) !== null) { value = `${num(fw[fromForm]).toFixed(2)} ATR`; src2 = `forming ${fw[0] === 'L' ? 'long' : 'short'}`; }
    if (c && last && fresh && (last[2] === 'rejected' || last[2] === 'blocked')) {
      state = c[1] ? 'pass' : 'fail'; value = c[2] || value; src2 = `${last[0]} ${last[1] === 'L' ? 'long' : 'short'} setup`;
    } else if (c && !value && fresh) { value = c[2]; src2 = `${last[0]} setup`; }
    return { k, key, label, rule, value, from: src2, state };
  };
  const flow = [
    node(1, 'levels', 'Levels', 'the day\'s liquidity map', null, null),
    node(2, 'sweep', 'Sweep', `depth >= ${R[0]} ATR${atr ? ` (${(R[0] * atr).toFixed(1)} pts)` : ''}`, 'depth', 2),
    node(3, 'inducement', 'Inducement', 'a smaller swing taken first (within 1 ATR)', 'idm', null),
    node(4, 'displacement', 'Displacement', `body >= ${R[1]} ATR${atr ? ` (${(R[1] * atr).toFixed(1)} pts)` : ''}`, 'disp', 3),
    node(5, 'cisd5', '5m CISD', 'a 5-minute close back through the run\'s open', null, null),
    node(6, 'limit', 'Limit + risk', `stop 8-80 pts, target >= ${R[2]}R`, 'stop', null),
    node(7, 'cisd1m', '1m CISD', 'a 1-minute confirmation within 20 bars', null, null),
    node(8, 'entry', 'Entry', 'next 1-minute open, stop 1 tick past the sweep', null, null),
    node(9, 'trade', 'Manage', 'break-even at +1R, VIX-band target, flat 15:55', null, null),
  ];
  const tg = fresh ? chk('target') : null; if (tg) { const f6 = flow[5]; f6.value = [f6.value, tg[2]].filter(Boolean).join(' · '); if (!tg[1] && f6.state === 'pass') f6.state = 'fail'; }
  if (last && !fresh && (last[2] === 'rejected' || last[2] === 'blocked')) notes.push(`The last setup (${last[0]} ${last[1] === 'L' ? 'long' : 'short'}) was ${last[2]}: see Skipped today. The pipeline shows where LIT is now.`);
  if (n === 10) for (const f of flow) if (f.state !== 'fail') f.state = f.state === 'wait' ? 'off' : f.state;
  if (!X) notes.push('The PC has not sent the gate numbers yet (the "bx" block of the day-brains-feed update): stages from its glance only.');
  // what would trigger a trade now
  const wait = str(gb && gb.wait, 260);
  const nowL = n === 10 ? { line: 'Done for today: one trade a day, or the entry window (02:00-15:30 ET) is over.', detail: [] }
    : { line: wait || (fw ? `Forming a ${fw[0] === 'L' ? 'long' : 'short'}: ${fw[1]}` : 'No forming setup reported.'),
      detail: [atr ? `A sweep must go ${R[0]} ATR = ${(R[0] * atr).toFixed(1)} pts past a level; the move back needs a body of ${R[1]} ATR = ${(R[1] * atr).toFixed(1)} pts.` : '',
        ...W.map((w) => `${w[0] === 'L' ? 'Long' : 'Short'} side: ${w[1] || 'nothing'}${num(w[2]) !== null ? `, sweep ${num(w[2]).toFixed(2)} ATR` : ''}${num(w[3]) !== null ? `, move back ${num(w[3]).toFixed(2)} ATR` : ''}${w[4] ? '' : ' (not allowed today)'}`)].filter(Boolean) };
  const px = gb ? num(gb.px) : X ? num(X.p) : null;
  const levels = arr(gb && gb.lv).filter((x) => Array.isArray(x) && num(x[1]) !== null).slice(0, 10).map(([nm, p, d]) => {
    const dist = num(d) !== null ? num(d) : px !== null ? num(p) - px : null;
    return { name: str(nm, 40), px: num(p), dist, side: dist === null ? '' : dist > 0 ? 'above' : 'below', text: dist === null ? '' : `${pts(dist)} ${dist > 0 ? 'above' : 'below'} · ${usd(Math.abs(dist) * MNQ)} a micro` };
  });
  if (!levels.length) notes.push('No levels in the PC\'s glance this post.');
  const skipped = S.filter((s) => s[2] !== 'filled' && s[2] !== 'armed' && s[2] !== 'tapped' && s[2] !== 'entering').map((s) => {
    const c = arr(s[4]).find((x) => Array.isArray(x) && x[0] === s[3]);
    return { hm: s[0], side: s[1] === 'L' ? 'LONG' : 'SHORT', status: s[2], why: `${SKIP_WHY[s[3]] || s[3] || s[2]}${c && c[2] ? `: ${c[2]}` : ''}` };
  });
  const sz = X && Array.isArray(X.sz) ? X.sz : null, risk = [];
  if (sz) {
    risk.push({ k: 'Next trade', v: `${sz[0] ?? '-'} micro${sz[0] === 1 ? '' : 's'}`, sub: str(sz[4], 120) });
    risk.push({ k: '$ at risk', v: usd(sz[1]), sub: num(sz[2]) !== null ? `${pts(sz[2])} stop x $2 x ${sz[0]}` : '' });
    risk.push({ k: '$ at target', v: usd(sz[3]), sub: '' });
  } else notes.push('The size of the next trade is not in this post.');
  if (gb && num(gb.room) !== null) risk.push({ k: 'Room left', v: usd(gb.room), sub: num(gb.mll) !== null ? `of ${usd(gb.mll)} before the account fails` : '' });
  const nS = X && Array.isArray(X.n) ? X.n : null;
  const health = healthOf(L, nowS, 'lit', [X && X.gd ? { k: 'Blocked by', v: str(X.gd, 90), lv: 'warn' } : null, X && num(L.bx.t) !== null && num(nowS) !== null ? { k: 'Brain numbers', v: ageWords(nowS - num(L.bx.t)), lv: lvOfAge(nowS - num(L.bx.t), 45 * 60, 2 * 3600) } : null].filter(Boolean));
  return { has: !!(gb || X), on: gb ? gb.on !== false : null, armed: gb ? !!gb.armed : null, mode: gb ? str(gb.mode, 20) : '', stage: str(gb && gb.stage, 40) || (X ? X.st : ''),
    flow, now: nowL, levels, thoughts: thoughtsOf(L, 'lit'), skipped, skippedN: nS ? `${nS[0] ?? 0} setups today, ${nS[1] ?? 0} blocked` : '', risk, health, notes };
}

// ------------------------------------------------------------------------------------------------ ATLAS
function atlasBrain(src, nowS) {
  const L = isObj(src.lite) ? src.lite : {}, g = glanceOf(src), gb = botOf(g, 'atlas'), X = isObj(L.bx) && isObj(L.bx.atlas) ? L.bx.atlas : null, notes = [];
  const lobes = X ? arr(X.l).filter((l) => Array.isArray(l)) : [];
  const flow = [];
  const ORDER = ['window', 'signal', 'armed', 'trade', 'done'];
  for (const l of lobes) {
    const st = String(l[1] || '').toLowerCase(), i = ORDER.indexOf(st);
    flow.push({ k: flow.length + 1, key: `${l[0]}:window`, label: `${l[0]} · window`, rule: 'its own entry hours', value: '', state: i < 0 ? 'wait' : i > 0 ? 'pass' : 'now', lobe: l[0] });
    for (const c of arr(l[3]).filter((c) => Array.isArray(c))) {
      flow.push({ k: flow.length + 1, key: `${l[0]}:${c[0]}`, label: `${l[0]} · ${str(c[0], 40)}`, rule: c[3] != null ? `needs ${c[3]}` : '', value: c[2] != null ? str(c[2], 30) : '', state: c[1] ? 'pass' : (i >= 2 ? 'pass' : 'fail'), lobe: l[0] });
    }
    flow.push({ k: flow.length + 1, key: `${l[0]}:armed`, label: `${l[0]} · armed`, rule: 'entry, stop, target known', value: l[4] ? `${String(l[4][0]).toUpperCase()} ${pxs(l[4][1])}` : '', state: i >= 2 ? (i === 2 ? 'now' : 'pass') : 'wait', lobe: l[0] });
    flow.push({ k: flow.length + 1, key: `${l[0]}:trade`, label: `${l[0]} · trade`, rule: 'stop past the wick, VIX-band target', value: '', state: i === 3 ? 'now' : i === 4 ? 'pass' : 'wait', lobe: l[0] });
  }
  if (!X) notes.push('The PC has not sent the lobes\' checks yet (the "bx" block of the day-brains-feed update).');
  const armed = lobes.find((l) => Array.isArray(l[4]));
  const nowL = { line: armed ? `${armed[0]} is armed: ${String(armed[4][0]).toUpperCase()} at ${pxs(armed[4][1])}, stop ${pxs(armed[4][2])}, target ${pxs(armed[4][3])}.` : str(gb && gb.wait, 260) || 'No lobe reported.',
    detail: lobes.map((l) => `${l[0]}: ${l[1] || '?'}${l[2] ? ` · first failing: ${str(l[2], 80)}` : ''}`) };
  const ab = isObj(L.ab) ? L.ab : null;
  const skipped = arr(ab && ab.h).filter((h) => Array.isArray(h)).map((h) => {
    const t = num(h[0]); let hm = '';
    try { hm = t ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t * 1000)) : ''; } catch (_) { hm = ''; }
    return { hm, side: str(h[1], 14), status: 'skipped', why: str(h[2], 90) };
  });
  const risk = [];
  if (armed) risk.push({ k: 'Armed plan', v: `${armed[4][5] ?? '-'} micros`, sub: `${usd(armed[4][4])} at risk` });
  if (gb && num(gb.dll) !== null) risk.push({ k: 'Daily loss limit', v: usd(gb.dll), sub: `${usd(gb.dll_used || 0)} used today` });
  if (gb && num(gb.room) !== null) risk.push({ k: 'Room left', v: usd(gb.room), sub: num(gb.mll) !== null ? `of ${usd(gb.mll)}` : '' });
  return { has: !!(gb || X), on: gb ? gb.on !== false : null, armed: gb ? !!gb.armed : null, mode: gb && /live/i.test(String(gb.mode)) ? 'LIVE' : gb ? 'LIVE' : '', stage: lobes.map((l) => `${l[0]} ${l[1]}`).join(' · '),
    flow, now: nowL, levels: [], thoughts: thoughtsOf(L, 'atlas'), skipped, skippedN: ab ? `${ab.hn || 0} skipped today on its account` : '', risk,
    health: healthOf(L, nowS, 'atlas', ab && ab.o ? [{ k: 'Account B', v: 'a position is open', lv: 'warn' }] : []), notes };
}

// ------------------------------------------------------------------------------------------------ BLITZ (paper)
function blitzBrain(src, nowS) {
  const L = isObj(src.lite) ? src.lite : {}, X = isObj(L.bx) && isObj(L.bx.blitz) ? L.bx.blitz : null, bf = isObj(L.bf) && isObj(L.bf.bots) && isObj(L.bf.bots.blitz) ? L.bf.bots.blitz : null, notes = [];
  const sg = X ? arr(X.sg).filter((x) => Array.isArray(x)) : [];
  const st = X ? str(X.st, 200) : '';
  const flow = [
    { k: 1, key: 'band', label: 'Opening band', rule: 'the first range of the day sets the band', value: X && X.ok === false ? 'day filter: no' : X && X.ok ? 'ready' : '', state: X ? (X.ok === false ? 'fail' : X.ok ? 'pass' : 'wait') : 'wait' },
    { k: 2, key: 'break', label: 'Band break', rule: 'a close outside the band', value: sg.length ? `${sg.length} today` : '', state: sg.length ? 'pass' : X && X.ok ? 'now' : 'wait' },
    { k: 3, key: 'trade', label: 'Paper trade', rule: 'never routed to an account', value: /open|in trade/i.test(st) ? 'open' : '', state: /open|in trade/i.test(st) ? 'now' : 'wait' },
  ];
  if (!X && !bf) notes.push('BLITZ is hidden and paper: the PC sends its state only in the "bx" / Brain-feed blocks, and neither rode this post.');
  const think = bf ? arr(bf.think).map((t) => ({ hm: '', text: str(t, 200), tone: 'calm' })) : [];
  return { has: !!(X || bf), on: null, armed: false, mode: 'PAPER', stage: st, flow, now: { line: st || (bf && bf.next && bf.next.waiting_for) || 'No state reported.', detail: sg.map((x) => `${x[0]} ${String(x[1]).toUpperCase()}: ${x[2]}`) },
    levels: arr(bf && bf.levels).filter(isObj).map((l) => ({ name: str(l.label || l.k, 30), px: num(l.px), dist: null, side: '', text: '' })), thoughts: [...thoughtsOf(L, 'blitz'), ...think], skipped: [], skippedN: '', risk: [{ k: 'Money', v: 'PAPER', sub: 'BLITZ never trades an account' }],
    health: healthOf(L, nowS, 'blitz', []), notes };
}

// ------------------------------------------------------------------------------------------------ POSEIDON (order flow, paper)
const READ = { a: 'absorbed (a trap: fade it)', n: 'not absorbed (it ran)', u: 'not touched yet' };
function poseidonBrain(src, nowS) {
  const L = isObj(src.lite) ? src.lite : {}, O = isObj(L.ofp) ? L.ofp : null, bf = isObj(L.bf) && isObj(L.bf.bots) && isObj(L.bf.bots.of) ? L.bf.bots.of : null, notes = [];
  const lv = O ? arr(O.lv).filter((x) => Array.isArray(x)) : [], lb = O ? arr(O.lb).filter((x) => Array.isArray(x)) : [];
  const touched = lv.filter((x) => x[2] !== 'u'), absorbed = lv.filter((x) => x[2] === 'a'), taken = lb.filter((x) => x[1] === 'take');
  const flow = [
    { k: 1, key: 'levels', label: 'Levels', rule: 'the key levels of the day', value: lv.length ? `${lv.length} watched` : '', state: lv.length ? 'pass' : 'wait' },
    { k: 2, key: 'touch', label: 'Touched', rule: 'price reaches a level', value: lv.length ? `${touched.length} of ${lv.length}` : '', state: touched.length ? 'pass' : lv.length ? 'now' : 'wait' },
    { k: 3, key: 'read', label: 'Absorption read', rule: 'the tape at the level: absorbed or ran', value: touched.length ? `${absorbed.length} absorbed` : '', state: absorbed.length ? 'pass' : touched.length ? 'fail' : 'wait' },
    { k: 4, key: 'decide', label: 'Take / skip', rule: 'take only an absorbed push', value: lb.length ? `${taken.length} taken, ${lb.length - taken.length} skipped` : '', state: taken.length ? 'pass' : lb.length ? 'fail' : 'wait' },
    { k: 5, key: 'trade', label: 'Paper trade', rule: 'PAPER: never an account', value: O && num(O.R) !== null ? `${num(O.R) >= 0 ? '+' : ''}${num(O.R).toFixed(2)}R today` : '', state: O && O.o ? 'now' : O && num(O.n) ? 'pass' : 'wait' },
  ];
  if (!O) notes.push('POSEIDON\'s paper bot posted nothing for today (the "ofp" block: no paper day yet, or the recorder is off).');
  return { has: !!(O || bf), on: null, armed: false, mode: 'PAPER', stage: O ? str(O.ln, 160) : '',
    flow, now: { line: O && O.ln ? str(O.ln, 200) : (bf && bf.next && bf.next.waiting_for) ? str(bf.next.waiting_for, 200) : 'Nothing reported.', detail: [] },
    levels: lv.map((x) => ({ name: str(x[0], 12), px: num(x[1]), dist: null, side: '', text: READ[x[2]] || '' })),
    thoughts: [...thoughtsOf(L, 'of'), ...(bf ? arr(bf.think).map((t) => ({ hm: '', text: str(t, 200), tone: 'calm' })) : [])],
    skipped: lb.filter((x) => x[1] !== 'take').map((x) => ({ hm: str(x[0], 5), side: '', status: str(x[1], 10), why: x[1] === 'skip' ? 'the push was not absorbed' : str(x[1], 40) })),
    skippedN: lb.length ? `${lb.length} LIT-level reads today` : '', risk: [{ k: 'Money', v: 'PAPER', sub: 'POSEIDON learns on paper; no account' }, ...(O && num(O.n) !== null ? [{ k: 'Paper trades', v: String(O.n), sub: O.o ? 'one open' : '' }] : [])],
    health: healthOf(L, nowS, 'of', []), notes };
}

export function brain(s, src, nowS) {
  const meta = STRATS.find((x) => x.s === s);
  if (!meta) return { s, name: String(s || '?'), has: false, notes: [`No strategy called "${str(s, 20)}".`], flow: [], now: { line: '', detail: [] }, levels: [], thoughts: [], skipped: [], risk: [], health: [] };
  const S = isObj(src) ? src : {};
  let m;
  try { m = s === 'lit' ? litBrain(S, nowS) : s === 'atlas' ? atlasBrain(S, nowS) : s === 'blitz' ? blitzBrain(S, nowS) : poseidonBrain(S, nowS); }
  catch (_) { m = { has: false, flow: [], now: { line: '', detail: [] }, levels: [], thoughts: [], skipped: [], risk: [], health: [], notes: ['This brain could not be read from the post.'] }; }
  if (!isObj(S.lite)) m.notes = ['No PC report on this page yet: nothing to show, nothing made up.', ...(m.notes || [])];
  const passN = m.flow.filter((f) => f.state === 'pass').length, failN = m.flow.filter((f) => f.state === 'fail').length;
  return { s, name: meta.name, what: meta.what, paper: meta.paper, ...m, mode: m.mode || (meta.paper ? 'PAPER' : ''), summary: `${passN} gate${passN === 1 ? '' : 's'} passed${failN ? `, ${failN} failed` : ''}` };
}
