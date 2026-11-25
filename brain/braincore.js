// THE BRAIN, the model (day-brain-app 2026-11-24; owner: "I want a huge brain, where I can directly go to certain areas. Like each separate
// brain; see what trade is coming up soon, live 3D charts, brain thinking process"). Pure ES module (no DOM, no fetch, no storage; node-tested
// by tests/test_brain_app.py). Six regions, each its own brain: LIT (Zlarior), ATLAS, BLITZ, ORDER FLOW, MARKET LEARN (the shared learner),
// RISK (the accounts). It reuses what the site already knows how to read:
//   warroom/warcore.build  -> each bot's step chain, what the next step waits for, windows, levels, positions, the day's story
//   pillars/pillarsfeed    -> the Four Pillars (status words, accounts per pillar with today $, tick count, lessons, BLITZ / OF chains)
//   brain/learn.json       -> what each region learned (tools/build_brain_learn.py: journal + brain_state, else the weekly insights)
//   the PC post (optional per-bot fields, session day-brain-feed): glance bot .think [last 8 lines], .next {setup, steps, waiting_for,
//   dist_pts, window, limit, stop, target}, .levels [{k, p, p2?, label?}] (also accepted at lite.brain[id]). Absent = derived or "not sent".
// Nothing made up: a number no source has is null and drawn as "-" / "not sent"; the bundled fixture is always labelled SAMPLE.
//   build(src, nowS) -> { mode, pc, price, headline, sample, regions[], pulse }
import * as W from '../warroom/warcore.js?v=w2';
import * as NB from '../nq/nqbars.js?v=b1';
import * as PF from '../pillars/pillarsfeed.js?v=p3';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 240);
export const px = W.px, usd = W.usd, pts = W.pts;

export const REGIONS = [
  { id: 'lit', name: 'LIT', alias: 'Zlarior', color: '#f1c14b', glyph: 'Λ', blurb: 'The liquidity sweep brain: levels, sweep, CISD, entry' },
  { id: 'atlas', name: 'ATLAS', alias: 'three lobes', color: '#77db89', glyph: 'A', blurb: 'EMA, MACD and S/R lobes, one trade a day each' },
  { id: 'blitz', name: 'BLITZ', alias: 'paper', color: '#c58cff', glyph: 'B', blurb: 'The afternoon brain: built, switched OFF' },
  { id: 'of', name: 'ORDER FLOW', alias: 'ticks', color: '#9d59ee', glyph: 'Ω', blurb: 'Collecting NQ ticks for 3 pre-registered designs' },
  { id: 'learn', name: 'MARKET LEARN', alias: 'the learner', color: '#e9d58a', glyph: 'Ψ', blurb: 'The shared learner: what the market taught every bot' },
  { id: 'risk', name: 'RISK', alias: 'accounts', color: '#b6f0c2', glyph: '$', blurb: 'Every account: today $, room left, the 7-day clock' },
];
export const IDS = REGIONS.map((r) => r.id);
const FIB = [0.5, 0.618, 0.705, 0.79];          // the OTE band of an expansion leg

/* ---------------- the optional per-bot fields ---------------- */
function glanceBot(lite, id) {
  const G = arr(isObj(lite) && isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance.bots : null);
  return G.find((x) => isObj(x) && x.id === id) || null;
}
function extra(lite, id, key) {
  const g = glanceBot(lite, id);
  if (g && g[key] != null) return g[key];
  const b = isObj(lite) && isObj(lite.brain) && isObj(lite.brain[id]) ? lite.brain[id] : null;
  return b && b[key] != null ? b[key] : null;
}
/** think lines: ["text"] or [["hm", "text"]] or [{t|hm, text}] -> [{hm, text}] newest first (as sent: the PC sends newest first) */
export function thinkLines(raw) {
  return arr(raw).map((r) => {
    if (typeof r === 'string') return { hm: '', text: str(r, 220) };
    if (Array.isArray(r)) return { hm: str(r[0], 5), text: str(r[1], 220) };
    if (isObj(r)) return { hm: str(r.hm || (num(r.t) !== null ? (NB.et(num(r.t)) || {}).hm : ''), 5), text: typeof r.text === 'string' ? str(r.text, 220) : '' };
    return null;
  }).filter((r) => r && r.text).slice(0, 12);
}
const LV_KIND = { sweep: 'sweep', swept: 'sweep', level: 'level', liq: 'level', stop: 'stop', sl: 'stop', target: 'target', tp: 'target', limit: 'entry', entry: 'entry',
  fvg: 'fvg', gap: 'fvg', leg: 'leg', expansion: 'leg', fib: 'fib', cisd: 'cisd', ote: 'fib' };
