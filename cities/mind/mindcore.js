// OLYMPUS Strategy Brain, the model (cities/mind/, day-mind 2026-11-23). Pure ES module: no DOM, no fetch (node-tested by
// tests/test_mind_brain.py). Everything the page shows comes from what the site already publishes:
//   - the strategies' thought process = the engine's own rules (engine/brain.py STAGES via nq/braincore.js LIT_STAGES, engine/second.py
//     for ATLAS EMA / MACD / S/R), written as one step chain per lobe;
//   - live state = the PC's glance (pc_feed.js -> lite.pc.glance, else home.json live.pc.glance): LIT's stage n/10, each ATLAS lobe's state;
//     nothing posted (or older than 20 min) says "waiting" / "PC last reported X min ago", never a made-up state;
//   - trade timelines = odeon/trades.json (the real ledger + paper + the backtest replays, with each engine event's time and the bars);
//   - research lobes = cities/brain-data.json (the Research Brain's findings per family; BLITZ is hidden, as everywhere).
// Read only: nothing here arms, starts, stops or orders anything.
import { LIT_STAGES, stageN, lobeState } from '../../nq/braincore.js?v=7';
import { pillarOf } from '../../pillars/pillarof.js?v=p1';
export { pillarOf };

export const FRESH_S = 20 * 60;           // the PC posts every 15 minutes (pc_feed.js FRESH_S)
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n || 240);

/* ---------------- the lobes ---------------- */
// kind 'strategy' = a strategy we trade (live chain + trades); kind 'research' = the findings of a Research Brain family.
// pos = where the lobe sits in the brain (x right, y up, z front), in the brain's own units (half sizes 1.15 / .9 / 1.5).
// THE FOUR PILLARS (owner 2026-11-23 23:00 ET): LIT, ATLAS, BLITZ, ORDER FLOW are the 4 big lobes; ATLAS's three members sit beside it; the
// research neurons orbit the pillar they belong to (pillarNeurons); the Strategy Lab (popular strategies) and the non-trading research stay small.
export const PILLAR_IDS = ['lit', 'atlas', 'blitz', 'of'];
export const LOBES = [
  { id: 'lit', kind: 'strategy', pillar: true, name: 'LIT', sub: 'Zlarior · pillar 1 of 4 · Builder 50K + 25K #2', bot: 'lit', color: '#f1c14b', pos: [-.55, .42, .45] },
  { id: 'atlas', kind: 'pillar', pillar: true, name: 'ATLAS', sub: 'pillar 2 of 4 · EMA + MACD + S/R on the funded 25K', bot: 'atlas', color: '#77db89', pos: [.55, .42, .45] },
  { id: 'blitz', kind: 'pillar', pillar: true, name: 'BLITZ', sub: 'pillar 3 of 4 · the scalper: built, switched OFF', bot: 'blitz', color: '#9d59ee', pos: [-.55, -.16, -.45] },
  { id: 'of', kind: 'pillar', pillar: true, name: 'ORDER FLOW', sub: 'pillar 4 of 4 · collecting ticks', bot: null, color: '#c9a7ff', pos: [.55, -.16, -.45] },
  { id: 'ema', kind: 'strategy', name: 'ATLAS EMA', sub: 'London trend pullback (ATLAS)', bot: 'atlas', lobe: { id: 'ema', name: 'EMA' }, strat: 'EMA', color: '#77db89', pos: [.95, .2, .12] },
  { id: 'macd', kind: 'strategy', name: 'ATLAS MACD', sub: 'Divergence at a sweep (ATLAS)', bot: 'atlas', lobe: { id: 'macd', name: 'MACD' }, strat: 'MACD', color: '#a6f0b4', pos: [.6, .7, .02] },
  { id: 'sr', kind: 'strategy', name: 'ATLAS S/R', sub: 'Day level sweep + reclaim (ATLAS)', bot: 'atlas', lobe: { id: 'sr', name: 'S/R' }, strat: 'S/R', color: '#4fbf9a', pos: [.28, .18, .92] },
  { id: 'lab', kind: 'lab', name: 'Strategy Lab', color: '#f1c14b', pos: [0, -.3, .8] },   // the popular strategies tested (labNeurons)
  { id: 'r_money', kind: 'research', name: 'Rapid + fleet money', fam: 3, color: '#f1c14b', pos: [.35, .55, -.95] },
  { id: 'r_kalshi', kind: 'research', name: 'Kalshi', fam: 4, color: '#9d59ee', pos: [-.35, .55, -.95] },
  { id: 'r_web', kind: 'research', name: 'Websites + calls', fam: 5, color: '#9d59ee', pos: [-.95, .25, -.05] },
  { id: 'r_ops', kind: 'research', name: 'Ops', fam: 6, color: '#77db89', pos: [0, -.25, -1.15] },
];
export const lobeById = (id) => LOBES.find((l) => l.id === id) || null;

