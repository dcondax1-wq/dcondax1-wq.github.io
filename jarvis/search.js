// Jarvis global search (2026-11-11, JARVIS BRAIN v3): "find ...", "search ...", "where is ...", "what did we test about VWAP".
// One ES module, no DOM, no network: it searches the small index that tools/jarvis_search_build.py writes at site-build time
// (jarvis/search-index.json: every app, the Archive's runs / write-ups / rejected ideas, Pythia's events, the Lyceum questions, the
// money machines' items, the Kalshi lists, the glossary and the live strategy's rules). Fuzzy (stems, prefixes, small typos),
// synonyms, deterministic: the same words and the same index give the same five hits, in the same order.
//
//   import { createSearch, parseAsk } from './search.js';
//   const se = createSearch(indexJson);            // { ready, size, counts, search }
//   se.search('vwap', { n: 5, prefer: ['run', 'writeup', 'rejected'] })
//     -> [{ kind, label, title, text, source, open, route, score }]     open: an app id, route: a deep link inside it ('' when none)
//   parseAsk('what did we test about VWAP')        -> { q: 'vwap', prefer: [...], tested: true } | null (not a search question)
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { norm, lev, ALIASES } from './router.js';

export const KIND_LABEL = { app: 'App', writeup: 'Write-up', run: 'Test run', rejected: 'Rejected idea', event: 'Calendar', quiz: 'Quiz question', money: 'Money machine', kalshi: 'Kalshi', term: 'Word', rule: 'Your rule' };
const STOP = new Set(('the a an of to in on at for and or is are was were be it its this that these those my me i we our you your do does did with about from by as into ' +
  'what which who how when where why can could should would will any some all there here have has had not no so if then than too very just app page please jarvis').split(' '));
/** words that mean the same thing when searching (each row is one meaning) */
export const SYNONYMS = [
  'vwap|anchored', 'stop|stoploss|sl', 'news|cpi|fomc|nfp|release|event|calendar', 'deal|discount|promo|coupon|sale|code', 'drawdown|dd|mll|floor',
  'kalshi|bet|prediction', 'journal|mnemosyne|diary', 'briefing|brief|helios|forum|morning', 'sizing|size|micros|contracts', 'rejected|failed|dropped|dead',
  'eval|evaluation|mffu|prop', 'filter|gate', 'breakeven|be', 'target|tp|objective', 'trail|trailing', 'payout|withdraw|withdrawal', 'tax|taxes|household',
  'spread|arbitrage|arb|funding', 'school|lyceum|learn|quiz', 'replay|odeon', 'settings|preferences|options', 'planner|agenda|schedule|todo|tasks', 'map|atlas|directory',
  'orb|opening', 'ema|macd|average', 'asia|overnight', 'weekday|monday|tuesday|wednesday|thursday|friday', 'income|earn|money|cash', 'fear|vix|volatility',
  'risk|drawdown', 'loss|losing|loser|lost', 'win|winning|winner|won', 'rule|rules|rulebook', 'odds|probability|chance', 'fee|fees|commission|cost|costs',
  'backtest|test|tested|study|research', 'strategy|system|model', 'trend|trending|momentum', 'sweep|liquidity|raid', 'fvg|ifvg|gap', 'cisd|shift',
].map((r) => r.split('|'));

/** a light stemmer: "tested" / "testing" / "tests" -> "test", "trades" / "trading" -> "trad" */
export function stem(w) {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
export const words = (s) => norm(s).replace(/['.$%+]/g, ' ').replace(/-/g, ' ').split(' ').filter(Boolean);
export const terms = (s) => words(s).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w))).map(stem);

const SYN = (() => { const m = new Map(); for (const row of SYNONYMS) { const st = row.map(stem); for (const a of st) { const cur = m.get(a) || new Set(); for (const b of st) if (b !== a) cur.add(b); m.set(a, cur); } } return m; })();

