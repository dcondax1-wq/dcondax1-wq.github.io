// THE WAR ROOM, the model (day-warroom 2026-11-24; owner ~08:30 ET: "We used to have steps for our entries, like what the brain was thinking.
// I want to see that for each, everything combined ... I want to know exactly what we are doing at all times").
// Pure (no DOM, no network, no storage; node-tested by tests/test_warroom.py). Everything comes from what the PC already posts:
//   lite  = the PC's newest status post (pc_feed.js fetchLatest: pc.glance bots = stage n/10, wait, why, lv, arm, pos, log; glog = the longer
//           thought stream; price; t / reporter.t = when the PC spoke)
//   bars  = the PC's "le-bars" post (nqbars.js: the last 5-minute bars + every open trade with entry / stop / target, by account LABEL)
//   brief = nq/brief.json (each bot's entry windows), pillars = pillars/pillars-data.json (BLITZ's and ORDER FLOW's steps + state)
// Nothing is made up: what the PC does not send says "waiting" or "not sent". BLITZ is hidden (paper): only its steps, never live data.
// Account ids never appear: the bars post carries labels; the glance's "mode" (it can hold part of an account id) is never shown.
//   build(src, nowS, memo) -> { pc, price, headline, bots[], feed[], chart, positions[], milestones[] }
import { LIT_STAGES, ATLAS_STEPS, ATLAS_LOBES, stageN, lobeState } from '../nq/braincore.js?v=7';
import * as NB from '../nq/nqbars.js?v=b1';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 240);
export const px = (v) => (num(v) === null ? '-' : num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pts = (v) => (num(v) === null ? '-' : Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 1 }));
export const usd = (v, sign) => { const n = num(v); if (n === null) return '-'; const r = Math.sign(n) * Math.round(Math.abs(n)), a = '$' + Math.abs(r).toLocaleString('en-US'); return r < 0 ? '-' + a : sign && r > 0 ? '+' + a : a; };
const MNQ = 2;                                     // $ a point a micro
export const COLORS = { lit: '#f1c14b', atlas: '#77db89', blitz: '#9d59ee', of: '#6fb7ff' };
export const PC_OK_S = 20 * 60, PC_OLD_S = 60 * 60;   // the PC posts every 15 minutes (pc_feed.js FRESH_S)

// ------------------------------------------------------------------------------------------------ time (New York)
export function etNow(nowS) { const p = NB.et(nowS) || { hm: '00:00', wd: 1, day: '', off: 0 }; return { ...p, mod: +p.hm.slice(0, 2) * 60 + +p.hm.slice(3) }; }
const toM = (s) => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
/** the epoch second of today's (ET) wall time "HH:MM" + k days */
export function atET(nowS, hm, k) { const p = etNow(nowS), wall = nowS + p.off, day0 = Math.floor(wall / 86400) * 86400; return day0 + (toM(hm) || 0) * 60 + (k || 0) * 86400 - p.off; }
export function dur(sec) { const s = Math.max(0, Math.round(num(sec) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }
export function clock(sec) { const s = Math.max(0, Math.floor(num(sec) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), z = (n) => String(n).padStart(2, '0'); return h ? `${h}:${z(m)}:${z(s % 60)}` : `${m}:${z(s % 60)}`; }
export function ago(sec) { const s = num(sec); if (s === null) return 'never'; if (s < 90) return 'just now'; return dur(s) + ' ago'; }

// each bot's entry windows (nq/brief.json, else these: the brief's own numbers on 2026-11-24)
const WIN_DEFAULT = { lit: [['02:00', '15:30']], atlas_ema: [['03:00', '09:30']], atlas_macd: [['02:00', '05:00'], ['09:30', '11:00']], atlas_sr: [['09:30', '12:00']],
  blitz: [['11:00', '15:30']] };
export function windowsOf(brief, id) {
  const b = arr(isObj(brief) ? brief.bots : null).find((x) => isObj(x) && x.id === id);
  const w = b ? arr(b.windows).filter((x) => isObj(x) && toM(x.from) !== null && toM(x.to) !== null).map((x) => [x.from, x.to]) : [];
  return w.length ? w : (WIN_DEFAULT[id] || []);
}
/** where a set of windows stands now: open (with the end) / later today / over / weekend, and the next opening (epoch) */
export function windowState(wins, nowS, label) {
  const p = etNow(nowS), wd = p.wd, mod = p.mod;
  const weekend = wd === 6 || (wd === 0 && mod < 18 * 60) || (wd === 5 && mod >= 17 * 60);
  const W = arr(wins).map(([f, t]) => ({ from: f, to: t, fm: toM(f), tm: toM(t) })).sort((a, b) => a.fm - b.fm);
  if (!W.length) return { state: 'none', text: 'No entry window: not a trading bot yet', nextS: null, endS: null };
  const span = W.map((w) => `${w.from}-${w.to}`).join(' + ') + ' ET';
  if (!weekend) {
    const o = W.find((w) => mod >= w.fm && mod < w.tm);
    if (o) {
      const endS = atET(nowS, o.to), len = (o.tm - o.fm) * 60;
      return { state: 'open', span, from: o.from, to: o.to, endS, nextS: null, left: Math.max(0, endS - nowS), frac: Math.max(0, Math.min(1, (endS - nowS) / len)),
        text: `${label} window open until ${o.to} ET` };
    }
    const nx = W.find((w) => mod < w.fm);
    if (nx) return { state: 'later', span, from: nx.from, to: nx.to, day: 'today', nextS: atET(nowS, nx.from), endS: null, text: `${label} opens ${nx.from} ET` };
  }
  // over for today (or the weekend): the first window of the next trading day (Fri evening / Sat / Sun before 18:00 -> Monday)
  const k = wd === 5 ? 3 : wd === 6 ? 2 : wd === 0 ? 1 : 1;
  const nextS = atET(nowS, W[0].from, wd === 0 && mod < 18 * 60 ? 1 : k);
  const dw = wd === 5 || wd === 6 || (wd === 0 && mod < 18 * 60) ? 'Monday' : 'tomorrow';
  return { state: weekend ? 'weekend' : 'over', span, from: W[0].from, to: W[0].to, day: dw, nextS, endS: null,
    text: `${label} ${weekend ? 'next opens' : 'done for today; next'} ${W[0].from} ET ${wd === 5 || wd === 6 || (wd === 0 && mod < 18 * 60) ? 'Monday' : 'tomorrow'}` };
}

// ------------------------------------------------------------------------------------------------ numbers inside the PC's words
/** "limit 26,244.50 · stop 26,339.50 · target 26,100.00" -> {limit, stop, target, entry, cisd}; only numbers the PC wrote */
export function pricesIn(text) {
  const out = {}, s = String(text || '');
  const rx = /\b(limit|entry|stop|target|through|back to)\s+(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,6}(?:\.\d+)?)/gi;
  let m;
  while ((m = rx.exec(s))) {
    const k = m[1].toLowerCase(), v = +m[2].replace(/,/g, ''), key = k === 'through' ? 'cisd' : k === 'back to' ? 'limit' : k;
    if (Number.isFinite(v) && out[key] === undefined) out[key] = v;
  }
  return out;
}
/** ATR(14) of complete 5-minute bars (the same definition as engine/brain.py: the average true range of the last 14 five-minute bars) */
export function atr14(bars, forming) {
  const B = arr(bars).slice(0, forming ? -1 : undefined);
  if (B.length < 15) return null;
  const tr = [];
  for (let i = B.length - 14; i < B.length; i += 1) { const [, , h, l] = B[i], pc = B[i - 1][4]; tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))); }
  return Math.round((tr.reduce((a, b) => a + b, 0) / tr.length) * 10) / 10;
}