/* ---------------- the step chains (the exact thought process) ---------------- */
// Each step: key, label, the plain-words rule, and `ev` = which trade event(s) mark its time on a timeline.
const LIT_HELP = Object.fromEntries(LIT_STAGES.map(([k, , h]) => [k, h]));
export const CHAINS = {
  lit: [
    { key: 'sweep', label: 'Sweep', ev: ['sweep'], help: LIT_HELP.sweep },
    { key: 'inducement', label: 'Inducement', ev: ['idm'], help: LIT_HELP.inducement },
    { key: 'cisd', label: 'CISD', ev: ['cisd5', 'cisd1'], help: 'Displacement (a body of at least 0.8 ATR back the other way), then the 5m CISD: a 5-minute close back through the open of the last run of candles into the sweep extreme. A limit waits there 30 minutes; once tapped, a 1-minute CISD must confirm within 20 bars.' },
    { key: 'entry', label: 'Entry', ev: ['entry'], help: 'Entry at the next 1-minute open after the 1m CISD close (about 3 s later). One trade a day, 02:00-15:30 ET.' },
    { key: 'stop', label: 'Stop', ev: ['entry'], help: 'Stop 1 tick beyond the sweep extreme. The size follows the stop: the further the stop, the fewer micros.' },
    { key: 'target', label: 'VIX-band target', ev: ['exit'], help: 'One target: the VIX band (the day\'s expected move from the VIX), banked at 8R. Breakeven at +1R, a 15-minute check, flat by 15:55.' },
  ],
  ema: [
    { key: 'window', label: 'Window', ev: ['session'], help: 'London hours: the EMA lobe only looks inside its own window, 1 trade a day.' },
    { key: 'trend', label: 'Trend + pullback', ev: ['setup'], help: 'The EMAs are stacked in one direction and price pulls back against it, sweeping a swing.' },
    { key: 'cisd', label: '5m CISD', ev: ['setup'], help: 'A 5-minute close back through the pullback (the CISD) arms the setup; it enters at the next 5m open, as the backtest does.' },
    { key: 'entry', label: 'Entry', ev: ['entry'], help: 'Entry at the next 5-minute open.' },
    { key: 'stop', label: 'Stop', ev: ['entry'], help: 'Stop beyond the setup\'s low (long) or high (short), past the sweep wick. Size follows the stop.' },
    { key: 'target', label: 'VIX-band target', ev: ['exit'], help: 'The VIX-band target, at least 1.5R away; breakeven plus costs at 1R.' },
  ],
  macd: [
    { key: 'window', label: 'Window', ev: ['session'], help: 'Its own entry hours, 1 trade a day. LIT goes first: the MACD trade is closed the moment LIT enters.' },
    { key: 'sweep', label: 'Level swept', ev: ['setup'], help: 'A LIT liquidity level (Asia, Frankfurt, London, NY, equal highs / lows) is swept to a new extreme.' },
    { key: 'div', label: 'MACD divergence', ev: ['setup'], help: 'While price made the new extreme, the MACD line did not: a higher low under a lower low (or the mirror). That is the divergence.' },
    { key: 'entry', label: 'Entry', ev: ['entry'], help: 'A 5-minute close back confirms; entry at the next 5m open.' },
    { key: 'stop', label: 'Stop', ev: ['entry'], help: 'Stop beyond the setup\'s extreme (the sweep wick). Size follows the stop.' },
    { key: 'target', label: 'VIX-band target', ev: ['exit'], help: 'The VIX-band target (banked at 8R at most), at least 1.5R away.' },
  ],
  sr: [
    { key: 'window', label: 'Window', ev: ['session'], help: 'New York hours from the 09:30 cash open, 1 trade a day.' },
    { key: 'sweep', label: 'Day level swept', ev: ['setup'], help: 'A day level (London, overnight, opening-range high or low) is swept.' },
    { key: 'idm', label: 'Inducement', ev: ['setup'], help: 'The sweep came after an inducement: a smaller swing near the level was taken first.' },
    { key: 'reclaim', label: 'Reclaim close', ev: ['setup'], help: 'A strong 5-minute close back through the level reclaims it (the body is measured in ATR).' },
    { key: 'entry', label: 'Entry', ev: ['entry'], help: 'Entry at the next 5-minute open. Stop beyond the setup low / high.' },
    { key: 'target', label: 'Plan target', ev: ['exit'], help: 'The plan target: 2R for S/R.' },
  ],
};

