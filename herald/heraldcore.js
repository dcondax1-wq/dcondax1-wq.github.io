// HERALD core (ES module, pure: no DOM, no network, no storage). The newspaper's rules, tested in node (tests/test_herald_page.py).
//   normalizeEdition   an edition file as the page may trust it (junk dropped, text clipped, nothing executable)
//   audit              the numbers printed in an article that are not among its facts: the same rule as tools/herald_build.py (must be empty)
//   articleText        an article as plain text to share; speechText: the same, shaped for reading aloud
//   editions           neighbours(dates, date): the older and the newer edition; safeDate
//   quiz               grade(quiz, answers)
// Nothing here trusts its input.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n || 400) : '');
const NUM_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;
export const DATE_RE = /^\d{4}-\d\d-\d\d$/;
export const safeDate = (d) => typeof d === 'string' && DATE_RE.test(d);

/** the numbers printed in a text, commas dropped: '1,836 buys at 4.7%' -> ['1836', '4.7'] */
export function tokens(text) { return (String(text).match(NUM_RE) || []).map((t) => t.replace(/,/g, '')); }
/** the numbers printed in an article that are not among its facts (must be empty) */
export function audit(a) {
  const allowed = new Set();
  for (const f of (a && a.facts) || []) for (const t of tokens(f.t)) allowed.add(t);
  const printed = new Set(tokens([a.headline || '', a.standfirst || ''].concat(a.body || []).join(' ')));
  return [...printed].filter((t) => !allowed.has(t)).sort();
}
function cleanArticle(a) {
  if (!isObj(a) || !str(a.id, 40) || !str(a.headline)) return null;
  const body = (Array.isArray(a.body) ? a.body : []).map((b) => str(b, 600)).filter(Boolean).slice(0, 6);
  if (body.length < 3) return null;
  const facts = (Array.isArray(a.facts) ? a.facts : []).filter(isObj).slice(0, 80).map((f) => ({ t: str(String(f.t === undefined ? '' : f.t), 300), src: str(f.src, 120), kind: f.quote ? 'quote' : typeof f.calc === 'string' ? 'calc' : 'value', how: typeof f.calc === 'string' ? str(f.calc, 160) : typeof f.at === 'string' ? str(f.at, 120) : '' }));
  return { id: str(a.id, 40), kicker: str(a.kicker, 40), headline: str(a.headline, 160), standfirst: str(a.standfirst, 300), body, facts,
    sources: (Array.isArray(a.sources) ? a.sources : []).map((x) => str(x, 120)).filter(Boolean).slice(0, 12), sample: a.sample === true, by: str(a.by, 60) };
}
export function normalizeEdition(doc) {
  if (!isObj(doc) || !safeDate(doc.date)) return null;
  const lead = cleanArticle(doc.lead), articles = (Array.isArray(doc.articles) ? doc.articles : []).map(cleanArticle).filter(Boolean).slice(0, 10);
  const m = isObj(doc.masthead) ? doc.masthead : {}, w = isObj(doc.weather) ? doc.weather : null, c = isObj(doc.classifieds) ? doc.classifieds : null, p = isObj(doc.press) ? doc.press : {};
  return {
    date: doc.date, number: isNum(doc.number) ? Math.max(1, Math.round(doc.number)) : 1, built: str(doc.built, 40), demo: doc.demo === true, label: str(doc.label, 200),
    masthead: { title: str(m.title, 60) || 'The Olympus Herald', motto: str(m.motto, 80), date_words: str(m.date_words, 60) || doc.date },
    lead, articles,
    numbers: (Array.isArray(doc.numbers) ? doc.numbers : []).filter(isObj).slice(0, 8).map((n) => ({ value: str(String(n.value), 30), label: str(n.label, 140), src: str(n.src, 120), article: str(n.article, 40) })).filter((n) => n.value),
    corrections: (Array.isArray(doc.corrections) ? doc.corrections : []).filter(isObj).slice(0, 6).map((x) => ({ was: str(x.was, 240), now: str(x.now, 300), proof: str(x.proof, 120), src: str(x.src, 120) })).filter((x) => x.was && x.now),
    classifieds: c ? { sample: c.sample === true, src: str(c.src, 120), note: str(c.note, 200), items: (Array.isArray(c.items) ? c.items : []).filter(isObj).slice(0, 6).map((i) => ({ title: str(i.title, 120), detail: str(i.detail, 260), usd: isNum(i.usd) ? i.usd : null, expires: safeDate(i.expires) ? i.expires : '' })).filter((i) => i.title) } : null,
    weather: w && ['calm', 'busy', 'careful'].indexOf(w.level) >= 0 ? { level: w.level, text: str(w.text, 200), note: str(w.note, 160), src: str(w.src, 120), events: (Array.isArray(w.events) ? w.events : []).filter(isObj).slice(0, 6).map((e) => ({ time: str(e.time, 10), title: str(e.title, 120), impact: str(e.impact, 12) })) } : null,
    quiz: (Array.isArray(doc.quiz) ? doc.quiz : []).filter((q) => isObj(q) && str(q.q) && Array.isArray(q.o) && q.o.length >= 2 && Number.isInteger(q.a) && q.a >= 0 && q.a < q.o.length).slice(0, 5).map((q) => ({ id: str(q.id, 20), topic: str(q.topic, 20), q: str(q.q, 300), o: q.o.map((x) => str(String(x), 200)).slice(0, 5), a: q.a, why: str(q.why, 400) })),
    interviews: (Array.isArray(doc.interviews) ? doc.interviews : []).filter((i) => isObj(i) && str(i.name) && Array.isArray(i.qa)).slice(0, 4).map((i) => ({ id: str(i.id, 60), name: str(i.name, 60), title: str(i.title, 80), src: str(i.src, 120), sample: i.sample === true, qa: i.qa.filter(isObj).slice(0, 4).map((x) => ({ q: str(x.q, 200), a: str(x.a, 400) })).filter((x) => x.q && x.a) })).filter((i) => i.qa.length),
    skipped: (Array.isArray(doc.skipped) ? doc.skipped : []).filter(isObj).slice(0, 14).map((s) => ({ article: str(s.article, 40), why: str(s.why, 240) })),
    missing: isObj(doc.sources) && Array.isArray(doc.sources.missing) ? doc.sources.missing.map((x) => str(x, 120)).filter(Boolean).slice(0, 20) : [],
    shipped: (Array.isArray(p.shipped) ? p.shipped : []).filter(isObj).slice(0, 10).map((s) => ({ who: str(s.who, 60), id: str(s.id, 60), t: isNum(s.t) ? s.t : 0, text: str(s.text, 200) })).filter((s) => s.who && s.text),
  };
}
export const allArticles = (ed) => (ed ? (ed.lead ? [ed.lead] : []).concat(ed.articles) : []);
export const findArticle = (ed, id) => allArticles(ed).filter((a) => a.id === id)[0] || null;
/** an edition worth printing has a lead story */
export const printable = (ed) => !!(ed && ed.lead);

