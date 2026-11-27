// LIVE CHART model (day-livechart 2026-11-27): PURE (no DOM / network / storage), node-tested by tests/test_livechart.py (its docstring lists the inputs).
import { et, px, ageWords, num } from './nqbars.js?v=b2';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export const PRIV_FRESH_S = 20, PUB_FRESH_S = 20 * 60;

// the bots' glance
export function bots(lite) {
  const out = {};
  for (const b of arr(obj(obj(obj(lite).pc).glance).bots)) if (isObj(b) && /^(lit|atlas|rapid)$/.test(String(b.id))) out[b.id] = b;
  return out;
}
/** "Displacement (4/10)" -> { label, n, of } (n null when the PC did not count) */
export function stage(lit) {
  const s = str(obj(lit).stage, 60);
  if (!s) return null;
  const m = /^(.*?)\s*\((\d{1,2})\/(\d{1,2})\)\s*$/.exec(s);
  return m ? { label: m[1], n: +m[2], of: +m[3] } : { label: s, n: null, of: 10 };
}

// levels: the PC's (glance, order-flow room)
const SIDE_HI = /high|pdh|pwh|onh|asia h|london h|\bhi\b|top|resist/i, SIDE_LO = /low|pdl|pwl|onl|asia l|london l|\blo\b|bottom|support/i;
/** [{label, price, side (1 high / -1 low / 0), src: 'lit' | 'atlas' | 'of', read?}] deduped within 1 point (LIT's name wins) */
export function pcLevels(lite, ofroom, day, last) {
  const B = bots(lite), out = [];
  const add = (label, p, src, read) => {
    const v = num(p); if (v == null) return;
    if (out.some((x) => Math.abs(x.price - v) < 1)) return;
    const side = SIDE_HI.test(label) ? 1 : SIDE_LO.test(label) ? -1 : (num(last) != null ? (v > last ? 1 : -1) : 0);
    out.push({ label: str(label, 28), price: v, side, src, ...(read ? { read } : {}) });
  };
  for (const r of arr(obj(B.lit).lv)) if (Array.isArray(r)) add(r[0], r[1], 'lit');
  for (const r of arr(obj(B.atlas).lv)) if (Array.isArray(r) && !/^EMA/i.test(String(r[0]))) add(r[0], r[1], 'atlas');
  const O = obj(ofroom);
  if (O.day && day && O.day === day) for (const L of arr(O.levels)) if (isObj(L)) add(L.label || L.name, L.px, 'of', str(L.read, 20));
  return out.slice(0, 12);
}
/** the first bar (index into bars) of the CME day of t: 18:00 ET the evening before */
export function dayStart(bars, t) {
  const p = et(t); if (!p || !bars.length) return 0;
  const [h] = p.hm.split(':').map(Number);
  const cut = t - (((h - 18 + 24) % 24) * 3600) - (+p.hm.split(':')[1]) * 60;      // the last 18:00 ET at or before t
  for (let i = 0; i < bars.length; i++) if (bars[i][0] >= cut) return i;
  return bars.length;
}
/** sweeps of the PC's levels today: a bar trades through by a tick and closes back -> {i, price, side, label, src} */
export function sweepsOf(levels, bars, from) {
  const out = [];
  for (const L of levels) {
    for (let i = Math.max(0, from); i < bars.length; i++) {
      const b = bars[i];
      if (L.side > 0 && b[2] >= L.price + 0.25 && b[4] < L.price) { out.push({ i, price: b[2], side: 1, label: L.label, src: L.src }); break; }
      if (L.side < 0 && b[3] <= L.price - 0.25 && b[4] > L.price) { out.push({ i, price: b[3], side: -1, label: L.label, src: L.src }); break; }
    }
  }
  return out;
}
/** absorption marks from the order-flow room (today only): {label, price, side, t, read} */
export function absorption(ofroom, day) {
  const O = obj(ofroom); if (!O.day || O.day !== day) return [];
  return arr(O.levels).filter((L) => isObj(L) && num(L.px) != null && /absorb/i.test(String(L.read || '')) && num(L.t) != null)
    .map((L) => ({ label: str(L.label || L.name, 28), price: num(L.px), side: /^h/i.test(String(L.side)) ? 1 : -1, t: num(L.t), read: str(L.read, 20) }));
}