/* ---------------- live state from the PC's glance ---------------- */
/** the PC's glance block from the lite feed, else from the site's home.json */
export function glanceOf(lite, home) {
  const a = isObj(lite) && isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance : null;
  const h = isObj(home) && isObj(home.live) && isObj(home.live.pc) && isObj(home.live.pc.glance) ? home.live.pc.glance : null;
  if (a && h) return (num(a.t) || 0) >= (num(h.t) || 0) ? a : h;
  return a || h;
}
// LIT stage n (1..10, engine/brain.py) -> index into CHAINS.lit; -1 = before the first step (watching the levels)
const LIT_IDX = { 1: -1, 2: 0, 3: 1, 4: 2, 5: 2, 6: 2, 7: 2, 8: 3, 9: 5, 10: 6 };
const LIT_NOTE = { 6: 'Limit armed at the CISD level (30 minutes).', 7: 'Limit tapped: waiting for the 1-minute CISD.', 9: 'In the trade: stop and target are working.' };
// ATLAS lobe state (braincore.lobeState) -> index into its chain
const ATLAS_IDX = { window: 0, signal: 1, armed: 3, trade: 5, done: 6 };

/** a strategy lobe's live state: { has, fresh, age, idx (-1..len; len = done for today), word, text } */
export function live(lobeId, glance, nowS) {
  const L = lobeById(lobeId), chain = CHAINS[lobeId];
  if (!L || L.kind !== 'strategy' || !chain) return { has: false, fresh: false, age: null, idx: -1, word: 'waiting', text: '' };
  const g = isObj(glance) ? glance : null, t = num(g && g.t), age = t === null ? null : Math.max(0, (num(nowS) || 0) - t);
  const bot = arr(g && g.bots).find((b) => isObj(b) && b.id === L.bot) || null;
  if (!bot) return { has: false, fresh: false, age, idx: -1, word: 'waiting', text: 'The PC has not sent this bot\'s brain yet (its 15-minute report).' };
  const fresh = age !== null && age < FRESH_S, off = bot.on === false;
  let idx = -1, text = '';
  if (L.bot === 'lit') {
    const n = stageN(bot.stage);
    idx = n === null ? -1 : LIT_IDX[n];
    text = n === null ? str(bot.wait, 160) : [`${LIT_STAGES[n - 1][1]} (${n}/10).`, LIT_NOTE[n], str(bot.wait, 140)].filter(Boolean).join(' ');
  } else {
    const st = lobeState(bot, L.lobe);
    idx = st.state === 'off' ? -1 : st.state in ATLAS_IDX ? ATLAS_IDX[st.state] : -1;
    text = st.text || (st.state === 'unknown' ? 'No word on this lobe in the PC\'s report.' : '');
    if (st.state === 'off') return { has: true, fresh, age, idx: -1, word: 'off', text: text || 'This lobe is off.' };
  }
  const word = off ? 'off' : !fresh ? 'stale' : idx >= chain.length ? 'done' : idx < 0 ? 'watching' : 'live';
  return { has: true, fresh, age, idx: Math.min(idx, chain.length), word, text };
}
/** each step's state for the chain list: done | now | wait | off */
export function chainStates(lobeId, lv) {
  const chain = CHAINS[lobeId] || [], v = lv || { idx: -1, word: 'waiting' };
  return chain.map((s, i) => {
    let state = !v.has ? 'wait' : v.idx >= chain.length ? 'done' : i < v.idx ? 'done' : i === v.idx ? 'now' : 'wait';
    if (v.word === 'off') state = 'off';
    return { ...s, n: i + 1, state };
  });
}
export function ageText(s) {
  const n = num(s); if (n === null) return 'never';
  if (n < 90) return 'just now';
  if (n < 3600) return `${Math.round(n / 60)} min ago`;
  if (n < 86400 * 2) return `${Math.round(n / 3600)} h ago`;
  return `${Math.round(n / 86400)} days ago`;
}

