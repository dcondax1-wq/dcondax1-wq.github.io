// ARCHIVE core (pure maths and words, no DOM, no network): the library of everything we ever tested. HISTORY, not a forecast.
// Rows come from archive/index.json + runs-<k>.json (built offline by tools/archive_build.py) or fixture.json (DEMO). A run row is an array
// [id, title, family, strategy, verdict, status, built, periods, m26, mold, writeup, note]; m26 / mold = [n, trades a week, PF, net $, $ a month, pass10 %, fail10 %] or 0.
// Safari 16 safe: no lookbehind, no .at().
export const COLS = ['id', 'title', 'family', 'strategy', 'verdict', 'status', 'built', 'periods', 'm26', 'mold', 'writeup', 'note'];
export const VERDICTS = ['adopted', 'rejected', 'open'];
export const VERDICT_WORD = ['Adopted', 'Rejected', 'Open'];
export const STATUS_WORD = { baseline: 'the live baseline', 'adopt-candidate': 'an adopt candidate', rejected: 'rejected', promising: 'promising', info: 'for information' };
export const LABEL = 'History, not a forecast. Money figures are after costs; 1 MNQ micro = $2 a point. Each run is one stored backtest: a better number is not proof.';
const M = { n: 0, tpw: 1, pf: 2, net: 3, pm: 4, p10: 5, f10: 6 };
export const METRICS = [['net', 'Net $'], ['pm', '$ a month'], ['pf', 'PF'], ['tpw', 'Trades a week'], ['p10', 'Pass in 10 sessions %'], ['f10', 'Fail in 10 sessions %'], ['n', 'Trades']];
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const clean = (s, n) => String(s == null ? '' : s).replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

