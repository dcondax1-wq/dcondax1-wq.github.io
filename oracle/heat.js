// ORACLE heat and "what is the bot waiting for" (2026-11-03). Pure: no DOM, no three.js (tests import it in the browser).
//   heatOf(dist, atr)          0..1: how hot a level is. 1 = price is on it, ~0.37 at 2.5 ATR away, ~0 beyond 5 ATR.
//   heatRows(world)            the open levels with their heat, hottest first (the ring glow, the ladder tag, the radar blip)
//   waitingOf(world, lw)       the ribbon: the ten stages as pips (done / now / todo) and the next thing the bot needs, in words
// A swept level is cold: LIT is done with it (one sweep per level). The distances come from the World (points; $ = |pts| x $2 a micro).

const fx = (n, d = 2) => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const arrow = (d) => (d > 0 ? '↑' : '↓');

export function heatOf(dist, atr) {
  if (dist == null || !Number.isFinite(dist)) return 0;
  const a = Math.max(2, atr || 12), x = Math.abs(dist) / (a * 2.5);
  return Math.exp(-x * x);
}

/** the open levels with their heat, hottest first: [{ id, label, kind, price, dist, usd, heat }] */
export function heatRows(w) {
  if (!w) return [];
  return w.levels.filter((l) => !l.taken && l.dist != null)
    .map((l) => ({ id: l.id, label: l.label, kind: l.kind, price: l.price, dist: l.dist, usd: l.usd, heat: heatOf(l.dist, w.atr) }))
    .sort((a, b) => b.heat - a.heat || Math.abs(a.dist) - Math.abs(b.dist));
}

/** What a stage means, in plain words (the headline's tooltip and the line under it) */
const GLOSS = {
  levels: 'Watching the price levels where stops are likely to sit',
  sweep: 'Price just poked through a level and grabbed the stops',
  inducement: 'A small trap move before the real one',
  displacement: 'A fast, strong move away from the level',
  cisd5: 'A 5-minute candle closed back the other way: the turn has started',
  limit: 'The entry order is placed and waiting to fill',
  cisd1m: 'A 1-minute candle confirms the turn',
  entry: 'The order just filled',
  trade: 'In the trade: stop, target and the 15-minute check are running',
  done: 'The one trade of the day is finished',
  closed: 'The market is closed',
};

/** one plain sentence for the stage shown in the headline ('' when there is nothing to say); also reads merged labels like "Sweep and inducement" */
export function glossOf(stage) {
  if (!stage) return '';
  const label = String(stage.label || '');
  if (/sweep/i.test(label) && /inducement/i.test(label)) return 'Price poked through a level, then a small trap move: the bot is waiting for a fast move away';
  return GLOSS[stage.key] || '';
}

const NEED = {
  sweep: 'inducement: a small counter-move that traps the late traders',
  inducement: 'displacement: a strong, fast move away from the sweep',
  displacement: 'a 5-minute CISD (a candle closing back through the move)',
  cisd5: 'the limit order to be armed (it waits up to 30 minutes)',
  limit: 'price to tap the limit, then a 1-minute CISD',
  cisd1m: 'the entry to fill',
};

/** The ribbon: { pips: [{ key, label, state }], now, label, next, detail, tone }. `lw` = litWindow() ({ open, in_s, open_t }) or null. */
export function waitingOf(w, lw) {
  if (!w) return null;
  const pips = w.stages.map((s) => ({ key: s.key, label: s.label, state: s.state }));
  const key = w.stage.key, n = w.stage.n;
  const out = { pips, now: n, label: w.stage.label, next: '', detail: '', tone: 'wait' };
  const open = heatRows(w);
  const up = open.filter((l) => l.dist > 0).sort((a, b) => a.dist - b.dist)[0], dn = open.filter((l) => l.dist < 0).sort((a, b) => b.dist - a.dist)[0];
  const near = (l) => `${l.label} ${arrow(l.dist)} ${fx(l.dist)} pts ($${Math.round(l.usd)} per micro)`;
  if (key === 'closed') {
    out.next = 'The market is closed'; out.tone = 'off';
  } else if (key === 'done') {
    out.next = 'Done for today: one trade a day'; out.tone = 'done';
  } else if (key === 'trade' || key === 'entry') {
    const p = w.position;
    out.tone = 'trade';
    out.next = p ? `Manage the ${p.side.toLowerCase()}: stop to breakeven at 1R, the 15-minute cut, the target at ${p.target != null ? fx(p.target) : 'the VIX band'}` : 'In the trade: breakeven at 1R, 15-minute cut, flat by 15:55';
    out.detail = p && p.r != null ? `${p.r >= 0 ? '+' : '−'}${Math.abs(p.r).toFixed(2)}R now` : '';
  } else if (key === 'levels' || !key) {
    const bits = [up && near(up), dn && near(dn)].filter(Boolean);
    out.next = bits.length ? `A sweep of ${bits.join(' or ')}` : 'A sweep of a LIT level';
    if (lw && !lw.open && lw.open_t != null) { out.tone = 'closed'; out.detail = 'The LIT window is shut: entries only 02:00 to 15:30 ET'; }
  } else {
    out.next = `Waiting for ${NEED[key] || 'the next step'}`;
    out.detail = w.stage.dir ? `a ${w.stage.dir > 0 ? 'long' : 'short'} setup` : '';
  }
  return out;
}