/* ---------------- trades and timelines ---------------- */
const SRC_RANK = { real: 0, live: 0, paper: 1, backtest: 2 };
/** the trades of one strategy lobe (odeon/trades.json), real first, then paper, then backtest; newest first inside each */
export function tradesFor(lobeId, file) {
  const L = lobeById(lobeId); if (!L || L.kind !== 'strategy') return [];
  return arr(isObj(file) ? file.trades : null).filter((t) => isObj(t) && (L.bot === 'lit' ? t.bot === 'LIT' : t.bot === 'ATLAS' && t.strat === L.strat)
    && isObj(t.entry) && num(t.entry.t) !== null)
    .sort((a, b) => ((SRC_RANK[a.src] ?? 3) - (SRC_RANK[b.src] ?? 3)) || (num(b.entry.t) - num(a.entry.t)));
}
/** odeon's bar block ({t0, s, p0, dt[], o/h/l/c[] in quarter ticks from p0}) -> 5-minute OHLC bars */
export function bars5(b) {
  if (!isObj(b) || !Array.isArray(b.c) || !b.c.length) return [];
  const s = num(b.s) || 60, t0 = num(b.t0) || 0, p0 = num(b.p0) || 0, out = [], by = new Map();
  for (let i = 0; i < b.c.length; i++) {
    const t = t0 + (num(arr(b.dt)[i]) ?? i) * s, k = Math.floor(t / 300) * 300;
    const o = (p0 + b.o[i]) / 4, h = (p0 + b.h[i]) / 4, l = (p0 + b.l[i]) / 4, c = (p0 + b.c[i]) / 4;
    let x = by.get(k);
    if (!x) { x = { t: k, o, h, l, c }; by.set(k, x); out.push(x); } else { x.h = Math.max(x.h, h); x.l = Math.min(x.l, l); x.c = c; }
  }
  return out;
}
const fmtPx = (v) => (num(v) === null ? '-' : num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** "HH:MM" New York time from the trade's own offset (odeon's `off`, seconds) */
export function hm(t, off) {
  const n = num(t); if (n === null) return '';
  return new Date((n + (num(off) ?? -18000)) * 1000).toISOString().slice(11, 16);
}
export function usd(v, sign = true) {
  const n = num(v); if (n === null) return '-';
  const a = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '-' + a : (sign && n > 0 ? '+' + a : a);
}
/** one trade as a timeline: setup found, each chain step's time + price + words, entry / stop / target / exit and the $ result */
export function timeline(lobeId, t) {
  const chain = CHAINS[lobeId] || [], ev = arr(t && t.events).filter(isObj), off = num(t && t.off) ?? -18000;
  const entryT = num(t.entry && t.entry.t), setupEv = ev.find((e) => e.k === (lobeId === 'lit' ? 'cisd5' : 'setup')) || ev.find((e) => e.k === 'setup') || null;
  const before = (e) => entryT === null || (num(e.t) || 0) <= entryT;
  const pickEv = (keys) => {                                   // the LAST matching event at or before the entry (the one that made the trade)
    let hit = null; for (const e of ev) if (keys.includes(e.k) && before(e)) hit = e;
    return hit || ev.find((e) => keys.includes(e.k)) || null;
  };
  const exitEv = ev.find((e) => e.k === 'exit') || null;
  const steps = chain.map((s, i) => {
    let e = s.ev.includes('exit') ? exitEv : pickEv(s.ev), when = e ? num(e.t) : null, px = e ? num(e.price) : null, text = e ? str(e.text, 260) : '';
    if (s.key === 'stop') { px = num(t.stop); text = `Stop ${fmtPx(t.stop)}${isObj(t.sweep) && num(t.sweep.ext_px) !== null ? `, 1 tick beyond the sweep extreme ${fmtPx(t.sweep.ext_px)}` : ''} (${num(t.risk_pts) ?? '-'} pts, ${usd(t.risk_usd, false)} risk).`; when = entryT; }
    if (s.key === 'target') { px = num(t.target); text = `${str(t.target_label || 'Target', 30)} ${fmtPx(t.target)} (${num(t.plan_rr) ?? '-'}R).${exitEv ? ' ' + str(exitEv.text, 200) : ''}`; }
    if (s.key === 'entry') { px = num(t.entry.px); when = entryT; }
    return { n: i + 1, key: s.key, label: s.label, t: when, hm: hm(when, off), px, text, seen: !!e || s.key === 'stop' };
  });
  const out = num(t.exit && (t.exit.t_end || t.exit.t));
  const res = num(t.usd);
  return {
    id: str(t.id, 80), day: str(t.day, 10), side: str(t.side, 6), qty: num(t.qty), src: str(t.src, 10), label: str(t.label, 60),
    setup: { t: setupEv ? num(setupEv.t) : entryT, hm: hm(setupEv ? setupEv.t : entryT, off), text: setupEv ? str(setupEv.text, 260) : '' },
    steps, entry: { t: entryT, hm: hm(entryT, off), px: num(t.entry.px) }, stop: num(t.stop), target: num(t.target),
    exit: { t: out, hm: hm(out, off), px: num(t.exit && t.exit.px), kind: str(t.exit && t.exit.kind, 12), outcome: str(t.exit && t.exit.outcome, 10) },
    usd: res, r: num(t.r), held: num(t.held_min), off,
    bars: bars5(t.bars), result: `${usd(res)}${num(t.r) !== null ? ` (${num(t.r) > 0 ? '+' : ''}${num(t.r).toFixed(2)}R)` : ''}`,
  };
}
/** the window of 5m bars around the trade (setup - 6 bars .. exit + 4 bars) with the price range covering entry / stop / target */
export function chartWindow(tl) {
  const b = arr(tl && tl.bars); if (!b.length) return null;
  const t0 = Math.min(...[tl.setup.t, ...tl.steps.map((s) => s.t)].filter((x) => num(x) !== null)) - 6 * 300;
  const t1 = (num(tl.exit.t) || num(tl.entry.t) || 0) + 4 * 300;
  let w = b.filter((x) => x.t >= t0 && x.t <= t1);
  if (w.length < 6) w = b.slice(-Math.min(60, b.length));
  if (w.length > 110) w = w.slice(w.length - 110);
  let lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h));
  for (const p of [tl.entry.px, tl.stop, tl.target, tl.exit.px]) if (num(p) !== null) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  const pad = (hi - lo) * .06 || 1;
  return { bars: w, lo: lo - pad, hi: hi + pad, t0: w[0].t, t1: w[w.length - 1].t + 300 };
}