export const usd = (x) => { const v = num(x); if (v === null) return 'n/a'; const r = Math.round(v); return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-US'); };
export const usdS = (x) => { const v = num(x); if (v === null) return 'n/a'; return (Math.round(v) > 0 ? '+' : '') + usd(v); };
export const pf = (x) => (num(x) === null ? 'n/a' : (Math.round(x * 100) / 100).toFixed(2));
export const dec = (x, k) => (num(x) === null ? 'n/a' : String(Math.round(x * Math.pow(10, k == null ? 1 : k)) / Math.pow(10, k == null ? 1 : k)));

/** one run row -> an object; text is cleaned, numbers are numbers or null, a missing period is null (never zeros) */
export function rowObj(r) {
  if (!Array.isArray(r) || typeof r[0] !== 'string' || !r[0]) return null;
  const mm = (a) => (Array.isArray(a) && num(a[0]) ? { n: num(a[0]), tpw: num(a[1]), pf: num(a[2]), net: num(a[3]), pm: num(a[4]), p10: num(a[5]), f10: num(a[6]) } : null);
  const o = { id: clean(r[0], 90), title: clean(r[1], 100), family: clean(r[2], 40) || 'other', lit: r[3] === 1, verdict: r[4] === 0 || r[4] === 1 ? r[4] : 2, status: clean(r[5], 20), built: clean(r[6], 10), m26: mm(r[8]), mold: mm(r[9]), writeup: /^[a-z0-9-]{0,70}$/.test(String(r[10] || '')) ? String(r[10] || '') : '', note: clean(r[11], 140) };
  o.hay = (o.id + ' ' + o.title + ' ' + o.family + ' ' + o.note + ' ' + (STATUS_WORD[o.status] || '')).toLowerCase();
  return o;
}
export function normIndex(idx) {
  if (!idx || typeof idx !== 'object' || !Array.isArray(idx.runs) || !idx.runs.length) return null;
  const runs = idx.runs.map(rowObj).filter(Boolean);
  if (!runs.length) return null;
  const arr = (a) => (Array.isArray(a) ? a : []);
  const fam = arr(idx.families).map((f) => ({ name: clean(f && f.name, 40), runs: num(f && f.runs) || 0, adopted: num(f && f.adopted) || 0, rejected: num(f && f.rejected) || 0, open: num(f && f.open) || 0 })).filter((f) => f.name);
  const slug = (s) => (/^[a-z0-9-]{1,70}$/.test(String(s || '')) ? String(s) : '');
  const wu = arr(idx.writeups).map((w) => ({ slug: slug(w && w.slug), title: clean(w && w.title, 120), date: clean(w && w.date, 10), status: clean(w && w.status, 20), verdict: num(w && w.verdict) === 0 || num(w && w.verdict) === 1 ? w.verdict : 2, summary: clean(w && w.summary, 240), runs: arr(w && w.runs).map((x) => clean(x, 80)) })).filter((w) => w.slug && w.title);
  const rej = arr(idx.rejected).map((x) => ({ title: clean(x && x.title, 110), text: clean(x && x.text, 700), writeups: arr(x && x.writeups).map(slug).filter(Boolean), src: clean(x && x.src, 60) })).filter((x) => x.title);
  const ds = arr(idx.datasets).map((d) => ({ name: clean(d && d.name, 50), kind: clean(d && d.kind, 16), first: clean(d && d.first, 10), last: clean(d && d.last, 10), rows: num(d && d.rows) || 0, source: clean(d && d.source, 120), file: clean(d && d.file, 60) })).filter((d) => d.name);
  const counts = { runs: runs.length, adopted: 0, rejected: 0, open: 0 };
  for (const r of runs) counts[VERDICTS[r.verdict]]++;
  const c = idx.counts || {};
  return { runs, families: fam, writeups: wu, rejected: rej, datasets: ds, shards: arr(idx.shards).filter((s) => /^runs-\d{1,3}\.json$/.test(String(s))), built: clean(idx.built, 10), demo: idx.demo === true,
    total: { runs: num(c.runs) || runs.length, writeups: num(c.writeups) || wu.length, rejected: num(c.rejected_ideas) || rej.length, datasets: num(c.datasets) || ds.length, adopted: num(c.adopted) || counts.adopted, rejectedRuns: num(c.rejected) || counts.rejected, open: num(c.open) || counts.open } };
}
/** the built file wins; a missing, empty or broken one falls back to the labelled demo; null when both are unusable */
export function chooseData(real, fx) {
  const r = normIndex(real); if (r) return r.demo ? { src: 'demo', v: r } : { src: 'file', v: r };
  const f = normIndex(fx); return f ? { src: 'demo', v: { ...f, demo: true } } : null;
}
/** add the runs of a shard (never twice) */
export function addShard(v, shard) {
  if (!v || !shard || !Array.isArray(shard.runs)) return 0;
  const have = new Set(v.runs.map((r) => r.id)); let k = 0;
  for (const raw of shard.runs) { const o = rowObj(raw); if (o && !have.has(o.id)) { v.runs.push(o); have.add(o.id); k++; } }
  return k;
}

// ------------------------------------------------------------------------------------------------ metrics, filter, sort
/** the metrics of a run for a period: '26' (2026), 'old' (2021-25), 'any' (2026 first, else 2021-25) */
export function metricsOf(r, period) { return period === 'old' ? r.mold : period === '26' ? r.m26 : (r.m26 || r.mold); }
export function periodOf(r, period) { return period === 'old' ? '2021-25' : period === '26' ? '2026' : (r.m26 ? '2026' : '2021-25'); }
/** filter = { q, family, verdict (-1 any | 0 | 1 | 2), years ('any' | '26' | 'old' | 'both'), min: { pf, net, pm, tpw, p10 }, maxF10 } */
export function tokens(q) { return String(q || '').toLowerCase().split(/[^a-z0-9$.+-]+/).filter(Boolean); }
export function filterRuns(runs, f) {
  const toks = tokens(f.q), yrs = f.years || 'any', per = yrs === 'old' ? 'old' : yrs === '26' ? '26' : 'any', mn = f.min || {};
  return runs.filter((r) => {
    if (f.family && f.family !== 'all' && r.family !== f.family) return false;
    if (f.verdict != null && f.verdict >= 0 && r.verdict !== f.verdict) return false;
    if (yrs === '26' && !r.m26) return false; if (yrs === 'old' && !r.mold) return false; if (yrs === 'both' && !(r.m26 && r.mold)) return false;
    for (const t of toks) if (r.hay.indexOf(t) < 0) return false;
    const need = Object.keys(mn).filter((k) => num(mn[k]) !== null), m = metricsOf(r, per);
    if (need.length || num(f.maxF10) !== null) { if (!m) return false; for (const k of need) if (!(num(m[k]) !== null && m[k] >= mn[k])) return false; if (num(f.maxF10) !== null && !(num(m.f10) !== null && m.f10 <= f.maxF10)) return false; }
    return true;
  });
}
export const SORTS = [['pm', '$ a month, best first'], ['net', 'Net $, best first'], ['pf', 'PF, best first'], ['tpw', 'Trades a week'], ['p10', 'Pass in 10 sessions'], ['f10', 'Fail in 10 sessions, lowest first'], ['new', 'Newest first'], ['name', 'Name']];
export function sortRuns(runs, key, years) {
  const per = years === 'old' ? 'old' : years === '26' ? '26' : 'any', out = runs.slice();
  if (key === 'name') return out.sort((a, b) => a.title.localeCompare(b.title));
  if (key === 'new') return out.sort((a, b) => (b.built || '').localeCompare(a.built || '') || a.id.localeCompare(b.id));
  const val = (r) => { const m = metricsOf(r, per); const v = m ? m[key] : null; return num(v); };
  const asc = key === 'f10';
  return out.sort((a, b) => { const x = val(a), y = val(b); if (x === null && y === null) return a.id.localeCompare(b.id); if (x === null) return 1; if (y === null) return -1; return (asc ? x - y : y - x) || a.id.localeCompare(b.id); });
}

// ------------------------------------------------------------------------------------------------ words
export function periodWords(m, label) {
  if (!m) return `${label}: no result stored.`;
  const bits = [`${usdS(m.net)} net`, m.pm !== null ? `${usd(m.pm)} a month` : null, `PF ${pf(m.pf)}`, m.tpw !== null ? `${dec(m.tpw, 1)} trades a week` : null, `${m.n} trades`];
  let s = `${label}: ${bits.filter(Boolean).join(', ')}`;
  if (m.p10 !== null || m.f10 !== null) s += `; eval in 10 sessions: pass ${m.p10 !== null ? dec(m.p10, 1) + '%' : 'n/a'}, fail ${m.f10 !== null ? dec(m.f10, 1) + '%' : 'n/a'}`;
  return s + '.';
}
export const verdictLine = (r) => `${VERDICT_WORD[r.verdict]} (${STATUS_WORD[r.status] || r.status || 'no label'}).`;
/** two runs side by side in plain words: one line each, then how they differ in money, and an honest caveat */
export function compareWords(a, b) {
  if (!a || !b) return [];
  const out = [];
  for (const [r, tag] of [[a, 'A'], [b, 'B']]) out.push(`${tag}: ${r.title}. ${verdictLine(r)} ${periodWords(r.m26, '2026')} ${periodWords(r.mold, '2021-25')}`);
  const diff = (k, lab) => {
    const x = a[k], y = b[k];
    if (!x || !y || num(x.pm) === null || num(y.pm) === null) return null;
    const d = y.pm - x.pm, more = d >= 0;
    return `${lab}: B makes ${usd(Math.abs(d))} a month ${more ? 'more' : 'less'} than A (${usd(y.pm)} against ${usd(x.pm)}), at PF ${pf(y.pf)} against ${pf(x.pf)}.`;
  };
  const d26 = diff('m26', 'In 2026'), dold = diff('mold', 'In 2021-25');
  if (d26) out.push(d26); if (dold) out.push(dold);
  if (!d26 && !dold) out.push('They have no period in common, so there is no like-for-like number to compare.');
  const hold = (r) => (r.m26 && r.mold && r.m26.net > 0 && r.mold.net > 0 ? 'positive in both periods' : r.m26 && r.mold ? 'not positive in both periods' : 'judged on one period only');
  out.push(`A is ${hold(a)}; B is ${hold(b)}. The house rule: a change counts only if it holds in both periods and keeps 2 to 4 trades a week.`);
  out.push('One backtest each. A better number is not proof that it will repeat.');
  return out;
}

// ------------------------------------------------------------------------------------------------ Don't redo this
const STOP = new Set(('of to in on at is it as by or an if so do the and for with from that this then than into over under about after before when while what which will would could should have has had are was were been being not but can may all any one two out off our your their its use used using add adding try trying tried test tests tested testing idea ideas new make makes made more less very just also each per via why how who does did done get gets got want let lets run runs running look check change changes changed trade trades only day days week weeks make makes work works none nothing').split(' '));
const SYN = { pt: 'point', pts: 'point', points: 'point', tp: 'target', sl: 'stop', stops: 'stop', stopped: 'stop', trailing: 'trail', trails: 'trail', trailed: 'trail', partials: 'partial', filters: 'filter', filtering: 'filter', filtered: 'filter', sweeps: 'sweep', sweeping: 'sweep', gaps: 'gap', sizing: 'size', sized: 'size', sizes: 'size', 'break-even': 'breakeven', be: 'breakeven', bias: 'bias', biases: 'bias', hours: 'hour', sessions: 'session', weeks: 'week', days: 'day', months: 'month', targets: 'target', entries: 'entry', levels: 'level', models: 'model', reclaim: 'reclaim', reclaims: 'reclaim', inducements: 'inducement', displacement: 'displac', displacements: 'displac', confluences: 'confluence', fixed: 'fix', fixing: 'fix' };
export function stems(text) {
  const out = []; const seen = new Set();
  for (let w of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    if (SYN[w]) w = SYN[w]; else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3); else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2); else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (/^\d+$/.test(w) || STOP.has(w) || seen.has(w)) continue; seen.add(w); out.push(w);
  }
  return out;
}
export const REDO_THRESHOLD = 2.4;
/** the rejected ideas an idea in the search box matches. Weighted by how rare a word is among the rejected ideas, so one rare word (e.g. "inducement") or two ordinary ones ("fixed stop") warn, one common word ("stop") does not. */
export function matchRejected(q, rejected) {
  const idea = stems(q); if (!idea.length || !rejected || !rejected.length) return { hits: [], idea };
  const sets = rejected.map((r) => new Set(stems(r.title + ' ' + r.text)));
  const df = {}; for (const s of sets) for (const w of s) df[w] = (df[w] || 0) + 1;
  const N = rejected.length, w = (t) => Math.log(1 + N / (df[t] || 1));
  const hits = [];
  rejected.forEach((r, i) => { const common = idea.filter((t) => sets[i].has(t)); const score = common.reduce((s, t) => s + (df[t] ? w(t) : 0), 0); if (common.length && score >= REDO_THRESHOLD) hits.push({ r, score: Math.round(score * 100) / 100, words: common }); });
  hits.sort((x, y) => y.score - x.score);
  const best = hits.length ? hits[0].score : 0;
  return { hits: hits.filter((x) => x.score >= best * 0.5).slice(0, 3), idea };
}
/** how many stored rejected RUNS carry every word of the idea (a second opinion on the same warning) */
export function rejectedRuns(q, runs) {
  const idea = stems(q); if (idea.length < 2) return { n: 0, top: [] };
  const hit = runs.filter((r) => r.verdict === 1 && idea.every((t) => stems(r.title + ' ' + r.id.replace(/_/g, ' ')).indexOf(t) >= 0));
  return { n: hit.length, top: hit.slice(0, 3) };
}
export function redoWords(m, rr) {
  if (!m || !m.hits.length) return null;
  const t = m.hits[0].r;
  let s = `Don't redo this: it matches an idea we already tested and rejected, "${t.title}". Only try it again with a new idea, not the same test.`;
  if (rr && rr.n) s += ` ${rr.n} stored ${rr.n === 1 ? 'run' : 'runs'} on it ${rr.n === 1 ? 'was' : 'were'} rejected too.`;
  return s;
}

