// DAPHNE branches (2026-11-04): the best branch of every root, as a library you can search, compare and rank. Pure functions over
// tree.json (core.js readDoc's model): no DOM, no storage, no network. Read-only research; nothing here changes a strategy.
//   branchesOf(model)                 -> [{id, key, level, dir, mode, text, steps, periods: {train, test, y2026}, base, tree, holds,
//                                          allPos, worst, avg, robust}]   one per root that has a best branch
//   filterBranches(list, f)           f = {q, holds: 'any' | 'tree' | 'all', dir: 'any' | 'long' | 'short', level: 'any' | <level>, minMean, minN}
//   sortBranches(list, by)            by = 'robust' | 'test' | 'train' | 'y2026' | 'net' | 'n' | 'name'
//   hallOfFame(list, n)               the best branches that hold in EVERY period, ranked by their worst period, with a plain reason
//   compare(a, b)                     rows side by side with the winner of each, and a plain verdict
//   plainWords(b)                     what the branch does and how it fared, in sentences
//   statsOf(model, list)              the numbers of the stats panel: nodes tested, cut, survival, placebo, histogram
//   shareLines(b)                     the lines of the share image
// "Every period" = positive $ per trade in train, in the 2025+ test and in 2026, on at least 10 test and 10 2026 trades.
const PERIODS = [['train', 'Train (to 2024)'], ['test', 'Test (2025 on)'], ['y2026', '2026']];
export const PERIOD_NAMES = Object.fromEntries(PERIODS);
const MIN_TEST = 10;
const usd = (x, d = 2) => (x == null || !Number.isFinite(x) ? '-' : (x < 0 ? '-$' : '+$') + Math.abs(x).toFixed(d));
const num = (x) => (x == null || !Number.isFinite(x) ? 0 : x);

export function branchesOf(model) {
  const out = [];
  for (const r of model.roots || []) {
    const b = r.best;
    if (!b || !b.train || !b.test) continue;
    const p = { train: b.train, test: b.test, y2026: b.y2026 || null };
    const means = [p.train.mean, p.test.mean, p.y2026 ? p.y2026.mean : null].filter((x) => x != null && Number.isFinite(x));
    const allPos = !!(p.y2026 && p.train.mean > 0 && p.test.mean > 0 && p.y2026.mean > 0 && p.test.n >= MIN_TEST && p.y2026.n >= MIN_TEST);
    out.push({
      id: r.id, node: b.node, key: r.key, level: r.level, dir: r.dir > 0 ? 'long' : 'short', mode: r.mode, targetR: r.target_r, horizon: r.horizon, rootText: r.text,
      text: b.text || r.text, steps: b.steps || [], periods: p, base: r.base || {}, tree: r.tree || {}, holds: !!b.holds, allPos, score: b.score, bound: b.bound,
      worst: means.length ? Math.min(...means) : 0, avg: means.length ? means.reduce((a, c) => a + c, 0) / means.length : 0,
      robust: allPos ? Math.min(...means) : Math.min(...means) - 1000,                         // the branches that hold everywhere always rank above the rest
    });
  }
  return out;
}