// ------------------------------------------------------------------------------------------------ LIT
const LIT_PCT = [0, 6, 24, 38, 50, 64, 78, 88, 96, 100, 0];            // how close a trade is at stage n (1..10)
const litWord = (n) => (n == null ? 'Waiting' : n <= 1 ? 'Far' : n <= 4 ? 'Forming' : n <= 6 ? 'Close' : n <= 8 ? 'Imminent' : n === 9 ? 'In a trade' : 'Done today');

function nearest(lv, last) {
  const rows = arr(lv).filter((x) => Array.isArray(x) && num(x[1]) !== null).map(([label, p, d]) => {
    const dist = num(last) !== null ? num(p) - num(last) : num(d);
    return { label: str(label, 40), price: num(p), dist };
  });
  const above = rows.filter((r) => r.dist !== null && r.dist > 0).sort((a, b) => a.dist - b.dist)[0] || null;
  const below = rows.filter((r) => r.dist !== null && r.dist < 0).sort((a, b) => b.dist - a.dist)[0] || null;
  return { above, below, rows };
}

/** what LIT's NEXT step waits for, in plain words with the numbers (stage n = where it is now) */
export function litNeeds(n, g, ctx) {
  const atr = num(ctx.atr), half = atr !== null ? Math.round(atr * 5) / 10 : null, last = ctx.last, arm0 = arr(g && g.arm)[0] || null;
  const atrSrc = atr !== null ? ` (0.5 ATR; ATR ${pts(atr)} pts${ctx.atrSrc ? ' ' + ctx.atrSrc : ''})` : ' (0.5 ATR: the ATR is not sent yet)';
  const N = nearest(g && g.lv, last);
  switch (n) {
    case null: case 0: case 1: {
      const parts = [];
      if (N.below) parts.push(`${half !== null ? `a sweep of ≥ ${pts(half)} pts below` : 'a sweep below'} the ${N.below.label} at ${px(N.below.price)} (${pts(N.below.dist)} pts away)`);
      if (N.above) parts.push(`${half !== null ? `≥ ${pts(half)} pts above` : 'a sweep above'} the ${N.above.label} at ${px(N.above.price)} (${pts(N.above.dist)} pts away)`);
      return parts.length ? `Needs ${parts.join(', or ')}${atrSrc}.` : `Needs a sweep: price through a liquidity level by at least 0.5 ATR${atr !== null ? ` (≥ ${pts(half)} pts)` : ''}. The PC has not sent today's levels yet.`;
    }
    case 2: return `Needs inducement: a smaller swing within 1 ATR${atr !== null ? ` (${pts(atr)} pts)` : ''} of the swept level taken first, at most 36 bars old.`;
    case 3: return `Needs displacement: a 5-minute candle back the other way with a body of ≥ 0.8 ATR${atr !== null ? ` (≥ ${pts(atr * 0.8)} pts)` : ''}.`;
    case 4: {
      const c = pricesIn(arm0 && arm0.trig).cisd;
      return `Needs the 5m CISD: a 5-minute close back through the open of the last run of candles into the sweep extreme${c ? ` (the CISD line at ${px(c)})` : ''}.`;
    }
    case 5: {
      const chk = arr(g && g.chk), blk = arr(g && g.blk);
      return `Needs its checks to pass, then a limit order at the CISD level (valid 30 minutes)${chk.length === 2 ? `: ${chk[0]} of ${chk[1]} checks passed on the last setup` : ''}${blk.length ? `. Blocked by: ${blk.map((x) => str(x, 60)).join('; ')}` : ''}.`;
    }
    case 6: {
      const a = arr(g && g.arm).find((x) => isObj(x) && x.text !== 'forming');
      return a ? `Needs a tap: ${str(a.trig, 160)}` : 'Needs price to come back to the limit within 30 minutes, then a 1-minute close back its way.';
    }
    case 7: return 'Needs the 1m CISD: a 1-minute close back its way within 20 one-minute bars; the entry is the next 1-minute open.';
    case 8: return 'Needs the fill: the market order goes in about 3 s after the 1m CISD close, at the next 1-minute open.';
    case 9: { const p = isObj(g && g.pos) ? g.pos : {};
      return `Needs the stop${num(p.stop) !== null ? ` at ${px(p.stop)}` : ''} or the target${num(p.target) !== null ? ` at ${px(p.target)}` : ''}; breakeven at +1R, the 15-minute check, flat by 15:55 ET.`; }
    default: return 'Done for today (one trade a day). Tomorrow starts a new map at 18:00 ET.';
  }
}

