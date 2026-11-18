// ATHENA Train, the pure part (2026-11-04): no DOM, no storage, no network. Tested from the page and from node.
//   buildQuestions(lib)                 every quiz question the library can make, deterministic, each with the entry it comes from (`from`)
//   askOptions(q, seen)                 the 4 options in a stable order (the same question shows the same order until it has been seen again)
//   pickDaily(qs, st, now, n, exclude)  the ids of today's 8: what is due first (Leitner boxes), then new ones, the weakest topic first
//   answer(st, q, ok, now)              -> the new state (box, topic scores, last miss, today's round, the streak day)
//   topicStats(st) / weakest(st) / nextStudy(st, qs, lib)   the weakest-topic card and ONE next thing to study
//   chartModel(drill, w, h, opt)        the candles + lines of a drill as plain numbers (the canvas only draws them)
//   drillOutcome(drill, take, stop)     what a drill answer was, in numbers and plain words
// State (one JSON value under the key 'athena.train.v1', see athenastore.js):
//   { v:1, q:{id:{b,d,n,ok}}, stats:{topic:[0|1 x20]}, miss:{entryId:t}, days:['2026-11-04'], qdays:['2026-11-04'], today:{day,round,ids,res,pick}|null,
//     drill:{round,i,picks:{id:{take,stop,ok:[takeOk,stopOk|null]}}}|null, drillRounds:n }
import { rng, shuffle } from './athenacore.js';
import { dayKey, rateCard, streakOf } from './athenabrain.js';
export { dayKey };

export const TOPICS = [
  { id: 'lit', name: 'LIT rules', blurb: 'How the bot trades' },
  { id: 'mffu', name: 'MFFU rules', blurb: 'The prop firm rules' },
  { id: 'risk', name: 'Risk rules', blurb: 'Your checklist and what to do when' },
  { id: 'words', name: 'Glossary', blurb: 'Words in plain English' },
  { id: 'charts', name: 'Reading charts', blurb: 'Would the bot take it, and where is the stop' },
];
export const topicName = (id) => (TOPICS.find((t) => t.id === id) || { name: id }).name;
const TOPIC_OF_KIND = { strategy: 'lit', numbers: 'lit', mffu: 'mffu', playbook: 'risk', words: 'words' };
export const DAILY = 8;                                   // about 15 seconds each: two minutes
export const WINDOW = 20;                                 // the last 20 answers of a topic make its score
export const MIN_SEEN = 3;                                // a topic needs 3 answers before it can be "weakest"
const DAY = 864e5;