export function filterBranches(list, f = {}) {
  const q = String(f.q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return list.filter((b) => {
    if (f.holds === 'all' && !b.allPos) return false;
    if (f.holds === 'tree' && !b.holds) return false;
    if (f.dir && f.dir !== 'any' && b.dir !== f.dir) return false;
    if (f.level && f.level !== 'any' && b.level !== f.level) return false;
    if (f.minMean != null && !(b.periods.test.mean >= f.minMean)) return false;
    if (f.minN != null && !(b.periods.test.n >= f.minN)) return false;
    if (q.length) { const hay = `${b.key} ${b.level} ${b.dir} ${b.mode} ${b.text} ${b.steps.join(' ')}`.toLowerCase(); if (!q.every((w) => hay.includes(w))) return false; }
    return true;
  });
}

export function sortBranches(list, by = 'robust') {
  const key = { robust: (b) => b.robust, test: (b) => b.periods.test.mean, train: (b) => b.periods.train.mean, y2026: (b) => (b.periods.y2026 ? b.periods.y2026.mean : -1e9),
    net: (b) => b.periods.test.net_bot, n: (b) => b.periods.test.n }[by];
  if (by === 'name') return list.slice().sort((a, b) => (a.key + a.id < b.key + b.id ? -1 : 1));
  return list.slice().sort((a, b) => num(key(b)) - num(key(a)) || (a.id < b.id ? -1 : 1));
}

export function hallOfFame(list, n = 10) {
  return sortBranches(list.filter((b) => b.allPos), 'robust').slice(0, n).map((b, i) => ({
    rank: i + 1, medal: ['gold', 'silver', 'bronze'][i] || '', b,
    reason: `Worst period still ${usd(b.worst)} a trade (train ${usd(b.periods.train.mean, 0)}, test ${usd(b.periods.test.mean, 0)}, 2026 ${usd(b.periods.y2026.mean, 0)}).`,
  }));
}

const ROWS = [
  ['Train $ / trade', (b) => b.periods.train.mean, (x) => usd(x), 1], ['Test $ / trade', (b) => b.periods.test.mean, (x) => usd(x), 1], ['2026 $ / trade', (b) => (b.periods.y2026 ? b.periods.y2026.mean : null), (x) => usd(x), 1],
  ['Test win rate', (b) => b.periods.test.win, (x) => (x == null ? '-' : x.toFixed(1) + '%'), 1], ['Test profit factor', (b) => b.periods.test.pf, (x) => (x == null ? '-' : x.toFixed(2)), 1],
  ['Test trades', (b) => b.periods.test.n, (x) => String(x), 1], ['Trades a week (test)', (b) => b.periods.test.tpw, (x) => (x == null ? '-' : x.toFixed(2)), 1],
  ['Test $ at the bot\'s risk', (b) => b.periods.test.net_bot, (x) => (x == null ? '-' : (x < 0 ? '-$' : '+$') + Math.abs(Math.round(x)).toLocaleString('en-US')), 1],
  ['Worst period $ / trade', (b) => b.worst, (x) => usd(x), 1], ['Holds in every period', (b) => (b.allPos ? 1 : 0), (x) => (x ? 'yes' : 'no'), 1],
];

export function compare(a, b) {
  const rows = ROWS.map(([label, get, show, hi]) => {
    const x = get(a), y = get(b);
    const win = x == null || y == null || x === y ? '' : (x > y) === (hi > 0) ? 'a' : 'b';
    return { label, a: show(x), b: show(y), win };
  });
  const aw = rows.filter((r) => r.win === 'a').length, bw = rows.filter((r) => r.win === 'b').length;
  const name = (z) => `${z.key} ${z.targetR}R / ${z.horizon}m`;
  const text = aw === bw ? 'A tie on the numbers. Neither branch is clearly better.'
    : `${aw > bw ? name(a) : name(b)} wins ${Math.max(aw, bw)} of ${rows.length} rows against ${Math.min(aw, bw)}.${a.allPos !== b.allPos ? ` Only ${a.allPos ? name(a) : name(b)} holds in every period.` : ''}`;
  return { rows, aWins: aw, bWins: bw, text };
}

export function plainWords(b) {
  const p = b.periods, side = b.dir === 'long' ? 'buys' : 'sells short';
  const out = [`This branch ${side}: ${b.text.charAt(0).toLowerCase() + b.text.slice(1)}.`];
  const t = `On ${p.train.n} trades up to 2024 it made ${usd(p.train.mean)} each. On ${p.test.n} trades from 2025 it made ${usd(p.test.mean)} each` + (p.y2026 ? `, and in 2026 ${usd(p.y2026.mean)} each (${p.y2026.n} trades).` : '.');
  out.push(t);
  out.push(b.allPos ? 'It made money in all three stretches. That is rare: it is the kind of branch worth watching on paper.'
    : b.holds ? 'It beat its own root out of sample, but one stretch lost money. Keep it on the watch list.'
      : p.test.mean <= 0 ? 'It looked good in training and lost money on the test. This is what overfitting looks like: do not trade it.' : 'It made money on the test but did not beat its own root, so the extra conditions did not help.');
  out.push(`It trades about ${p.test.tpw == null ? '?' : p.test.tpw.toFixed(2)} times a week. Numbers are $ per trade for one micro contract, after costs.`);
  return out;
}

export function statsOf(model, list) {
  const meta = model.meta || {}, h = model.honesty || {}, real = h.real || {};
  const bins = [-60, -30, -15, 0, 15, 30, 60], hist = new Array(bins.length + 1).fill(0);
  for (const b of list) { const m = b.periods.test.mean; let k = bins.findIndex((e) => m < e); if (k < 0) k = bins.length; hist[k]++; }
  const holdN = list.filter((b) => b.holds).length, all = list.filter((b) => b.allPos).length;
  return {
    nodes: meta.nodes || 0, cut: meta.cut || 0, cutPct: meta.cut_pct || 0, roots: (model.roots || []).length, branches: list.length, built: meta.built || '',
    holdN, holdPct: list.length ? Math.round((1000 * holdN) / list.length) / 10 : 0, all, allPct: list.length ? Math.round((1000 * all) / list.length) / 10 : 0,
    real, placebo: h.placebo || [], hist, bins, positiveTest: list.filter((b) => b.periods.test.mean > 0).length, rule: h.rule || '',
    seconds: meta.seconds || 0, complete: meta.complete || 0,
  };
}

export function shareLines(b) {
  const p = b.periods;
  return {
    title: `${b.key} · ${b.level} ${b.dir.toUpperCase()}`, sub: b.id.replace(/_/g, ' '), verdict: b.allPos ? 'HOLDS IN EVERY PERIOD' : b.holds ? 'HOLDS OUT OF SAMPLE' : 'DOES NOT HOLD',
    bars: [['TRAIN', p.train.mean], ['TEST', p.test.mean], ['2026', p.y2026 ? p.y2026.mean : 0]], text: plainWords(b)[0],
    foot: 'DAPHNE · strategy tree search on NQ · paper research, not advice',
  };
}
