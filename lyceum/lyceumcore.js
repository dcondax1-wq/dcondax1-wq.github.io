// LYCEUM core (pure, no DOM, no network, no storage): the owner's rules as questions, the daily 5-question quiz, XP and Greek ranks, streaks, spaced-repetition cards made
// from past mistakes, the 3 habits that cost the most money, and the weekly report card. Node-tested by tests/test_lyceum_page.py.
// The trade / journal shapes are the Journal's (tools/web_public/journal/journalcore.js): trades { id, day, usd, r, side }, entries { [tradeId]: { rating, mood } }.

export const RULES = ['stop', 'size', 'target', 'greed', 'flat'];
export const RULE_NAME = { stop: 'The stop', size: 'The size', target: 'One target', greed: 'No greed', flat: 'Flat on time' };

// the owner's own rules (CLAUDE.md): stop 1 tick beyond the sweep extreme, size follows the stop, one target banked at 8R, BE at 1R, 15-minute cut, 1 trade a day, entries 02:00 to 15:30, flat 15:55
export const QUESTIONS = [
  { id: 's1', topic: 'stop', q: 'Where does the stop go?', o: ['1 tick beyond the sweep extreme, the protected high or low', 'A fixed 20 points from the entry', 'Wherever feels safe'], a: 0, why: 'The stop sits at the protected low or high, one tick beyond the sweep extreme. Never a random or fixed distance.' },
  { id: 's2', topic: 'stop', q: 'You are long. The sweep made its low at 21,480.00. The stop goes at', o: ['21,479.75, one tick below it', '21,500.00, closer to the entry', 'The entry price'], a: 0, why: 'One tick (0.25) beyond the sweep extreme. If price takes that low, the idea was wrong.' },
  { id: 's3', topic: 'stop', q: 'Price is close to your stop and you feel sure it will turn. Move the stop further away?', o: ['No. A stop never moves away from price', 'Yes, give the trade room', 'Yes, but only by a few points'], a: 0, why: 'The stop only ever moves toward safety: to break-even at 1R. Widening it turns a small loss into a big one.' },
  { id: 's4', topic: 'stop', q: 'Why is the stop at the protected low or high?', o: ['If price takes it, the trade idea is wrong', 'It is always the tightest stop', 'It makes the target bigger'], a: 0, why: 'That level is where the idea is proven wrong, so the loss is cut exactly there.' },
  { id: 'z1', topic: 'size', q: 'The stop is wide today. How many micros?', o: ['Fewer: size follows the stop', 'The same as always', 'More, to make the money back'], a: 0, why: 'A wide stop means less risk per micro, so you carry fewer. The dollars risked stay inside the plan.' },
  { id: 'z2', topic: 'size', q: 'The stop is tight today. The rules allow', o: ['More micros, up to the risk cap', 'Fewer micros', 'Exactly the same number'], a: 0, why: 'A small stop allows more micros, but never above the cap the account rules give you.' },
  { id: 'z3', topic: 'size', q: 'What do you decide first?', o: ['The stop, then the size from it', 'The size, then fit a stop to it', 'The target, then skip the stop'], a: 0, why: 'Stop first. The size is worked out from the stop distance and the dollars you may risk (1R).' },
  { id: 'z4', topic: 'size', q: 'After three winners you feel hot. The size for the next trade', o: ['Follows the stop, as always', 'Goes up, you are on a roll', 'Doubles to finish the week'], a: 0, why: 'Size follows the stop and the account room, never your mood or the last result.' },
  { id: 't1', topic: 'target', q: 'How many targets does the plan have?', o: ['One: the VIX-band objective, banked at 8R', 'Two or three, scaling out', 'None, I trail by feel'], a: 0, why: 'One clear target, banked. No greed, no scaling by feel.' },
  { id: 't2', topic: 'target', q: 'Price reaches the target. You', o: ['Bank it', 'Wait for a bit more', 'Move the target up'], a: 0, why: 'The target is the plan. Bank it and the trade is done.' },
  { id: 't3', topic: 'target', q: 'The target is based on', o: ['The 18:00 open plus or minus one VIX day move', 'Yesterday\'s high', 'A round number'], a: 0, why: 'The 18:00 New York open plus or minus one VIX day move, the same every day.' },
  { id: 't4', topic: 'target', q: 'At 1R in profit the stop goes to', o: ['Break-even, plus the costs (+1.25 points)', 'The target', 'Further away'], a: 0, why: 'At 1R the stop moves to break-even plus costs. That is the only stop move allowed.' },
  { id: 'g1', topic: 'greed', q: 'You are up on the day and a new setup appears. The plan allows', o: ['One trade a day, so no', 'As many as show up', 'A bigger one to finish strong'], a: 0, why: 'One trade a day. Quiet days and early finishes are normal: the plan wants 2 to 4 trades a week.' },
  { id: 'g2', topic: 'greed', q: 'You lost today and want it back right now. You', o: ['Stop for the day', 'Take a revenge trade', 'Double the size'], a: 0, why: 'One trade a day and a loss is a loss of 1R, not an insult. Revenge trades are how evals end.' },
  { id: 'g3', topic: 'greed', q: 'A trade is at 4R and still running. Greed says remove the target. You', o: ['Leave the plan alone', 'Remove the target', 'Add more size'], a: 0, why: 'The target is set before the entry. Changing it mid-trade is the greedy mistake.' },
  { id: 'g4', topic: 'greed', q: 'You missed a big move and feel FOMO. You', o: ['Let it go: no chase outside the plan', 'Chase it', 'Chase it with bigger size'], a: 0, why: 'No setup, no trade. The next valid setup comes; chasing costs money.' },
  { id: 'f1', topic: 'flat', q: 'What time is the bot flat by?', o: ['15:55 New York time', '16:10, the firm\'s limit', 'Whenever the trade ends'], a: 0, why: 'Flat at 15:55 ET. MFFU requires flat by 16:10, so 15:55 leaves a margin.' },
  { id: 'f2', topic: 'flat', q: 'What is the latest time for a new entry?', o: ['15:30 New York', '15:55', '16:10'], a: 0, why: 'Entries run from 02:00 to 15:30 ET, so a trade has time to work before flat.' },
  { id: 'f3', topic: 'flat', q: 'A trade is open at 15:50 and looks great. You', o: ['Let it close at 15:55', 'Hold it overnight', 'Add to it'], a: 0, why: 'Flat at 15:55, every day. Overnight is not part of the plan.' },
  { id: 'f4', topic: 'flat', q: 'A trade has not moved in 15 minutes. The plan says', o: ['Cut it (the 15-minute cut)', 'Wait all day', 'Widen the stop'], a: 0, why: 'The 15-minute cut frees you from a trade that is not working.' },
];

