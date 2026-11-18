// PINAKES core (ES module, pure: no DOM, no network, no storage). The catalogue's brain, tested in node (tests/test_pinakes_page.py).
//   reading     kindOf / colType / findTables / tableAt / inferColumns: the same rules as tools/pinakes_build.py (the test checks they agree on real files)
//   asking      applyFilters (plain-word filters), sortRows, stats, groupBy, histogram
//   out         toCSV, toJSON, encodeView / decodeView (the share link), normalizeViews (saved views in and out)
//   catalogue   normalizeCatalog, searchCatalog, labelOf (demo / sample / stale with its age), safeUrl (only files of this site)
//   Ask         ASKS: a few built-in questions that join known tables, each with its query in plain words
// Nothing here trusts its input: a share link, an imported views file and every table are treated as data that may be wrong.

export const DISTRICTS = ['Market', 'Research', 'Money', 'Command', 'Life'];
const MAX_DEPTH = 4, MAX_KEYS = 200, SAMPLE_N = 500, MAX_COLS = 60, FLAT_KEYS = 12;
const DATE_RE = /^\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:?\d\d)?)?$/;
const NUMSTR_RE = /^-?\$?-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/;
const USD_RE = /(?:^|[_. ])(?:usd|pnl|net|dollars?|cost|costs|fee|fees|profit|balance|equity|payout|payouts|amount|cash|gross|revenue|income|spend|budget|per_month|usd_month)(?:$|[_. ])|\$/;
const R_RE = /(?:^|[_. ])(?:r|rr|rmult|r_mult|r_multiple)(?:$|[_. ])/;
const EPOCH_RE = /(?:^|[_. ])(?:t|ts|time|asof|updated|created|built|generated|at|when|epoch|stamp|timestamp)(?:$|[_. ])/;
const NUMERIC = { number: 1, usd: 1, R: 1 };
const DAY = 86400000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isNum = (v) => typeof v === 'number' && isFinite(v);
export const isNumeric = (t) => !!NUMERIC[t];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ reading a file as tables
/** null | bool | num | numstr | date | str | json */
export function kindOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return isFinite(v) ? 'num' : 'null';
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return 'null';
    if (DATE_RE.test(s)) return 'date';
    if (s.length <= 24 && NUMSTR_RE.test(s)) return 'numstr';
    return 'str';
  }
  return 'json';
}
export const isEpoch = (v) => isNum(v) && ((v >= 9.0e8 && v <= 2.2e9) || (v >= 9.0e11 && v <= 2.2e12));
/** kinds = the value kinds seen (a Set or an array, null ignored); values = the numbers seen (for the epoch test) */
export function colType(name, kinds, values) {
  const k = new Set(kinds); k.delete('null');
  const low = String(name).toLowerCase(), only = (...xs) => [...k].every((x) => xs.indexOf(x) >= 0);
  if (!k.size) return 'text';
  if (only('bool')) return 'bool';
  if (only('date')) return 'date';
  if (only('json')) return 'json';
  if (only('num', 'numstr') && k.has('num')) {
    if (EPOCH_RE.test(low) && values && values.length && values.every(isEpoch)) return 'date';
    if (R_RE.test(low)) return 'R';
    if (USD_RE.test(low)) return 'usd';
    return 'number';
  }
  return 'text';
}
export function applyOpts(rows, opts) {
  const expand = (opts && opts.expand) || null, decode = (opts && opts.decode) || null;
  if (!expand && !decode) return rows;
  return rows.map((r) => {
    const n = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (expand && Array.isArray(expand[k]) && Array.isArray(v)) expand[k].forEach((name, i) => { n[`${k}.${name}`] = i < v.length ? v[i] : null; });
      else if (decode && Array.isArray(decode[k]) && Number.isInteger(v) && v >= 0 && v < decode[k].length) n[k] = decode[k][v];
      else n[k] = v;
    }
    return n;
  });
}
export function toRows(node, kind, cols) {
  if (kind === 'rows') return node.map((x) => (isObj(x) ? x : { value: x }));
  if (kind === 'matrix') return node.map((x) => { if (!Array.isArray(x)) return { value: x }; const o = {}; x.forEach((v, i) => { o[cols && i < cols.length ? cols[i] : `c${i + 1}`] = v; }); return o; });
  if (kind === 'map') return Object.keys(node).map((k) => { const v = node[k], row = { key: k }; if (isObj(v)) { for (const kk of Object.keys(v)) if (kk !== 'key') row[kk] = v[kk]; } else row.value = v; return row; });
  if (kind === 'values') return node.map((x) => ({ value: x }));
  if (kind === 'kv') return isObj(node) ? Object.keys(node).map((k) => ({ key: k, value: node[k] })) : [{ key: 'value', value: node }];
  return [];
}
function share(seq, pred) { const head = seq.slice(0, 200); return head.length ? head.filter(pred).length / head.length : 0; }
function header(parent, width) {
  if (!isObj(parent)) return null;
  for (const k of ['cols', 'columns', 'header', 'headers', 'fields', 'keys']) { const v = parent[k]; if (Array.isArray(v) && v.length === width && v.every((x) => typeof x === 'string')) return v; }
  return null;
}
/** every array (or map of records) in a JSON document that can be shown as a table: [{path, kind, rows}], biggest first; paths are keys joined by '/' */
export function findTables(doc) {
  const out = [];
  const visit = (node, path, depth) => {
    if (Array.isArray(node)) {
      if (!node.length) return;
      if (share(node, isObj) >= 0.6) out.push({ path, kind: 'rows', rows: node.length });
      else if (share(node, Array.isArray) >= 0.6) out.push({ path, kind: 'matrix', rows: node.length });
      else if (depth === 0 && node.length >= 2) out.push({ path, kind: 'values', rows: node.length });
      return;
    }
    if (!isObj(node)) return;
    const keys = Object.keys(node), vals = keys.map((k) => node[k]);
    if (depth > 0 && vals.length >= 3 && share(vals, (x) => isObj(x) && Object.keys(x).length > 0) >= 0.8) {
      const sets = vals.slice(0, 200).filter(isObj).map((v) => Object.keys(v));
      if (sets.length) {
        const common = sets[0].filter((k) => sets.every((s) => s.indexOf(k) >= 0)), widest = Math.max(...sets.map((s) => s.length));
        if (common.length && common.length * 2 >= widest) out.push({ path, kind: 'map', rows: vals.length });
      }
    }
    if (depth >= MAX_DEPTH) return;
    keys.slice(0, MAX_KEYS).forEach((k) => { const v = node[k]; if (k.indexOf('/') >= 0 || v === null || typeof v !== 'object') return; visit(v, path ? `${path}/${k}` : k, depth + 1); });
  };
  visit(doc, '', 0);
  const deep = (p) => p.split('/').length - 1;
  out.sort((a, b) => b.rows - a.rows || deep(a.path) - deep(b.path) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!out.length) out.push({ path: '', kind: 'kv', rows: isObj(doc) ? Object.keys(doc).length : 1 });
  return out;
}
export function resolve(doc, path) {
  let node = doc, parent = null;
  for (const k of String(path || '').split('/').filter((p) => p !== '')) {
    if (isObj(node) && Object.prototype.hasOwnProperty.call(node, k)) { parent = node; node = node[k]; } else return [undefined, null];
  }
  return [node, parent];
}
/** the rows of the table at `path`; kind is worked out when not given; opts = the card's hand hints (header / expand / decode) */
export function tableAt(doc, path, kind, opts) {
  const [node, parent] = resolve(doc, path);
  if (node === undefined || node === null) return { rows: [], kind: 'kv' };
  let k = kind && kind !== 'auto' ? kind : null;
  if (!k) { const hit = findTables(doc).filter((c) => c.path === (path || ''))[0]; k = hit ? hit.kind : Array.isArray(node) ? 'rows' : 'kv'; }
  if ((k === 'rows' || k === 'matrix' || k === 'values') && !Array.isArray(node)) k = isObj(node) ? 'kv' : 'kv';
  if ((k === 'map') && !isObj(node)) k = Array.isArray(node) ? 'rows' : 'kv';
  let cols = null;
  if (k === 'matrix' && node.length && Array.isArray(node[0])) cols = (opts && Array.isArray(opts.header) && opts.header) || header(parent, node[0].length);
  return { rows: applyOpts(toRows(node, k, cols), opts), kind: k };
}
/** one level: {a: {b: 1}} -> {'a.b': 1} for small plain objects; lists and deeper objects stay (shown as JSON) */
export function flatten(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (isObj(v)) { const ks = Object.keys(v); if (ks.length > 0 && ks.length <= FLAT_KEYS) { for (const kk of ks) out[`${k}.${kk}`] = v[kk]; continue; } }
    out[k] = v;
  }
  return out;
}
export function sampleIdx(n, cap) {
  const c = cap || SAMPLE_N;
  if (n <= c) return Array.from({ length: n }, (_, i) => i);
  const step = n / c, seen = new Set();
  for (let i = 0; i < c; i++) seen.add(Math.min(n - 1, Math.floor(i * step)));
  return [...seen].sort((a, b) => a - b);
}
/** [{k, t, mixed?}] in first-seen order, from an even sample of the (already flat or not) rows */
export function inferColumns(rows, flat) {
  const order = [], kinds = {}, nums = {};
  for (const i of sampleIdx(rows.length)) {
    const r = rows[i];
    if (!isObj(r)) continue;
    const f = flat ? r : flatten(r);
    for (const k of Object.keys(f)) {
      if (!Object.prototype.hasOwnProperty.call(kinds, k)) { if (order.length >= MAX_COLS) continue; order.push(k); kinds[k] = new Set(); nums[k] = []; }
      const kd = kindOf(f[k]); kinds[k].add(kd); if (kd === 'num') nums[k].push(f[k]);
    }
  }
  return order.map((k) => { const ks = new Set(kinds[k]); ks.delete('null'); const c = { k, t: colType(k, ks, nums[k]) }; if (c.t === 'text' && ks.size > 1) c.mixed = true; return c; });
}
/** a loaded file -> { rows (flat), cols, kind, paths, path, moved } ready for the grid. path '' with kind 'auto' (or a path that is gone) means: take the biggest array. */
export function openTable(doc, path, kind, opts) {
  const paths = findTables(doc), want = typeof path === 'string' ? path : null;
  let exists = false;
  if (want !== null) { const node = resolve(doc, want)[0]; exists = want === '' ? !!(kind && kind !== 'auto') || paths.some((c) => c.path === '') : node !== undefined && node !== null && typeof node === 'object'; }
  const p = exists ? want : paths[0].path, t = tableAt(doc, p, exists ? kind : null, exists ? opts : null);
  const rows = t.rows.map((r) => (isObj(r) ? flatten(r) : { value: r }));
  return { rows, cols: inferColumns(rows, true), kind: t.kind, paths, path: p, moved: want !== null && want !== '' && !exists };
}