function litBot(g, ctx) {
  const off = !g || g.on === false || ctx.stopped, n = g ? stageN(g.stage) : null;
  const steps = LIT_STAGES.map(([key, label, help], i) => {
    const k = i + 1;
    let state = n === null ? 'wait' : k < n ? 'done' : k === n ? 'now' : k === n + 1 ? 'next' : 'wait';
    if (n === 10) state = 'done';
    if (off && n !== 10) state = k < (n || 1) ? 'done' : k === n ? 'now' : 'off';
    return { n: k, key, label, help, state };
  });
  const cur = n ? steps[n - 1] : null, nxt = n && n < 10 ? steps[n] : !n && g ? steps[0] : null;
  const win = windowState(windowsOf(ctx.brief, 'lit'), ctx.now, 'LIT');
  const word = !g ? 'No data' : ctx.stopped ? 'PC stopped' : g.on === false ? 'Off' : win.state !== 'open' && n !== 9 && n !== 10 ? 'Window closed' : litWord(n);
  const pct = !g || off ? 0 : win.state !== 'open' && n !== 9 ? 0 : LIT_PCT[n || 0];
  return {
    id: 'lit', name: 'LIT', alias: 'Zlarior', color: COLORS.lit, has: !!g, on: !!(g && g.on), armed: !!(g && g.armed), hidden: false,
    pill: !g ? 'NO DATA' : ctx.stopped ? 'STOPPED' : g.on === false ? 'OFF' : g.armed ? 'ARMED' : 'ON · NOT ARMED',
    stepText: n ? `${n}/10` : '-', groups: [{ id: 'lit', name: '', steps }],
    now: cur ? { label: cur.label, text: str(g.wait || cur.help, 240) } : g ? { label: 'Levels', text: str(g.wait || 'Mapping today\'s levels.', 240) } : null,
    next: nxt ? { label: nxt.label, text: litNeeds(n, g, ctx) } : null,
    why: g && g.why ? str(g.why, 220) : '', nar: g && g.nar ? str(g.nar, 110) : '',
    window: win, meter: { pct, word, time: win.state === 'open' ? win.frac : 0 },
  };
}

