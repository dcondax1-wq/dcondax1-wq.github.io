// NQ BOT BRAIN, the model (day-nqdash3 2026-11-21; owner Fri 19:50 ET: "a brain for each bot ... describes everything that's going on: the steps
// in order for a trade, and tons more", research/handoff/2026-11-21/brain3d/SPEC.md). Pure (node-tested: tests/test_nq_brain.py): everything the
// Brain tab (nq/brain.html) and the 3D brain (DESIGN's olympus/brain3d.js) show, from what the PC already posts:
//   pc.glance bots (stage n/10, wait, why, lv, arm, log, day, room, mll, armed, mode) + board / mf / at / life / zl + the site's brief.json,
//   news_week.json, edge.json, trades.json, business/accounts.json + goals.json. Nothing made up: what the PC does not send says so
//   (and is listed in research/handoff/2026-11-20/nqdash3/LEAD_WIRES.md O as a PC-side addition).
//   brain(bot, src, nowS) -> { bot, name, what, mode, on, armed, steps[], current, regions[], thoughts[], watch[], memory, grade, plan, risk[],
//                              accounts[], payout, health[], replay, cards{} }
// LIT's ten stages and their words are engine/brain.py STAGES (the bot's own brain); ATLAS is three lobes (EMA, MACD, S/R) and a shared risk gate.
import { etParts, updated, ageLevel, accounts as deskAccounts, feedAge } from './nqdesk.js?v=8';
import { goals as goalTiles, clock } from './nqgoals.js?v=10';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n || 240);
const usd = (v, sign) => { const n = num(v); if (n === null) return '-'; const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); return n < 0 && Math.round(n) ? '-' + a : (sign && Math.round(n) > 0 ? '+' + a : a); };
const pts = (v) => (num(v) === null ? '' : `${Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 2 })} pts`);
const MNQ = 2;                                  // $ per point per micro (MNQ)

// engine/brain.py STAGES: (key, label, what it means). The glance says e.g. "5m CISD (5/10)".
export const LIT_STAGES = [
  ['levels', 'Levels', 'The map: every liquidity level LIT watches today (session boxes, previous day / week / month highs and lows, opening gaps, equal highs / lows).'],
  ['sweep', 'Sweep', 'Price trades through a level (takes the stops resting there) by at least 0.5 ATR.'],
  ['inducement', 'Inducement', 'Before the sweep, a smaller swing near the level was taken first: early traders trapped (within 1 ATR of the level, at most 36 bars old).'],
  ['displacement', 'Displacement', 'A strong candle back the other way: body at least 0.8 ATR.'],
  ['cisd5', '5m CISD', 'Change in state of delivery: a 5-minute close back through the open of the last run of candles into the sweep extreme. This is the setup.'],
  ['limit', 'Limit armed', 'A limit order at the CISD level, valid 30 minutes (6 bars of 5m).'],
  ['cisd1m', '1m CISD wait', 'Once the limit is tapped, the bot waits up to 20 one-minute bars for a 1-minute CISD to confirm.'],
  ['entry', 'Entry', 'Entry at the next 1-minute open, routed about 3 s after the 1m CISD close. Stop 1 tick beyond the sweep extreme, size follows the stop.'],
  ['trade', 'In trade', 'Managing: breakeven at +1R, the 15-minute check, the VIX-band target (banked at 8R), flat at 15:55.'],
  ['done', 'Done for today', 'One trade a day, or the 02:00-15:30 entry window is over.'],
];
// ATLAS: three lobes (each its own hours, 1 trade a day each) + their steps; the words are the brief's (tools/premarket_brief.py) where it has them
export const ATLAS_LOBES = [
  { id: 'ema', name: 'EMA', brief: 'atlas_ema' }, { id: 'macd', name: 'MACD', brief: 'atlas_macd' }, { id: 'sr', name: 'S/R', brief: 'atlas_sr' },
];
export const ATLAS_STEPS = [
  ['window', 'Window', 'Its entry hours are open (each lobe has its own).'],
  ['signal', 'Signal', 'EMA: a trend pullback that sweeps a swing; MACD: a LIT level swept with MACD divergence; S/R: a day level swept after an inducement.'],
  ['armed', 'Armed', 'The setup is armed: entry, stop and target are known; it waits for the 5m close / trigger.'],
  ['trade', 'In trade', 'Managing the position: stop past the sweep wick, the VIX-band target, breakeven + costs at 1R.'],
  ['done', 'Done for today', 'This lobe took its trade today (1 a day), or its hours are over.'],
];