// what each habit means, in the owner's rules
export const HABITS = {
  interfered: { name: 'Touching a trade by hand', rule: 'The stop and the target are set before the entry. Do not touch them: the stop never moves away, and at 1R it goes to break-even.', topic: 'stop' },
  hesitated: { name: 'Hesitating on a valid setup', rule: 'If the rules say go, go. The size already follows the stop, so the risk is small and fixed.', topic: 'size' },
  fomo: { name: 'Chasing (FOMO)', rule: 'No setup, no trade. Let the move go: one trade a day, entries only 02:00 to 15:30.', topic: 'greed' },
  revenge: { name: 'Revenge trading', rule: 'After a loss the day is done: one trade a day. A loss is 1R, nothing more.', topic: 'greed' },
  bored: { name: 'Trading from boredom', rule: 'Quiet days are normal: the plan wants 2 to 4 trades a week. No setup, no trade.', topic: 'greed' },
  tired: { name: 'Trading when tired', rule: 'Tired means smaller or off, never bigger. Size still follows the stop.', topic: 'size' },
};

// ------------------------------------------------------------------------------------------------ ranks
export const RANKS = [
  { id: 'mathetes', name: 'Mathetes', note: 'the pupil', xp: 0 },
  { id: 'hoplite', name: 'Hoplite', note: 'the shield bearer', xp: 120 },
  { id: 'stoic', name: 'Stoic', note: 'calm under loss', xp: 300 },
  { id: 'rhetor', name: 'Rhetor', note: 'speaks the plan aloud', xp: 600 },
  { id: 'philosopher', name: 'Philosopher', note: 'lover of the rules', xp: 1000 },
  { id: 'archon', name: 'Archon', note: 'the ruler of his own desk', xp: 1600 },
  { id: 'sophos', name: 'Sophos', note: 'the sage', xp: 2500 },
];

