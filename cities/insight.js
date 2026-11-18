// What a city says, in plain words: one sentence per city (the score card) and the table behind it (the city report).
// Pure: no DOM, no three.js. Reads a generated city (generator.js) and its dataset (datasets.js): the district whose buildings are
// highest on average (by the height field's own numbers, signed ones keep their sign) is "the strongest", the lowest "the weakest".
import { parseExpr } from './generator.js';
import { fieldMap } from './datasets.js';
import { fmtField, plain } from './util.js';

const ONE = (n) => (n === 1 ? '' : 's');

export function insight(spec, ds, city) {
  const f = fieldMap(ds), hp = parseExpr(String(spec.height_by).replace(/^-/, '')), fd = f[hp.field] || { label: hp.field, fmt: 'num' };
  const per = new Map();
  let numeric = true, pos = 0, tot = 0, best = -1, bestV = -Infinity;
  for (let k = 0; k < city.n; k++) {
    const it = ds.items[city.item[k]], v = it.f[hp.field];
    if (typeof v !== 'number' || !Number.isFinite(v)) { numeric = false; break; }
    const d = city.districts[city.dist[k]], r = per.get(d.index) || { label: d.label, color: d.color, n: 0, sum: 0, max: -Infinity };
    r.n++; r.sum += v; r.max = Math.max(r.max, v); per.set(d.index, r);
    tot++; if (v > 0) pos++;
    if (v > bestV) { bestV = v; best = k; }
  }
  const items = ds.items;
  const nm = spec.name;
  if (!numeric || !per.size) {
    const d = [...city.districts].sort((a, b) => b.count - a.count)[0];
    return { sentence: `${nm}: ${plain(city.n)} building${ONE(city.n)}${d ? `, most of them in ${d.label}` : ''}.`, rows: [], top: null, low: null, numeric: false, field: fd.label };
  }
  const rows = [...per.values()].map((r) => ({ label: r.label, color: r.color, n: r.n, mean: r.sum / r.n, max: r.max })).sort((a, b) => b.mean - a.mean || (a.label < b.label ? -1 : 1));
  const top = rows[0], low = rows[rows.length - 1], word = String(fd.label).toLowerCase();
  const val = (v) => fmtField(fd, Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2));
  let s;
  if (rows.length === 1) s = `${nm}: ${plain(top.n)} building${ONE(top.n)}, ${word} averages ${val(top.mean)}${best >= 0 ? ` and peaks at ${fmtField(fd, bestV)}` : ''}.`;
  else if (rows.length === 2) s = `${nm}: ${top.label} leads on ${word} (${val(top.mean)} on average) and ${low.label} trails (${val(low.mean)}).`;
  else s = `${nm}: ${top.label} is the strongest on ${word}, averaging ${val(top.mean)} over ${plain(top.n)}; ${low.label} is the weakest at ${val(low.mean)}.`;
  void items;
  return { sentence: s.slice(0, 200), rows, top, low, numeric: true, field: fd.label, positive: tot ? pos / tot : 0, total: tot, best, bestV };
}