/** "5m CISD (5/10)" -> 5 (1..10), or the label's position; null when the glance has no stage */
export function stageN(stageText) {
  const s = String(stageText || ''), m = /\((\d{1,2})\/10\)/.exec(s);
  if (m) return Math.max(1, Math.min(10, +m[1]));
  const lab = s.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
  const i = LIT_STAGES.findIndex((x) => x[1].toLowerCase() === lab || x[0] === lab);
  return i >= 0 ? i + 1 : null;
}
/** an ATLAS lobe's words from the glance ("EMA: Done for today ...; MACD: Armed (short): ...") -> { state, text } */
export function lobeState(glanceBot, lobe) {
  const g = isObj(glanceBot) ? glanceBot : {}, all = `${g.wait || ''} · ${g.why || ''}`;
  const rx = new RegExp(`(?:^|[;·]\\s*)${lobe.name.replace('/', '\\/')}:\\s*([^;·]+)`, 'i'), m = rx.exec(all);
  const t = m ? m[1].trim().replace(/…$/, '') : '';
  const state = !t ? 'unknown' : /done for today/i.test(t) ? 'done' : /in (a )?trade|managing/i.test(t) ? 'trade' : /armed/i.test(t) ? 'armed'
    : /waiting|watch|no setup|before|outside/i.test(t) ? 'window' : 'signal';
  return { state, text: t };
}

const STATE_WORD = { done: 'passed', now: 'now', wait: 'waiting', blocked: 'blocked', off: 'off' };
/** the ordered steps of one bot with a state each: done | now | wait | blocked | off */
export function steps(bot, g, nowS, pcStopped) {
  if (bot === 'lit') {
    const n = stageN(g && g.stage), off = !g || g.on === false || pcStopped;
    return LIT_STAGES.map(([key, label, help], i) => {
      const k = i + 1;
      let state = n === null ? 'wait' : k < n ? 'done' : k === n ? 'now' : 'wait';
      if (off) state = k < (n || 1) ? 'done' : 'off';
      if (n === 10) state = 'done';
      return { n: k, key, label, help, state, word: STATE_WORD[state] };
    });
  }
  // ATLAS: the lobes in order, each with its furthest step
  const out = [];
  for (const L of ATLAS_LOBES) {
    const st = lobeState(g, L), idx = ATLAS_STEPS.findIndex((x) => x[0] === st.state);
    ATLAS_STEPS.forEach(([key, label, help], i) => {
      let state = idx < 0 ? 'wait' : i < idx ? 'done' : i === idx ? (st.state === 'done' ? 'done' : 'now') : 'wait';
      if (pcStopped || (g && g.on === false)) state = i < Math.max(0, idx) ? 'done' : 'off';
      out.push({ n: out.length + 1, lobe: L.id, lobeName: L.name, key: `${L.id}:${key}`, label: `${L.name} · ${label}`, help, state, word: STATE_WORD[state], text: i === idx ? st.text : '' });
    });
  }
  return out;
}

