// ORACLE replays. The demo: a real session replayed when there is no live data (demo_day.json, 2026-01-22: the London
// sweeps of the Asia high and the PDH, then the NY short at 09:24 that banked +6.4R), built from the stored bars by
// engine/brain.replay (python -X utf8 -m tests.test_oracle_page --regen). Today: todayFx() rebuilds the same shape from the
// live World (the site's 5m bars + the polled prices, the levels with the time each was taken, the Brain's log for the
// stages), so the owner can scrub through how today's session unfolded. docAt(fx, t) gives a live.json-shaped doc at any
// second, so both replays go through the same normalize() as the real feed.
import { etParts, etToUnix, hm } from './time.js';
import { STAGES } from './data.js';

const ATLAS_HOURS = { ema_lon_vix: ['EMA', [[180, 570]]], macd_sweep: ['MACD', [[120, 300], [570, 660]]], sr_nyreclaim: ['S/R', [[570, 720]]] };

export async function loadDemo(url = 'demo_day.json') {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('demo ' + r.status);
  const fx = await r.json();
  if (!fx || fx.kind !== 'oracle-demo' || !Array.isArray(fx.bars) || !fx.bars.length) throw new Error('not a demo day');
  return fx;
}

/** Price inside a 5m bar: open -> the far wick -> the other wick -> close (the path a candle most likely took). */
function priceAt(fx, t) {
  const B = fx.bars;
  let lo = 0, hi = B.length - 1;
  if (t <= B[0][0]) return B[0][1];
  if (t >= B[hi][0] + 300) return B[hi][4];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m][0] <= t) lo = m; else hi = m - 1; }
  const [t0, o, h, l, c] = B[lo], f = Math.min(1, (t - t0) / 300);
  const path = c >= o ? [o, l, h, c] : [o, h, l, c];
  const k = Math.min(2, Math.floor(f * 3)), u = f * 3 - k;
  return path[k] + (path[k + 1] - path[k]) * u;
}

/** The replay span: 00:30 ET (Asia's end) to 11:00 ET (after the trade), and the slow parts (the sweeps and the entry). */
export function span(fx) {
  if (fx.span) return fx.span;
  const p = etParts(fx.bars[fx.bars.length - 1][0]);
  const at = (h, m) => etToUnix(p.y, p.mo, p.d, h, m);
  return { from: at(0, 30), to: at(11, 0), slow: [[at(2, 50), at(4, 0)], [at(8, 40), at(9, 55)]] };
}

export function docAt(fx, t) {
  const price = Math.round(priceAt(fx, t) * 4) / 4;
  let fr = fx.frames[0];
  for (const f of fx.frames) if (f.t <= t) fr = f;
  const exitT = fx.trade && fx.trade.exit_t != null ? fx.trade.exit_t : Infinity;
  const tr = fr.trade && fr.trade.entry_t <= t && t < exitT ? fr.trade : null;
  const mod = etParts(t).mod;
  return {
    kind: 'le-live', demo: true, t, price,
    pc: {
      brain: {
        price, atr: fr.atr, stage: fr.stage, stages: fr.stages, day_pnl: fr.day_pnl,
        levels: fx.levels.filter((l) => l.from_t <= t).map((l) => ({ label: l.label, price: l.price, kind: l.kind,
          taken: l.taken_t != null && l.taken_t <= t, taken_hm: l.taken_t != null && l.taken_t <= t ? hm(l.taken_t - 300) : null })),
        guards: { vix: fx.vix },
        trade: tr ? { ...tr, price } : null,
        log: (fx.log || []).filter((r) => r.t <= t),
      },
      mind: { regime: fx.regime },
    },
    board: {
      lit: { today_pnl: fr.day_pnl || 0 },
      atlas: fx.today ? null : { members: Object.entries(ATLAS_HOURS).map(([key, [short, wins]]) => {
        const on = wins.some(([a, b]) => mod >= a && mod < b);
        return { key, short, stage: on ? 'waiting' : 'off', window: { open: on } };
      }) },
    },
    bars: fx.bars.filter((b) => b[0] + 300 <= t).map((b) => [b[0] + 300, b[4]]),
  };
}

// ------------------------------------------------------------------ today, rebuilt from the live World
const STAGE_OF = { sweep: 'sweep', cisd: 'cisd5', armed: 'limit', entry: 'trade', exit: 'done' };
const pxOf = (s) => (s == null ? null : +String(s).replace(/,/g, ''));