// ------------------------------------------------------------------------------------------------ shelves (the 3D library and its flat twin)
/** one shelf per strategy family: three books (adopted, open, rejected), the height of a book follows how many runs it stands for (square-root scale so a shelf with 3 runs is still a visible book) */
export function shelves(families, limit) {
  const f = (families || []).slice(0, limit || 14), top = Math.max(1, ...f.map((x) => Math.max(x.adopted, x.open, x.rejected)));
  return f.map((x) => ({ name: x.name, runs: x.runs, books: [['adopted', x.adopted], ['open', x.open], ['rejected', x.rejected]].map(([k, n]) => ({ k, n, h: n ? Math.max(0.12, Math.sqrt(n / top)) : 0 })) }));
}
export const SHELF_WORD = (s) => `${s.name}: ${s.runs} runs (${s.books[0].n} adopted, ${s.books[1].n} open, ${s.books[2].n} rejected).`;
export function headline(v) {
  const t = v.total; return `${t.runs.toLocaleString('en-US')} runs, ${t.writeups} write-ups, ${t.rejected} rejected ideas and ${t.datasets} datasets: everything we ever tested, in one library.`;
}
export function jarvisCard(v) {
  const t = v.total;
  return { v: 1, name: 'Archive', status: { level: v.demo ? 'off' : 'ok', label: v.demo ? 'Demo data' : 'Library ready' }, kpis: [{ label: 'Runs', value: t.runs.toLocaleString('en-US') }, { label: 'Adopted', value: String(t.adopted) }, { label: 'Rejected', value: String(t.rejectedRuns) }],
    lines: [`${t.runs.toLocaleString('en-US')} tested runs, ${t.writeups} write-ups.`, "Don't redo what was rejected."], t: Math.floor(Date.now() / 1000), open: '#', theme: '#14110e' };
}