/** levels: [{k, p, p2, label}] or [label, price] -> [{kind, price, price2, label}] */
export function levelRows(raw) {
  const out = [];
  for (const r of arr(raw)) {
    if (Array.isArray(r) && num(r[1]) !== null) out.push({ kind: LV_KIND[String(r[2] || '').toLowerCase()] || 'level', price: num(r[1]), price2: null, label: str(r[0], 36) });
    else if (isObj(r)) {
      const p = num(r.p ?? r.price), p2 = num(r.p2 ?? r.to ?? r.price2), k = LV_KIND[String(r.k || r.kind || '').toLowerCase()] || 'level';
      if (p !== null) out.push({ kind: k, price: p, price2: p2, label: str(r.label || r.l || r.k || r.kind || '', 36) });
    }
  }
  return out.slice(0, 24);
}
/** fib retracements of an expansion leg (from -> to): the price at each OTE ratio, measured back from the leg's end */
export function fibs(leg) {
  const a = num(leg && leg.price), b = num(leg && leg.price2);
  if (a === null || b === null || a === b) return [];
  return FIB.map((f) => ({ kind: 'fib', price: Math.round((b - (b - a) * f) * 4) / 4, price2: null, label: `fib ${f}` }));
}

/* ---------------- the next trade of one bot ---------------- */
function nextTrade(id, bot, lite, warLevels, price, pos) {
  const N = extra(lite, id, 'next'), n = isObj(N) ? N : null;
  const byKind = (k) => { const l = warLevels.find((x) => x.who === id && x.kind === k); return l ? l.price : null; };
  const p = arr(pos).find((x) => x.bot === id) || null;
  const steps = n && arr(n.steps).length ? arr(n.steps).map((s) => (isObj(s) ? { label: str(s.label || s.k, 40), state: ['done', 'now', 'wait'].includes(s.state) ? s.state : s.done ? 'done' : 'wait' }
    : { label: str(s, 40), state: 'done' })).slice(0, 10) : null;
  const limit = num(n && n.limit) ?? (p ? p.entry : byKind('entry')), stop = num(n && n.stop) ?? (p ? p.stop : byKind('stop')), target = num(n && n.target) ?? (p ? p.target : byKind('target'));
  let dist = num(n && n.dist_pts), distFrom = dist !== null ? 'from the PC' : '';
  if (dist === null && price !== null) {
    const ref = limit !== null && !p ? limit : null;
    if (ref !== null) { dist = Math.abs(ref - price); distFrom = 'to the limit'; }
    else {
      const lv = warLevels.filter((x) => x.who === id && x.kind === 'level' && num(x.price) !== null).sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0];
      if (lv) { dist = Math.abs(lv.price - price); distFrom = `to the ${lv.label.replace(/^(LIT|ATLAS) /, '')}`; }
    }
  }
  const rr = limit !== null && stop !== null && target !== null && limit !== stop ? Math.abs(target - limit) / Math.abs(limit - stop) : null;
  return {
    setup: str(n && n.setup, 120) || (bot && bot.now ? `${bot.now.label}${bot.stepText && bot.stepText !== '-' ? ` (${bot.stepText})` : ''}` : ''),
    waiting: str(n && n.waiting_for, 240) || (bot && bot.next ? bot.next.text : ''),
    window: str(n && n.window, 80) || (bot && bot.window ? bot.window.text : ''),
    steps, limit, stop, target, rr, dist, distFrom, from: n ? 'pc' : 'derived',
    pct: bot && bot.meter ? bot.meter.pct : 0, word: bot && bot.meter ? bot.meter.word : 'No data', inTrade: !!p, pos: p,
  };
}