/** the levels it watches, with distance in points and $ per micro, and what a touch would mean */
export function watch(g, bot, last) {
  return arr(g && g.lv).filter((x) => Array.isArray(x) && num(x[1]) !== null).slice(0, 12).map(([name, px, dist]) => {
    const d = num(dist) !== null ? num(dist) : num(last) !== null ? Math.abs(num(px) - num(last)) : null;
    const above = num(last) !== null ? num(px) > num(last) : /high|pdh|pwh|hi\b/i.test(String(name));
    return { name: str(name, 60), px: num(px), dist: d, distText: d === null ? 'distance unknown' : `${pts(d)} (${usd(d * MNQ)} a micro)`,
      side: above ? 'above' : 'below',
      ifTouch: bot === 'lit' ? `If NQ sweeps ${num(px).toLocaleString('en-US', { minimumFractionDigits: 2 })} by 0.5 ATR, I look for a ${above ? 'short' : 'long'} (inducement, then a 5m CISD back through it).`
        : `A sweep of ${str(name, 40)} is what the S/R and MACD lobes wait for: then a 5m close back ${above ? 'down' : 'up'}.` };
  });
}

/** today's / recent trades of the bot (the PC's "at" rows + the trade file's live rows), newest first, with the streak */
export function memory(bot, lite, file, edge, zl) {
  const ids = bot === 'lit' ? ['mffu50k_eval', 'lit', 'b25k_2'] : ['atlas', 'acct_b'], out = [], seen = new Set();
  for (const a of arr(isObj(lite) && isObj(lite.at) ? lite.at.a : null)) if (isObj(a) && ids.includes(String(a.id))) {
    for (const r of arr(a.tr)) if (Array.isArray(r) && num(r[1]) !== null) {
      const id = `${etParts(num(r[0])).day}:${Math.round(Math.abs(num(r[8]) || 0))}`; if (seen.has(id)) continue; seen.add(id);
      out.push({ t: num(r[0]), xt: num(r[1]), side: num(r[2]) < 0 ? 'SHORT' : 'LONG', usd: num(r[8]), r: num(r[9]), how: str(r[7], 20), day: etParts(num(r[0])).day });
    }
  }
  const BOT = bot === 'lit' ? 'LIT' : 'ATLAS';
  for (const t of arr(isObj(file) ? file.trades : null)) if (isObj(t) && t.src === 'live' && t.bot === BOT) {
    const xt = num(t.xt) || num(t.t), id = `${str(t.day, 10)}:${Math.round(Math.abs(num(t.usd) || 0))}`; if (seen.has(id)) continue; seen.add(id);   // one trade, two sources (minutes and cents differ)
    out.push({ t: num(t.t), xt, side: String(t.side || ''), usd: num(t.usd), r: num(t.r), how: str(t.k, 20), day: str(t.day, 10) });
  }
  out.sort((a, b) => (b.xt || 0) - (a.xt || 0));
  const last = out.slice(0, 10);
  let streak = 0, sk = '';
  for (const r of last) { const w = (r.usd || 0) > 0.5 ? 'W' : (r.usd || 0) < -0.5 ? 'L' : 'B'; if (!sk) sk = w; if (w === sk) streak += 1; else break; }
  const e = isObj(edge) && isObj(edge.bots) ? edge.bots[bot === 'lit' ? 'lit' : 'atlas'] : null;
  const learn = isObj(zl) && zl.s ? (String(zl.s).split('·').map((x) => x.trim()).find((x) => x.toLowerCase().startsWith(bot === 'lit' ? 'zlarior' : 'atlas')) || '') : '';
  return { last, streak: sk ? { kind: sk, n: streak, text: `${streak} ${sk === 'W' ? 'win' : sk === 'L' ? 'loss' : 'flat'}${streak === 1 ? '' : sk === 'L' ? 'es' : 's'} in a row` } : null,
    edge: e ? { light: str(e.light, 10), pf: num(e.pf), win: num(e.win), n: num(e.n), sessions: num(e.sessions), text: `Edge ${str(e.light, 10)}: PF ${num(e.pf)} over the last ${num(e.sessions)} sessions (${num(e.n)} trades, backtest of the live settings)` } : null,
    learn: learn ? `Last night's scorecard (${str(zl.d, 10)}): ${learn}` : '' };
}

/** the setup grade: the armed setups as the PC posts them (the engine's setup grade itself is not posted yet: LEAD_WIRES O) */
export function grade(g) {
  const arms = arr(g && g.arm).filter(isObj).map((a) => ({ side: str(a.side, 6), text: str(a.text, 160), trig: str(a.trig, 200) }));
  return { arms, grade: null, gradeText: 'Setup grade (A-D): not sent by the PC yet', armed: !!(g && g.armed) };
}