// ATLAS: its 5m EMA 50 + its armed side
export function ema(closes, n) {
  const k = 2 / (n + 1), out = [];
  let e = null;
  closes.forEach((c, i) => { if (i < n - 1) { out.push(null); return; } if (e == null) { e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n; out.push(e); return; } e = c * k + e * (1 - k); out.push(e); });
  return out;
}
export function atlasArm(lite) {
  const a = obj(bots(lite).atlas), r = arr(a.arm).find((x) => isObj(x) && x.side);
  return r ? { side: /short/i.test(r.side) ? 'SHORT' : 'LONG', text: str(r.text, 60), trig: str(r.trig, 160) } : null;
}

// open trades (glance pos) with $ risk / $ target
export function trades(lite) {
  const out = [];
  for (const [id, b] of Object.entries(bots(lite))) {
    const p = obj(b.pos); if (num(p.entry) == null) continue;
    out.push({ bot: id, name: str(b.name, 20) || id, side: /short/i.test(String(p.side)) ? 'SHORT' : 'LONG', qty: num(p.qty), entry: num(p.entry), stop: num(p.stop),
      target: num(p.target), risk: num(p.risk_usd), tgt: num(p.tgt_usd), now: num(p.now_usd) });
  }
  return out;
}

// today's halt (CME early close: brief.json)
/** epoch seconds of today's early close (brief.early_close "13:15" on brief.day == today ET), else null */
export function haltT(brief, nowS) {
  const B = obj(brief), today = (et(nowS) || {}).day, m = /^(\d{1,2}):(\d{2})$/.exec(String(B.early_close || ''));
  if (!m || !B.day || B.day !== today) return null;
  const p = et(nowS), [h, mi] = p.hm.split(':').map(Number);
  return Math.round(nowS - (h * 3600 + mi * 60) + (+m[1]) * 3600 + (+m[2]) * 60 - (nowS % 60) + (nowS % 60));
}

// the "now" ticker + the next trigger
const EMO = [[/swept|sweep/i, '🧹'], [/armed|arm\b|tapped/i, '🎯'], [/entered|entry|bought|sold|long at|short at|filled/i, '🚀'], [/target|took profit|banked/i, '💰'],
  [/no trade|skip|wait|blocked|not routed|done for/i, '⏳'], [/stop|stopped|loss/i, '🛑'], [/break-even|breakeven|\bbe\b/i, '🛡️'],
  [/news|fomc|cpi|nfp|halt|close/i, '📰'], [/displacement|cisd|structure|inducement/i, '📈']];
export function emoji(text) { for (const [rx, e] of EMO) if (rx.test(text)) return e; return '🧠'; }
/** newest first, up to n: [{hm, bot, name, text, emoji}] from glog (else each bot's glance log) */
export function ticker(lite, n) {
  const L = obj(lite), g = obj(L.glog), B = bots(lite), rows = [];
  for (const id of ['lit', 'atlas']) {
    const src = arr(g[id]).length ? arr(g[id]) : arr(obj(B[id]).log);
    for (const r of src) if (Array.isArray(r) && r[1]) rows.push({ hm: str(r[0], 5), bot: id, name: id === 'lit' ? 'Zlarior' : 'ATLAS', text: str(r[1], 140) });
  }
  rows.sort((a, b) => (a.hm < b.hm ? 1 : a.hm > b.hm ? -1 : 0));
  return rows.slice(0, n || 6).map((r) => ({ ...r, emoji: emoji(r.text) }));
}
/** the one line: what would make a trade next (LIT's armed trigger, else ATLAS's, else LIT's wait line) */
export function nextTrigger(lite) {
  const B = bots(lite), la = arr(obj(B.lit).arm).find((x) => isObj(x) && x.trig), aa = atlasArm(lite);
  if (la) return { bot: 'Zlarior', side: /short/i.test(la.side) ? 'SHORT' : 'LONG', text: str(la.trig, 170) };
  if (aa && aa.trig) return { bot: 'ATLAS', side: aa.side, text: aa.trig };
  const w = str(obj(B.lit).wait, 170) || str(obj(B.atlas).wait, 170);
  return w ? { bot: obj(B.lit).wait ? 'Zlarior' : 'ATLAS', side: null, text: w } : null;
}