/* ---------------- the chart of one region: candles + that bot's levels (+ FVG zones, fib lines) ---------------- */
export const CHART_BARS = 48;
function chartOf(id, bars, warChart, lite, nowS) {
  const all = isObj(bars) ? NB.unpack(bars) : [];
  if (!all.length) return { state: 'none', candles: [], levels: [], text: 'The PC has not sent chart bars yet.' };
  const c = all.slice(-CHART_BARS);
  const levels = arr(warChart && warChart.levels).concat(arr(warChart && warChart.off)).filter((l) => l.who === id)
    .map((l) => ({ kind: l.kind === 'cisd' ? 'cisd' : l.kind, price: l.price, price2: null, label: l.label.replace(/^(LIT|ATLAS) /, '') }));
  const extraLv = levelRows(extra(lite, id, 'levels'));
  for (const l of extraLv) {                       // the PC's own levels win over the same price read from its words
    const same = levels.findIndex((x) => Math.abs(x.price - l.price) < 0.01 && (x.kind === l.kind || x.kind === 'level' || x.kind === 'cisd' || (x.kind === 'entry' && l.kind === 'entry')));
    if (same >= 0) levels.splice(same, 1, l); else levels.push(l);
    if (l.kind === 'leg') levels.push(...fibs(l));
  }
  for (let i = levels.length - 1; i > 0; i--) if (levels.slice(0, i).some((x) => Math.abs(x.price - levels[i].price) < 0.01 && x.kind !== 'fvg' && levels[i].kind !== 'fvg' && x.kind !== 'leg' && levels[i].kind !== 'leg')) levels.splice(i, 1);
  const dataT = num(bars.t) || c[c.length - 1][0] + 300, age = Math.max(0, nowS - dataT);
  let lo = Math.min(...c.map((b) => b[3])), hi = Math.max(...c.map((b) => b[2]));
  const range = Math.max(4, hi - lo), lim = [lo - range, hi + range];
  const far = [lo - range * 2.5, hi + range * 2.5];           // the trade's own lines (limit, stop, target, sweep, FVG, fibs) reach further than plain levels
  const inView = levels.filter((l) => (l.kind === 'level' ? l.price >= lim[0] && l.price <= lim[1] : l.price >= far[0] && l.price <= far[1]));
  for (const l of inView) { lo = Math.min(lo, l.price, l.price2 ?? l.price); hi = Math.max(hi, l.price, l.price2 ?? l.price); }
  return { state: age <= NB.FRESH_S ? 'ok' : 'old', candles: c.map(([t, o, h, l, cl]) => ({ t, o, h, l, c: cl })), lo, hi, last: c[c.length - 1][4],
    levels: inView.slice(0, 16), off: levels.filter((l) => !inView.includes(l)).length, dataT, age,
    text: `NQ 5-minute bars, the last ${c.length}, from the PC ${W.ago(age)}.` };
}

/* ---------------- learning ---------------- */
function learnOf(id, L, P, nowS) {
  const J = arr(isObj(L) ? L.journal : null), st = isObj(L) && isObj(L.state) && isObj(L.state[id]) ? L.state[id] : null;
  const day = (t) => new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), weekAgo = day(nowS - 7 * 86400);
  const mine = J.filter((r) => isObj(r) && (r.pillar === id || (id === 'learn' && !IDS.slice(0, 4).includes(r.pillar))));
  const week = mine.filter((r) => String(r.date || '') >= weekAgo).slice(0, 6);
  const conf = num(st && st.confidence);
  const lessons = P && arr(P.lessons).length ? arr(P.lessons).slice(0, 4).map((x) => ({ d: str(x.d, 10), text: str(x.text, 260) })) : [];
  return { has: !!(mine.length || st), confidence: conf, confWord: conf === null ? 'not scored yet' : conf >= 0.7 ? 'high' : conf >= 0.4 ? 'medium' : 'low',
    lessonsN: num(st && st.lessons), last: str(st && st.last_learned, 120), testing: arr(st && st.testing_next).map((x) => str(x, 200)).filter(Boolean),
    read: str(st && st.market_read, 240), week, older: mine.length - week.length, lessons,
    src: isObj(L) ? (arr(L.sources).join(' + ') || 'none') : 'brain/learn.json not loaded', journalLanded: !!(isObj(L) && L.journal_landed) };
}

