// ATHENA brain: the 2026-11-04 features as pure functions (no DOM, no storage, no network). Tested from the page and from node.
//   ask(ix, question, n)         "Ask Athena": ranked answers, each the entry + its best sentence + the matched words + a plain confidence
//   dailyLesson(lib, t)          the lesson of the day (a fixed shuffled order: no repeats until the whole library has had a turn)
//   flashDeck(lib)               flashcards from every entry; dueCards / rateCard / cardStats = a Leitner box schedule (state = {id: {b, d}})
//   ruleGroups(lib)              the "My rules" checklist, grouped (before / during / after / money / never), built from library.json 'rules'
//   streakOf(days, today)        days in a row (today may still be empty)
import { norm, lev, rng, shuffle, tokenScore } from './athenacore.js';

const STOP = new Set('a an the is are was were be do does did i me my we our you your it its of to in on at for and or what when where why how which who whom should can could would will shall this that these those with from about as by if not no into than then so just tell explain please need want get'.split(' '));
const sents = (t) => (String(t || '').match(/[\s\S]+?[.!?]+(?=\s|$)|\S[\s\S]*$/g) || []).map((x) => x.trim()).filter(Boolean);   // split after . ! ? (no lookbehind: Safari before 16.4 cannot parse it)
const DAY_MS = 864e5;

export function ask(ix, question, n = 6) {
  const toks = norm(question).split(' ').filter((t) => t && !STOP.has(t));
  if (!toks.length) return [];
  const out = [];
  for (const x of ix) {
    let tot = 0;
    const hit = [];
    const tw = x.title.split(' ');
    for (const t of toks) { const s = tokenScore(t, x); if (s) { tot += s + (tw.some((w) => w === t || (t.length >= 4 && lev(t, w, 1) <= 1)) ? 45 : 0); hit.push(t); } }      // a word of the title is the best sign
    if (!hit.length) continue;
    const flat = [x.e.short, ...x.e.body].flatMap(sents);
    let at = 0, bs = -1;
    flat.forEach((s, k) => {
      const ns = norm(s);
      let sc = 0;
      for (const t of toks) { if (ns.includes(t)) sc += 1; else if (t.length >= 4 && ns.split(' ').some((w) => lev(t, w, 1) <= 1)) sc += 0.5; }
      if (sc > bs) { bs = sc; at = k; }
    });
    let best = flat[at] || x.e.short;
    if (best.length < 45 && flat[at + 1]) best += ' ' + flat[at + 1];
    const cover = hit.length / toks.length;
    out.push({ e: x.e, score: tot * (0.4 + 0.6 * cover) + bs * 12, excerpt: best.length > 240 ? best.slice(0, 237).replace(/\s+\S*$/, '') + '...' : best, matched: hit, cover });
  }
  out.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
  const top = out.slice(0, n), peak = top.length ? top[0].score : 1;
  return top.map((r) => ({ ...r, conf: r.cover >= 0.99 && r.score >= peak * 0.6 ? 'strong' : r.cover >= 0.5 ? 'maybe' : 'weak', score: Math.round(r.score) }));
}

const dayNumber = (t) => { const d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS); };
export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function dailyLesson(lib, t = Date.now()) {
  const pool = lib.entries.filter((e) => e.body.length >= 1 && e.kind !== 'olympus').slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!pool.length) return lib.entries[0] || null;
  const order = shuffle(pool, rng(20261104));
  return order[dayNumber(t) % order.length];
}

export function flashDeck(lib) {
  return lib.entries.map((e) => {
    if (e.ask) return { id: e.id, front: e.ask.q + '?', back: e.ask.a, from: e.id };
    if (e.quiz) return { id: e.id, front: e.quiz.q, back: e.quiz.a, from: e.id };
    const front = e.kind === 'learned' ? 'What did we learn: ' + e.title + '?' : e.kind === 'rejected' ? 'Why was this rejected: ' + e.title + '?' : 'In plain words: ' + e.title;
    return { id: e.id, front, back: e.short, from: e.id };
  });
}

const BOXES = [0, 1, 2, 4, 8, 16];
export function dueCards(deck, state, now = Date.now(), n = 10) {
  const st = state || {};
  const rank = (c) => { const s = st[c.id]; return !s ? [0, 0] : s.d <= now ? [1, s.d] : [9, s.d]; };
  return deck.slice().sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || (a.id < b.id ? -1 : 1); }).slice(0, n);
}

/** grade 0 = again (back in 10 minutes), 1 = good (next box), 2 = easy (two boxes) -> the new state */
export function rateCard(state, id, grade, now = Date.now()) {
  const old = (state && state[id]) || { b: 0, d: 0 };
  const b = grade === 0 ? 0 : Math.min(BOXES.length - 1, old.b + (grade === 2 ? 2 : 1));
  return { ...(state || {}), [id]: { b, d: grade === 0 ? now + 10 * 60e3 : now + BOXES[b] * DAY_MS } };
}

export function cardStats(deck, state, now = Date.now()) {
  const st = state || {};
  let fresh = 0, due = 0, learned = 0;
  for (const c of deck) { const s = st[c.id]; if (!s) fresh++; else if (s.d <= now) due++; else learned++; }
  return { fresh, due, learned, total: deck.length };
}

const GROUPS = [['before', 'Before the session'], ['during', 'During'], ['after', 'After'], ['money', 'The money rules'], ['never', 'Never']];
export function ruleGroups(lib) {
  const R = lib.rules || [];
  return GROUPS.map(([key, title]) => ({ key, title, rules: R.filter((r) => r.group === key) })).filter((g) => g.rules.length);
}

export function streakOf(days, today = Date.now()) {
  const set = new Set(days || []);
  let n = 0, t = today;
  if (!set.has(dayKey(t))) t -= DAY_MS;
  while (set.has(dayKey(t))) { n++; t -= DAY_MS; }
  return n;
}