// ------------------------------------------------------------------------------------------------ ATLAS: three lobes, each its own steps and hours
const LOBE_PCT = { window: 12, signal: 48, armed: 86, trade: 100, done: 0, off: 0, unknown: 0 };
const LOBE_SIGNAL = { ema: 'a trend pullback that sweeps a swing', macd: 'a LIT level swept with MACD divergence', sr: 'a day level swept after an inducement' };
function lobeNeeds(L, st, win, g, ctx) {
  if (st.state === 'off') return `Off: ${st.text || 'not running'}.`;
  if (st.state === 'done') return 'Done for today (one trade a day).';
  if (st.state === 'trade') return 'Needs its stop or its target (breakeven + costs at 1R).';
  if (win.state !== 'open' && st.state !== 'armed') return `Needs its window: ${win.text}.`;
  if (st.state === 'armed') {
    const a = arr(g && g.arm).find((x) => isObj(x) && new RegExp('^' + L.name.replace('/', '\\/') + ':', 'i').test(String(x.text || '')));
    const seg = new RegExp(L.name.replace('/', '\\/') + ':([^·]+)', 'i').exec(String(g && g.why || '')), w = /waiting (until [^.;…·]+)/i.exec(`${st.text || ''} ${seg ? seg[1] : ''}`);
    return `Needs the trigger${w ? `: ${w[1].trim()}` : ': its 5m close'}${a ? ` · ${str(String(a.text).replace(/^[^:]+:\s*/, ''), 90)}` : ''}.`;
  }
  if (st.state === 'signal') return 'Needs the setup armed: entry, stop and target set, then its 5m trigger.';
  const lvl = L.id !== 'ema' ? nearest(arr(g && g.lv).filter((x) => Array.isArray(x) && (L.id === 'sr' ? /^S\/R/i.test(x[0]) : true)), ctx.last) : null;
  const near = lvl && (lvl.below || lvl.above);
  return `Needs a signal: ${LOBE_SIGNAL[L.id]}${near ? ` (nearest: ${near.label} at ${px(near.price)}${near.dist !== null ? `, ${pts(near.dist)} pts away` : ''})` : ''}.`;
}
function atlasBot(g, ctx) {
  const off = !g || g.on === false || ctx.stopped;
  const groups = [], wins = [];
  let pct = 0, best = null;
  for (const L of ATLAS_LOBES) {
    const st = g ? lobeState(g, L) : { state: 'unknown', text: '' }, idx = ATLAS_STEPS.findIndex((x) => x[0] === st.state);
    const win = windowState(windowsOf(ctx.brief, L.brief), ctx.now, `ATLAS ${L.name}`);
    wins.push(win);
    const steps = ATLAS_STEPS.map(([key, label, help], i) => {
      let state = idx < 0 ? (i === 0 ? 'next' : 'wait') : i < idx ? 'done' : i === idx ? (st.state === 'done' ? 'done' : 'now') : i === idx + 1 ? 'next' : 'wait';
      if (st.state === 'done') state = 'done';
      if (st.state === 'off' || off) state = i < Math.max(0, idx) ? 'done' : 'off';
      return { n: i + 1, key: `${L.id}:${key}`, label, help, state };
    });
    const needs = lobeNeeds(L, st, win, g, ctx);
    const p = off ? 0 : (win.state === 'open' || st.state === 'armed' || st.state === 'trade') ? LOBE_PCT[st.state] || 0 : 0;
    if (p > pct) { pct = p; best = L; }
    groups.push({ id: L.id, name: L.name, state: st.state, text: str(st.text, 200), needs, window: win, steps, pct: p });
  }
  const open = wins.filter((w) => w.state === 'open').sort((a, b) => b.left - a.left)[0] || null;
  const later = wins.filter((w) => w.nextS).sort((a, b) => a.nextS - b.nextS)[0] || null;
  const win = open || later || wins[0];
  const bg = best ? groups.find((x) => x.id === best.id) : groups.find((x) => x.state !== 'done' && x.state !== 'off') || groups[0];
  const word = !g ? 'No data' : ctx.stopped ? 'PC stopped' : g.on === false ? 'Off' : groups.some((x) => x.state === 'trade') ? 'In a trade'
    : groups.every((x) => x.state === 'done') ? 'Done today' : pct >= 80 ? 'Imminent' : pct >= 40 ? 'Forming' : open ? 'Far' : 'Window closed';
  return {
    id: 'atlas', name: 'ATLAS', alias: 'EMA · MACD · S/R', color: COLORS.atlas, has: !!g, on: !!(g && g.on), armed: !!(g && g.armed), hidden: false,
    pill: !g ? 'NO DATA' : ctx.stopped ? 'STOPPED' : g.on === false ? 'OFF' : g.armed ? 'ARMED' : 'ON · NOT ARMED',
    stepText: `${groups.filter((x) => x.state === 'done').length}/3 done`, groups,
    now: bg && g ? { label: `${bg.name}: ${bg.state === 'unknown' ? 'waiting' : bg.state}`, text: bg.text || str(g.wait, 200) } : null,
    next: bg && g ? { label: bg.name, text: bg.needs } : null,
    why: g && g.why ? str(g.why, 240) : '', nar: g && g.nar ? str(g.nar, 110) : '',
    window: win, meter: { pct, word, time: open ? open.frac : 0 },
  };
}