/** plan for today: the bot's windows (the brief), today's news, early close, the next window countdown */
export function plan(bot, brief, news, nowS) {
  const p = etParts(nowS), mod = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3);
  const legs = arr(isObj(brief) ? brief.bots : null).filter((x) => isObj(x) && (bot === 'lit' ? x.id === 'lit' : String(x.id).startsWith('atlas')));
  const toM = (s) => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
  const wins = [];
  for (const l of legs) for (const w of arr(l.windows)) if (isObj(w) && toM(w.from) !== null) wins.push({ who: str(l.name, 40), from: w.from, to: w.to, fm: toM(w.from), tm: toM(w.to) });
  if (!wins.length) wins.push(bot === 'lit' ? { who: 'Zlarior (LIT)', from: '02:00', to: '15:30', fm: 120, tm: 930 } : { who: 'ATLAS', from: '02:00', to: '12:00', fm: 120, tm: 720 });
  const weekend = p.wd === 'Sat' || (p.wd === 'Sun' && mod < 1080);
  for (const w of wins) w.state = weekend ? 'closed' : mod >= w.fm && mod < w.tm ? 'open' : mod < w.fm ? 'later' : 'over';
  const nx = wins.filter((w) => w.state === 'later').sort((a, b) => a.fm - b.fm)[0];
  const today = p.day, ev = arr(isObj(news) ? news.events : null).filter((e) => isObj(e) && e.date === today);
  const early = isObj(brief) && brief.early_close ? `Early close today: ${str(brief.early_close, 80)}` : '';
  return { windows: wins, open: wins.some((w) => w.state === 'open'), next: nx ? { who: nx.who, at: nx.from, inMin: nx.fm - mod } : null,
    countdown: weekend ? 'Weekend: the next window is Monday' : nx ? `${nx.who} opens at ${nx.from} ET (in ${nx.fm - mod >= 60 ? Math.floor((nx.fm - mod) / 60) + ' h ' : ''}${(nx.fm - mod) % 60} min)` : wins.some((w) => w.state === 'open') ? 'A window is open now' : 'Today\'s windows are over',
    news: ev.map((e) => ({ time: str(e.time, 5), title: str(e.title, 80), past: toM(e.time) !== null && toM(e.time) < mod })), early, clock: clock(nowS) };
}