/** 5m OHLC bars from the site's bars, then the polled prices bucketed into 5 minutes (o = first, h / l, c = last). */
function barsSince(start, until, ohlc, hist) {
  const out = (ohlc || []).filter((b) => b[0] >= start && b[0] < until).map((b) => b.slice(0, 5));
  const last = out.length ? out[out.length - 1][0] : start - 300;
  const by = new Map();
  for (const [t, p] of hist || []) {
    const k = Math.floor(t / 300) * 300;
    if (k <= last || k < start || !Number.isFinite(p)) continue;
    const b = by.get(k);
    if (!b) by.set(k, [k, p, p, p, p]);
    else { b[2] = Math.max(b[2], p); b[3] = Math.min(b[3], p); b[4] = p; }
  }
  return [...out, ...[...by.values()].sort((a, b) => a[0] - b[0])];
}

/** Today's session as a replay (the demo's shape), or null when there are not enough bars yet. */
export function todayFx(w, ohlc, hist) {
  if (!w || w.price == null || !w.t) return null;
  const p = etParts(w.t);
  const start = etToUnix(p.y, p.mo, p.d, 18, 0) - (p.h >= 18 ? 0 : 86400);       // the futures day opens at 18:00 ET
  const bars = barsSince(start, w.t, ohlc, hist);
  if (bars.length < 3) return null;
  const tOf = (s) => { const [h, m] = String(s).split(':').map(Number); return start + ((((h * 60 + m) - 1080) % 1440 + 1440) % 1440) * 60; };
  const log = (w.log || []).map((r) => ({ ...r, t: r.t != null ? r.t : tOf(r.hm) })).filter((r) => r.t <= w.t).sort((a, b) => a.t - b.t);
  const stagesAt = (n) => STAGES.map(([k], i) => [k, i + 1 < n ? 'done' : i + 1 === n ? 'now' : 'todo']);
  const frames = [{ t: start, stage: { key: 'levels', label: 'Levels', n: 1, dir: null, waiting: 'The session opens: the levels are on the map.' },
    stages: stagesAt(1), atr: w.atr, day_pnl: 0, trade: null }];
  let trade = null, dir = null, exitT = null;
  for (const r of log) {
    const key = STAGE_OF[r.kind];
    if (!key || (r.kind === 'sweep' && !/✓/.test(r.text))) continue;
    const n = STAGES.findIndex(([k]) => k === key) + 1;
    const m = r.text.match(/(LONG|SHORT)/);
    if (m) dir = m[1] === 'SHORT' ? -1 : 1;
    if (r.kind === 'entry') {
      const q = r.text.match(/@ ([\d,.]+) stop ([\d,.]+) target ([\d,.]+) qty (\d+)/);
      if (q) trade = { side: dir < 0 ? 'SHORT' : 'LONG', dir, entry_t: r.t, entry: pxOf(q[1]), stop: pxOf(q[2]), stop0: pxOf(q[2]),
        target: pxOf(q[3]), qty: +q[4], risk_pts: Math.abs(pxOf(q[1]) - pxOf(q[2])), be: false };
    }
    if (r.kind === 'exit') exitT = r.t;
    frames.push({ t: r.t, stage: { key, label: STAGES[n - 1][1], n, dir, waiting: r.text }, stages: stagesAt(n), atr: w.atr,
      day_pnl: r.kind === 'exit' ? (w.pnlToday || 0) : 0, trade: r.kind === 'exit' ? null : trade });
  }
  const pos = w.position;
  frames.push({ t: w.t, stage: { ...w.stage }, stages: w.stages.map((s) => [s.key, s.state]), atr: w.atr, day_pnl: w.pnlToday || 0,
    trade: pos ? { ...(trade || {}), ...pos, entry_t: pos.entry_t || (trade && trade.entry_t) || w.t } : null });
  const takenT = (l) => (l.takenHm ? Math.min(w.t, tOf(l.takenHm) + 300) : start);   // no time known: taken before the replay
  return {
    v: 1, kind: 'oracle-demo', today: true, day: 'today', bars, vix: w.vix || {}, regime: w.regime,
    levels: w.levels.map((l) => ({ label: l.label, price: l.price, kind: l.kind, from_t: start, taken_t: l.taken ? takenT(l) : null })),
    frames, log, trade: { exit_t: exitT != null ? exitT : Infinity },
    span: { from: bars[0][0], to: w.t, slow: log.filter((r) => r.kind === 'entry' || (r.kind === 'sweep' && /✓/.test(r.text))).map((r) => [r.t - 900, r.t + 600]) },
  };
}