// ------------------------------------------------------------------------------------------------ BLITZ (hidden: steps only) and ORDER FLOW (research)
function chainOf(P, id) { const p = arr(isObj(P) ? P.pillars : null).find((x) => isObj(x) && x.id === id); return { p, chain: arr(p && p.chain).filter((c) => isObj(c) && c.key) }; }
function blitzBot(ctx) {
  const { p, chain } = chainOf(ctx.pillars, 'blitz');
  const live = p && p.state === 'live' && !ctx.hidden.includes('blitz');
  const steps = chain.map((c, i) => ({ n: i + 1, key: str(c.key, 20), label: str(c.label, 30), help: str(c.help, 220), state: 'off' }));
  const win = windowState(windowsOf(ctx.brief, 'blitz'), ctx.now, 'BLITZ checks');
  return { id: 'blitz', name: 'BLITZ', alias: 'the scalper', color: COLORS.blitz, has: !!p, on: false, armed: false, hidden: !live,
    pill: live ? 'ON' : 'HIDDEN · PAPER', stepText: `${steps.length} steps`, groups: [{ id: 'blitz', name: '', steps }],
    now: { label: 'Off', text: live ? 'The PC does not post BLITZ\'s steps yet.' : 'Hidden and paper-only (owner 2026-11-16): its steps are shown, never live BLITZ data.' },
    next: steps[0] ? { label: steps[0].label, text: `When it is on: ${steps[0].help}` } : null,
    why: p ? str(p.status, 200) : '', nar: '', window: win, meter: { pct: 0, word: live ? 'Waiting' : 'Off (paper)', time: 0 } };
}
function ofBot(ctx) {
  const { p, chain } = chainOf(ctx.pillars, 'of'), R = p && isObj(p.readiness) ? p.readiness : {};
  const days = num(p && p.tick_days) ?? (/(\d+) tick days verified/.exec(String(p && p.status)) ? +/(\d+) tick days verified/.exec(String(p.status))[1] : null);
  const need = num(R.days_needed) || num(p && p.study_days) || 60;
  const idx = days !== null && days >= need ? 3 : days ? 2 : 0;            // record -> backfill -> 60 days -> study -> verdict
  const steps = chain.map((c, i) => ({ n: i + 1, key: str(c.key, 20), label: str(c.label, 30), help: str(c.help, 220),
    state: i < idx ? 'done' : i === idx ? 'now' : i === idx + 1 ? 'next' : 'wait' }));
  return { id: 'of', name: 'ORDER FLOW', alias: 'the tick study', color: COLORS.of, has: !!p, on: false, armed: false, hidden: false,
    pill: p && p.state === 'live' ? 'LIVE' : 'RESEARCH', stepText: days !== null ? `${days}/${need} days` : `0/${need} days`, groups: [{ id: 'of', name: '', steps }],
    now: steps[idx] ? { label: steps[idx].label, text: p ? str(p.status, 220) : 'Waiting for the pillars file.' } : null,
    next: steps[idx + 1] ? { label: steps[idx + 1].label, text: steps[idx + 1].help } : null,
    why: '', nar: '', window: { state: 'none', text: `Not a trading bot yet: ${days === null ? 0 : days} of ${need} tick days`, nextS: null, endS: null },
    meter: { pct: Math.round(Math.min(1, (days || 0) / need) * 100), word: 'Research', time: 0, unit: 'days' } };
}