// ------------------------------------------------------------------ values
export function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string') { const s = v.trim(); if (s.length <= 24 && NUMSTR_RE.test(s)) return parseFloat(s.replace(/[$,%]/g, '')); }
  return NaN;
}
/** a date value (ISO text or an epoch in seconds / milliseconds) as milliseconds UTC, or NaN */
export function toMs(v) {
  if (isNum(v)) return isEpoch(v) ? (v < 1e11 ? v * 1000 : v) : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim(), m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?/.exec(s);
  if (!m) return NaN;
  if (/(?:Z|[+-]\d\d:?\d\d)$/.test(s) && s.length > 10) { const p = Date.parse(s.replace(' ', 'T')); if (!isNaN(p)) return p; }
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
const p2 = (n) => (n < 10 ? '0' : '') + n;
export function isoDay(ms) { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; }
/** the calendar day a value falls on, as the file wrote it (text keeps its own date; an epoch is read in UTC) */
export function dayOf(v) {
  if (typeof v === 'string') { const m = /^(\d{4}-\d\d-\d\d)/.exec(v.trim()); return m ? m[1] : ''; }
  const ms = toMs(v); return isNaN(ms) ? '' : isoDay(ms);
}
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function weekdayOf(v) { const d = dayOf(v); if (!d) return ''; const ms = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); return WEEKDAYS[(new Date(ms).getUTCDay() + 6) % 7]; }
export function weekOf(v) { const d = dayOf(v); if (!d) return ''; const ms = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); return isoDay(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY); }
const isEmpty = (v) => v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) || (typeof v === 'string' && v.trim() === '');
function group3(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function num(v, dp) {
  if (!isNum(v)) return '';
  const a = Math.abs(v), d = dp !== undefined ? dp : Number.isInteger(v) ? 0 : a >= 100 ? 2 : a >= 1 ? 3 : 4;
  let s = a.toFixed(d); if (dp === undefined && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  const [i, f] = s.split('.');
  return (v < 0 && +s !== 0 ? '-' : '') + group3(i) + (f ? '.' + f : '');
}
export function money(v) {
  if (!isNum(v)) return '';
  const a = Math.abs(v), whole = Math.abs(a - Math.round(a)) < 0.005, s = whole ? String(Math.round(a)) : a.toFixed(2), [i, f] = s.split('.');
  return (v < 0 && +s !== 0 ? '-' : '') + '$' + group3(i) + (f ? '.' + f : '');
}
export const rWords = (v) => (isNum(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + 'R' : '');
export function compact(v, n) { let s; try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (_) { s = String(v); } s = s === undefined ? '' : s; const max = n || 80; return s.length > max ? s.slice(0, max - 1) + '\u2026' : s; }
/** a cell as text, by the column's type; an empty cell is '' */
export function fmt(v, t, wide) {
  if (isEmpty(v)) return '';
  if (t === 'usd') { const n = toNum(v); return isNaN(n) ? compact(v) : money(n); }
  if (t === 'R') { const n = toNum(v); return isNaN(n) ? compact(v) : rWords(n); }
  if (t === 'number') { const n = toNum(v); return isNaN(n) ? compact(v) : num(n); }
  if (t === 'bool') return v === true ? 'yes' : v === false ? 'no' : compact(v);
  if (t === 'date') { if (isNum(v)) { const ms = toMs(v); if (isNaN(ms)) return String(v); const d = new Date(ms); return `${isoDay(ms)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`; } return String(v).replace('T', ' '); }
  if (typeof v === 'object') return compact(v, wide ? 4000 : 80);
  return wide ? String(v) : compact(String(v), 120);
}
export const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many || one + 's'}`;
export function bytesWords(b) { return !isNum(b) ? '' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' bytes'; }

// ------------------------------------------------------------------ filters in plain words
export const OPS = {
  lt: 'less than', lte: 'at most', gt: 'more than', gte: 'at least', eq: 'equals', ne: 'is not', between: 'between',
  has: 'contains', nhas: 'does not contain', is: 'is exactly', starts: 'starts with',
  last: 'in last', before: 'before', after: 'after', on: 'on',
  yes: 'is yes', no: 'is no', empty: 'is empty', nempty: 'is not empty',
};
export function opsFor(t) {
  if (isNumeric(t)) return ['lt', 'lte', 'gt', 'gte', 'eq', 'ne', 'between', 'empty', 'nempty'];
  if (t === 'date') return ['last', 'before', 'after', 'on', 'between', 'empty', 'nempty'];
  if (t === 'bool') return ['yes', 'no', 'empty', 'nempty'];
  return ['has', 'nhas', 'is', 'starts', 'empty', 'nempty'];
}
export const needsValue = (op) => ['yes', 'no', 'empty', 'nempty'].indexOf(op) < 0;
const fold = (s) => { const x = String(s); return (x.normalize ? x.normalize('NFC') : x).toLowerCase(); };
const textOf = (v) => (typeof v === 'object' && v !== null ? compact(v, 4000) : String(v));
/** does one row pass one filter? now = today's end in ms (for 'in last N days') */
export function test(row, f, t, now) {
  const v = row[f.col], e = isEmpty(v);
  if (f.op === 'empty') return e;
  if (f.op === 'nempty') return !e;
  if (e) return false;
  if (isNumeric(t)) {
    const n = toNum(v), a = toNum(f.value), b = toNum(f.value2);
    if (isNaN(n) || isNaN(a)) return false;
    switch (f.op) { case 'lt': return n < a; case 'lte': return n <= a; case 'gt': return n > a; case 'gte': return n >= a; case 'eq': return n === a; case 'ne': return n !== a;
      case 'between': return !isNaN(b) && n >= Math.min(a, b) && n <= Math.max(a, b); default: return false; }
  }
  if (t === 'date') {
    const ms = toMs(v); if (isNaN(ms)) return false;
    if (f.op === 'last') { const n = toNum(f.value); return !isNaN(n) && ms > now - n * DAY && ms <= now; }
    const a = toMs(f.value); if (isNaN(a)) return false;
    if (f.op === 'before') return ms < a;
    if (f.op === 'after') return ms >= a + DAY;
    if (f.op === 'on') return dayOf(v) === dayOf(f.value);
    if (f.op === 'between') { const b = toMs(f.value2); return !isNaN(b) && ms >= Math.min(a, b) && ms < Math.max(a, b) + DAY; }
    return false;
  }
  if (t === 'bool') return f.op === 'yes' ? v === true : f.op === 'no' ? v === false : false;
  const s = fold(textOf(v)), q = fold(f.value === undefined || f.value === null ? '' : f.value);
  switch (f.op) { case 'has': return s.indexOf(q) >= 0; case 'nhas': return s.indexOf(q) < 0; case 'is': return s === q; case 'starts': return s.indexOf(q) === 0; default: return false; }
}
/** keep only filters that make sense for these columns (a share link or a saved view may be old or wrong) */
export function cleanFilters(filters, cols) {
  const by = {}; cols.forEach((c) => { by[c.k] = c; });
  const out = [];
  for (const f of Array.isArray(filters) ? filters.slice(0, 20) : []) {
    if (!isObj(f) || typeof f.col !== 'string' || !by[f.col] || opsFor(by[f.col].t).indexOf(f.op) < 0) continue;
    const g = { col: f.col, op: f.op };
    if (needsValue(f.op)) {
      const scalar = (x) => (typeof x === 'number' && isFinite(x) ? x : typeof x === 'string' ? x.slice(0, 200) : null);
      g.value = scalar(f.value); if (g.value === null || g.value === '') continue;
      const t = by[f.col].t;
      if (isNumeric(t) && isNaN(toNum(g.value))) continue;
      if (t === 'date' && (f.op === 'last' ? !(toNum(g.value) > 0) : isNaN(toMs(g.value)))) continue;
      if (f.op === 'between') { g.value2 = scalar(f.value2); if (g.value2 === null || g.value2 === '' || (isNumeric(t) ? isNaN(toNum(g.value2)) : isNaN(toMs(g.value2)))) continue; }
    }
    out.push(g);
  }
  return out;
}
/** rows that pass every filter (mode 'all') or at least one (mode 'any'); todayIso fixes 'in last N days' */
export function applyFilters(rows, filters, cols, todayIso, mode) {
  if (!filters || !filters.length) return rows;
  const by = {}; cols.forEach((c) => { by[c.k] = c.t; });
  const base = toMs(todayIso || ''), now = (isNaN(base) ? Date.now() : Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10))) + DAY - 1;
  const fs = filters.map((f) => [f, by[f.col] || 'text']), any = mode === 'any';
  return rows.filter((r) => (any ? fs.some(([f, t]) => test(r, f, t, now)) : fs.every(([f, t]) => test(r, f, t, now))));
}
/** 'pnl less than $0', 'day in last 7 days', 'note contains "sweep"' */
export function filterWords(f, t) {
  const v = (x) => (isNumeric(t) ? fmt(toNum(x), t) : t === 'date' ? String(x) : `"${x}"`);
  if (!needsValue(f.op)) return `${f.col} ${OPS[f.op]}`;
  if (f.op === 'last') { const n = toNum(f.value); return `${f.col} in last ${num(n)} ${n === 1 ? 'day' : 'days'}`; }
  if (f.op === 'between') return `${f.col} between ${v(f.value)} and ${v(f.value2)}`;
  return `${f.col} ${OPS[f.op]} ${v(f.value)}`;
}
export function filtersWords(filters, cols, mode) {
  const by = {}; cols.forEach((c) => { by[c.k] = c.t; });
  return filters.map((f) => filterWords(f, by[f.col] || 'text')).join(mode === 'any' ? ' OR ' : ' AND ');
}

// ------------------------------------------------------------------ sort, stats, group
export function sortRows(rows, key, dir, t) {
  if (!key) return rows;
  const sign = dir === 'desc' ? -1 : 1, numeric = isNumeric(t), date = t === 'date';
  const keyed = rows.map((r, i) => {
    const v = r[key];
    if (isEmpty(v)) return [r, i, 2, 0];
    if (numeric) { const n = toNum(v); return isNaN(n) ? [r, i, 1, fold(textOf(v))] : [r, i, 0, n]; }
    if (date) { const ms = toMs(v); return isNaN(ms) ? [r, i, 1, fold(textOf(v))] : [r, i, 0, ms]; }
    if (t === 'bool') return [r, i, 0, v === true ? 1 : 0];
    return typeof v === 'number' ? [r, i, 0, v] : [r, i, 1, fold(textOf(v))];
  });
  keyed.sort((a, b) => {
    if (a[2] === 2 || b[2] === 2) return a[2] - b[2] || a[1] - b[1];          // empty cells always last, whichever way the sort runs
    const c = a[2] - b[2] || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0);
    return c * sign || a[1] - b[1];                                          // ties keep their order
  });
  return keyed.map((x) => x[0]);
}
/** count, empty, distinct and, for numbers, sum / mean / min / max / median; for dates the first and last; for text the commonest values */
export function stats(rows, key, t) {
  const out = { count: 0, empty: 0, distinct: 0, type: t };
  const seen = new Map(), nums = [];
  let lo = null, hi = null;
  for (const r of rows) {
    const v = r[key];
    if (isEmpty(v)) { out.empty++; continue; }
    out.count++;
    const s = textOf(v); if (seen.size < 100000 || seen.has(s)) seen.set(s, (seen.get(s) || 0) + 1);
    if (isNumeric(t)) { const n = toNum(v); if (!isNaN(n)) nums.push(n); } else if (t === 'date') { const ms = toMs(v); if (!isNaN(ms)) { if (lo === null || ms < lo[0]) lo = [ms, v]; if (hi === null || ms > hi[0]) hi = [ms, v]; } }
  }
  out.distinct = seen.size;
  if (isNumeric(t) && nums.length) {
    let sum = 0, mn = Infinity, mx = -Infinity; for (const n of nums) { sum += n; if (n < mn) mn = n; if (n > mx) mx = n; }
    nums.sort((a, b) => a - b); const m = nums.length >> 1;
    Object.assign(out, { n: nums.length, sum, mean: sum / nums.length, min: mn, max: mx, median: nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2 });
  } else if (t === 'date' && lo) { out.min = lo[1]; out.max = hi[1]; }
  if (!isNumeric(t)) out.top = [...seen.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([value, n]) => ({ value, n }));
  return out;
}
export const BUCKETS = { day: 'day', week: 'week', month: 'month', weekday: 'weekday' };
export function bucketKey(v, t, bucket) {
  if (isEmpty(v)) return '(empty)';
  if (t === 'date') { const d = dayOf(v); if (!d) return textOf(v); return bucket === 'month' ? d.slice(0, 7) : bucket === 'week' ? weekOf(v) : bucket === 'weekday' ? weekdayOf(v) : d; }
  if (t === 'bool') return v === true ? 'yes' : v === false ? 'no' : textOf(v);
  return compact(v, 60);
}
/** rows grouped by one column: [{key, count, sum, mean, min, max}]; dates in order (weekdays Mon..Sun), everything else biggest first */
export function groupBy(rows, by, tBy, measure, tMeasure, bucket, agg) {
  const m = new Map();
  for (const r of rows) {
    const k = bucketKey(r[by], tBy, bucket);
    let g = m.get(k); if (!g) { g = { key: k, count: 0, n: 0, sum: 0, min: null, max: null }; m.set(k, g); }
    g.count++;
    if (measure) { const n = toNum(r[measure]); if (!isNaN(n)) { g.n++; g.sum += n; if (g.min === null || n < g.min) g.min = n; if (g.max === null || n > g.max) g.max = n; } }
  }
  const out = [...m.values()].map((g) => ({ key: g.key, count: g.count, sum: measure ? g.sum : null, mean: measure && g.n ? g.sum / g.n : null, min: g.min, max: g.max }));
  const val = (g) => (!measure || agg === 'count' ? g.count : agg === 'mean' ? (g.mean === null ? -Infinity : g.mean) : g.sum);
  if (tBy === 'date' && bucket === 'weekday') out.sort((a, b) => (WEEKDAYS.indexOf(a.key) + 8) % 8 - (WEEKDAYS.indexOf(b.key) + 8) % 8);
  else if (tBy === 'date') out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  else out.sort((a, b) => val(b) - val(a) || (a.key < b.key ? -1 : 1));
  return out;
}
/** equal-width bins over a numeric column: [{lo, hi, n}] */
export function histogram(rows, key, bins) {
  const xs = []; for (const r of rows) { const n = toNum(r[key]); if (!isNaN(n)) xs.push(n); }
  if (!xs.length) return [];
  let mn = Infinity, mx = -Infinity; for (const x of xs) { if (x < mn) mn = x; if (x > mx) mx = x; }
  const nb = mn === mx ? 1 : clamp(bins || 12, 2, 40), w = (mx - mn) / nb || 1, out = Array.from({ length: nb }, (_, i) => ({ lo: mn + i * w, hi: mn + (i + 1) * w, n: 0 }));
  for (const x of xs) out[Math.min(nb - 1, Math.floor((x - mn) / w))].n++;
  return out;
}

// ------------------------------------------------------------------ out: CSV, JSON, share link, saved views
function csvCell(v, t) {
  if (isEmpty(v)) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
  if (typeof v === 'string' && /^[=+@\t\r]/.test(s) || (typeof v === 'string' && /^-/.test(s) && isNaN(toNum(s)))) s = "'" + s;   // a text cell must never run as a spreadsheet formula
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(rows, cols) {
  const head = cols.map((c) => csvCell(c.k, 'text')).join(',');
  return [head].concat(rows.map((r) => cols.map((c) => csvCell(r[c.k], c.t)).join(','))).join('\r\n') + '\r\n';
}
export function toJSON(rows, cols) {
  return JSON.stringify(rows.map((r) => { const o = {}; for (const c of cols) { const v = r[c.k]; o[c.k] = v === undefined || (typeof v === 'number' && !isFinite(v)) ? null : v; } return o; }));
}
const SAFE_ID = /^[a-z0-9][a-z0-9~\-]{0,119}$/;
/** the state worth sharing: which table, which array, filters, sort, the chart and the tab */
export function cleanView(v) {
  if (!isObj(v) || typeof v.t !== 'string' || !SAFE_ID.test(v.t)) return null;
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n || 120) : ''), out = { t: v.t };
  if (typeof v.p === 'string' && v.p.length <= 200) out.p = v.p;
  if (Array.isArray(v.f)) out.f = v.f.slice(0, 20).filter(isObj).map((f) => { const g = { col: str(f.col), op: str(f.op, 12) }; for (const k of ['value', 'value2']) if (typeof f[k] === 'number' && isFinite(f[k])) g[k] = f[k]; else if (typeof f[k] === 'string') g[k] = f[k].slice(0, 200); return g; });
  if (v.m === 'any') out.m = 'any';
  if (Array.isArray(v.s) && typeof v.s[0] === 'string') out.s = [str(v.s[0]), v.s[1] === 'desc' ? 'desc' : 'asc'];
  if (isObj(v.c)) out.c = { kind: ['bar', 'line', 'hist'].indexOf(v.c.kind) >= 0 ? v.c.kind : 'bar', y: str(v.c.y), by: str(v.c.by), agg: ['sum', 'mean', 'count'].indexOf(v.c.agg) >= 0 ? v.c.agg : 'sum', bucket: BUCKETS[v.c.bucket] || 'day' };
  if (['rows', 'stats', 'chart', 'views'].indexOf(v.tab) >= 0) out.tab = v.tab;
  if (Array.isArray(v.h)) out.h = v.h.slice(0, 60).filter((x) => typeof x === 'string').map((x) => x.slice(0, 120));
  return out;
}
export function encodeView(v) { const c = cleanView(v); return c ? 'v=' + encodeURIComponent(JSON.stringify(c)) : ''; }
export function decodeView(hash) {
  const s = String(hash || '').replace(/^#/, ''), m = /(?:^|&)v=([^&]*)/.exec(s);
  if (!m || m[1].length > 8000) return null;
  try { return cleanView(JSON.parse(decodeURIComponent(m[1]))); } catch (_) { return null; }
}
/** saved views in and out of a file or the phone: [{name, view, at}] (at most 60), junk dropped */
export function normalizeViews(raw) {
  let d = raw;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return null; } }
  const list = Array.isArray(d) ? d : isObj(d) && Array.isArray(d.views) ? d.views : null;
  if (!list) return null;
  const out = [], names = new Set();
  for (const x of list) {
    if (!isObj(x) || typeof x.name !== 'string') continue;
    const view = cleanView(x.view), name = x.name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
    if (!view || !name || names.has(name)) continue;
    names.add(name); out.push({ name, view, at: typeof x.at === 'string' && DATE_RE.test(x.at) ? x.at : '' });
    if (out.length >= 60) break;
  }
  return out;
}
export const exportViews = (views) => JSON.stringify({ app: 'pinakes', v: 1, views: normalizeViews(views) || [] }, null, 1);

// ------------------------------------------------------------------ the catalogue
/** only a JSON file of this site: '../app/file.json' or './file.json' (no scheme, no host, no climbing further up) */
export function safeUrl(u) {
  if (typeof u !== 'string' || u.length > 200) return false;
  if (!/^\.\.?\/[A-Za-z0-9_\-.~/]+\.json$/.test(u)) return false;
  return u.slice(u.indexOf('/') + 1).split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
export function normalizeCatalog(doc) {
  if (!isObj(doc) || !Array.isArray(doc.tables)) return null;
  const tables = [], ids = new Set();
  for (const c of doc.tables) {
    if (!isObj(c) || typeof c.id !== 'string' || !SAFE_ID.test(c.id) || ids.has(c.id) || typeof c.name !== 'string') continue;
    const inline = typeof c.inline === 'string' ? c.inline : null, url = safeUrl(c.url) ? c.url : null;
    ids.add(c.id);
    tables.push({ id: c.id, name: c.name.slice(0, 80), app: String(c.app || ''), district: DISTRICTS.indexOf(c.district) >= 0 ? c.district : 'Command', url, inline, path: typeof c.path === 'string' ? c.path : '',
      kind: String(c.kind || 'auto'), desc: String(c.desc || '').slice(0, 400), rows: isNum(c.rows) ? c.rows : null, bytes: isNum(c.bytes) ? c.bytes : null,
      cols: Array.isArray(c.cols) ? c.cols.filter((x) => isObj(x) && typeof x.k === 'string').map((x) => ({ k: x.k, t: String(x.t || 'text') })) : [],
      sample: Array.isArray(c.sample) ? c.sample.filter(isObj).slice(0, 3) : [], label: ['demo', 'sample', 'live', 'build', 'research'].indexOf(c.label) >= 0 ? c.label : 'live',
      source: ['site', 'build', 'research'].indexOf(c.source) >= 0 ? c.source : 'site', fresh: isObj(c.fresh) ? { field: String(c.fresh.field || ''), value: c.fresh.value } : null,
      opts: isObj(c.opts) ? c.opts : null, span: isObj(c.span) ? { first: String(c.span.first || ''), last: String(c.span.last || '') } : null, file: typeof c.file === 'string' ? c.file : '', needs: typeof c.needs === 'string' ? c.needs : '' });
  }
  return { tables, built: typeof doc.built === 'string' ? doc.built : '', demo: doc.demo === true };
}
export function totals(tables) {
  const by = {}; DISTRICTS.forEach((d) => { by[d] = { tables: 0, rows: 0 }; });
  const t = { tables: tables.length, rows: 0, open: 0, openRows: 0, build: 0, research: 0, researchRows: 0, by };
  for (const c of tables) {
    const r = c.rows || 0; t.rows += r; by[c.district].tables++; by[c.district].rows += r;
    if (c.source === 'research') { t.research++; t.researchRows += r; } else if (c.source === 'build') t.build++; else { t.open++; t.openRows += r; }
  }
  return t;
}
/** '127 tables, 1,009,704 rows' */
export const totalWords = (t) => `${plural(t.tables, 'table')}, ${plural(t.rows, 'row')}`;
export function totalNote(t) {
  const bits = [`${plural(t.open, 'table')} with ${plural(t.openRows, 'row')} open right here`];
  if (t.build) bits.push(`${plural(t.build, 'table')} written by the site build (measured when opened)`);
  if (t.research) bits.push(`${plural(t.research, 'research dataset')} with ${plural(t.researchRows, 'row')} kept on the PC (span and rows only)`);
  return bits.join('; ') + '.';
}
export function searchCatalog(tables, q, district) {
  const words = fold(q || '').split(/\s+/).filter(Boolean);
  return tables.filter((c) => {
    if (district && district !== 'All' && c.district !== district) return false;
    if (!words.length) return true;
    const hay = fold([c.name, c.app, c.desc, c.district, c.label, c.url || c.file || '', c.cols.map((x) => x.k).join(' ')].join(' '));
    return words.every((w) => hay.indexOf(w) >= 0);
  });
}
export function ageWords(ms) {
  if (!isNum(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 2 ? `${d} days old` : h >= 2 ? `${h} hours old` : m >= 2 ? `${m} minutes old` : 'just now';
}
/** the honest badge of a table: {cls, text, age} from what the file says it is and how old its own stamp is */
export function labelOf(card, nowMs, fresh) {
  const f = fresh || card.fresh, ms = f ? toMs(f.value) : NaN, age = isNaN(ms) || !isNum(nowMs) ? '' : ageWords(Math.max(0, nowMs - ms));
  if (card.label === 'research') return { cls: 'info', text: 'On the PC', age: card.span ? `${card.span.first} to ${card.span.last}` : '' };
  if (card.label === 'demo') return { cls: 'warn', text: 'DEMO', age };
  if (card.label === 'sample') return { cls: 'warn', text: 'SAMPLE', age };
  if (card.label === 'build') return { cls: 'info', text: 'Site build', age };
  if (!isNaN(ms) && isNum(nowMs) && nowMs - ms > 14 * DAY) return { cls: 'bad', text: 'STALE', age };
  return { cls: 'ok', text: 'Published', age };
}
/** why a table could not be loaded, in plain words */
export function whyWords(card, err) {
  const what = card.url ? card.url.replace(/^\.\.\//, '').replace(/^\.\//, 'pinakes/') : card.file || card.name;
  if (card.source === 'research') return `${what} is a research dataset kept on the PC. It is not published, so it cannot be opened or downloaded here. The catalogue shows its span and row count only.`;
  if (!card.url && !card.inline) return `${what} has no address on this site, so it cannot be opened.`;
  if (err === 404 && card.source === 'build') return `${what} is not on this site yet. It is written by the site build, so it appears after the next publish.`;
  if (err === 404) return `${what} was not found on this site (404).`;
  if (err === 'json') return `${what} was found but it is not valid JSON, so it cannot be read as a table.`;
  if (err === 'timeout') return `${what} took too long to load. Check the connection and try again.`;
  if (err === 'empty') return `${what} loaded, but there are no rows in it.`;
  if (typeof err === 'number') return `${what} could not be loaded (the site answered ${err}).`;
  return `${what} could not be loaded (no connection, or the file is missing).`;
}

// ------------------------------------------------------------------ what a loaded file says about itself
const FRESH_KEYS = ['asof', 'as_of', 'built', 'generated', 'generated_at', 'updated', 'updated_at', 'published', 't', 'ts', 'time', 'date', 'last', 'when'];
/** the field that says how old a file is: {field, value}, looked for at the top and one level down (same rule as the builder) */
export function findFresh(doc) {
  const ok = (v) => (typeof v === 'string' && DATE_RE.test(v.trim())) || isEpoch(v);
  if (!isObj(doc)) return null;
  for (const k of FRESH_KEYS) if (Object.prototype.hasOwnProperty.call(doc, k) && ok(doc[k])) return { field: k, value: doc[k] };
  for (const outer of ['meta', '_meta', 'header', 'info', 'status', 'summary']) {
    const sub = doc[outer];
    if (isObj(sub)) for (const k of FRESH_KEYS) if (Object.prototype.hasOwnProperty.call(sub, k) && ok(sub[k])) return { field: `${outer}/${k}`, value: sub[k] };
  }
  return null;
}
/** demo | sample | live, from the file itself once it is loaded (a published file may still carry sample data) */
export function docLabel(card, doc) {
  if (card.label === 'demo' || card.label === 'research') return card.label;
  if (isObj(doc)) { if (doc.demo === true) return 'demo'; if (String(doc.status || '').toLowerCase() === 'sample' || doc.sample === true) return 'sample'; }
  return card.label === 'build' ? 'live' : card.label;
}
/** which fields a phone shows first when a table has many: dates, $ and R, then text and yes / no, then other numbers, nested ones last; the file's own order is kept */
export function defaultShown(cols, n) {
  const rank = (t) => (t === 'date' || t === 'usd' || t === 'R' ? 0 : t === 'text' || t === 'bool' ? 1 : t === 'number' ? 2 : 3), max = n || 14;
  if (cols.length <= max) return cols.map((c) => c.k);
  const keep = new Set(cols.map((c, i) => [rank(c.t), i, c.k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, max).map((x) => x[2]));
  return cols.filter((c) => keep.has(c.k)).map((c) => c.k);
}
export const KIND_WORDS = { rows: 'a list of records', matrix: 'a grid of values', map: 'named records', values: 'a plain list', kv: 'the top-level fields', csv: 'a CSV file', auto: 'a list' };

// ------------------------------------------------------------------ Ask: built-in questions that join known tables
const pick = (r, keys) => { for (const k of keys) if (!isEmpty(r[k])) return r[k]; return null; };
function askWeekday(sets) {
  const rows = [].concat(...sets), m = {}; WEEKDAYS.forEach((d) => { m[d] = { weekday: d, trades: 0, usd: 0, r: 0 }; });
  let used = 0;
  for (const r of rows) { const d = weekdayOf(pick(r, ['day', 'date', 'entry.t', 't'])), usd = toNum(pick(r, ['usd', 'pnl', 'net'])); if (!d || isNaN(usd)) continue; used++; m[d].trades++; m[d].usd += usd; const rr = toNum(r.r); if (!isNaN(rr)) m[d].r += rr; }
  const out = WEEKDAYS.map((d) => m[d]).filter((g) => g.trades > 0).map((g) => ({ weekday: g.weekday, trades: g.trades, usd: Math.round(g.usd * 100) / 100, avg_usd: Math.round(g.usd / g.trades * 100) / 100, r: Math.round(g.r * 100) / 100 }));
  return { cols: [{ k: 'weekday', t: 'text' }, { k: 'trades', t: 'number' }, { k: 'usd', t: 'usd' }, { k: 'avg_usd', t: 'usd' }, { k: 'r', t: 'R' }], rows: out, chart: { x: 'weekday', y: 'usd' }, note: `${plural(used, 'trade')} counted${rows.length - used ? `, ${plural(rows.length - used, 'row')} without a day or a $ result left out` : ''}. Small samples: a weekday with a handful of trades proves nothing.` };
}
function askVerdicts(sets) {
  const rows = [].concat(...sets), m = new Map();
  for (const r of rows) { const fam = isEmpty(r.family) ? '(none)' : String(r.family), v = String(isEmpty(r.verdict) ? 'open' : r.verdict); let g = m.get(fam); if (!g) { g = { family: fam, runs: 0, adopted: 0, rejected: 0, open: 0 }; m.set(fam, g); } g.runs++; if (v === 'adopted' || v === 'rejected') g[v]++; else g.open++; }
  const out = [...m.values()].sort((a, b) => b.runs - a.runs || (a.family < b.family ? -1 : 1)).map((g) => Object.assign(g, { adopted_pct: g.runs ? Math.round(g.adopted / g.runs * 1000) / 10 : 0 }));
  return { cols: [{ k: 'family', t: 'text' }, { k: 'runs', t: 'number' }, { k: 'adopted', t: 'number' }, { k: 'rejected', t: 'number' }, { k: 'open', t: 'number' }, { k: 'adopted_pct', t: 'number' }], rows: out, chart: { x: 'family', y: 'runs' }, note: `${plural(rows.length, 'run')} in ${plural(out.length, 'family', 'families')}. "adopted_pct" is the share of a family's runs that were adopted.` };
}
function askDeals(sets, today) {
  const rows = [].concat(...sets), t0 = toMs(today), out = [];
  for (const r of rows) { const ms = toMs(r.expires); if (isNaN(ms) || isNaN(t0)) continue; const days = Math.round((ms - t0) / DAY); if (days < 0 || days > 7) continue; out.push({ ends: dayOf(r.expires), days_left: days, title: String(pick(r, ['title', 'text']) || ''), usd: isNaN(toNum(r.usd)) ? null : toNum(r.usd), risk: isEmpty(r.risk) ? '' : String(r.risk) }); }
  out.sort((a, b) => a.days_left - b.days_left || (b.usd || 0) - (a.usd || 0));
  return { cols: [{ k: 'ends', t: 'date' }, { k: 'days_left', t: 'number' }, { k: 'title', t: 'text' }, { k: 'usd', t: 'usd' }, { k: 'risk', t: 'text' }], rows: out, chart: null, note: out.length ? `${plural(out.length, 'dated deal')} end between ${today} and 7 days later. The $ is an estimate of the saving, not a promise.` : `No dated deal ends between ${today} and 7 days later (${plural(rows.length, 'item')} looked at).` };
}
function askStrategies(sets) {
  const rows = [].concat(...sets), m = new Map();
  for (const r of rows) { const k = String(pick(r, ['s', 'strategy', 'strat', 'bot']) || '(none)'), usd = toNum(pick(r, ['pnl', 'usd'])); if (isNaN(usd)) continue; let g = m.get(k); if (!g) { g = { strategy: k, trades: 0, wins: 0, usd: 0 }; m.set(k, g); } g.trades++; g.usd += usd; if (usd > 0) g.wins++; }
  const out = [...m.values()].map((g) => ({ strategy: g.strategy, trades: g.trades, win_pct: Math.round(g.wins / g.trades * 1000) / 10, usd: Math.round(g.usd * 100) / 100 })).sort((a, b) => b.usd - a.usd);
  return { cols: [{ k: 'strategy', t: 'text' }, { k: 'trades', t: 'number' }, { k: 'win_pct', t: 'number' }, { k: 'usd', t: 'usd' }], rows: out, chart: { x: 'strategy', y: 'usd' }, note: `Paper trades only, ${plural(out.reduce((s, g) => s + g.trades, 0), 'trade')}. Never an order.` };
}
/** tries = lists of catalogue ids; the first list whose tables all load is used (so a missing published file falls back to a labelled demo) */
export const ASKS = [
  { id: 'weekday', title: '$ by weekday from trades', words: 'Take every trade in the Odeon trades table. Group the trades by the weekday of "day". For each weekday: count the trades, add up "usd" and "r".', tries: [['odeon-trades'], ['demo-trades']], run: askWeekday },
  { id: 'verdicts', title: 'Runs by verdict per family', words: 'Take every research run (the kept and open runs in the Archive index, plus the four files of rejected runs). Group by "family". For each family: count the runs that were adopted, rejected and still open.', tries: [['archive-index', 'archive-runs-0', 'archive-runs-1', 'archive-runs-2', 'archive-runs-3'], ['demo-runs']], run: askVerdicts },
  { id: 'deals', title: 'Deals ending this week', words: 'Take the items of the Mercury and Chrysos money machines. Keep the ones whose "expires" date is today or within the next 7 days. Soonest first.', tries: [['money-mercury', 'money-chrysos'], ['mercury-fixture'], ['demo-deals']], run: askDeals },
  { id: 'kalshi', title: 'Paper $ by Kalshi strategy', words: 'Take every trade in the Kalshi paper ledger. Group by the strategy "s". For each: count the trades, the share that won, and add up "pnl".', tries: [['kalshicity-ledger'], ['demo-paper']], run: askStrategies },
];