/** the risk ring: MFFU's rules, live, one node each: ok | warn | bad | unknown, with the number */
export function risk(bot, g, lite, acct, nowS) {
  const room = num(g && g.room) ?? num(acct && acct.room), mll = num(g && g.mll) ?? num(acct && acct.mll);
  const fr = room !== null && mll ? room / mll : null;
  const mf = arr(isObj(lite) && isObj(lite.mf) ? lite.mf.a : null).find((x) => isObj(x) && (bot === 'lit' ? ['mffu50k_eval', 'lit'] : ['atlas', 'acct_b']).includes(String(x.id))) || null;
  const accts = arr(isObj(lite) ? lite.accounts : null), ev = isObj(accts.find((a) => isObj(a) && (bot === 'lit' ? a.id === 'mffu50k_eval' : a.id === 'atlas'))) ? accts.find((a) => isObj(a) && (bot === 'lit' ? a.id === 'mffu50k_eval' : a.id === 'atlas')).eval || {} : {};
  const dll = num(ev.dll), used = num(ev.dll_used);
  const f = mf && isObj(mf.f) ? mf.f : null, bestPct = f && num(f.cp) > 0 && num(f.bd) !== null ? Math.round((num(f.bd) / num(f.cp)) * 100) : null;
  const lt = mf && mf.lt ? mf.lt : null, idle = lt ? Math.floor((Date.parse(etParts(nowS).day) - Date.parse(lt)) / 86400000) : null;
  const node = (k, label, level, value, why) => ({ k, label, level, value, why });
  return [
    node('dd', 'Drawdown left', fr === null ? 'unknown' : fr < 0.3 ? 'bad' : fr < 0.55 ? 'warn' : 'ok', room === null ? '-' : room > (mll || 0) ? `${usd(room)} above the floor (max loss ${usd(mll)})` : `${usd(room)} of ${usd(mll)}`, 'MFFU end-of-day trailing max loss: the account fails at the floor.'),
    node('dll', 'Daily loss used', dll === null ? 'unknown' : used / dll > 0.7 ? 'bad' : used / dll > 0.4 ? 'warn' : 'ok', dll === null ? 'not sent' : `${usd(used)} of ${usd(dll)}`, 'A day that loses this much pauses the account until tomorrow.'),
    node('best', 'Best day share', bestPct === null ? (f ? 'ok' : 'unknown') : bestPct > 50 ? 'warn' : 'ok', bestPct === null ? (f ? 'no profit yet' : 'eval: no rule') : `${bestPct}% of the cycle (max 50%)`, 'Funded: no day over 50% of the cycle profit when you ask for a payout.'),
    node('idle', '7-day clock', idle === null ? 'unknown' : idle >= 5 ? 'bad' : idle >= 3 ? 'warn' : 'ok', idle === null ? 'no trade date' : `${idle} day${idle === 1 ? '' : 's'} since the last trade`, 'No trade for 7 calendar days and MFFU can close the account.'),
    node('news', 'News block', 'ok', 'Builder: news allowed', 'The Builder plan allows news (a Rapid funded account does not): the bot trades through releases with its normal stop.'),
    node('limit', '2% price limit', 'unknown', 'not sent by the PC yet', 'CME halts / limits: the PC does not post this yet (LEAD_WIRES O).'),
    node('hedge', 'Hedge guard', 'unknown', 'not sent by the PC yet', 'Never long and short NQ at once across the accounts: the guard runs on the PC; its state is not posted yet (LEAD_WIRES O).'),
  ];
}

