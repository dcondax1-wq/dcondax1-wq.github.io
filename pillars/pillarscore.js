// THE FOUR PILLARS, the model (day-pillars 2026-11-24; owner 2026-11-23 23:00 ET: "Orderflow and BLITZ alongside LIT and ATLAS are
// gonna make us. Those are our 4 pillars"). Pure ES module: no DOM, no fetch (node-tested: tests/test_pillars.py).
//   static  = pillars-data.json (tools/build_pillars.py: status words, the edge line, span numbers + their source, chains, what's next)
//   cards   = nq/acctcore.build(...).cards (one per account: name, today $, the bots on it with armed state, the MFFU 7-day clock)
//   glance  = the PC glance (the step each bot is on + its thought lines today)
//   lite    = the PC's post (lite.tr = the tick recorder line from engine/tickrec.tiny; lite.at = real trades for the last trade)
//   file    = odeon/trades.json (the ledger: a last trade when the post has none)
// Missing data says "waiting", never a made-up number. Read only: nothing here arms, starts, stops or orders anything.
import { live as liveState, chainStates, today as todayRows, ageText, FRESH_S, glanceOf, pillarOf } from '../cities/mind/mindcore.js?v=m7';
import { ATLAS_STEPS, lobeState } from '../nq/braincore.js?v=7';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n || 200);
export { glanceOf };

export function usd(v, sign = true) {
  const n = num(v); if (n === null) return '-';
  const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  return n < 0 && Math.round(n) ? '-' + a : (sign && Math.round(n) > 0 ? '+' + a : a);
}
const STATE_WORD = { live: 'LIVE', off: 'OFF', collecting: 'COLLECTING', notready: 'NOT READY' };
const ARM_WORD = { armed: 'ARMED', on: 'ON, not armed', off: 'OFF', unknown: 'not reported', paper: 'paper only' };

/* ---------------- accounts per pillar (from the Accounts screen's cards) ---------------- */
export function accountsOf(p, cards) {
  const C = arr(cards).filter(isObj);
  if (p.id === 'of') return [];
  if (p.id === 'blitz') {
    // BLITZ is switched OFF and only ever meant for a Rapid eval: list the Rapid cards it would sit on, as OFF
    return C.filter((c) => /rapid/i.test(`${c.name} ${c.plan}`)).map((c) => ({ key: c.key, name: c.name, stage: c.stage, state: 'off', stateWord: 'OFF (switched off)',
      today: null, todayText: '-', clock: null }));
  }
  const want = p.id === 'lit' ? 'LIT' : 'ATLAS';
  return C.filter((c) => arr(c.bots).some((b) => b.name === want)).map((c) => {
    const b = arr(c.bots).find((x) => x.name === want) || {};
    return { key: c.key, name: c.name, stage: c.stage, state: b.state || 'unknown', stateWord: ARM_WORD[b.state] || 'not reported',
      todayText: c.today || '-', todayLvl: c.todayLvl || 'none', has: !!c.has,
      clock: c.clock ? { text: `${c.clock.leftText} · ${c.clock.lastText}`, lvl: c.clock.lvl } : null };
  });
}

/* ---------------- the last trade (the PC's real trades first, else the ledger) ---------------- */
export function lastTrade(p, lite, file) {
  if (p.id === 'of' || p.id === 'blitz') return null;
  const ids = p.id === 'lit' ? ['mffu50k_eval', 'lit', 'b25k_2'] : ['atlas', 'acct_b'], rows = [];
  for (const a of arr(isObj(lite) && isObj(lite.at) ? lite.at.a : null)) if (isObj(a) && ids.includes(String(a.id))) {
    for (const r of arr(a.tr)) if (Array.isArray(r) && num(r[1]) !== null) rows.push({ t: num(r[1]), side: num(r[2]) < 0 ? 'SHORT' : 'LONG', usd: num(r[8]), r: num(r[9]), src: 'PC' });
  }
  const BOT = p.id === 'lit' ? 'LIT' : 'ATLAS';
  for (const t of arr(isObj(file) ? file.trades : null)) if (isObj(t) && t.bot === BOT && ['real', 'live', 'paper'].includes(t.src)) {
    const x = num(t.exit && (t.exit.t_end || t.exit.t)) || num(t.entry && t.entry.t);
    if (x !== null) rows.push({ t: x, side: String(t.side || ''), usd: num(t.usd), r: num(t.r), src: t.src === 'paper' ? 'paper' : 'ledger', day: str(t.day, 10) });
  }
  rows.sort((a, b) => b.t - a.t);
  const r = rows[0]; if (!r) return null;
  const day = r.day || new Date((r.t - 5 * 3600) * 1000).toISOString().slice(0, 10);
  return { ...r, day, text: `${day} · ${r.side} · ${usd(r.usd)}${r.r !== null ? ` (${r.r > 0 ? '+' : ''}${r.r.toFixed(2)}R)` : ''}${r.src === 'paper' ? ' · paper' : ''}` };
}