// ------------------------------------------------------------------------------------------------ open trades
const BOT_OF = (k, bot) => (/atlas/i.test(String(bot)) || /^atlas/.test(k) ? 'atlas' : /lit/i.test(String(bot)) || /^z/.test(k) ? 'lit' : /rapid/.test(k) ? 'lit' : 'lit');
/** the bars post's trades, cleaned the way nqbars.js does, with the account LABEL (never an id) and the bot */
export function trades(bars) {
  const post = isObj(bars) ? bars : null, ac = post && isObj(post.ac) ? post.ac : {}, out = [];
  const nameOf = (k) => { const a = ac[k], d = NB.ACCTS.find((x) => x.k === k); return str((Array.isArray(a) && a[0]) || (d && d.name) || 'an account', 32); };
  for (const [list, open] of [[post && post.open, true], [post && post.closed, false]]) for (const r of arr(list)) {
    if (!isObj(r) || !/^[a-z0-9_]{1,24}$/.test(String(r.k || '')) || num(r.t) === null || num(r.e) === null) continue;
    out.push({ k: r.k, name: nameOf(r.k), bot: BOT_OF(r.k, Array.isArray(ac[r.k]) ? ac[r.k][1] : ''), s: num(r.s) === -1 ? -1 : 1, q: num(r.q) || 1, t: num(r.t), e: num(r.e),
      sl: num(r.sl), tp: num(r.tp), be: !!r.be, open, xt: num(r.xt), x: num(r.x), usd: num(r.usd), why: str(r.why, 12).toUpperCase() });
  }
  return out;
}
export function positions(bars, glanceBots, last, nowS) {
  const out = [];
  for (const r of trades(bars).filter((x) => x.open)) out.push(card({ bot: r.bot, acct: r.name, side: r.s > 0 ? 'LONG' : 'SHORT', q: r.q, e: r.e, sl: r.sl, tp: r.tp, t: r.t, be: r.be }, last, nowS));
  if (!out.length) for (const g of arr(glanceBots)) if (isObj(g) && isObj(g.pos) && num(g.pos.entry) !== null && ['lit', 'atlas'].includes(g.id)) {
    const p = g.pos;
    out.push(card({ bot: g.id, acct: g.id === 'lit' ? 'Zlarior' : 'ATLAS', side: String(p.side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG', q: num(p.qty) || 1,
      e: num(p.entry), sl: num(p.stop), tp: num(p.target), t: null, be: false, nowUsd: num(p.now_usd) }, last, nowS));
  }
  return out;
}
function card(x, last, nowS) {
  const d = x.side === 'SHORT' ? -1 : 1, risk = x.sl !== null ? Math.abs(x.e - x.sl) : null, L = num(last);
  const live = L !== null ? (L - x.e) * d : null, liveUsd = live !== null ? live * MNQ * x.q : num(x.nowUsd);
  const r = live !== null && risk ? live / risk : null;
  const close = [];
  if (x.sl !== null) close.push(`the stop at ${px(x.sl)}${x.be || (risk !== null && risk < 0.3) ? ' (break-even)' : ` (${usd(-(risk * MNQ * x.q))})`}`);
  if (x.tp !== null) close.push(`the target at ${px(x.tp)} (${usd(Math.abs(x.tp - x.e) * MNQ * x.q, true)})`);
  close.push(x.bot === 'lit' ? 'the 15-minute check, or flat by 15:55 ET; breakeven moves the stop to entry at +1R' : 'flat by the close; breakeven + costs at 1R');
  return { bot: x.bot, color: COLORS[x.bot], acct: str(x.acct, 32), side: x.side, q: x.q, entry: x.e, stop: x.sl, target: x.tp, t: x.t,
    since: x.t ? Math.max(0, nowS - x.t) : null, live: L, pts: live, usd: liveUsd, r, riskUsd: risk !== null ? risk * MNQ * x.q : null,
    head: `${x.bot === 'lit' ? 'LIT' : 'ATLAS'} ${x.side} ${x.q} micro${x.q === 1 ? '' : 's'} · ${str(x.acct, 32)}`, close: `Closes on ${close.join('; ')}.` };
}

// ------------------------------------------------------------------------------------------------ the chart: the last 2 hours + the levels each bot watches
export const CHART_BARS = 24;
export function chart(bars, glanceBots, nowS, pos) {
  const post = isObj(bars) ? bars : null, all = post ? NB.unpack(post) : [];
  if (!all.length) return { state: 'none', candles: [], levels: [], off: [], text: 'The PC has not sent chart bars yet.' };
  const c = all.slice(-CHART_BARS), dataT = num(post.t) || c[c.length - 1][0] + 300, age = Math.max(0, nowS - dataT);
  let lo = Math.min(...c.map((b) => b[3])), hi = Math.max(...c.map((b) => b[2]));
  const levels = [];
  const add = (price, label, who, kind) => { if (num(price) !== null && !levels.some((l) => Math.abs(l.price - price) < 0.01 && l.who === who && l.kind === kind)) levels.push({ price: num(price), label: str(label, 36), who, color: COLORS[who] || '#a99cc2', kind }); };
  for (const g of arr(glanceBots)) if (isObj(g) && (g.id === 'lit' || g.id === 'atlas')) {
    for (const r of arr(g.lv)) if (Array.isArray(r)) add(r[1], `${g.id === 'lit' ? 'LIT' : 'ATLAS'} ${r[0]}`, g.id, 'level');
    if (g.id === 'lit' && Array.isArray(g.ax)) { add(g.ax[0], 'LIT limit', 'lit', 'entry'); add(g.ax[1], 'LIT stop', 'lit', 'stop'); add(g.ax[2], 'LIT target', 'lit', 'target'); }   // glance "ax" (lead wire): exact numbers
    for (const a of arr(g.arm)) if (isObj(a)) {
      if (g.id === 'atlas') { const L = ATLAS_LOBES.find((x) => new RegExp('^' + x.name.replace('/', '\\/') + ':', 'i').test(String(a.text || ''))); if (!L || lobeState(g, L).state !== 'armed') continue; }
      const P = pricesIn(`${a.text || ''} ${a.trig || ''}`);
      if (P.cisd) add(P.cisd, `${g.id === 'lit' ? 'LIT' : 'ATLAS'} CISD line`, g.id, 'cisd');
      if (P.limit) add(P.limit, `${g.id === 'lit' ? 'LIT' : 'ATLAS'} limit`, g.id, 'entry');
      if (P.entry) add(P.entry, `${g.id === 'lit' ? 'LIT' : 'ATLAS'} entry`, g.id, 'entry');
      if (P.stop) add(P.stop, `${g.id === 'lit' ? 'LIT' : 'ATLAS'} stop`, g.id, 'stop');
      if (P.target) add(P.target, `${g.id === 'lit' ? 'LIT' : 'ATLAS'} target`, g.id, 'target'); }
  }
  for (const p of arr(pos)) { add(p.entry, `${p.bot.toUpperCase()} entry`, p.bot, 'entry'); add(p.stop, `${p.bot.toUpperCase()} stop`, p.bot, 'stop'); add(p.target, `${p.bot.toUpperCase()} target`, p.bot, 'target'); }
  // the price scale reaches every trade line and every level within 1.5x the bars' own range; the rest are listed as "off the chart"
  const range = Math.max(4, hi - lo), lim = [lo - range * 0.75, hi + range * 0.75];
  for (const l of levels) if (l.kind !== 'level' && l.price >= lim[0] && l.price <= lim[1]) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); }
  for (const l of levels) if (l.kind === 'level' && l.price >= lim[0] && l.price <= lim[1]) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); }
  const pad = (hi - lo) * 0.06 || 2;
  const inView = levels.filter((l) => l.price >= lo - pad && l.price <= hi + pad), off = levels.filter((l) => !inView.includes(l));
  const lastC = c[c.length - 1][4];
  return { state: age <= NB.FRESH_S ? 'ok' : 'old', candles: c.map(([t, o, h, l, cl]) => ({ t, o, h, l, c: cl })), lo: lo - pad, hi: hi + pad, last: lastC, dataT, age,
    levels: inView, off: off.map((l) => ({ ...l, dir: l.price > lastC ? 'up' : 'down', dist: l.price - lastC })),
    text: `NQ 5-minute bars, the last ${c.length} (${NB.hm(c[0][0], nowS)} to ${NB.hm(c[c.length - 1][0] + 300, nowS)}), from the PC ${ago(age)}.` };
}

