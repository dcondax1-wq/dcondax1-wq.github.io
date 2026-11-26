/* STRATEGY HEALTH (day-site5 2026-11-26; lead: "per bot, live rolling results vs the backtest band (research/health/bands.json) with plain words
   'normal / cold streak / outside the band'"). Pure: no DOM, no fetch (node-tested by tests/test_strategy_health.py).
   bands = trading/bands.json (tools/build_money_health.py: research/health/bands.json once it lands, else a PROVISIONAL band measured on the
   backtest trades in trading/trades.json; a fixture is labelled SAMPLE). trades = trading/trades.json (src live = the PC's real MFFU trades).
     window.STRAT_HEALTH / module.exports = { health, liveTrades, BOTS, MIN_N } */
(function (root) {
  'use strict';
  const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const BOTS = [['lit', 'LIT', 'Zlarior'], ['atlas', 'ATLAS', 'ATLAS']];
  const MIN_N = 5;                                         // fewer live trades than this: too few to call anything
  const fmtR = (v) => (v === null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2) + 'R');
  function usd(v) { const n = num(v); if (n === null) return '-'; const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); return n < 0 && Math.round(n) ? '-' + a : Math.round(n) > 0 ? '+' + a : a; }

  /** the bot's real closed trades, newest first: [{t, r, usd, day}] */
  function liveTrades(file, bot) {
    const B = bot.toUpperCase(), out = [];
    for (const t of Array.isArray(isObj(file) ? file.trades : null) ? file.trades : []) {
      if (!isObj(t) || String(t.bot).toUpperCase() !== B || !['live', 'real'].includes(t.src) || num(t.r) === null || num(t.t) === null) continue;
      out.push({ t: num(t.t), r: num(t.r), usd: num(t.usd), day: String(t.day || '').slice(0, 10) });
    }
    return out.sort((a, b) => b.t - a.t);
  }

  /** one bot's health: its last `window` live trades vs the backtest band of that many trades */
  function botHealth(id, name, alias, band, rows) {
    const w = band ? num(band.window) || 10 : 10, last = rows.slice(0, w), n = last.length;
    const avg = n ? last.reduce((s, x) => s + x.r, 0) / n : null, win = n ? (last.filter((x) => x.r > 0).length / n) * 100 : null;
    const sum = last.reduce((s, x) => s + (x.usd || 0), 0);
    let streak = 0; for (const x of rows) { if (x.r < 0) streak++; else break; }
    const q = band && isObj(band.avg_r) ? band.avg_r : null, P = (k) => (q ? num(q[k]) : null);
    const sMax = band ? num(band.streak_p95) : null, sTyp = band ? num(band.streak_p75) : null;
    let word, level, why;
    if (!q) { word = 'no band yet'; level = 'none'; why = 'The backtest band for this bot has not been measured yet.'; }
    else if (n < MIN_N) { word = 'too few trades'; level = 'none'; why = `Only ${n} live trade${n === 1 ? '' : 's'} so far: at least ${MIN_N} are needed before saying anything (the band is for ${w}).`; }
    else if (avg < P('p5') || (sMax !== null && streak > sMax)) { word = 'outside the band'; level = 'bad'; why = avg < P('p5') ? `The last ${n} average ${fmtR(avg)} a trade, under the backtest's worst 5% of ${w}-trade stretches (${fmtR(P('p5'))}).` : `${streak} losses in a row: longer than 95% of the backtest's streaks (${sMax}).`; }
    else if (avg > P('p95')) { word = 'outside the band'; level = 'hot'; why = `The last ${n} average ${fmtR(avg)}, above the backtest's best 5% (${fmtR(P('p95'))}): luck runs out, do not size up.`; }
    else if (avg < P('p25') || (sTyp !== null && streak > sTyp && streak >= 3)) { word = 'cold streak'; level = 'warn'; why = avg < P('p25') ? `The last ${n} average ${fmtR(avg)}: in the band but in its weaker quarter (under ${fmtR(P('p25'))}). The backtest had stretches like this.` : `${streak} losses in a row: inside the backtest's range (its 95% mark is ${sMax}).`; }
    else { word = 'normal'; level = 'ok'; why = `The last ${n} average ${fmtR(avg)} a trade, inside the backtest's middle half (${fmtR(P('p25'))} to ${fmtR(P('p75'))}).`; }
    return { id, name, alias, word, level, why, n, window: w, avg, win, usd: n ? sum : null, streak, band: q ? { p5: P('p5'), p25: P('p25'), p50: P('p50'), p75: P('p75'), p95: P('p95') } : null,
      bandN: band ? num(band.n_backtest) : null, span: band ? String(band.span || '') : '', last: rows[0] ? rows[0].day : null,
      line: n ? `Last ${n} live: ${fmtR(avg)} avg · win ${Math.round(win)}% · ${usd(sum)}` : 'No live trade yet' };
  }

  /** bands (trading/bands.json), file (trading/trades.json) -> {bots: [...], src, provisional, sample} */
  function health(bands, file) {
    const B = isObj(bands) && isObj(bands.bots) ? bands.bots : {};
    return { bots: BOTS.map(([id, name, alias]) => botHealth(id, name, alias, isObj(B[id]) ? B[id] : null, liveTrades(file, id))),
      src: isObj(bands) ? String(bands.src || '') : '', made: isObj(bands) ? String(bands.made || '').slice(0, 10) : '', provisional: !!(isObj(bands) && bands.provisional), sample: !!(isObj(bands) && bands.sample) };
  }

  const api = { health, liveTrades, BOTS, MIN_N, fmtR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.STRAT_HEALTH = api;
})(typeof window !== 'undefined' ? window : null);