export function rankFor(xp) {
  const x = Math.max(0, Number(xp) || 0);
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (x >= RANKS[k].xp) i = k;
  const cur = RANKS[i], next = RANKS[i + 1] || null;
  return { index: i, rank: cur, next, toNext: next ? next.xp - x : 0, frac: next ? (x - cur.xp) / (next.xp - cur.xp) : 1, xp: x };
}

/** the hall: 2 columns at the start, one more per rank (8 at the top); a laurel on every column from the 4th rank on */
export function hallFor(rankIndex) {
  const r = Math.max(0, Math.min(RANKS.length - 1, rankIndex | 0));
  return { columns: 2 + r, laurels: Math.max(0, r - 2), total: 2 + (RANKS.length - 1) };
}

// ------------------------------------------------------------------------------------------------ dates (ymd strings, UTC arithmetic so no clock drift)
const okYmd = (s) => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = Date.parse(s + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; };
export function addDays(ymd, n) { const d = new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000); return d.toISOString().slice(0, 10); }
export function localYmd(now) { const d = now instanceof Date ? now : new Date(now); const p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
export const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// ------------------------------------------------------------------------------------------------ the daily quiz
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** 5 questions, one per rule (stop, size, target, greed, flat), chosen and shuffled by the date: the same day gives the same quiz */
export function dailyQuiz(ymd) {
  const r = rng(hash('lyceum|' + ymd));
  return RULES.map((t) => {
    const pool = QUESTIONS.filter((q) => q.topic === t), q = pool[Math.floor(r() * pool.length)];
    const order = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return { id: q.id, topic: q.topic, q: q.q, o: order.map((k) => q.o[k]), a: order.indexOf(q.a), why: q.why };
  });
}

// ------------------------------------------------------------------------------------------------ progress (the page keeps it in localStorage 'lyceum.v1'; this is the clean copy)
export const emptyProg = () => ({ v: 1, days: {}, reviewsByDay: {}, srs: {} });

export function cleanProg(p) {
  const out = emptyProg();
  if (!p || typeof p !== 'object') return out;
  if (p.days && typeof p.days === 'object') for (const [k, d] of Object.entries(p.days).slice(0, 800)) {
    if (!okYmd(k) || !d || typeof d !== 'object') continue;
    const score = Math.max(0, Math.min(5, Math.round(+d.score))), xp = Math.max(0, Math.min(200, Math.round(+d.xp)));
    if (Number.isFinite(score) && Number.isFinite(xp)) out.days[k] = { score, xp, miss: Array.isArray(d.miss) ? d.miss.filter((x) => typeof x === 'string' && /^[a-z]\d$/.test(x)).slice(0, 5) : [] };
  }
  if (p.reviewsByDay && typeof p.reviewsByDay === 'object') for (const [k, n] of Object.entries(p.reviewsByDay).slice(0, 800)) if (okYmd(k) && Number.isFinite(+n)) out.reviewsByDay[k] = Math.max(0, Math.min(999, Math.round(+n)));
  if (p.srs && typeof p.srs === 'object') for (const [id, c] of Object.entries(p.srs).slice(0, 400)) if (/^c-[\w.\-]{1,40}$/.test(id) && c && okYmd(c.due)) out.srs[id] = { box: Math.max(0, Math.min(4, Math.round(+c.box) || 0)), due: c.due };
  return out;
}

export const REVIEW_XP = 5, REVIEW_XP_DAILY = 10;
export function totalXp(prog) {
  let x = 0;
  for (const d of Object.values(prog.days)) x += d.xp;
  for (const n of Object.values(prog.reviewsByDay)) x += Math.min(n, REVIEW_XP_DAILY) * REVIEW_XP;
  return x;
}

/** days in a row with a finished quiz, counted back from today (today not done yet: counted from yesterday) */
export function streak(prog, ymd) {
  let d = prog.days[ymd] ? ymd : addDays(ymd, -1), n = 0;
  while (prog.days[d]) { n++; d = addDays(d, -1); }
  let best = 0, run = 0;
  const keys = Object.keys(prog.days).sort();
  for (let i = 0; i < keys.length; i++) { run = i > 0 && diffDays(keys[i - 1], keys[i]) === 1 ? run + 1 : 1; best = Math.max(best, run); }
  return { streak: n, best, doneToday: !!prog.days[ymd] };
}

/** the XP of a finished quiz: 10 a right answer, 20 more for 5 of 5, 5 for each day already in the streak (at most 30) */
export function quizXp(score, streakBefore) { return score * 10 + (score === 5 ? 20 : 0) + 5 * Math.min(6, Math.max(0, streakBefore)); }

/** record today's quiz: answers = chosen option indexes (5). Once a day: a second try changes nothing. Returns { prog, result } */
export function finishQuiz(prog, quiz, answers, ymd) {
  if (prog.days[ymd]) return { prog, result: { already: true, ...prog.days[ymd] } };
  const miss = [], score = quiz.reduce((n, q, i) => { const ok = answers[i] === q.a; if (!ok) miss.push(q.id); return n + (ok ? 1 : 0); }, 0);
  const before = streak(prog, ymd).streak;   // days in a row up to yesterday (today is not done yet)
  const xp = quizXp(score, before);
  const next = { ...prog, days: { ...prog.days, [ymd]: { score, xp, miss } } };
  return { prog: next, result: { already: false, score, xp, miss } };
}

// ------------------------------------------------------------------------------------------------ the trades and the habits
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export function normTrades(raw) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.trades) ? raw.trades : [];
  const out = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const id = String(x.id == null ? '' : x.id), usd = fin(x.usd) ? x.usd : fin(x.pnl) ? x.pnl : null;
    if (!/^[\w.\-]{1,40}$/.test(id) || usd === null) continue;
    const t = x.entry && fin(x.entry.t) ? x.entry.t : fin(x.t) ? x.t : null;
    const day = okYmd(x.day) ? x.day : t !== null ? new Date(t * 1000).toISOString().slice(0, 10) : '';
    if (!day) continue;
    out.push({ id, day, usd, r: fin(x.r) ? x.r : null, side: /short/i.test(String(x.side || '')) ? 'SHORT' : 'LONG', qty: fin(x.qty) ? Math.round(x.qty) : 0 });
  }
  out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.id < b.id ? 1 : -1));
  return out.slice(0, 200);
}