// ------------------------------------------------------------------------------------------------ the narration: a time-stamped story of the day
const WHO = { lit: 'LIT', atlas: 'ATLAS', blitz: 'BLITZ', of: 'ORDER FLOW' };
export function feed(src, model, nowS, memo) {
  const lite = isObj(src.lite) ? src.lite : {}, G = arr(isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance.bots : null), today = etNow(nowS);
  const tOf = (hm) => { const m = toM(hm); if (m === null) return null; let t = atET(nowS, hm); if (t > nowS + 300) t -= 86400; return t; };
  const rows = [];
  const add = (t, who, text, kind) => { const s = str(text, 260); if (!s || t === null) return; if (rows.some((r) => r.who === who && r.text === s)) return; rows.push({ t, who, color: COLORS[who] || '#a99cc2', text: s, kind: kind || 'log' }); };
  // the bots' own thoughts (the ext "glog": 8 a bot; else the glance's 4)
  for (const id of ['lit', 'atlas']) {
    const g = G.find((x) => isObj(x) && x.id === id), gl = isObj(lite.glog) ? arr(lite.glog[id]) : [];
    for (const r of (gl.length >= arr(g && g.log).length ? gl : arr(g && g.log))) if (Array.isArray(r)) add(tOf(r[0]), id, `${WHO[id]}: ${String(r[1]).replace(/^(EMA|MACD|S\/R):/, '$1 ·')}`, 'log');
  }
  // where each bot stood when the PC last spoke
  const gt = num(isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance.t : null) || num(lite.t);
  for (const b of model.bots.filter((x) => (x.id === 'lit' || x.id === 'atlas') && x.has && x.now)) {
    add(gt, b.id, b.id === 'lit' ? `LIT at step ${b.stepText} (${b.now.label}): ${b.now.text}` : `ATLAS ${b.groups.map((x) => `${x.name} ${x.state === 'unknown' ? 'waiting' : x.state}`).join(' · ')}`, 'stage');
  }
  // windows that opened today
  if (today.wd >= 1 && today.wd <= 5) {
    const W = [['lit', 'lit', 'LIT'], ['atlas', 'atlas_ema', 'ATLAS EMA'], ['atlas', 'atlas_macd', 'ATLAS MACD'], ['atlas', 'atlas_sr', 'ATLAS S/R']];
    for (const [who, id, name] of W) for (const [f, to] of windowsOf(src.brief, id)) {
      const tf = atET(nowS, f), tt = atET(nowS, to);
      if (tf <= nowS) add(tf, who, `${name} window opened (${f}-${to} ET).`, 'window');
      if (tt <= nowS) add(tt, who, `${name} window closed.`, 'window');
    }
  }
  // the trades (the bars post: entries and exits by account label)
  for (const r of trades(src.bars)) {
    const side = `${r.s > 0 ? 'LONG' : 'SHORT'} ${r.q} micro${r.q === 1 ? '' : 's'}`;
    if (NB.et(r.t) && NB.et(r.t).day === today.day) add(r.t, r.bot, `${WHO[r.bot]} ${side} at ${px(r.e)} on ${r.name}${r.open ? ` (stop ${px(r.sl)}, target ${px(r.tp)})` : ''}.`, 'entry');
    if (!r.open && r.xt !== null) add(r.xt, r.bot, `${WHO[r.bot]} out on ${r.name}: ${NB.whyText(r.why).toLowerCase()} at ${px(r.x)} · ${usd(r.usd, true)}.`, 'exit');
  }
  // what this page saw change between two PC posts (kept for today on this phone)
  for (const m of arr(memo)) if (isObj(m) && m.day === today.day) add(num(m.t), m.who, m.text, 'change');
  rows.sort((a, b) => b.t - a.t);
  return rows.slice(0, 40).map((r) => ({ ...r, hm: (NB.et(r.t) || {}).hm || '' }));
}