const LEAD = '(?:please |pls |jarvis |hey jarvis |ok jarvis |can you |could you |would you |i want to |i need to |help me |let\'s |lets )*';
const ASKS = [
  { rx: new RegExp('^' + LEAD + '(?:what did we|what have we|what did i|what have i) (?:test|tested|try|tried|learn|learned|find|found|conclude|concluded|study|studied)(?: out)?(?: about| on| with| for| regarding)?\\s+(.+)$'), tested: true },
  { rx: new RegExp('^' + LEAD + '(?:did|have) (?:we|i) (?:ever |already )?(?:test|tested|try|tried|study|studied|backtest|backtested)\\s+(.+)$'), tested: true },
  { rx: new RegExp('^' + LEAD + '(?:what do we know about|any research on|any tests on|any tests about|research on|tests on|studies on)\\s+(.+)$'), tested: true },
  { rx: new RegExp('^' + LEAD + '(?:where is|where\'s|wheres|where are|where do i find|where can i find|where do i see|where can i see|where would i find|which app (?:shows|has|is for|tracks|do i use for|is)|which page (?:shows|has))\\s+(.+)$'), where: true },
  { rx: new RegExp('^' + LEAD + '(?:find me|find|search for|search the (?:site|archive|library|apps) for|search|look for|anything about|anything on|show me everything about|show me everything on)\\s+(.+)$') },
];
const NOT_MINE = /\b(my notes?|my vault|the vault|obsidian|my memor(?:y|ies)|the web|the internet|online|on google|google)\b/;
/** is this a search question? -> { q, prefer, tested, where } or null */
export function parseAsk(raw) {
  const q = norm(raw).replace(/[?!.]+$/g, '').trim();
  if (!q || q.length > 200) return null;
  for (const a of ASKS) {
    const m = q.match(a.rx);
    if (!m) continue;
    if (NOT_MINE.test(q)) return null;
    let rest = m[1].replace(/^(?:the|a|an|about|for|on|any|some|all|every|everything about|everything on|my|our)\s+/, '').replace(/^(?:the|a|an)\s+/, '')
      .replace(/\s+(?:in|on|from) (?:the )?(?:archive|site|library|apps?|research|olympus)$/, '').replace(/\s+(?:app|page|screen|dashboard|thing|stuff|please|pls)$/, '').trim();
    if (!rest || !terms(rest).length) return null;
    return { q: rest, tested: !!a.tested, where: !!a.where, prefer: a.tested ? ['writeup', 'run', 'rejected'] : a.where ? ['app'] : null };
  }
  return null;
}