export function hash(s) {                                 // FNV-1a, 32 bit: the same text always gives the same number
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clip = (s, n = 110) => { s = String(s); if (s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : n) + '...'; };
/** library text with its [[id]] glossary links turned into plain words (the page writes text with textContent, never as HTML) */
export const plain = (text, byId) => String(text ?? '').replace(/\[\[([a-z0-9-]+)\]\]/g, (m, id) => (byId && byId[id] ? byId[id].title.replace(/ \(.*\)$/, '').toLowerCase() : id));
/** one clean line for an option: the first sentence when it is short enough, else cut at a word */
const gist = (s) => { s = String(s).trim(); const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(s); return m && m[0].length >= 25 && m[0].length <= 140 ? m[0] : clip(s, 120); };
const stable = (arr, key, seed) => arr.slice().sort((a, b) => hash(seed + '|' + key(a)) - hash(seed + '|' + key(b)) || (key(a) < key(b) ? -1 : 1));   // a fixed "random" order

// ------------------------------------------------------------------------------------------------ the questions
export function buildQuestions(lib) {
  const byId = Object.fromEntries(lib.entries.map((e) => [e.id, e]));
  const out = [], seenIds = new Set();
  const add = (q) => {
    const uniq = new Set([q.right, ...q.wrongs].map((s) => s.trim()));
    if (!q.q || !q.right || q.wrongs.length < 3 || uniq.size < 4 || seenIds.has(q.id) || !byId[q.from]) return;
    seenIds.add(q.id); out.push({ ...q, wrongs: q.wrongs.slice(0, 3) });
  };
  const pool = lib.entries.filter((e) => TOPIC_OF_KIND[e.kind]);
  const sameKind = (e) => pool.filter((o) => o.kind === e.kind && o.id !== e.id);
  for (const e of pool) {
    const topic = TOPIC_OF_KIND[e.kind], P = (t) => plain(t, byId);
    if (e.quiz && e.quiz.wrong && e.quiz.wrong.length >= 3) { add({ id: 'q:' + e.id, topic, q: e.quiz.q, right: P(e.quiz.a), wrongs: e.quiz.wrong.map(P), from: e.id }); continue; }
    if (e.ask) {
      const others = stable(sameKind(e).filter((o) => o.ask), (o) => o.id, e.id);
      add({ id: 'w:' + e.id, topic, q: e.ask.q + '?', right: gist(P(e.ask.a)), wrongs: others.slice(0, 3).map((o) => gist(P(o.ask.a))), from: e.id });
      continue;
    }
    if (e.short && e.short.length >= 25) {                                              // no written question: "which one is true about this page?"
      const lead = e.kind === 'playbook' ? `What is the plan: ${P(e.title)}?` : e.kind === 'mffu' ? `Which line belongs to the MFFU rule “${P(e.title)}”?` : `Which line belongs to “${P(e.title)}”?`;
      const others = stable(sameKind(e).filter((o) => o.short && o.short.length >= 25), (o) => o.id, e.id);
      add({ id: 'g:' + e.id, topic, q: lead, right: gist(P(e.short)), wrongs: others.slice(0, 3).map((o) => gist(P(o.short))), from: e.id });
    }
  }
  // the order of the steps: "what comes right after Step k?"
  const steps = lib.entries.map((e) => ({ e, m: /^Step (\d+): (.+)$/.exec(e.title) })).filter((x) => x.m).map((x) => ({ n: +x.m[1], name: x.m[2], id: x.e.id })).sort((a, b) => a.n - b.n);
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i], b = steps[i + 1];
    add({ id: 'o:' + a.id, topic: 'lit', q: `In the bot's recipe, what comes right after Step ${a.n} (${a.name})?`, right: `Step ${b.n}: ${b.name}`, from: b.id,
      wrongs: stable(steps.filter((s) => s.n !== b.n && s.n !== a.n), (s) => s.id, a.id).slice(0, 3).map((s) => `Step ${s.n}: ${s.name}`) });
  }
  // the owner's checklist: "which one is a rule of this group?"
  const R = lib.rules || [], ASK = { before: 'Which one is on your checklist BEFORE the session?', during: 'Which one is on your checklist DURING the session?', after: 'Which one is on your checklist AFTER the session?',
    money: 'Which one is one of the money rules?', never: 'Which one is on the NEVER list?' };
  for (const r of R) {
    if (!ASK[r.group]) continue;
    add({ id: 'r:' + r.id, topic: 'risk', q: ASK[r.group], right: clip(r.text, 120), from: r.from,
      wrongs: stable(R.filter((o) => o.group !== r.group), (o) => o.id, r.id).slice(0, 3).map((o) => clip(o.text, 120)) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** the 4 options in a stable order; `seen` (how many times it was asked before) changes the order so the right one does not sit in one place */
export function askOptions(q, seen = 0) {
  const opts = shuffle([q.right, ...q.wrongs], rng(hash(q.id) + seen * 7919));
  return { options: opts, answer: opts.indexOf(q.right) };
}

// ------------------------------------------------------------------------------------------------ the memory
export const emptyState = () => ({ v: 1, q: {}, stats: {}, miss: {}, days: [], qdays: [], today: null, drill: null, drillRounds: 0 });
export function normState(s) {
  const e = emptyState();
  if (!s || typeof s !== 'object' || s.v !== 1) return e;
  return { ...e, ...s, q: s.q && typeof s.q === 'object' ? s.q : {}, stats: s.stats && typeof s.stats === 'object' ? s.stats : {}, miss: s.miss && typeof s.miss === 'object' ? s.miss : {},
    days: Array.isArray(s.days) ? s.days.filter((d) => typeof d === 'string').slice(-120) : [], qdays: Array.isArray(s.qdays) ? s.qdays.filter((d) => typeof d === 'string').slice(-120) : [] };
}

export function topicStats(st) {
  return TOPICS.map((t) => {
    const a = (st.stats && st.stats[t.id]) || [], n = a.length, ok = a.reduce((x, y) => x + (y ? 1 : 0), 0);
    return { ...t, n, ok, pct: n ? Math.round((100 * ok) / n) : null };
  });
}
/** the topic to work on: lowest score among the topics with 3+ answers (ties: fewer answers, then the list order); null when nothing is scored yet */
export function weakest(st) {
  const s = topicStats(st).filter((t) => t.n >= MIN_SEEN);
  if (!s.length) return null;
  return s.slice().sort((a, b) => a.ok / a.n - b.ok / b.n || a.n - b.n)[0];
}
const topicOrder = (st) => topicStats(st).slice().sort((a, b) => (a.ok + 1) / (a.n + 2) - (b.ok + 1) / (b.n + 2));        // weakest first; an unseen topic counts as 50%

// ------------------------------------------------------------------------------------------------ the daily set (Leitner boxes)
export function pickDaily(qs, st, now = Date.now(), n = DAILY, exclude = new Set(), salt = '') {
  const S = st.q || {}, pool = qs.filter((q) => !exclude.has(q.id));
  const due = pool.filter((q) => S[q.id] && S[q.id].d <= now).sort((a, b) => S[a.id].d - S[b.id].d || (a.id < b.id ? -1 : 1));
  const fresh = pool.filter((q) => !S[q.id]);
  const out = due.slice(0, Math.max(1, n - 2));                                            // keep room for new material
  const byTopic = Object.fromEntries(TOPICS.map((t) => [t.id, stable(fresh.filter((q) => q.topic === t.id), (q) => q.id, 'fresh').slice()]));
  const order = topicOrder(st).map((t) => t.id);
  for (let guard = 0; out.length < n && guard < 400; guard++) {                              // round robin over the topics, the weakest first
    let moved = false;
    for (const t of order) { if (out.length >= n) break; const q = byTopic[t].shift(); if (q) { out.push(q); moved = true; } }
    if (!moved) break;
  }
  if (out.length < n) {                                                                     // nothing new left: the soonest-due of the rest, extra practice
    const have = new Set(out.map((q) => q.id));
    for (const q of pool.filter((x) => S[x.id] && !have.has(x.id)).sort((a, b) => S[a.id].d - S[b.id].d || (a.id < b.id ? -1 : 1))) { if (out.length >= n) break; out.push(q); }
  }
  return shuffle(out, rng(hash(dayKey(now) + '|' + salt))).map((q) => q.id);
}

/** start (or fetch) a round of the daily quiz. -> the state with st.today set; `fresh` true begins another round even when the last one is unfinished */
export function startRound(qs, st, now = Date.now(), fresh = false) {
  const day = dayKey(now), t = st.today;
  if (t && t.day === day && !fresh && qs.length) return st;
  const round = t && t.day === day ? t.round + 1 : 1;
  const used = new Set(t && t.day === day ? (t.all || t.ids) : []);
  const ids = pickDaily(qs, st, now, DAILY, used, 'r' + round);
  return { ...st, today: { day, round, ids, res: ids.map(() => null), pick: ids.map(() => null), all: [...used, ...ids] } };
}
export const roundDone = (t) => !!t && t.res.every((r) => r !== null);
export const roundIndex = (t) => (t ? t.res.findIndex((r) => r === null) : -1);
export const quizDoneToday = (st, now = Date.now()) => st.qdays.includes(dayKey(now));
export const streak = (st, now = Date.now()) => streakOf(st.days, now);

/** record one answer of the current round (index i): the Leitner box (right = next box, wrong = box 0, back in 10 minutes), the topic score, the last miss, the streak day */
export function answer(st, q, i, pick, ok, now = Date.now()) {
  const prev = (st.q[q.id] || { n: 0, ok: 0 });
  const r = rateCard(st.q, q.id, ok ? 1 : 0, now)[q.id];
  const stats = { ...st.stats, [q.topic]: [...(st.stats[q.topic] || []), ok ? 1 : 0].slice(-WINDOW) };
  const t = st.today ? { ...st.today, res: st.today.res.slice(), pick: st.today.pick.slice() } : null;
  if (t && t.ids[i] === q.id) { t.res[i] = ok ? 1 : 0; t.pick[i] = pick; }
  const fin = !!t && roundDone(t);
  const days = fin && !st.days.includes(t.day) ? [...st.days, t.day].slice(-120) : st.days;
  const qdays = fin && !st.qdays.includes(t.day) ? [...st.qdays, t.day].slice(-120) : st.qdays;
  return { ...st, qdays, q: { ...st.q, [q.id]: { b: r.b, d: r.d, n: prev.n + 1, ok: prev.ok + (ok ? 1 : 0) } }, stats, miss: ok ? st.miss : { ...st.miss, [q.from]: now }, today: t, days };
}

/** ONE next thing to study: for the weakest topic, the entry of the question missed last; else the entry with the lowest box; else the first one */
export function nextStudy(st, qs, lib) {
  const w = weakest(st), byId = Object.fromEntries(lib.entries.map((e) => [e.id, e]));
  const topic = w ? w.id : null, have = (id) => (byId[id] ? id : null);
  if (!topic) return { topic: null, id: have('lit-in-one') || (lib.entries[0] && lib.entries[0].id) || null, why: 'Start here: the whole bot in one minute.' };
  if (topic === 'charts') {
    const picks = Object.values((st.drill && st.drill.picks) || {});
    const stopMiss = picks.filter((p) => p.ok && p.ok[1] === 0).length, takeMiss = picks.filter((p) => p.ok && p.ok[0] === 0).length;
    const id = stopMiss >= takeMiss ? have('step-6') : have('step-2');
    return { topic, id: id || have('lit-in-one'), why: stopMiss >= takeMiss ? 'You miss the stop most. Read where it goes.' : 'You miss which setups the bot takes. Read what it waits for.' };
  }
  const mine = qs.filter((q) => q.topic === topic);
  const missed = mine.filter((q) => st.miss[q.from]).sort((a, b) => st.miss[b.from] - st.miss[a.from] || (a.id < b.id ? -1 : 1))[0];
  if (missed) return { topic, id: missed.from, why: 'You missed this one most recently.' };
  const low = mine.filter((q) => st.q[q.id]).sort((a, b) => st.q[a.id].b - st.q[b.id].b || st.q[a.id].d - st.q[b.id].d)[0] || mine[0];
  return { topic, id: low ? low.from : null, why: 'The one you know least.' };
}

export function counts(qs, st, now = Date.now()) {
  const S = st.q || {};
  let due = 0, fresh = 0, learned = 0;
  for (const q of qs) { const s = S[q.id]; if (!s) fresh++; else if (s.d <= now) due++; else learned++; }
  return { total: qs.length, due, fresh, learned, doneToday: quizDoneToday(st, now), streak: streak(st, now) };
}

// ------------------------------------------------------------------------------------------------ the chart drills
export const px = (q) => q / 4;                                                            // quarter-points -> points
export const fmtPrice = (q) => px(q).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usd = (n) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}`;
export const EXIT = { TARGET: 'hit the target', STOP: 'was stopped out', BE: 'closed at breakeven', CUT_T15: 'was cut by the 15-minute check', TIME: 'was closed by the clock' };
export const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** is the drill file usable? (v 1, drills with the same-length candle arrays and, for a trade, 4 stop choices) */
export function validDrills(d) {
  return !!d && d.kind === 'olympus-athena-drills' && Array.isArray(d.drills) && d.drills.length > 0 && d.drills.every((x) => x && Array.isArray(x.o) && x.o.length >= 12 && ['h', 'l', 'c'].every((k) => Array.isArray(x[k]) && x[k].length === x.o.length)
    && x.n_known >= 6 && x.n_known < x.o.length && (!x.take || (Array.isArray(x.stops) && x.stops.length === 4 && x.answer >= 0 && x.answer < 4 && Number.isFinite(x.entry) && Number.isFinite(x.stop))));
}

/** a tiny practice set for when drills.json is missing: a made-up path (labelled SAMPLE on the page), never blank */
export function sampleDrills() {
  const o = [], h = [], l = [], c = [];
  let p = 4000;
  for (let i = 0; i < 44; i++) { const d = i < 30 ? -3 - (i % 3) : i < 36 ? 5 : 3; const op = p, cl = p + d; o.push(op); c.push(cl); h.push(Math.max(op, cl) + 2); l.push(Math.min(op, cl) + (i === 29 ? -8 : -2)); p = cl; }
  const entry = c[35], stop = Math.min(...l) - 1;
  const mk = (id, take) => ({ id, day: 'sample', take, side: take ? 'LONG' : null, m0: 480, n_known: 36, o, h, l, c, ...(take ? { entry_i: 36, exit_i: 43, entry_time: '11:00', exit_time: '11:35', entry, stop, target: entry + 200, exit_price: c[43], exit: 'BE',
    sweep_ext: stop + 1, stops: [entry - 20, stop, entry - 80, entry - 150], answer: 1, kinds: ['tight', 'real', 'wide', 'fixed'], risk_pts: px(entry - stop), qty: 10, risk_usd: 500, r: 0, pnl: 0, pools: [], why: ['A practice chart, not a real day.'] } : { cut_time: '11:00' }) });
  return { v: 1, kind: 'olympus-athena-drills', scale: 4, step_s: 300, sample: true, source: 'sample', drills: [mk('sample-a', true), mk('sample-b', false)] };
}

/**
 * The picture of a drill as numbers. opt: {reveal:boolean, options:boolean (show the four stop lines), picked:index|null}.
 * -> {candles:[{x,w,o,h,l,c,up}], lines:[{y,x0,x1,kind,label}], ticks:[{x,label}], axis:[{y,label}], cut:x|null, bars, off:{dir,label}|null, lo, hi}
 */
export function chartModel(d, w, h, opt = {}) {
  const reveal = !!opt.reveal, N = reveal ? d.o.length : d.n_known;
  const L = 4, R = w - 54, T = 10, B = h - 20, slot = (R - L) / (N + 1.5), bw = Math.max(1, Math.floor(slot * 0.62));
  const lines = [];
  const mark = (q, kind, label) => lines.push({ q, kind, label });
  if (d.take && opt.options && !reveal) d.stops.forEach((q, i) => mark(q, i === opt.picked ? 'pick' : 'opt', 'ABCD'[i]));
  if (d.take && reveal) {
    mark(d.entry, 'entry', 'entry'); mark(d.stop, 'stop', 'stop');
    if (Number.isFinite(d.exit_price) && !(Number.isFinite(d.target) && Math.abs(d.exit_price - d.target) <= 2)) mark(d.exit_price, 'exit', 'exit');
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, d.l[i]); hi = Math.max(hi, d.h[i]); }
  const candleRange = hi - lo;
  for (const m of lines) { lo = Math.min(lo, m.q); hi = Math.max(hi, m.q); }
  let off = null;
  if (d.take && reveal && Number.isFinite(d.target)) {                                      // the target is often far away: draw it only when it is near the candles
    if (d.target >= lo - candleRange * 0.5 && d.target <= hi + candleRange * 0.5) { mark(d.target, 'target', 'target'); lo = Math.min(lo, d.target); hi = Math.max(hi, d.target); }
    else off = { dir: d.target > hi ? 'up' : 'down', label: `target ${fmtPrice(d.target)}` };
  }
  const pad = Math.max(4, (hi - lo) * 0.06); lo -= pad; hi += pad;
  const y = (q) => T + ((hi - q) / (hi - lo)) * (B - T);
  const candles = [];
  for (let i = 0; i < N; i++) candles.push({ x: L + slot * (i + 0.5), w: bw, o: y(d.o[i]), h: y(d.h[i]), l: y(d.l[i]), c: y(d.c[i]), up: d.c[i] >= d.o[i] });
  const ticks = [];
  for (let i = 0; i < N; i++) { const m = d.m0 + 5 * i; if (m % 60 === 0) ticks.push({ x: L + slot * (i + 0.5), label: hm(m) }); }
  let axis = [0, 1, 2, 3].map((k) => { const q = lo + ((hi - lo) * (k + 0.5)) / 4; return { y: y(q), label: fmtPrice(Math.round(q)) }; });
  const ls = lines.map((m) => ({ y: y(m.q), ly: y(m.q), x0: L, x1: R, kind: m.kind, label: m.label, price: m.q })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ls.length; i++) if (ls[i].ly < ls[i - 1].ly + 11) ls[i].ly = ls[i - 1].ly + 11;                       // labels never sit on top of each other
  axis = axis.filter((a) => !ls.some((l) => Math.abs(l.ly - a.y) < 11 || Math.abs(l.y - a.y) < 11));                    // a price label never sits under a line label
  return { candles, lines: ls, ticks, axis, cut: reveal ? L + slot * d.n_known : null, bars: N, off, lo, hi, w, h, plotR: R, plotB: B };
}

/** the result of answering a drill. take: true / false (would the bot take it), stop: the picked stop index or null. */
export function drillOutcome(d, take, stop) {
  const takeOk = take === !!d.take;
  const stopOk = d.take && take ? stop === d.answer : null;
  const wins = d.take ? Number.isFinite(d.pnl) && d.pnl > 0 : null;
  return { takeOk, stopOk, points: (takeOk ? 1 : 0) + (stopOk ? 1 : 0), max: d.take ? 2 : 1, wins };
}
export const drillPoints = (drills, picks) => {
  let got = 0, max = 0;
  for (const d of drills) { max += d.take ? 2 : 1; const p = picks && picks[d.id]; if (p && p.ok) got += (p.ok[0] ? 1 : 0) + (p.ok[1] ? 1 : 0); }
  return { got, max };
};
/** what to tell the owner after a drill, as plain sentences (an array of lines; the page writes each with textContent) */
export function drillLines(d, take, stop) {
  const o = drillOutcome(d, take, stop), L = [];
  if (!d.take) {
    L.push(o.takeOk ? 'Right. The bot stayed out.' : 'Not this time. The bot took no trade on this day.');
    L.push(`In the replay the bot took no trade this day. It only trades after a sweep of a marked level, a trap, a shift back (5m CISD) and a limit fill, between 02:00 and 15:30. When that does not all happen, it waits. A quiet day is normal.`);
    return L;
  }
  const side = d.side === 'LONG' ? 'buy' : 'sell';
  L.push(o.takeOk ? `Right. The bot took this one: a ${side} at ${fmtPrice(d.entry)} (${d.entry_time} New York).` : `Not this time. The bot did take this one: a ${side} at ${fmtPrice(d.entry)} (${d.entry_time} New York).`);
  if (take) L.push(o.stopOk ? 'Right stop.' : `The real stop was ${fmtPrice(d.stop)}.`);
  L.push(`The stop sits 1 tick beyond the sweep extreme (${fmtPrice(d.sweep_ext)}, the high or low made before the turn), shown as the stop line. It is ${d.risk_pts} points away, so ${d.qty} micros ($${Math.round(d.risk_usd)} at risk). If price goes back through it, the idea was wrong.`);
  L.push(`Result in the replay: the trade ${EXIT[d.exit] || 'ended'} at ${d.exit_time}: ${usd(d.pnl)} on ${d.qty} micros (${d.r >= 0 ? '+' : ''}${Number(d.r).toFixed(2)}R).`);
  return L;
}
export const STOP_NOTES = { real: 'the bot\'s stop: 1 tick beyond the sweep extreme', tight: 'too tight: inside the wick, one small push takes it out', wide: 'too far: it risks more than the setup needs', fixed: 'a fixed distance: ignores where the trap really was' };

// ------------------------------------------------------------------------------------------------ a round of the chart drills
/** the index of the first drill of the round that has no answer yet (-1 when the round is finished) */
export const drillIndex = (st, drills) => (st.drill && !st.drill.done ? drills.findIndex((d) => !(st.drill.picks || {})[d.id]) : -1);
export function startDrills(st, fresh = false) {
  if (st.drill && !st.drill.done && !fresh) return st;
  return { ...st, drill: { round: (st.drillRounds || 0) + 1, picks: {}, done: false }, drillRounds: (st.drillRounds || 0) + 1 };
}
/** record one drill: the score, the chart-reading topic score (the pick, and the stop when there was one), and the streak day when the round is finished */
export function recordDrill(st, drills, d, take, stop, now = Date.now()) {
  const o = drillOutcome(d, take, stop), cur = st.drill || { round: 1, picks: {}, done: false };
  const picks = { ...cur.picks, [d.id]: { take, stop: stop === undefined ? null : stop, ok: [o.takeOk ? 1 : 0, o.stopOk === null ? null : (o.stopOk ? 1 : 0)] } };
  const done = drills.every((x) => picks[x.id]);
  const add = [o.takeOk ? 1 : 0, ...(o.stopOk === null ? [] : [o.stopOk ? 1 : 0])];
  const stats = { ...st.stats, charts: [...(st.stats.charts || []), ...add].slice(-WINDOW) };
  const day = dayKey(now);
  return { ...st, stats, drill: { ...cur, picks, done }, days: done && !st.days.includes(day) ? [...st.days, day].slice(-120) : st.days };
}
