// ATHENA core: pure functions (no DOM). Search, tags, the quiz, the text with glossary links. Tested from the page and from Python.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9$%.+ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// a tiny embedded library so the page still opens when library.json is missing (the build writes the real one)
export const FALLBACK = { v: 1, kind: 'olympus-athena-library', sources: [], tags: [{ id: 'strategy', name: 'Strategy', color: '#6f9bb8', blurb: '' }],
  entries: [{ id: 'offline', kind: 'strategy', tags: ['strategy'], title: 'Library file not found', short: 'Run python tools/athena_build.py to build library.json.', body: [], src: [] }] };

export async function loadLibrary(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json();
    if (!d || !Array.isArray(d.entries)) throw new Error('bad library');
    return { ...d, src: 'file' };
  } catch (_) { return { ...FALLBACK, src: 'embedded' }; }
}

/** a small JSON file next to the page (drills.json), or null when it is missing or broken */
export async function loadJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}

// edit distance, stops early above `max`
export function lev(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur.push(v); if (v < best) best = v; }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function indexOf(lib) {
  return lib.entries.map((e) => ({
    e, title: norm(e.title), id: norm(e.id.replace(/-/g, ' ')), short: norm(e.short), body: norm(e.body.join(' ')),
    words: [...new Set(norm([e.title, e.short, e.body.join(' ')].join(' ')).split(' ').filter(Boolean))],
    tags: norm(e.tags.join(' ')),
  }));
}

// score one token against one entry: title > words > text; a typo of one or two letters still matches a word of 4+ letters
export function tokenScore(t, x) {
  let s = 0;
  if (x.title.startsWith(t)) s = 100; else if (x.title.split(' ').some((w) => w.startsWith(t))) s = 85; else if (x.title.includes(t)) s = 70;
  else if (x.id.includes(t) || x.tags.includes(t)) s = 55;
  else if (x.short.includes(t)) s = 40; else if (x.body.includes(t)) s = 25;
  if (s) return s;
  if (t.length >= 4) {
    const max = t.length >= 7 ? 2 : 1;
    let best = max + 1;
    for (const w of x.title.split(' ')) { if (Math.abs(w.length - t.length) > max) continue; const d = lev(t, w, max); if (d <= max) { let k = 0; while (k < t.length && t[k] === w[k]) k++; return (d === 0 ? 85 : 70) + k * 2; } }   // a typo of a word in the title ranks first
    for (const w of x.words) { if (Math.abs(w.length - t.length) > max) continue; const d = lev(t, w, max); if (d < best) best = d; if (best === 0) break; }
    if (best <= max) return best === 1 ? 35 : 22;
  }
  return 0;
}

export function search(ix, query, tag = null) {
  const q = norm(query), toks = q.split(' ').filter(Boolean);
  const pool = tag ? ix.filter((x) => x.e.tags.includes(tag)) : ix;
  if (!toks.length) return pool.map((x) => x.e);
  const out = [];
  for (const x of pool) {
    let tot = 0, ok = true;
    for (const t of toks) { const s = tokenScore(t, x); if (!s) { ok = false; break; } tot += s; }
    if (ok) out.push({ e: x.e, s: tot + (x.title === q ? 200 : 0) });
  }
  return out.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title)).map((o) => o.e);
}

export function counts(lib) {
  const c = {}; for (const t of lib.tags) c[t.id] = lib.entries.filter((e) => e.tags.includes(t.id)).length; return c;
}

// text with [[id]] links -> safe HTML (a button that opens the entry); an unknown id is shown as plain text
export function linkify(text, byId) {
  return esc(text).replace(/\[\[([a-z0-9-]+)\]\]/g, (m, id) => byId[id] ? `<button type="button" class="gl" data-go="${id}">${esc(byId[id].title.replace(/ \(.*\)$/, ''))}</button>` : esc(id));
}

// ---------------------------------------------------------------------------------------- the quiz
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n = 120) => { s = String(s); if (s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : n) + '...'; };

// n questions drawn from the library: word meanings (`ask`) and the entries with a written question (`quiz`). Each: {id, q, options[4], answer (index), from}
export function makeQuiz(lib, n = 5, seed = Date.now()) {
  const r = rng(seed);
  const asks = lib.entries.filter((e) => e.ask), facts = lib.entries.filter((e) => e.quiz);
  const pool = shuffle([...facts.map((e) => ({ e, t: 'fact' })), ...asks.map((e) => ({ e, t: 'word' }))], r);
  const out = [], seen = new Set();
  // mix: about two fact questions and the rest words, when both exist
  const want = { fact: Math.min(facts.length, Math.ceil(n / 2)), word: 0 };
  want.word = Math.min(asks.length, n - want.fact);
  const got = { fact: 0, word: 0 };
  for (const p of pool) {
    if (out.length >= n) break;
    if (got[p.t] >= want[p.t] || seen.has(p.e.id)) continue;
    got[p.t]++; seen.add(p.e.id);
    if (p.t === 'fact') {
      const opts = shuffle([p.e.quiz.a, ...p.e.quiz.wrong.slice(0, 3)], r);
      out.push({ id: p.e.id, q: p.e.quiz.q, options: opts, answer: opts.indexOf(p.e.quiz.a), from: p.e.id });
    } else {
      const others = shuffle(asks.filter((o) => o.id !== p.e.id), r).slice(0, 3);
      const right = clip(p.e.ask.a), opts = shuffle([right, ...others.map((o) => clip(o.ask.a))], r);
      out.push({ id: p.e.id, q: p.e.ask.q + '?', options: opts, answer: opts.indexOf(right), from: p.e.id });
    }
  }
  for (const p of pool) {                            // not enough of one kind: top up from anything left
    if (out.length >= n) break;
    if (seen.has(p.e.id)) continue; seen.add(p.e.id);
    if (p.t === 'fact') { const opts = shuffle([p.e.quiz.a, ...p.e.quiz.wrong.slice(0, 3)], r); out.push({ id: p.e.id, q: p.e.quiz.q, options: opts, answer: opts.indexOf(p.e.quiz.a), from: p.e.id }); }
  }
  return shuffle(out, r).slice(0, n);
}
