// Jarvis explain-anything (2026-11-11, JARVIS BRAIN v3): "what is drawdown / CISD / IFVG / a sweep / Kelly / PF", "where does the stop go".
// Answers come ONLY from jarvis/strategy-facts.json, which tools/jarvis_facts_build.py writes from STRATEGY.md (the owner's own rules,
// word for word) and the site glossary. Nothing here knows a rule by itself, so it cannot invent one: an unknown word returns null and a
// missing file is said to be missing. No DOM, no network. iPhone Safari 16: plain ES2020, no regex lookbehind.
//
//   import { createExplain } from './explain.js';
//   const ex = createExplain(factsJson);                 // { ready, find, parseAsk, answer, overview, names }
//   ex.parseAsk('what is a sweep')        -> { term: 'sweep' } | { overview: true } | null
//   ex.answer('sweep', { plain: false })  -> { text, speak, intent: 'explain', term, sources: [...] }

import { norm, lev } from './router.js';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const LEAD = '(?:please |pls |jarvis |hey jarvis |ok |okay |so |and |can you |could you |quickly |again |remind me |tell me )*';
const WHAT = new RegExp('^' + LEAD + '(?:what is|what\'s|whats|what are|what was|what does|what do|what do you mean by|what is meant by|what exactly is|define|definition of|meaning of|the meaning of|explain|describe|tell me about|tell me what|teach me|teach me about|remind me what|whats the meaning of|what is the meaning of)\\s+(.+?)$');
const HOW = new RegExp('^' + LEAD + '(?:where does|where do|where should|how does|how do|how is|how are|how big is|how wide is|how far is|when does|when do|when is|why is|what decides|what sets)\\s+(?:the |my |our |a |an )?(.+?)\\s+(?:go|goes|work|works|get set|set|calculated|worked out|chosen|picked|placed|sit|sits|move|moves|happen|happens|decided|trigger|triggers|kick in|kicks in|start|starts|sized|defined|found|used)(?:\\s.*)?$');
const RULE = new RegExp('^' + LEAD + '(?:what is|what\'s|whats|what are|tell me|show me|explain|give me)\\s+(?:the |my |our )?rules?\\s+(?:for|on|about|of|around)\\s+(?:the |my |our |a )?(.+?)$');
const OVER = new RegExp('^' + LEAD + '(?:what is|what\'s|whats|what are|explain|describe|tell me|show me|summarize|summarise|give me)\\s+(?:about )?(?:the |my |our )?(?:strategy|lit|lit strategy|trading rules|rules of the strategy|strategy rules|rules|bot\'?s? rules|live strategy|strategy in plain words|whole strategy)$');

