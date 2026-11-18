// DAPHNE core: the tree.json model, the tree layout and the number formats. No DOM, no canvas (app.js draws).
//
//   const model = readDoc(doc)                 // roots, featured seeds, conditions, the honesty numbers
//   const tree = layoutTree(model.trees[id])   // nodes with polar positions (u: -1..1 across the fan, r: 0..1 up)
//   usd(12.3) -> "+$12.30"   money(1234) -> "+$1,234"
//
// Node status codes come from tools/strategytree/search.py: 0 open, 1 expanded, 2 cut, 3 leaf.

export const OPEN = 0, EXPANDED = 1, CUT = 2, LEAF = 3;
export const STATUS_WORDS = ['OPEN · BUDGET RAN OUT', 'EXPANDED', 'CUT BY THE BOUND', 'LEAF · DEPTH LIMIT'];

/** The page's model of tree.json: featured trees as node objects, roots by id, plain lookups. */
export function readDoc(doc) {
  const cols = doc.node_cols;
  const at = Object.fromEntries(cols.map((c, i) => [c, i]));
  const trees = {};
  for (const [id, rows] of Object.entries(doc.trees || {})) {
    trees[id] = rows.map((r) => ({
      id: r[at.id], parent: r[at.parent], cond: r[at.cond], depth: r[at.depth], n: r[at.n], excess: r[at.excess],
      score: r[at.score], bound: r[at.bound], status: r[at.status], best: !!r[at.best], oos: r[at.oos], oosN: r[at.oos_n],
    }));
  }
  const roots = doc.roots || [];
  const byId = Object.fromEntries(roots.map((r, i) => [r.id, { ...r, index: i }]));
  // seeds: the top rules' roots in rank order, then the other featured roots by best score
  const ranked = (doc.top || []).map((t) => t.root).filter((id) => trees[id]);
  const rest = roots.filter((r) => r.featured && trees[r.id] && !ranked.includes(r.id))
    .sort((a, b) => (b.tree.best || 0) - (a.tree.best || 0)).map((r) => r.id);
  const featured = [...new Set(ranked), ...rest];
  return {
    meta: doc.meta || {}, conds: doc.conds || [], top: doc.top || [], honesty: doc.honesty || {}, roots, byId, trees,
    featured, demo: !!(doc.meta && doc.meta.demo),
  };
}

/** A stable pseudo-random number in [0, 1) from integers (layout jitter that never changes between renders). */
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Lay a node list out as an upward fan. Leaves (in depth-first order, children by id) share the angle range
 * equally; a parent sits at the n-weighted middle of its children. r grows with depth, with a little stable jitter so
 * the levels read as an organic canopy, not rings. Returns { nodes, byId, order, maxDepth, bestPath }; nodes keep
 * their search (id) order, which is the playback order.
 */
export function layoutTree(rows) {
  const nodes = rows.map((n) => ({ ...n, kids: [], u: 0, r: 0, leaves: 0 }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let root = null;
  for (const n of nodes) {
    const p = byId.get(n.parent);
    if (p) p.kids.push(n); else if (!root || n.id < root.id) root = n;
  }
  if (!root) return { nodes: [], byId, maxDepth: 0, bestPath: [], root: null };
  for (const n of nodes) n.kids.sort((a, b) => a.id - b.id);
  const maxDepth = Math.max(1, ...nodes.map((n) => n.depth));
  // leaf slots, depth first; heavier subtrees get a little more room so big branches spread
  const post = [];
  (function walk(n) { for (const k of n.kids) walk(k); post.push(n); })(root);
  for (const n of post) n.leaves = n.kids.length ? n.kids.reduce((s, k) => s + k.leaves, 0) : 1;
  let slot = 0;
  const total = root.leaves;
  (function place(n) {
    if (!n.kids.length) { n.u = total > 1 ? (slot++ + 0.5) / total * 2 - 1 : 0; return; }
    for (const k of n.kids) place(k);
    const w = n.kids.reduce((s, k) => s + k.leaves, 0);
    n.u = n.kids.reduce((s, k) => s + k.u * k.leaves, 0) / w;
  })(root);
  root.u = 0;
  for (const n of nodes) {
    const j = n.depth ? (hash01(n.id, 7) - 0.5) * 0.42 : 0;
    n.r = n.depth ? Math.min(1, (n.depth + j + 0.15) / (maxDepth + 0.35)) : 0;
    n.phase = hash01(n.id, 3) * Math.PI * 2;
    n.bend = (hash01(n.id, 11) - 0.5);
  }
  const best = nodes.filter((n) => n.best).sort((a, b) => a.depth - b.depth);
  return { nodes, byId, maxDepth, bestPath: best, root };
}

/** Screen position of a node: the fan opens upward from (cx, baseY); `spread` is the half-angle in radians. */
export function place(n, geo) {
  const a = n.u * geo.spread;
  return [geo.cx + Math.sin(a) * n.r * geo.rx, geo.baseY - Math.cos(a) * n.r * geo.ry];
}

const fmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "+$12.30" / "−$4.10" / "—" (per-trade dollars). */
export function usd(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return (x < 0 ? '−$' : '+$') + fmt2.format(Math.abs(x));
}

/** "+$1,234" / "−$56" / "—" (monthly or total dollars). */
export function money(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return (x < 0 ? '−$' : '+$') + fmt0.format(Math.abs(x));
}

export function int(x) { return Number.isFinite(x) ? fmt0.format(x) : '—'; }
export function sign(x) { return !Number.isFinite(x) ? 'na' : x > 0 ? 'pos' : x < 0 ? 'neg' : 'na'; }

/** A root's short tag: "1R·60M". */
export function variant(root) { return `${root.target_r}R·${root.horizon}M`; }

/** Money of a node in a period from the root's base numbers: n, $ a trade, $ a month at 1 micro. */
export function nodeMoney(root, node, period, sessions) {
  const base = root.base[period] || {};
  const n = period === 'train' ? node.n : node.oosN;
  const ex = period === 'train' ? node.excess : node.oos;
  if (!n || !Number.isFinite(base.mean) || !Number.isFinite(ex)) return { n: n || 0, mean: null, mo: null };
  const mean = base.mean + ex;
  const months = (sessions[period] || 0) / 21;
  return { n, mean, excess: ex, mo: months ? mean * n / months : null };
}

/** The search as a whole beats chance: its hold rate tops every placebo run by more than 10 points
 * (tools/strategytree/report.beats_chance). */
export function beatsChance(honesty) {
  const real = (honesty || {}).real || {}, plc = ((honesty || {}).placebo || []).map((p) => p.hold_pct || 0);
  return plc.length > 0 && Number.isFinite(real.hold_pct) && real.hold_pct > Math.max(...plc) + 10;
}

/** The out-of-sample verdict of a node, as tools/strategytree/report.holds decides it. */
export function holds(root, node, minN, sessions) {
  const m = nodeMoney(root, node, 'test', sessions);
  if (!m.n || m.n < minN || m.mean === null) return null;
  return m.excess > 0 && m.mean > 0;
}