/* ---------------- the whole brain ---------------- */
export function build(src, nowS) {
  const S = isObj(src) ? src : {}, lite = isObj(S.lite) ? S.lite : null, L = isObj(S.learn) ? S.learn : null;
  const war = W.build({ lite, bars: S.bars, brief: S.brief, pillars: S.pillarsData, hidden: S.hidden }, nowS, []);
  let pillars = [];
  try { pillars = PF.modelFrom({ data: S.pillarsData, home: S.home || {}, biz: S.biz, payday: S.payday, file: S.file, lite, nowS, feed: S.feed, coach: S.coach || null }); } catch (_) { pillars = []; }
  const pil = (id) => pillars.find((p) => p.id === id) || null;
  const wbot = (id) => war.bots.find((b) => b.id === id) || null;
  const warLevels = arr(war.chart && war.chart.levels).concat(arr(war.chart && war.chart.off));
  const price = war.price;
  const regions = REGIONS.map((R) => {
    const P = pil(R.id), B = wbot(R.id), g = glanceBot(lite, R.id);
    const reg = { ...R, status: P ? P.statusWord : B ? B.pill : '', level: P ? P.level : 'warn', statusText: P ? str(P.status, 240) : '' };
    // NEXT TRADE + chart: the trading regions
    if (R.id === 'lit' || R.id === 'atlas') {
      reg.next = nextTrade(R.id, B, lite, warLevels, price, war.positions);
      reg.chain = B ? B.groups.map((G) => ({ id: G.id, name: G.name, state: G.state || '', needs: str(G.needs, 200), steps: arr(G.steps).map((s) => ({ n: s.n, label: s.label, state: s.state, help: str(s.help, 200) })) })) : [];
      reg.chart = chartOf(R.id, S.bars, war.chart, lite, nowS);
    } else if (R.id === 'blitz' || R.id === 'of') {
      reg.next = { setup: R.id === 'blitz' ? 'Switched OFF (paper only)' : (P && P.tick && P.tick.has ? `Collecting: ${P.tick.d} of ${P.tick.of} tick days` : 'Not collecting yet'),
        waiting: R.id === 'blitz' ? 'The owner\'s yes to switch it on, on a Rapid eval.' : (P && P.tick ? P.tick.text : 'The tick recorder\'s first count.'),
        window: R.id === 'blitz' ? '11:00-15:30 ET when on' : '', steps: null, limit: null, stop: null, target: null, rr: null, dist: null, distFrom: '',
        pct: R.id === 'of' && P && P.tick && P.tick.frac !== null ? Math.round(P.tick.frac * 100) : 0, word: R.id === 'blitz' ? 'Off' : 'Collecting', from: 'derived' };
      reg.chain = P && P.chain ? [{ id: R.id, name: '', state: '', needs: '', steps: arr(P.chain.steps).map((s, i) => ({ n: i + 1, label: str(s.label, 40), state: s.state, help: str(s.help, 200) })) }] : [];
      reg.chart = null;
      if (R.id === 'of') reg.designs = arr(P && P.designs).map((d) => ({ id: d.id, text: str(d.text, 160) }));
    } else {
      reg.next = null; reg.chain = []; reg.chart = null;
    }
    // THINKING: the PC's think lines, else its thought stream (glog / glance log), + the War Room story for that bot
    const think = thinkLines(extra(lite, R.id, 'think'));
    const glog = isObj(lite) && isObj(lite.glog) ? thinkLines(lite.glog[R.id]) : [];
    const log = thinkLines(g && g.log);
    const story = arr(war.feed).filter((f) => f.who === R.id && f.kind !== 'log').slice(0, 6).map((f) => ({ hm: f.hm, text: str(f.text, 220), kind: f.kind }));
    reg.think = (think.length ? think : glog.length >= log.length ? glog : log).map((x) => ({ ...x, kind: think.length ? 'think' : 'log' }));
    reg.thinkFrom = think.length ? 'think' : (glog.length || log.length) ? 'log' : 'none';
    for (const s of story) if (!reg.think.some((x) => x.text === s.text)) reg.think.push(s);
    // LEARNING
    reg.learn = learnOf(R.id, L, P, nowS);
    if (R.id === 'learn') {
      reg.think = reg.think.concat(reg.learn.week.slice(0, 6).map((r) => ({ hm: str(r.date, 10).slice(5), text: `${r.pillar === 'learn' ? 'Shared' : (REGIONS.find((x) => x.id === r.pillar) || { name: r.pillar }).name}: ${str(r.text, 200)}`, kind: 'learn' })));
      reg.status = L ? (L.journal_landed ? 'LEARNING' : 'WEEKLY') : 'WAITING';
      reg.level = L ? 'ok' : 'warn';
      reg.statusText = L ? str(L.line || 'Lessons from the weekly market study.', 200) : 'brain/learn.json not loaded.';
      reg.current = isObj(L && L.current) ? { regime: str(L.current.regime, 20), vix: num(L.current.vix), band: str(L.current.vix_band, 20), prior: str(L.current.prior_day, 20), for: str(L.current.for, 10) } : null;
    }
    // TODAY $: the accounts on this pillar (the Accounts screen's cards), + the glance's day / room for the bot
    const accts = P ? arr(P.accounts).map((a) => ({ name: str(a.name, 40), stage: str(a.stage, 12), today: a.todayText || '-', lvl: a.todayLvl || 'none', state: str(a.stateWord, 30), clock: a.clock ? a.clock.text : '' })) : [];
    reg.money = { accounts: accts, day: num(g && g.day), room: num(g && g.room), mll: num(g && g.mll) };
    return reg;
  });
  // RISK: every account once, the glance's room per bot, the 7-day banner words
  const risk = regions.find((r) => r.id === 'risk'), seen = new Set(), all = [];
  for (const r of regions) for (const a of r.money.accounts) if (!seen.has(a.name)) { seen.add(a.name); all.push({ ...a, bot: r.name }); }
  const rooms = ['lit', 'atlas'].map((id) => { const g = glanceBot(lite, id); return g ? { bot: id === 'lit' ? 'LIT' : 'ATLAS', day: num(g.day), room: num(g.room), mll: num(g.mll) } : null; }).filter(Boolean);
  risk.money = { accounts: all, rooms, day: rooms.reduce((s, x) => (x.day === null ? s : (s ?? 0) + x.day), null) };
  risk.status = !lite ? 'WAITING' : rooms.some((x) => x.room !== null && x.mll && x.room / x.mll < 0.25) ? 'TIGHT' : 'OK';
  risk.level = !lite ? 'warn' : risk.status === 'TIGHT' ? 'bad' : 'ok';
  risk.statusText = rooms.length ? rooms.map((x) => `${x.bot} today ${usd(x.day, true)} · room ${usd(x.room)}${x.mll ? ` of ${usd(x.mll)}` : ''}`).join(' · ') : 'Waiting for the PC\'s numbers.';
  risk.think = rooms.map((x) => ({ hm: '', text: `${x.bot}: ${x.room !== null && x.mll ? `${Math.round((x.room / x.mll) * 100)}% of the loss room left` : 'room not sent'}${x.day !== null ? `, today ${usd(x.day, true)}` : ''}.`, kind: 'risk' }))
    .concat(all.filter((a) => a.clock).map((a) => ({ hm: '', text: `${a.name}: 7-day clock ${a.clock}`, kind: 'risk' })));
  // the pulse: one number per region for the 3D brain (how lit its neurons are, 0..1)
  const pulse = Object.fromEntries(regions.map((r) => [r.id, Math.max(0.12, Math.min(1, r.id === 'lit' || r.id === 'atlas' ? (r.next.pct || 0) / 100 * 0.85 + (r.think.length ? 0.15 : 0)
    : r.id === 'of' ? 0.2 + (r.next.pct || 0) / 200 : r.id === 'blitz' ? 0.12 : r.id === 'learn' ? (r.learn.week.length ? 0.6 : 0.3) : r.level === 'bad' ? 0.9 : 0.4))]));
  return { t: nowS, mode: S.sample ? 'sample' : lite ? 'live' : 'none', sample: !!S.sample, pc: war.pc, price, headline: war.headline, next: war.next, regions, pulse, positions: war.positions };
}
export const region = (M, id) => arr(M && M.regions).find((r) => r.id === id) || null;