/** createExplain(facts) -> { ready, find, parseAsk, answer, overview, names } */
export function createExplain(facts) {
  const ok = isObj(facts) && isObj(facts.terms) && Array.isArray(facts.sections);
  const T = ok ? facts.terms : {}, secs = ok ? facts.sections.filter(isObj) : [], byN = new Map(secs.map((s) => [s.n, s]));
  const forms = new Map();                       // a normalised way of saying it -> the term's name
  const put = (form, name) => { const k = norm(form); if (k && !forms.has(k)) forms.set(k, name); };
  for (const name of Object.keys(T)) { put(name, name); put(name + 's', name); put(name.replace(/-/g, ' '), name); }
  if (ok && isObj(facts.aliases)) for (const a of Object.keys(facts.aliases)) if (T[facts.aliases[a]]) put(a, facts.aliases[a]);
  const formList = Array.from(forms.keys());

  /** the term a short phrase names ("a sweep", "profit factor", "cisd rule", "drawdwn") or null */
  function find(text) {
    let q = norm(text).replace(/[?!.]+$/g, '').replace(/^(?:a|an|the|one|our|your|this|that)\s+/, '').trim();
    q = q.replace(/\s+(?:mean|means|meaning|stand for|stands for|is|are|rule|rules|exactly|again|in trading|in plain words|in simple words|in plain english|please|actually|for|about)$/g, '').replace(/\s+(?:mean|means|rule|rules|please)$/g, '').trim();
    if (!q || q.split(' ').length > 5) return null;
    if (forms.has(q)) return forms.get(q);
    if (/^(?:my|his|her|their|todays?|current|yesterdays?)\b/.test(q)) return null;         // "what is my drawdown" asks for the number
    if (q.length >= 5 && !/\d/.test(q)) {
      const max = q.length >= 9 ? 2 : 1;
      let best = null, bd = max + 1;
      for (const f of formList) { if (Math.abs(f.length - q.length) > max || f.length < 4) continue; const d = lev(q, f, max); if (d < bd) { bd = d; best = f; } }
      if (best) return forms.get(best);
    }
    return null;
  }
  function parseAsk(raw) {
    const q = norm(raw).replace(/[?!.]+$/g, '').trim();
    if (!ok || !q || q.length > 160) return null;
    if (OVER.test(q)) return { overview: true };
    let m = q.match(RULE);
    if (m) { const t = find(m[1]); if (t) return { term: t, rule: true }; }
    m = q.match(WHAT);
    if (m) {
      const rest = m[1], mine = /^(?:my|our)\s+/.test(rest), t = find(rest.replace(/^(?:my|our)\s+/, ''));
      if (t && (!mine || (/\brules?$/.test(rest) && T[t].rules))) return { term: t, rule: /\brules?$/.test(rest) };
    }
    m = q.match(HOW);
    if (m) { const t = find(m[1]); if (t && T[t].rules) return { term: t, rule: true }; }
    return null;
  }
  const ruleLines = (name, max) => { const out = []; for (const n of (T[name] && T[name].rules) || []) { const s = byN.get(n); if (s) out.push({ n, title: s.title, lines: s.lines.slice(0, max) }); } return out; };
  const firstSentence = (s) => { const m = String(s || '').match(/^.*?[.!?](?:\s|$)/); return (m ? m[0] : String(s || '')).trim(); };
  /** the answer for a term. opt.plain: only the one plain sentence; opt.full: every rule line of its sections */
  function answer(name, opt) {
    const t = T[name], o = opt || {};
    if (!t) return null;
    const rules = ruleLines(name, o.full ? 8 : 3), out = [], src = [];
    const label = /^[a-z]/.test(name) && name.length > 3 ? name.charAt(0).toUpperCase() + name.slice(1) : name;
    if (o.plain) {
      const d = t.def ? firstSentence(t.def) : rules.length ? rules[0].lines[0] : '';
      const from = t.def ? t.src : 'STRATEGY.md rule ' + (rules[0] ? rules[0].n : '');
      const text = `In plain words, ${label}: ${d}`;
      return { text: text + `\nFrom ${from}.`, speak: text, intent: 'explain', term: name, sources: [from], link: { open: 'athena', route: '' } };
    }
    if (t.def) { out.push(`${label}: ${t.def}`); src.push(t.src); }
    for (const r of rules) { out.push(`Your rule (STRATEGY.md, rule ${r.n}, ${r.title}): ${r.lines.join(' ')}`); src.push('STRATEGY.md rule ' + r.n); }
    if (!rules.length && t.live === false && t.prev) out.push(`Your live strategy (${facts.strategy || 'LIT'}) has no rule that uses it; STRATEGY.md names it only under the previous strategy.`);
    if (!out.length) return null;
    const tail = 'From ' + src.join('; ') + '.';
    return { text: out.join('\n') + '\n' + tail, speak: (t.def ? firstSentence(t.def) : '') + (rules.length ? ' Your rule: ' + firstSentence(rules[0].lines[0]) : ''), intent: 'explain', term: name, sources: src, link: { open: 'athena', route: '' } };
  }
  /** the whole live strategy in a few lines: the rule titles with their first line */
  function overview() {
    if (!ok || !secs.length) return null;
    const lines = [`${facts.strategy || 'The strategy'}, your live rules (STRATEGY.md): ${facts.head || ''}`.trim()].concat(secs.map((s) => `${s.n}. ${s.title}: ${firstSentence(s.lines[0] || '')}`));
    return { text: lines.join('\n') + '\nFrom STRATEGY.md. Ask "what is the stop rule" for any one of them.', speak: `${facts.strategy || 'The strategy'} has ${secs.length} rules. ` + secs.slice(0, 4).map((s) => s.title).join(', ') + ', and more on screen.', intent: 'explain', term: 'strategy', sources: ['STRATEGY.md'], link: { open: 'athena', route: '' } };
  }
  return { ready: ok, find, parseAsk, answer, overview, names: Object.keys(T), sha: (ok && facts.sha) || '' };
}
export default createExplain;