/** the whole brain of one bot. src = { lite, home, biz, goals, brief, news, edge, file } */
export function brain(bot, src, nowS) {
  const S = isObj(src) ? src : {}, lite = isObj(S.lite) ? S.lite : null, pc = lite && isObj(lite.pc) ? lite.pc : {};
  const g = arr(isObj(pc.glance) ? pc.glance.bots : null).find((x) => isObj(x) && x.id === bot) || null;
  const pcStopped = pc.running === false || String(pc.adapter || '').toLowerCase() === 'paper';
  const home = S.home || {}, A = deskAccounts(home, S.biz, nowS, null);
  const mine = A.filter((a) => (bot === 'lit' ? ['zlarior', 'fresh25', 'rapid1'] : ['atlas', 'rapid1']).includes(a.key));
  const st = steps(bot, g, nowS, pcStopped), cur = st.find((x) => x.state === 'now') || null;
  const last = num(isObj(lite) ? lite.price : null);
  const fa = feedAge(home, nowS), gt = num(isObj(pc.glance) ? pc.glance.t : null), gAge = gt !== null ? Math.max(0, nowS - gt) : null;
  const tiles = goalTiles(A, [], S.goals, nowS, {}, typeof globalThis !== 'undefined' && globalThis.PC_FEED ? globalThis.PC_FEED.mffuView : null);
  const pay = bot === 'atlas' ? tiles.find((t) => t.kind === 'payout') || null : null;
  const cards = {};
  for (const s of st) {
    const nextHelp = (st[st.indexOf(s) + 1] || {}).help || '';
    cards[s.key] = { title: `${s.n}. ${s.label}`, now: s.state === 'now' ? str((g && (s.text || g.wait)) || 'Working on this step.', 300) : s.state === 'done' ? 'Passed this step today.' : s.state === 'off' ? 'The bot is not running this step now.' : 'Not here yet.',
      why: s.state === 'now' ? str((g && g.why) || s.help, 300) : s.help, change: nextHelp ? `What moves it on: ${nextHelp}` : 'Tomorrow starts a new map at 18:00 ET.' };
  }
  return {
    bot, name: g ? str(g.name, 30) : bot === 'lit' ? 'Zlarior' : 'ATLAS', what: g ? str(g.what, 80) : '', mode: g ? str(g.mode, 40) : '', on: !!(g && g.on), armed: !!(g && g.armed),
    has: !!g, stopped: pcStopped, steps: st, current: cur,
    regions: bot === 'lit' ? st.map((s) => ({ id: s.key, label: s.label, state: s.state })) : ATLAS_LOBES.map((L) => ({ id: L.id, label: L.name, state: lobeState(g, L).state, text: lobeState(g, L).text })),
    thoughts: arr(g && g.log).filter((x) => Array.isArray(x)).map(([hm, t]) => ({ hm: str(hm, 5), text: str(t, 220) })).reverse(),
    watch: watch(g, bot, last), memory: memory(bot, lite, S.file, S.edge, lite && lite.zl), grade: grade(g), plan: plan(bot, S.brief, S.news, nowS),
    risk: risk(bot, g, lite, mine[0] || null, nowS),
    accounts: mine.map((a) => ({ key: a.key, name: a.name, stage: a.stage, balance: a.balance, room: a.room, dot: a.dot, ageText: a.ageText })),
    payout: pay ? { frac: pay.frac, big: pay.big, unit: pay.unit, goal: pay.goal, when: pay.when, lines: pay.lines } : null,
    health: [
      { k: 'pc', label: 'PC report', level: fa.report === null ? 'bad' : ageLevel(fa.report, 'pc'), value: fa.report === null ? 'no report' : updated(fa.report) },
      { k: 'brain', label: 'Brain glance', level: gAge === null ? 'warn' : ageLevel(gAge, 'pc'), value: gAge === null ? 'not sent' : updated(gAge) },
      { k: 'nt', label: 'NinjaTrader', level: pc.adapter === 'ninjatrader' ? 'ok' : pc.adapter ? 'warn' : 'unknown', value: pc.adapter ? str(pc.adapter, 20) : 'unknown' },
      { k: 'run', label: 'Bot', level: pcStopped ? 'bad' : g && g.armed ? 'ok' : g && g.on ? 'warn' : 'unknown', value: pcStopped ? 'STOPPED (paper numbers)' : g ? (g.armed ? 'armed, live' : g.on ? 'on, not armed' : 'off') : 'no glance' },
    ],
    replay: replay(bot, lite, st, nowS),
    cards,
  };
}

/** today's trade(s) through the stages: the frames a scrubber walks (entry -> in trade -> done), from the PC's "at" rows */
export function replay(bot, lite, st, nowS) {
  const ids = bot === 'lit' ? ['mffu50k_eval', 'lit'] : ['atlas', 'acct_b'], today = etParts(nowS).day, frames = [];
  for (const a of arr(isObj(lite) && isObj(lite.at) ? lite.at.a : null)) if (isObj(a) && ids.includes(String(a.id))) {
    for (const r of arr(a.tr)) if (Array.isArray(r) && etParts(num(r[0])).day === today) {
      const side = num(r[2]) < 0 ? 'Short' : 'Long';
      frames.push({ t: num(r[0]), stage: bot === 'lit' ? 'entry' : 'trade', text: `${etParts(num(r[0])).hm} ET: ${side} ${r[3]} at ${num(r[4])} · stop ${num(r[5])} · target ${num(r[6])}` });
      if (num(r[1])) frames.push({ t: num(r[1]), stage: 'done', text: `${etParts(num(r[1])).hm} ET: out (${str(r[7], 12).toLowerCase()}) ${usd(r[8], true)}${num(r[9]) !== null ? ` (${num(r[9]) >= 0 ? '+' : ''}${num(r[9]).toFixed(2)}R)` : ''}` });
    }
  }
  frames.sort((a, b) => a.t - b.t);
  return { frames, text: frames.length ? `${frames.length / 2 >= 1 ? Math.round(frames.length / 2) : 1} trade(s) today: scrub through them` : 'No trade today yet: nothing to replay.' };
}