/* ---------------- the thought process with today's live step ---------------- */
export function chainOf(p, glance, nowS, tick) {
  if (p.id === 'lit') {
    const v = liveState('lit', glance, nowS);
    return { steps: chainStates('lit', v).map((s) => ({ key: s.key, label: s.label, help: s.help, state: s.state })), live: v };
  }
  if (p.id === 'atlas') {
    const bot = arr(isObj(glance) ? glance.bots : null).find((b) => isObj(b) && b.id === 'atlas') || null;
    const lobes = [['ema', 'EMA'], ['macd', 'MACD'], ['sr', 'S/R']].map(([id, name]) => {
      const st = bot ? lobeState(bot, { id, name }) : { state: 'unknown', text: '' };
      return { id, name, state: st.state, text: st.text };
    });
    const best = ['trade', 'armed', 'signal', 'window', 'done'].find((s) => lobes.some((l) => l.state === s)) || null;
    const idx = best ? ATLAS_STEPS.findIndex((x) => x[0] === best) : -1;
    return { steps: ATLAS_STEPS.map(([key, label, help], i) => ({ key, label, help, state: idx < 0 ? 'wait' : i < idx ? 'done' : i === idx ? (best === 'done' ? 'done' : 'now') : 'wait' })),
      lobes, live: liveState('ema', glance, nowS) };
  }
  if (p.id === 'blitz') return { steps: arr(p.chain).map((s) => ({ ...s, state: 'off' })), live: { word: 'off' } };
  // ORDER FLOW: recording -> backfill -> 60 days -> study -> verdict, from the tick line
  const t = tick || {}, d = num(t.d), of = num(t.of) || num(p.study_days) || 60;
  const at = !t.has ? -1 : !t.on ? 0 : d === null ? 0 : d < of ? (t.bf === 'done' ? 2 : 1) : 3;
  return { steps: arr(p.chain).map((s, i) => ({ ...s, state: at < 0 ? 'wait' : i < at ? 'done' : i === at ? 'now' : 'wait' })), live: { word: t.has ? 'collecting' : 'waiting' } };
}

/* ---------------- the tick recorder line (order flow) ---------------- */
export function tickLine(lite, nowS, studyDays) {
  const tr = isObj(lite) && isObj(lite.tr) ? lite.tr : isObj(lite) && isObj(lite.pc) && isObj(lite.pc.tr) ? lite.pc.tr : null;
  const of = num(tr && tr.of) || num(studyDays) || 60;
  if (!tr) return { has: false, of, d: null, frac: null, text: `Waiting: no tick count from the PC yet (the recorder is not running; ${of} NQ tick days needed)` };
  const d = Math.max(0, num(tr.d) || 0), age = num(tr.t) !== null ? Math.max(0, (num(nowS) || 0) - num(tr.t)) : null;
  const bits = [`${d} of ${of} NQ tick days`];
  if (tr.bf) bits.push(`backfill ${str(tr.bf, 12)}`);
  if (tr.o) bits.push(`oldest ${str(tr.o, 10)}`);
  if (tr.on === false) bits.unshift('recorder OFF');
  return { has: true, on: tr.on !== false, d, of, bf: tr.bf || null, o: tr.o || null, l: tr.l || null, frac: Math.max(0, Math.min(1, d / of)),
    text: (d >= of ? 'Enough ticks: the study runs at the next quiet window · ' : 'Collecting ticks: ') + bits.join(' · '), age, ageText: age === null ? '' : `counted ${ageText(age)}` };
}