/* ---------------- research lobes ---------------- */
const VERDICT = { a: 'Adopted', r: 'Rejected', o: 'Open' };
/** one research lobe: counts by verdict + the newest findings */
export function research(lobeId, data, n = 6) {
  const L = lobeById(lobeId); if (!L || L.kind !== 'research') return null;
  const rows = arr(isObj(data) ? data.n : null).filter((x) => isObj(x) && x.f === L.fam);
  const c = { a: 0, r: 0, o: 0 }; rows.forEach((x) => { if (x.s in c) c[x.s] += 1; });
  const top = rows.slice().sort((a, b) => String(b.d || '').localeCompare(String(a.d || ''))).slice(0, n)
    .map((x) => ({ d: str(x.d, 10), s: x.s, verdict: VERDICT[x.s] || '', t: str(x.t, 160), v: str(x.v, 160) }));
  return { total: rows.length, counts: c, top };
}
/** how bright each lobe glows in the 3D (0..1): live strategies brightest, research by its size */
export function glow(lobeId, ctx) {
  const L = lobeById(lobeId); if (!L) return 0;
  if (L.kind === 'strategy') { const v = live(lobeId, ctx && ctx.glance, ctx && ctx.now); return v.word === 'live' ? 1 : v.word === 'done' ? .7 : v.has ? .6 : .5; }
  if (L.kind === 'pillar') { if (lobeId === 'blitz') return .35; if (lobeId === 'of') return .55; const v = live('ema', ctx && ctx.glance, ctx && ctx.now); return v.word === 'live' ? 1 : .6; }
  if (L.kind === 'lab') return .6;
  const r = research(lobeId, ctx && ctx.data, 0); return r ? Math.min(.9, .3 + r.total / 60) : .3;
}

/* ---------------- label placement (no two lobe names on top of each other) ---------------- */
/** items: [{ id, x, y (the lobe's spot), w, h, pri (higher wins), z }] in one box { w, h }; each label tries centred above its
 *  lobe, then below, then left / right; a label that still overlaps a placed one (or leaves the box) is hidden.
 *  -> [{ id, x, y (top-left), show }] */