/** what changed between the previous model and this one, in plain words (the page keeps them as memo rows) */
export function changes(prev, next, nowS) {
  const out = [], day = etNow(nowS).day;
  if (!prev || !next) return out;
  for (const b of next.bots) {
    const a = prev.bots.find((x) => x.id === b.id);
    if (!a || !a.has || !b.has) continue;
    if (b.id === 'lit' && a.stepText !== b.stepText && b.now) out.push({ t: nowS, day, who: 'lit', text: `LIT moved to ${b.stepText} (${b.now.label}). ${b.next ? 'Next: ' + b.next.text : ''}` });
    if (b.id === 'atlas') for (const L of b.groups) { const o = a.groups.find((x) => x.id === L.id); if (o && o.state !== L.state && o.state !== 'unknown' && L.state !== 'unknown') out.push({ t: nowS, day, who: 'atlas', text: `ATLAS ${L.name}: ${o.state} -> ${L.state}. ${L.needs}` }); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ milestones (the optional phone pushes)
export function milestones(model) {
  const out = [];
  const lit = model.bots.find((b) => b.id === 'lit'), at = model.bots.find((b) => b.id === 'atlas');
  const n = lit && /^(\d+)\/10$/.exec(lit.stepText) ? +/^(\d+)\/10$/.exec(lit.stepText)[1] : 0;
  if (n >= 5 && n <= 8) out.push({ key: `lit:${n}`, text: n >= 7 ? `LIT ${n}/10: entry likely within minutes` : n === 6 ? 'LIT 6/10: limit armed' : 'LIT 5/10: a 5m CISD setup' });
  if (at) for (const L of at.groups) if (L.state === 'armed') out.push({ key: `atlas:${L.id}:armed`, text: `ATLAS ${L.name} armed: ${L.needs}` });
  for (const p of model.positions) out.push({ key: `pos:${p.bot}:${p.acct}:${p.t || p.entry}`, text: `In a trade: ${p.head} at ${px(p.entry)}` });
  return out;
}

// ------------------------------------------------------------------------------------------------ the whole room
export function build(src, nowS, memo) {
  const S = isObj(src) ? src : {}, lite = isObj(S.lite) ? S.lite : null, pc = lite && isObj(lite.pc) ? lite.pc : {};
  const G = arr(isObj(pc.glance) ? pc.glance.bots : null);
  const bars = isObj(S.bars) ? S.bars : null, B = bars ? NB.unpack(bars) : [];
  const coreT = lite ? num(lite.t) || num(isObj(lite.reporter) ? lite.reporter.t : null) : null, age = coreT !== null ? Math.max(0, nowS - coreT) : null;
  const barsT = bars ? num(bars.t) : null;
  const last = barsT !== null && B.length && (coreT === null || barsT >= coreT) ? B[B.length - 1][4] : num(lite && lite.price) ?? (B.length ? B[B.length - 1][4] : null);
  const atrB = atr14(B, num(bars && bars.f) === 1);
  const litG = G.find((x) => isObj(x) && x.id === 'lit') || null;
  const ctx = { now: nowS, brief: S.brief, pillars: S.pillars, last, stopped: pc.running === false, hidden: arr(S.hidden).length ? arr(S.hidden) : ['blitz'],
    atr: num(litG && litG.atr) ?? atrB, atrSrc: num(litG && litG.atr) !== null ? 'from the PC' : atrB !== null ? 'from the last 14 5m bars' : '' };
  const level = age === null ? 'none' : age <= PC_OK_S ? 'ok' : age <= PC_OLD_S ? 'warn' : 'bad';
  const gT = num(pc.glance && pc.glance.t);
  const M = {
    t: nowS, price: last, atr: ctx.atr,
    pc: { t: coreT, age, level, glanceT: gT, glanceAge: gT !== null ? Math.max(0, nowS - gT) : null,
      text: age === null ? 'PC: no word yet' : `PC ${ago(age)}`,
      banner: age === null ? 'No word from your PC yet on this page: the steps below wait for its report (every 15 minutes).'
        : level === 'bad' ? `Stale: your PC last spoke ${ago(age)} (${(NB.et(coreT) || {}).hm || '?'} ET). The steps below are where the bots were then, not now.`
          : level === 'warn' ? `Your PC is late: its last report was ${ago(age)} (it posts every 15 minutes).` : '' },
    bots: [litBot(litG, ctx), atlasBot(G.find((x) => isObj(x) && x.id === 'atlas') || null, ctx), blitzBot(ctx), ofBot(ctx)],
  };
  if (level === 'bad') for (const b of M.bots.slice(0, 2)) if (b.has && b.meter.pct > 0) b.meter.word = 'Was ' + b.meter.word.toLowerCase();   // honest: where it WAS
  M.positions = positions(bars, G, last, nowS);
  M.chart = chart(bars, G, nowS, M.positions);
  M.feed = feed(S, M, nowS, memo);
  M.milestones = milestones(M);
  M.stopped = ctx.stopped;
  const live = M.bots.filter((b) => b.id === 'lit' || b.id === 'atlas');
  const top = live.slice().sort((a, b) => b.meter.pct - a.meter.pct)[0];
  const nextW = live.map((b) => (b.id === 'atlas' ? b.groups.map((g) => ({ who: `ATLAS ${g.name}`, w: g.window })) : [{ who: 'LIT', w: b.window }])).flat()
    .filter((x) => x.w && x.w.nextS).sort((a, b) => a.w.nextS - b.w.nextS)[0] || null;
  M.next = nextW ? { who: nextW.who, at: nextW.w.from, day: nextW.w.day || 'today', s: nextW.w.nextS } : null;
  const asOf = level === 'bad' ? `As of ${(NB.et(coreT) || {}).hm || '?'} ET (the PC is silent): ` : '';
  M.headline = asOf + (M.positions.length ? `In a trade: ${M.positions[0].head}.`
    : !lite ? 'Waiting for your PC\'s report.'
      : ctx.stopped ? 'The PC bot is STOPPED: nothing is trading.'
        : top && top.meter.pct >= 40 ? `${top.name} ${/^was /i.test(top.meter.word) ? '' : 'is '}${top.meter.word.toLowerCase()}: ${top.now ? top.now.label : ''}. ${top.next ? top.next.text : ''}`
          : `Quiet: no setup forming.${M.next ? ` Next window: ${M.next.who} ${M.next.day === 'today' ? 'at' : M.next.day} ${M.next.at} ET.` : ''}`);
  return M;
}