/* ---------------- one pillar ---------------- */
export function pillar(p, ctx) {
  const c = isObj(ctx) ? ctx : {}, nowS = num(c.nowS) || 0, glance = c.glance || null;
  const tick = p.id === 'of' ? tickLine(c.lite, nowS, p.study_days) : null;
  const accounts = accountsOf(p, c.cards);
  const chain = chainOf(p, glance, nowS, tick);
  const gAge = num(isObj(glance) ? glance.t : null) !== null ? Math.max(0, nowS - num(glance.t)) : null;
  const armed = accounts.filter((a) => a.state === 'armed').length;
  let statusWord = STATE_WORD[p.state] || String(p.state || '').toUpperCase(), level = p.state === 'live' ? 'ok' : p.state === 'off' ? 'off' : 'warn';
  let status = p.status;
  if (p.id === 'of' && tick && tick.has && tick.on) { statusWord = 'COLLECTING'; status = tick.text; }   // only the PC's own count makes it "collecting"
  if (Array.isArray(c.cards)) {                     // account words only when the caller handed in the account cards (the Brain does not)
    const reported = accounts.some((a) => a.has);      // an account the PC sent numbers for (not just the plan file's row)
    if (p.state === 'live' && (!accounts.length || !reported)) { statusWord = 'LIVE · waiting for the PC'; level = 'warn'; }
    else if (p.state === 'live' && !armed) { statusWord = 'LIVE · not armed'; level = 'warn'; }
  }
  const today = p.bot === 'lit' || p.bot === 'atlas'
    ? todayRows(glance, c.lite).filter((r) => r.bot === p.bot)
    : [];
  const todayEmpty = p.id === 'blitz' ? 'Switched OFF: no thinking today' : p.id === 'of' ? (tick && tick.has ? tick.text : 'Not running: no ticks recorded, nothing to think about yet')
    : !glance ? "Waiting for the PC's report" : 'No thinking logged yet today';
  return {
    id: p.id, name: p.name, alias: p.alias, color: p.color, state: p.state, statusWord, level, status,
    accounts, armed, accountsText: p.id === 'of' ? 'No account: research on recorded ticks (the PC records, nothing trades)'
      : p.id === 'blitz' ? (accounts.length ? `${accounts.length} Rapid account${accounts.length === 1 ? '' : 's'} it was built for · OFF` : 'Rapid eval only · no Rapid account reported · OFF')
        : accounts.some((a) => a.has) ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${armed} armed`
          : accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} planned · waiting for the PC's numbers` : "Waiting for the PC's accounts",
    last: lastTrade(p, c.lite, c.file), edge: p.edge, spans: arr(p.spans), recent: p.recent || null, src: p.src,
    chain, today, todayEmpty, next: arr(p.next).length ? arr(p.next) : [str(p.next, 400)].filter(Boolean), risks: arr(p.risks), basis: str(p.basis, 300),
    accountsNote: arr(p.accounts_note), researchDate: str(p.research_date, 10), spansNote: str(p.spans_note, 500), readiness: isObj(p.readiness) ? p.readiness : null,
    lessons: arr(p.lessons).filter(isObj).map((x) => ({ d: str(x.d, 10), text: str(x.text, 240), src: str(x.src, 120) })),
    tick, designs: arr(p.designs), tests: arr(p.tests),
    glanceAge: gAge, fresh: gAge !== null && gAge < FRESH_S,
  };
}

/** the bare four pillars (no numbers): what the NQ strip needs for its chips, so the NQ page fetches no extra data file */
export const PILLAR_BASE = [
  { id: 'lit', name: 'LIT', alias: 'Zlarior', color: '#f1c14b', bot: 'lit', state: 'live', status: 'On the PC bot' },
  { id: 'atlas', name: 'ATLAS', alias: 'EMA · MACD · S/R', color: '#77db89', bot: 'atlas', state: 'live', status: 'On the PC bot' },
  { id: 'blitz', name: 'BLITZ', alias: 'the scalper', color: '#9d59ee', bot: 'blitz', state: 'off', status: 'Paper, hidden; built and OFF' },
  { id: 'of', name: 'ORDER FLOW', alias: 'ticks', color: '#c9a7ff', bot: null, state: 'notready', status: 'Not ready', study_days: 60 },
];
/** the four pillars in the owner's order: LIT, ATLAS, BLITZ, ORDER FLOW */
export function build(data, ctx) {
  const ps = arr(isObj(data) ? data.pillars : null).filter(isObj);
  const order = ['lit', 'atlas', 'blitz', 'of'];
  const sample = !!(isObj(data) && data.lessons_sample), lsrc = isObj(data) ? str(data.lessons_src, 80) : '';
  return order.map((id) => ps.find((p) => p.id === id)).filter(Boolean).map((p) => ({ ...pillar(p, ctx), lessonsSample: sample, lessonsSrc: lsrc }));
}

/** the 4 mini chips for Home / NQ: name, one status word, one short line */
export function chips(model) {
  return arr(model).map((m) => ({ id: m.id, name: m.name, color: m.color, level: m.level, word: m.statusWord,
    line: m.id === 'of' ? (m.tick && m.tick.has ? (m.tick.d >= m.tick.of ? 'Ready' : `${m.tick.d}/${m.tick.of} tick days`) : 'recorder not set up')
      : m.id === 'blitz' ? 'built · OFF'
        : m.accounts.some((a) => a.has) ? `${m.armed}/${m.accounts.length} armed` : 'waiting for the PC' }));
}

/** which pillar a piece of research belongs to (one rule for the Brain and the Hub): mindcore.pillarOf */
export { pillarOf };
