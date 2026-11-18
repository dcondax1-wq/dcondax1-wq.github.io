// ORACLE prophecy (2026-11-04): what the bot is likely to need next, level by level, from the bot's own stored statistics.
// Pure: no DOM, no three.js (the test imports it in the browser).
//   familyOf(label)                 'Asia high' -> 'asia_h' (the ids of tools/oracle_prophecy_stats.py)
//   prophecyRows(world, stats, n)   the open levels with their odds: heat (how near price is) x how often that family has started a LIT trade
// The odds are RELATIVE (they add up to 100 over the rows shown) and come from 631 replayed trades: a ranking of which level the next
// sweep is most likely to come from, never a forecast of price.
import { heatRows } from './heat.js';

const SIDE_H = /high|top|\b(pmh|pwh|pdh)\b/i, SIDE_L = /low|bottom|\b(pml|pwl|pdl)\b/i;

/** the stats family of a level label ('NY 09:30-10 high' -> 'ny930b_h'); null when the label is not a LIT family */
export function familyOf(label) {
  const s = String(label || '');
  const side = SIDE_H.test(s) ? 'h' : SIDE_L.test(s) ? 'l' : null;
  if (/nwog/i.test(s)) return 'nwog';
  if (/ndog/i.test(s)) return 'ndog';
  if (!side) return null;
  if (/equal/i.test(s)) return 'bu_' + side;
  if (/\bpm[hl]\b|prior month/i.test(s)) return 'pm_' + side;
  if (/\bpw[hl]\b|prior week/i.test(s)) return 'pw_' + side;
  if (/\bpd[hl]\b|prior day/i.test(s)) return 'pd_' + side;
  if (/asia/i.test(s)) return 'asia_' + side;
  if (/frankfurt/i.test(s)) return 'frank_' + side;
  if (/london 03-04/i.test(s)) return 'lon34_' + side;
  if (/london/i.test(s)) return 'lon25_' + side;
  if (/ny 08-09/i.test(s)) return 'ny89_' + side;
  if (/ny 08:30/i.test(s)) return 'ny830_' + side;
  if (/09:30-10/.test(s)) return 'ny930b_' + side;
  if (/ny 09:30/i.test(s)) return 'ny930_' + side;
  if (/premarket|\bpre\b/i.test(s)) return 'pre_' + side;
  return null;
}

const SHARE_TOP = 0.43;                      // the commonest family (equal highs) = 1.0

/** The open levels, most likely first: [{ id, label, fam, dist, usd, heat, odds (0-100), share, n, win, n26, win26, avg_r, low, known }] */
export function prophecyRows(w, stats, limit = 6) {
  const fams = (stats && stats.families) || {};
  const rows = heatRows(w).slice(0, 12).map((r) => {
    const fam = familyOf(r.label), st = fam ? fams[fam] : null;
    const share = st ? st.share : 0;
    const weight = r.heat * (0.2 + 0.8 * Math.min(1, share / SHARE_TOP));
    return { id: r.id, label: r.label, kind: r.kind, fam, price: r.price, dist: r.dist, usd: r.usd, heat: r.heat, weight, share,
      n: st ? st.n : 0, win: st ? st.win_pct : null, n26: st ? st.n26 : 0, win26: st ? st.win26 : null, avg_r: st ? st.avg_r : null,
      low: !st || st.n < 30, known: !!st };
  });
  const top = rows.sort((a, b) => b.weight - a.weight).slice(0, limit), sum = top.reduce((a, r) => a + r.weight, 0) || 1;
  return top.map((r) => ({ ...r, odds: Math.round((r.weight / sum) * 1000) / 10 }));
}
