// CLIO core (ES module, no DOM, no network): the research library. The write-ups the site publishes (an index of title / date / verdict / summary), searchable, grouped by verdict, with the best and worst ideas by
// dollars a month, and a plain reader for one write-up's text. Pure, so the tests call it in node. Everything is text: titles and summaries are cleaned of tags and capped before they reach the page.
// Money words: a "$ a month" figure is only ever quoted from the write-up's own sentence (never computed here); a write-up without one is simply not ranked.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWord(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; }

export const GROUPS = [['all', 'All'], ['adopt', 'Adopted or ready'], ['promising', 'Promising'], ['finding', 'Findings'], ['rejected', 'Rejected'], ['info', 'Reference']];
export const GROUP_WORD = { adopt: 'Ready to adopt', promising: 'Promising', finding: 'Finding', rejected: 'Rejected: do not redo', info: 'Reference', archive: 'Old report', other: 'Note' };
export function groupOf(status) {
  const s = String(status || '').toLowerCase();
  if (/^adopt|^live|^adopted/.test(s)) return 'adopt';
  if (/^promising|^lead/.test(s)) return 'promising';
  if (/^finding/.test(s)) return 'finding';
  if (/^reject|^dead|^no\b/.test(s)) return 'rejected';
  if (/^info|^reference/.test(s)) return 'info';
  if (/^archive/.test(s)) return 'archive';
  return 'other';
}

/** "$823 a month", "-$51 a month", "$4,467 / mo", "$2,670/mo" -> the FIRST such figure in the text, or null */
export function perMonth(text) {
  const t = String(text == null ? '' : text), re = /(-|−|\+)?\s?\$\s?(\d[\d,]*(?:\.\d+)?)\s*(?:\/\s*mo(?:nth)?\b|a month\b|per month\b)/i;
  const m = re.exec(t); if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, '')); if (!Number.isFinite(v)) return null;
  return m[1] === '-' || m[1] === '−' ? -v : v;
}

// ------------------------------------------------------------------------------------------------ the index (site file or fixture)
/** accepts { writeups: [...] }, the site's data.json { docs: { writeups: [...] } } or a bare list. Records are cleaned; newest first. */
export function normIndex(raw) {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.writeups) ? raw.writeups : isObj(raw) && isObj(raw.docs) && Array.isArray(raw.docs.writeups) ? raw.docs.writeups : null;
  if (!list) return null;
  const seen = new Set(), out = [];
  for (const w of list) {
    if (!isObj(w) || typeof w.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(w.slug) || seen.has(w.slug)) continue;
    const title = str(w.title, 140); if (!title) continue;
    seen.add(w.slug);
    const summary = str(w.summary, 420), status = str(w.status, 200).toLowerCase(), group = groupOf(status);
    const pm = num(w.usd_month) != null ? num(w.usd_month) : (perMonth(summary) != null ? perMonth(summary) : perMonth(`${w.title} ${w.status}`));
    out.push({ slug: w.slug, title, summary, status, group, family: str(w.family, 20).toLowerCase() || 'other', date: /^\d{4}-\d{2}-\d{2}$/.test(String(w.date || '')) ? w.date : '', runs: Array.isArray(w.runs) ? w.runs.length : 0, words: num(w.words) || 0, pm, body: typeof w.body === 'string' ? w.body.slice(0, 8000) : '' });
    if (out.length >= 400) break;
  }
  if (!out.length) return null;
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title < b.title ? -1 : 1));
}
export function counts(list) { const c = { all: list.length }; for (const [g] of GROUPS) if (g !== 'all') c[g] = list.filter((x) => x.group === g).length; c.archive = list.filter((x) => x.group === 'archive').length; return c; }

// ------------------------------------------------------------------------------------------------ search, filter, sort
export function tokens(q) { return String(q || '').toLowerCase().split(/[^a-z0-9$%.\-]+/).filter((t) => t.length > 0).slice(0, 8); }
export function matches(rec, toks) {
  if (!toks.length) return true;
  const hay = `${rec.title} ${rec.summary} ${rec.family} ${rec.status} ${rec.date}`.toLowerCase();
  return toks.every((t) => hay.includes(t));
}
/** opts: { group: 'all' | adopt | ..., q: text, sort: 'new' | 'money' | 'old' } */
export function view(list, opts) {
  const o = opts || {}, toks = tokens(o.q);
  let out = list.filter((r) => (!o.group || o.group === 'all' || r.group === o.group) && matches(r, toks));
  if (o.sort === 'money') out = out.filter((r) => r.pm != null).sort((a, b) => b.pm - a.pm);
  else if (o.sort === 'old') out = out.slice().reverse();
  return out;
}
/** the five best and five worst ideas by the $ a month the write-ups themselves quote (rejected and reference notes included: a bad idea is useful to remember) */
export function ideas(list) {
  const ranked = list.filter((r) => r.pm != null);
  const best = ranked.filter((r) => r.pm > 0).sort((a, b) => b.pm - a.pm).slice(0, 5), worst = ranked.filter((r) => r.pm < 0).sort((a, b) => a.pm - b.pm).slice(0, 5);
  return { best, worst, ranked: ranked.length, unranked: list.length - ranked.length };
}

// ------------------------------------------------------------------------------------------------ the reader: markdown -> plain blocks
export function plainMd(text, max) {
  const lim = num(max) || 6000, blocks = [];
  let s = String(text == null ? '' : text).replace(/\r/g, ''), inCode = false, used = 0;
  if (s.startsWith('---')) { const e = s.indexOf('\n---', 3); if (e > 0) s = s.slice(e + 4); }
  for (const raw of s.split('\n')) {
    let line = raw.trim();
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode || !line || /^\|?\s*:?-{2,}/.test(line) || /^<.*>$/.test(line)) continue;
    let k = 'p';
    if (/^#{1,6}\s/.test(line)) { k = 'h'; line = line.replace(/^#{1,6}\s+/, ''); }
    else if (/^[-*]\s+/.test(line)) { k = 'li'; line = line.replace(/^[-*]\s+/, ''); }
    else if (line.startsWith('|')) { k = 'row'; line = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join('  ·  '); }
    line = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (used + line.length > lim) { blocks.push({ k: 'p', t: '…the rest is in the full write-up on the Lab page.' }); break; }
    used += line.length; blocks.push({ k, t: line });
  }
  return blocks;
}
export const isSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(s);

export function jarvisCard(list, usingFixture) {
  const c = counts(list), id = ideas(list), top = id.best[0];
  return { v: 1, name: 'Clio', status: { level: 'off', label: usingFixture ? 'Demo library' : `${c.all} write-ups` }, kpis: [{ label: 'Write-ups', value: String(c.all) }, { label: 'Ready to adopt', value: String(c.adopt) }, { label: 'Rejected', value: String(c.rejected) }],
    lines: [top ? str(`Best idea: ${top.title} (${moneyS(top.pm)} a month).`, 118) : 'Search the research in plain words.'], t: 1793394000, theme: '#14110e' };
}