export function money(v) {
  if (!isNum(v)) return '';
  const a = Math.abs(v), whole = Math.abs(a - Math.round(a)) < 0.005, s = whole ? String(Math.round(a)) : a.toFixed(2), parts = s.split('.');
  return (v < 0 && +s !== 0 ? '-' : '') + '$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
}
/** an article as plain text, to share: masthead line, headline, standfirst, body, sources */
export function articleText(a, ed) {
  const lines = [`${ed.masthead.title}, ${ed.masthead.date_words} (edition ${ed.number})${ed.demo ? ' [DEMO: not real]' : a.sample ? ' [rests on sample data]' : ''}`, '', a.headline.toUpperCase(), a.standfirst, ''];
  for (const b of a.body) lines.push(b);
  if (a.sources.length) lines.push('', 'Sources: ' + a.sources.join(', '));
  return lines.join('\n');
}
/** the same article shaped for a voice: no file names, a pause between parts */
export function speechText(a, ed) {
  return [ed && ed.demo ? 'Demo edition. Not real numbers.' : a.sample ? 'This story rests on sample data.' : '', a.headline + '.', a.standfirst].concat(a.body).filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\$-/g, 'minus $').replace(/-\$/g, 'minus $');
}
/** the older and the newer edition next to `date` in a list of dates */
export function neighbours(dates, date) {
  const ds = [...new Set((Array.isArray(dates) ? dates : []).filter(safeDate))].sort(), i = ds.indexOf(date);
  if (i < 0) { const older = ds.filter((d) => d < date), newer = ds.filter((d) => d > date); return { older: older.length ? older[older.length - 1] : '', newer: newer.length ? newer[0] : '', index: -1, total: ds.length }; }
  return { older: i > 0 ? ds[i - 1] : '', newer: i < ds.length - 1 ? ds[i + 1] : '', index: i, total: ds.length };
}
export function indexDates(ix) { return isObj(ix) && Array.isArray(ix.editions) ? ix.editions.filter((e) => isObj(e) && safeDate(e.date)).map((e) => e.date) : []; }
export function grade(quiz, answers) {
  let right = 0, done = 0;
  quiz.forEach((q, i) => { const a = answers ? answers[i] : undefined; if (Number.isInteger(a)) { done++; if (a === q.a) right++; } });
  return { right, done, total: quiz.length, words: done < quiz.length ? `${done} of ${quiz.length} answered` : `${right} of ${quiz.length} right` };
}
export function initials(name) { const w = String(name || '?').replace(/^the\s+/i, '').split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
/** 'built from data as of 2026-11-11 01:10 UTC (10 hours before this view)' */
export function builtWords(built, nowMs) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(built || '');
  if (!m) return 'The sources carry no time stamp, so the age of this edition is not known.';
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)), when = `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5]} UTC` : ''}`;
  if (!isNum(nowMs) || nowMs < ms) return `Edition built from data as of ${when}.`;
  const h = Math.floor((nowMs - ms) / 3600000), d = Math.floor(h / 24);
  return `Edition built from data as of ${when} (${d >= 2 ? d + ' days' : h >= 2 ? h + ' hours' : 'under two hours'} old${d >= 3 ? ': STALE' : ''}).`;
}
export const WEATHER = { calm: ['Calm', 'ok'], busy: ['Busy', 'warn'], careful: ['Careful', 'bad'] };
/** split a headline into lines of about `n` characters (for the scroll) */
export function wrap(text, n, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const w of words) { if (cur && (cur + ' ' + w).length > n) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
  if (cur) lines.push(cur);
  const max = maxLines || 4;
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, '') + '…'; }
  return lines;
}