/** createSearch(index) -> { ready, size, counts, search(q, { n, prefer, kinds }) } */
export function createSearch(index) {
  const ok = !!index && typeof index === 'object' && Array.isArray(index.docs) && Array.isArray(index.kinds);
  const kinds = ok ? index.kinds : [];
  const docs = ok ? index.docs.filter((d) => Array.isArray(d) && d.length >= 6 && typeof d[1] === 'string') : [];
  let post = null, vocab = null, idf = null, normTitle = null, normAll = null;
  function prepare() {
    if (post) return;
    post = new Map(); normTitle = new Array(docs.length); normAll = new Array(docs.length);
    const add = (t, i, w) => { let m = post.get(t); if (!m) { m = new Map(); post.set(t, m); } const cur = m.get(i) || 0; if (w > cur) m.set(i, w); };
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i], kind = kinds[d[0]] || '';
      normTitle[i] = ' ' + words(d[1]).join(' ') + ' ';
      normAll[i] = normTitle[i] + words(d[2]).join(' ') + ' ' + (kind === 'app' ? words(d[3] + ' ' + (ALIASES[d[3]] || '').replace(/\|/g, ' ')).join(' ') + ' ' : '');
      for (const t of terms(d[1])) add(t, i, 3);
      for (const t of terms(d[2])) add(t, i, 1);
      if (kind === 'app') { for (const t of terms(d[3] + ' ' + (ALIASES[d[3]] || '').replace(/\|/g, ' '))) add(t, i, 2); }
      else if (kind === 'run' || kind === 'writeup') for (const t of terms(String(d[4]).replace(/^#find=/, '').replace(/[_-]/g, ' '))) add(t, i, 1);
    }
    vocab = Array.from(post.keys());
    idf = new Map(); for (const [t, m] of post) idf.set(t, Math.log(1 + docs.length / (1 + m.size)));
  }
  /** the index words a query word may mean: itself, a stem / prefix, a small typo, a synonym. [[term, quality]] */
  function expand(t) {
    const out = new Map(), put = (k, q) => { if (post.has(k) && (out.get(k) || 0) < q) out.set(k, q); };
    put(t, 1);
    const exact = out.has(t);
    for (const s of SYN.get(t) || []) put(s, 0.55);
    if (!exact || t.length >= 4) {
      const max = t.length >= 9 ? 2 : t.length >= 5 ? 1 : 0;
      let n = 0;
      for (const v of vocab) {
        if (v === t) continue;
        if (t.length >= 4 && v.length > t.length && v.startsWith(t)) { put(v, exact ? 0.3 : 0.75); n++; }
        else if (v.length >= 4 && t.length > v.length && t.startsWith(v) && t.length - v.length <= 3) { put(v, 0.6); n++; }
        else if (!exact && max > 0 && !/\d/.test(t) && Math.abs(v.length - t.length) <= max && lev(t, v, max) <= max) { put(v, 0.6); n++; }
        if (n > 40) break;
      }
    }
    return out;
  }
  function search(query, opt) {
    const o = opt || {}, n = Math.max(1, Math.min(20, o.n || 5));
    if (!docs.length) return [];
    prepare();
    const qt = Array.from(new Set(terms(query)));
    if (!qt.length) return [];
    const score = new Map(), cover = new Map();
    qt.forEach((t, ti) => {
      const best = new Map();
      for (const [v, q] of expand(t)) { const w = idf.get(v) * q; for (const [i, fw] of post.get(v)) { const s = w * (1 + fw); if ((best.get(i) || 0) < s) best.set(i, s); } }
      for (const [i, s] of best) { score.set(i, (score.get(i) || 0) + s); cover.set(i, (cover.get(i) || 0) | (1 << Math.min(30, ti))); }
    });
    const phrase = ' ' + words(query).filter((w) => !STOP.has(w)).join(' ') + ' ', full = ' ' + words(query).join(' ') + ' ';
    const allow = Array.isArray(o.kinds) && o.kinds.length ? new Set(o.kinds) : null, prefer = Array.isArray(o.prefer) ? new Set(o.prefer) : null;
    const rawW = words(query).filter((w) => !STOP.has(w));
    const rows = [];
    for (const [i, s0] of score) {
      const d = docs[i], kind = kinds[d[0]] || '';
      if (allow && !allow.has(kind)) continue;
      let bits = cover.get(i), c = 0; while (bits) { c += bits & 1; bits >>>= 1; }
      let s = s0 * Math.pow(c / qt.length, 2);
      if (qt.length > 1 && phrase.length > 4 && (normTitle[i].indexOf(phrase) >= 0 || (kind === 'app' && normAll[i].indexOf(phrase) >= 0))) s *= 1.35;      // the words in that order (an app: also in what people call it)
      if (normTitle[i] === phrase || normTitle[i] === full) s *= kind === 'app' ? 2.2 : 1.6;           // the thing is called exactly that
      if (rawW.length) s *= 1 + 0.25 * rawW.filter((w) => normAll[i].indexOf(' ' + w + ' ') >= 0).length / rawW.length;      // the very word, not only its stem
      if (kind === 'app') s *= 1.15; else if (kind === 'run') s *= 0.85;
      if (prefer && prefer.has(kind)) s *= 1.6;
      rows.push({ i, s, kind });
    }
    rows.sort((a, b) => (b.s - a.s) || (a.i - b.i));
    const out = [], perKind = {};
    const cap = (k) => (k === 'run' ? 3 : k === 'event' || k === 'quiz' || k === 'money' ? 2 : 4);
    for (const pass of [0, 1]) {
      for (const r of rows) {
        if (out.length >= n) break;
        if (out.some((x) => x.i === r.i)) continue;
        if (pass === 0 && (perKind[r.kind] || 0) >= cap(r.kind)) continue;      // a mix of kinds first; the second pass fills what is left
        perKind[r.kind] = (perKind[r.kind] || 0) + 1; out.push(r);
      }
    }
    out.sort((a, b) => (b.s - a.s) || (a.i - b.i));
    return out.map((r) => { const d = docs[r.i]; return { kind: r.kind, label: KIND_LABEL[r.kind] || r.kind, title: d[1], text: d[2], source: d[5], open: d[3] || '', route: d[4] || '', score: Math.round(r.s * 100) / 100 }; });
  }
  return { ready: ok && docs.length > 0, size: docs.length, counts: (ok && index.counts) || {}, sha: (ok && index.sha) || '', search };
}
export default createSearch;