export function placeLabels(items, box, gap = 2) {
  const placed = [], out = new Map();
  const hit = (a, b) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  const inBox = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= box.w && r.y + r.h <= box.h;
  const order = arr(items).filter((it) => isObj(it) && Number.isFinite(it.x) && Number.isFinite(it.y))
    .sort((a, b) => (b.pri - a.pri) || ((a.z || 0) - (b.z || 0)));
  for (const it of order) {
    const w = it.w || 40, h = it.h || 14, tries = [[-w / 2, -h - 9], [-w / 2, 9], [-w - 10, -h / 2], [10, -h / 2]];
    let got = null;
    for (const [dx, dy] of tries) { const r = { x: it.x + dx, y: it.y + dy, w, h }; if (inBox(r) && !placed.some((p) => hit(p, r))) { got = r; break; } }
    if (got) placed.push(got);
    out.set(it.id, got ? { id: it.id, x: got.x, y: got.y, show: true } : { id: it.id, x: 0, y: 0, show: false });
  }
  return arr(items).filter((it) => out.has(it && it.id)).map((it) => out.get(it.id));
}

/* ---------------- the Strategy Lab cluster (cities/lab-data.json, tools/build_strategy_lab.py) ---------------- */
export const VERDICT_COLOR = { adopted: '#f1c14b', open: '#77db89', live: '#f1c14b', paper: '#77db89', promising: '#77db89', rejected: '#8a6bbd' };   // dim violet: visible on the cortex, never brighter than a live / mint one
export const VERDICT_WORD = { adopted: 'Adopted', open: 'Open', live: 'Live', paper: 'Paper', promising: 'Promising', rejected: 'Rejected' };
const lastSpan = (r) => { const sp = arr(r && r.spans); return sp[sp.length - 1] || {}; };
/** the lab rows, best first: live, then paper / promising, then rejected; inside each by the last span's $/month */
export function labRows(lab) {
  const R = { live: 0, paper: 1, promising: 1, rejected: 2 };
  return arr(isObj(lab) ? lab.rows : null).filter((r) => isObj(r) && r.id)
    .sort((a, b) => ((R[a.verdict] ?? 3) - (R[b.verdict] ?? 3)) || ((num(lastSpan(b).usd_mo) ?? -1e9) - (num(lastSpan(a).usd_mo) ?? -1e9)));
}
/** one neuron per strategy on a small sphere around the Strategy Lab lobe (golden-angle spiral: even, stable order) */
export function labNeurons(lab) {
  // the Strategy Lab cluster = the strategies that are not one of the pillars' own (LIT variants orbit LIT: pillarNeurons)
  const L = lobeById('lab'), rows = labRows(lab).filter((r) => r.verdict !== 'live' && r.src !== 'LEADERBOARD.md'), n = rows.length, ga = Math.PI * (3 - Math.sqrt(5));
  return rows.map((r, i) => {
    const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0, rad = Math.sqrt(1 - y * y), th = ga * i, k = .3;
    return { id: 'lab:' + r.id, rid: r.id, color: VERDICT_COLOR[r.verdict] || VERDICT_COLOR.rejected, verdict: r.verdict,
      pos: [L.pos[0] + Math.cos(th) * rad * k * 1.25, L.pos[1] + y * k * .7, L.pos[2] + Math.sin(th) * rad * k] };
  });
}
export const labRow = (lab, rid) => labRows(lab).find((r) => r.id === rid) || null;
export function labCounts(lab) {
  const c = { live: 0, paper: 0, promising: 0, rejected: 0 }; labRows(lab).forEach((r) => { if (r.verdict in c) c[r.verdict] += 1; }); return c;
}