const RATINGS = new Set(['plan', 'hesitated', 'interfered']), MOODS = new Set(['calm', 'fomo', 'revenge', 'bored', 'tired']);
/** the Journal's entries ({ [tradeId]: { rating, mood } }), cleaned; accepts the whole journal.v1 store or just its entries */
export function normEntries(raw) {
  const src = raw && typeof raw === 'object' ? (raw.entries && typeof raw.entries === 'object' ? raw.entries : raw) : {};
  const out = {};
  for (const [id, e] of Object.entries(src).slice(0, 2000)) {
    if (!/^[\w.\-]{1,40}$/.test(id) || !e || typeof e !== 'object') continue;
    const o = {}; if (RATINGS.has(e.rating)) o.rating = e.rating; if (MOODS.has(e.mood)) o.mood = e.mood;
    if (o.rating || o.mood) out[id] = o;
  }
  return out;
}

export function money(v) { const n = Math.round(Number(v) || 0); return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US'); }
export function moneyS(v) { const n = Math.round(Number(v) || 0); return n === 0 ? '$0' : (n > 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US'); }
export function rText(r) { return fin(r) ? (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(2) + 'R' : 'R n/a'; }
/** a dollar figure with its R, always together */
export const both = (usd, r) => moneyS(usd) + ' (' + rText(r) + ')';

/** the habits that cost the most: what the trades with that habit earned less than your followed-plan trades did, in $ and R. Top 3 (cost above zero only). */
export function habits(trades, entries) {
  const b = {}, add = (k, t) => { const x = b[k] || (b[k] = { n: 0, usd: 0, r: 0, nr: 0 }); x.n++; x.usd += t.usd; if (t.r != null) { x.r += t.r; x.nr++; } };
  for (const t of trades) {
    const e = entries[t.id]; if (!e) continue;
    if (e.rating) add(e.rating, t);
    if (e.mood && e.mood !== 'calm') add(e.mood, t);
  }
  const base = b.plan || null, baseUsd = base ? base.usd / base.n : 0, baseR = base && base.nr ? base.r / base.nr : null;
  const out = [];
  for (const k of Object.keys(HABITS)) {
    const x = b[k]; if (!x) continue;
    const cost = Math.max(0, x.n * (baseUsd - x.usd / x.n)), costR = baseR != null && x.nr ? Math.max(0, x.nr * (baseR - x.r / x.nr)) : null;
    if (cost <= 0) continue;
    out.push({ key: k, name: HABITS[k].name, rule: HABITS[k].rule, n: x.n, usd: x.usd, cost: Math.round(cost * 100) / 100, costR, vsPlan: !!base });
  }
  out.sort((a, c) => c.cost - a.cost);
  return { top: out.slice(0, 3), planAvg: base ? { n: base.n, usd: baseUsd, r: baseR } : null, rated: Object.keys(b).length ? trades.filter((t) => entries[t.id]).length : 0 };
}

// ------------------------------------------------------------------------------------------------ spaced repetition
export const INTERVALS = [1, 2, 4, 8, 16];
/** a card for every trade the journal marks as a mistake (interfered, hesitated, or a bad mood on a losing / unplanned trade); newest first, at most 12 */
export function cardsFromMistakes(trades, entries) {
  const out = [];
  for (const t of trades) {
    const e = entries[t.id]; if (!e) continue;
    const key = e.rating === 'interfered' || e.rating === 'hesitated' ? e.rating : e.mood && e.mood !== 'calm' && (t.usd < 0 || e.rating !== 'plan') ? e.mood : null;
    if (!key || !HABITS[key]) continue;
    const word = { interfered: 'you touched the trade by hand', hesitated: 'you hesitated', fomo: 'you chased (FOMO)', revenge: 'it was a revenge trade', bored: 'you traded out of boredom', tired: 'you were tired' }[key];
    out.push({ id: 'c-' + t.id, front: t.day + ' ' + t.side + ' ' + both(t.usd, t.r) + ': ' + word + '. Which rule would have held?', back: HABITS[key].rule, topic: HABITS[key].topic, habit: key });
    if (out.length >= 12) break;
  }
  return out;
}

export function dueCards(cards, srs, ymd) {
  return cards.filter((c) => !srs[c.id] || srs[c.id].due <= ymd).sort((a, b) => ((srs[a.id] || { box: -1 }).box) - ((srs[b.id] || { box: -1 }).box));
}

/** Leitner boxes: right -> next box (1, 2, 4, 8, 16 days), wrong -> back to box 0 and due tomorrow. Also counts today's review for XP. */
export function reviewCard(prog, id, ok, ymd) {
  const cur = prog.srs[id] || { box: 0, due: ymd }, box = ok ? Math.min(4, cur.box + 1) : 0, days = ok ? INTERVALS[box] : 1;
  return { ...prog, srs: { ...prog.srs, [id]: { box, due: addDays(ymd, days) } }, reviewsByDay: { ...prog.reviewsByDay, [ymd]: (prog.reviewsByDay[ymd] || 0) + 1 } };
}

// ------------------------------------------------------------------------------------------------ the weekly report card
export const GRADES = [[90, 'Alpha', 'α'], [75, 'Beta', 'β'], [60, 'Gamma', 'γ'], [0, 'Delta', 'δ']];
export function gradeFor(score) { for (const g of GRADES) if (score >= g[0]) return { name: g[1], letter: g[2], score: Math.round(score) }; return { name: 'Delta', letter: 'δ', score: 0 }; }

/** the last 7 days up to and including ymd: quiz days, average quiz score, reviews, trades with $ and R, plan-follow rate, and a grade */
export function weeklyReport(prog, trades, entries, ymd) {
  const days = []; for (let i = 6; i >= 0; i--) days.push(addDays(ymd, -i));
  const done = days.filter((d) => prog.days[d]), avg = done.length ? done.reduce((n, d) => n + prog.days[d].score, 0) / done.length : null;
  const reviews = days.reduce((n, d) => n + (prog.reviewsByDay[d] || 0), 0), set = new Set(days);
  const tw = trades.filter((t) => set.has(t.day)), usd = tw.reduce((n, t) => n + t.usd, 0), withR = tw.filter((t) => t.r != null), r = withR.length ? withR.reduce((n, t) => n + t.r, 0) : null;
  const rated = tw.filter((t) => entries[t.id] && entries[t.id].rating), plan = rated.filter((t) => entries[t.id].rating === 'plan').length;
  const parts = [[done.length / 7 * 100, 0.5]];
  if (avg != null) parts.push([avg / 5 * 100, 0.2]);
  if (rated.length) parts.push([plan / rated.length * 100, 0.3]);
  const w = parts.reduce((n, p) => n + p[1], 0), score = parts.reduce((n, p) => n + p[0] * p[1], 0) / w;
  const missed = {}; for (const d of done) for (const id of prog.days[d].miss || []) { const q = QUESTIONS.find((x) => x.id === id); if (q) missed[q.topic] = (missed[q.topic] || 0) + 1; }
  const weak = Object.keys(missed).sort((a, b) => missed[b] - missed[a])[0] || null;
  return { days, quizDays: done.length, avgScore: avg, reviews, trades: tw.length, usd, r, rated: rated.length, plan, planRate: rated.length ? plan / rated.length : null, grade: gradeFor(score), weakTopic: weak };
}

/** the demo fixture moved in time so its last quiz day is yesterday: the demo streak and the weekly card are never stale */
export function shiftDemo(fx, ymd) {
  if (!fx || typeof fx !== 'object') return null;
  const keys = fx.progress && fx.progress.days ? Object.keys(fx.progress.days).sort() : [], last = keys.length ? keys[keys.length - 1] : null;
  const delta = last ? diffDays(last, addDays(ymd, -1)) : 0, mv = (d) => (okYmd(d) ? addDays(d, delta) : d);
  const prog = emptyProg();
  if (fx.progress) {
    for (const k of keys) prog.days[mv(k)] = fx.progress.days[k];
    for (const k of Object.keys(fx.progress.reviewsByDay || {})) prog.reviewsByDay[mv(k)] = fx.progress.reviewsByDay[k];
  }
  return { trades: (fx.trades || []).map((t) => ({ ...t, day: mv(t.day) })), entries: fx.entries || {}, progress: cleanProg(prog) };
}