// the private link: live candles from the bot itself
/** the bot snapshot's 5-minute bars -> [[t, o, h, l, c]] (closed bars), its price + when */
export function privBars(priv) {
  const P = obj(priv), out = [];
  for (const r of arr(P.bars)) if (isObj(r) && [r.time, r.open, r.high, r.low, r.close].every((v) => num(v) != null)) out.push([num(r.time), num(r.open), num(r.high), num(r.low), num(r.close)]);
  out.sort((a, b) => a[0] - b[0]);
  const st = obj(P.state), h = obj(P.health);
  const price = num(st.price) != null ? num(st.price) : num(obj(st.brain).price);
  const t = num(P.last_poll) || num(h.last_poll) || num(st.t) || null;
  return { bars: out, price, t };
}
/** the forming 5-minute bar from the newest price, honestly: opens at the last closed bar's close; high / low only from prices SEEN */
export function forming(lastBar, seen, nowS) {
  if (!lastBar || !arr(seen).length) return null;
  const t0 = lastBar[0] + 300, bucket = Math.floor(nowS / 300) * 300;
  if (bucket !== t0) return null;                                  // the next bar has not been written yet by the bot: only that one forms
  const ps = seen.filter((s) => s.t >= t0).map((s) => s.p);
  if (!ps.length) return null;
  const o = lastBar[4];
  return [t0, o, Math.max(o, ...ps), Math.min(o, ...ps), ps[ps.length - 1]];
}

// the stamp: where the chart's numbers come from, how old
export function stamp(src, dataT, nowS) {
  const a = dataT == null ? null : Math.max(0, nowS - dataT), hm = dataT == null ? '' : ((et(dataT) || {}).hm || '');
  if (src === 'private') {
    const live = a != null && a <= PRIV_FRESH_S;
    return { live, cls: live ? 'live' : 'warm', text: live ? `LIVE from your PC · ${hm} ET` : `Your PC · as of ${hm} ET (${ageWords(a)} ago)` };
  }
  if (a == null) return { live: false, cls: 'none', text: 'Waiting for the PC' };
  const live = a <= PUB_FRESH_S;
  return { live, cls: live ? 'warm' : 'old', text: `As of ${hm} ET (${a < 90 ? 'just now' : ageWords(a) + ' ago'}) · the public feed` };
}

/** everything the live layer adds, for the chart's own candles (cs: nqbars candles at wall time) and raw bars */
export function live(o) {
  const { lite, priv, brief, ofroom, bars, candles, nowS } = o;
  const now = num(nowS) != null ? num(nowS) : Date.now() / 1000;
  const today = (et(now) || {}).day, B = bots(lite), last = bars && bars.length ? bars[bars.length - 1][4] : null;
  const lv = pcLevels(lite, ofroom, today, last), from = bars && bars.length ? dayStart(bars, bars[bars.length - 1][0]) : 0;
  const sw = bars && bars.length ? sweepsOf(lv, bars, from) : [];
  const closes = (bars || []).map((b) => b[4]), e = ema(closes, 50);
  const off = (t) => ((et(t) || {}).off || 0);
  const emaPts = (bars || []).map((b, i) => (e[i] == null ? null : { time: b[0] + off(b[0]), value: Math.round(e[i] * 100) / 100 })).filter(Boolean);
  const ht = haltT(brief, now);
  return {
    stage: stage(B.lit), litOn: !!obj(B.lit).on, atlasArm: atlasArm(lite), levels: lv,
    sweeps: sw.map((w) => ({ ...w, time: candles && candles[w.i] ? candles[w.i].time : null })).filter((w) => w.time != null),
    absorb: absorption(ofroom, today).map((a) => ({ ...a, time: a.t + off(a.t) })), ema: emaPts, trades: trades(lite), haltT: ht,
    halt: ht == null ? null : { time: ht + off(ht), text: `CME halt ${((et(ht) || {}).hm || '')} ET (early close today)`, passed: now >= ht },
    ticker: ticker(lite, 6), next: nextTrigger(lite), why: { lit: str(obj(B.lit).why, 170), atlas: str(obj(B.atlas).why, 170) },
  };
}
export { px };