/* ---------------- today: every bot's thinking in time order (the PC glance) ---------------- */
const BOT_COLOR = { lit: '#f1c14b', atlas: '#77db89', rapid: '#9d59ee', rapid2: '#9d59ee' };
const ATLAS_LOBE = [['ema', /^\s*EMA\b/i], ['macd', /^\s*MACD\b/i], ['sr', /^\s*S\/R\b/i]];
/** [{ hm, bot, name, lobe, color, text }] oldest first: the ext "glog" (8 a bot) when it came, else the glance's 4 a bot */
export function today(glance, lite) {
  const g = isObj(glance) ? glance : null, gl = isObj(lite) && isObj(lite.glog) ? lite.glog : {}, out = [];
  for (const b of arr(g && g.bots)) {
    if (!isObj(b) || !b.id || /blitz/i.test(String(b.id))) continue;
    const a = arr(gl[b.id]), c = arr(b.log), rows = (a.length >= c.length ? a : c).filter((x) => Array.isArray(x) && /^\d{1,2}:\d{2}$/.test(String(x[0])));
    for (const [hm, t] of rows) {
      const text = str(t, 200), lobe = b.id === 'atlas' ? ((ATLAS_LOBE.find(([, rx]) => rx.test(text)) || [])[0] || 'atlas') : b.id === 'lit' ? 'lit' : b.id;
      out.push({ hm: String(hm).padStart(5, '0'), bot: str(b.id, 12), name: b.id === 'lit' ? 'LIT' : b.id === 'atlas' ? 'ATLAS' : str(b.name || b.id, 20),
        lobe, color: (lobeById(lobe) || {}).color || BOT_COLOR[b.id] || '#9d59ee', text });
    }
  }
  const seen = new Set();
  return out.filter((x) => { const k = x.bot + x.hm + x.text; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.hm.localeCompare(b.hm) || a.bot.localeCompare(b.bot));
}

/* ---------------- the pillars' own research, orbiting them ---------------- */
const FIND_VERDICT = { a: 'adopted', r: 'rejected', o: 'open' };
/** every pillar's research as neurons on a shell around its lobe:
 *  Research Brain findings (brain-data.json; families LIT / ATLAS / BLITZ, or words that name a pillar), the Strategy Lab's LIT variants
 *  (LEADERBOARD.md) around LIT, the order-flow proxy tests (pillars-data.json) around ORDER FLOW.
 *  -> [{ id: 'find:<i>' | 'lab:<rid>' | 'of:<id>', pillar, color, verdict, pos }] */
export function pillarNeurons(brainData, lab, pillarsData) {
  const by = { lit: [], atlas: [], blitz: [], of: [] };
  arr(isObj(brainData) ? brainData.n : null).forEach((x, i) => {
    if (!isObj(x)) return;
    const fam = num(x.f), p = fam !== null && fam <= 2 ? pillarOf(`${x.t || ''} ${x.v || ''}`, fam) : pillarOf(`${x.t || ''}`, -1);
    if (p && by[p]) by[p].push({ id: 'find:' + (num(x.i) ?? i), verdict: FIND_VERDICT[x.s] || 'open' });
  });
  for (const r of labRows(lab)) if (r.src === 'LEADERBOARD.md') by.lit.push({ id: 'lab:' + r.id, verdict: r.verdict });
  const ofp = arr(isObj(pillarsData) ? pillarsData.pillars : null).find((p) => isObj(p) && p.id === 'of');
  for (const t of arr(ofp && ofp.tests)) if (isObj(t) && t.id) by.of.push({ id: 'of:' + t.id, verdict: t.verdict === 'rejected' ? 'rejected' : 'open' });
  const ga = Math.PI * (3 - Math.sqrt(5)), out = [];
  for (const pid of PILLAR_IDS) {
    const L = lobeById(pid), rows = by[pid], n = rows.length, k = Math.min(.34, .18 + n * .0016);
    rows.forEach((q, i) => {
      const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0, rad = Math.sqrt(1 - y * y), th = ga * i;
      out.push({ ...q, pillar: pid, color: VERDICT_COLOR[q.verdict] || VERDICT_COLOR.rejected,
        pos: [L.pos[0] + Math.cos(th) * rad * k * 1.15, L.pos[1] + y * k * .8, L.pos[2] + Math.sin(th) * rad * k] });
    });
  }
  return out;
}
/** a Research Brain finding by its neuron id ('find:<i>') */
export function finding(brainData, id) {
  const i = +String(id || '').replace(/^find:/, '');
  const x = arr(isObj(brainData) ? brainData.n : null).find((r, j) => isObj(r) && (num(r.i) ?? j) === i);
  if (!x) return null;
  const fam = arr(brainData.fam)[x.f];
  return { title: str(x.t, 200), result: str(x.r, 200), verdict: FIND_VERDICT[x.s] || 'open', text: str(x.v, 240), date: str(x.d, 10), family: str(fam, 40) };
}
