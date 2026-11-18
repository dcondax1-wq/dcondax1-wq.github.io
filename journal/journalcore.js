// MNEMOSYNE (OLYMPUS trade journal): the pure part (no DOM, no network): the trades from the already-published Odeon JSON, the journal's store
// ('journal.v1', this phone only), the maths in dollars, the weekly review with ONE rule, export / import / Markdown.
//   normTrades(raw, n)            Odeon trades.json (or the demo fixture) -> the last n trades, newest first: { id, day, t, side, qty, usd, r, src, label }
//   readStore / writeStore        localStorage['journal.v1'] = { v: 1, entries: { <trade id>: { rating, mood, note, at } }, rule: { week, id, on }, demoSeeded }
//   setEntry(store, id, patch)    validates: rating plan | hesitated | interfered, mood calm | fomo | revenge | bored | tired, note <= 140 chars
//   insights(trades, store)       dollars by rating and by mood, what interfering cost, the worst mood, the streak of days following the plan
//   weekly(trades, store)         the review of the week of the latest trade, in plain words, with one rule for next week
//   markdown(...)                 the journal as Markdown for Obsidian;  exportJSON / parseImport / mergeStores
// Paper research only: the journal never changes the bot; it never touches the network.

export const KEY = 'journal.v1';
export const RATINGS = [['plan', 'Followed plan'], ['hesitated', 'Hesitated'], ['interfered', 'Interfered']];
export const MOODS = [['calm', 'Calm'], ['fomo', 'FOMO'], ['revenge', 'Revenge'], ['bored', 'Bored'], ['tired', 'Tired']];
export const NOTE_MAX = 140;
const MAX_ENTRIES = 2000, ID_RE = /^[A-Za-z0-9._:-]{1,80}$/, MAX_IMPORT = 1_000_000;
const RATING_SET = new Set(RATINGS.map((r) => r[0])), MOOD_SET = new Set(MOODS.map((m) => m[0]));
export const ratingLabel = (k) => (RATINGS.find((r) => r[0] === k) || [0, ''])[1];
export const moodLabel = (k) => (MOODS.find((m) => m[0] === k) || [0, ''])[1];

// ------------------------------------------------------------------------------------------------ numbers and words
const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v);
export const money = (v) => (fin(v) && Math.round(v) !== 0 ? (v < 0 ? '-' : '+') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US') : '$0');
export const plainMoney = (v) => '$' + Math.abs(Math.round(+v || 0)).toLocaleString('en-US');
export const pad2 = (x) => String(x).padStart(2, '0');

const SRC = { real: 'MFFU eval', paper: 'paper', backtest: 'replay', demo: 'demo' };
let etf = null;
/** 'Wed 03:43 ET' for an epoch second (America/New_York; a fixed -5 h label if the browser has no time zones) */
export function etLabel(t) {
  if (!fin(t)) return '';
  try {
    etf ||= new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(etf.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.hour}:${p.minute} ET`;
  } catch (e) { const d = new Date((t - 18000) * 1000); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} ET`; }
}

// ------------------------------------------------------------------------------------------------ the trades
/** Odeon's trades.json (or the demo fixture) -> the last n trades with a dollar result, newest first. Only what the journal needs is kept. */
export function normTrades(raw, n = 30) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.trades) ? raw.trades : [];
  const out = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const id = String(x.id ?? '');
    const usd = fin(x.usd) ? +x.usd : fin(x.pnl) ? +x.pnl : null;
    if (!ID_RE.test(id) || usd === null) continue;
    const t = fin(x.entry?.t) ? +x.entry.t : fin(x.t) ? +x.t : null;
    const day = typeof x.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.day) ? x.day : t !== null ? new Date(t * 1000).toISOString().slice(0, 10) : '';
    if (!day) continue;
    out.push({ id, day, t: t ?? Date.parse(day + 'T14:00:00Z') / 1000, side: /short/i.test(x.side || '') ? 'SHORT' : 'LONG', qty: fin(x.qty) ? Math.round(+x.qty) : 0, usd, r: fin(x.r) ? +x.r : null,
               src: SRC[x.src] ? x.src : 'backtest', label: String(x.label || x.strat || '').slice(0, 60) });
  }
  out.sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : -1));
  return out.slice(0, Math.max(1, n));
}
export const srcLabel = (s) => SRC[s] || s;

// ------------------------------------------------------------------------------------------------ the store (this phone only)
export const emptyStore = () => ({ v: 1, entries: {}, rule: null, checks: [], demoSeeded: false });
export function cleanNote(s) { return String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX); }
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const o = {};
  if (RATING_SET.has(e.rating)) o.rating = e.rating;
  if (MOOD_SET.has(e.mood)) o.mood = e.mood;
  const note = cleanNote(e.note);
  if (note) o.note = note;
  if (!o.rating && !o.mood && !o.note) return null;
  o.at = fin(e.at) ? Math.round(+e.at) : 0;
  return o;
}
export const CHECK_MAX = 30;
/** the pre-trade checks kept: { at, a: 'ynn-y' (the 5 answers, - = none), v: fine | wait }; at most the last 30 */
function cleanChecks(c) {
  const out = [];
  if (Array.isArray(c)) for (const x of c.slice(-CHECK_MAX)) if (x && typeof x === 'object' && fin(x.at) && /^[yn-]{5}$/.test(String(x.a)) && (x.v === 'fine' || x.v === 'wait')) out.push({ at: Math.round(+x.at), a: String(x.a), v: x.v });
  return out;
}
export function cleanStore(s) {
  const out = emptyStore();
  if (!s || typeof s !== 'object' || typeof s.entries !== 'object' || s.entries === null) return out;
  for (const [id, e] of Object.entries(s.entries).slice(0, MAX_ENTRIES)) { const c = ID_RE.test(id) ? cleanEntry(e) : null; if (c) out.entries[id] = c; }
  if (s.rule && typeof s.rule === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(s.rule.week || '') && /^[a-z_]{2,24}$/.test(s.rule.id || '')) out.rule = { week: s.rule.week, id: s.rule.id, on: !!s.rule.on };
  out.checks = cleanChecks(s.checks);
  out.demoSeeded = !!s.demoSeeded;
  return out;
}
export function readStore(ls) { try { return cleanStore(JSON.parse(ls.getItem(KEY) || 'null')); } catch (e) { return emptyStore(); } }
export function writeStore(ls, store) { try { ls.setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; } }

/** set / change / clear one trade's entry: patch = { rating?, mood?, note? } (null or '' clears that field); returns the entry or null */
export function setEntry(store, id, patch, now = Date.now() / 1000) {
  if (!ID_RE.test(String(id))) return null;
  const cur = { ...(store.entries[id] || {}) };
  for (const k of ['rating', 'mood', 'note']) if (k in patch) { if (patch[k] === null || patch[k] === '' || patch[k] === undefined) delete cur[k]; else cur[k] = patch[k]; }
  cur.at = Math.round(now);
  const c = cleanEntry(cur);
  if (c) { c.at = Math.round(now); store.entries[id] = c; } else delete store.entries[id];
  return c;
}
export function setRule(store, week, id, on) { store.rule = { week, id, on: !!on }; return store.rule; }

// ------------------------------------------------------------------------------------------------ the dollars
const bucket = () => ({ n: 0, usd: 0, avg: 0 });
function fold(b, usd) { b.n++; b.usd += usd; b.avg = b.usd / b.n; }

/** the days (newest first) with every trade of the day rated 'followed plan', counted from the latest day: { streak, best } */
export function streaks(trades, store) {
  const days = new Map();
  for (const t of trades) {
    const d = days.get(t.day) || { all: 0, plan: 0 };
    d.all++; if (store.entries[t.id]?.rating === 'plan') d.plan++;
    days.set(t.day, d);
  }
  const order = [...days.keys()].sort().reverse();
  let streak = 0, run = 0, best = 0, open = true;
  for (const k of order) {
    const d = days.get(k), ok = d.plan === d.all && d.all > 0;
    if (ok) { run++; best = Math.max(best, run); if (open) streak = run; } else { run = 0; open = false; }
  }
  return { streak, best, days: order.length };
}

/** the whole picture in dollars for a list of trades and the journal's entries */
export function insights(trades, store) {
  const byRating = { plan: bucket(), hesitated: bucket(), interfered: bucket() }, byMood = {};
  for (const [k] of MOODS) byMood[k] = bucket();
  let rated = 0, net = 0;
  for (const t of trades) {
    net += t.usd;
    const e = store.entries[t.id];
    if (!e) continue;
    if (e.rating) { fold(byRating[e.rating], t.usd); rated++; }
    if (e.mood) fold(byMood[e.mood], t.usd);
  }
  let worst = null;
  for (const [k] of MOODS) { const b = byMood[k]; if (b.n >= 1 && b.usd < 0 && (!worst || b.usd < worst.usd)) worst = { mood: k, usd: b.usd, n: b.n, avg: b.avg }; }
  const st = streaks(trades, store), I = byRating.interfered, P = byRating.plan;
  const lines = [];
  if (I.n || P.n) {
    lines.push(`Trades where you interfered: ${money(I.usd)} (${I.n}). Followed the plan: ${money(P.usd)} (${P.n}).`);
    if (I.n && P.n) lines.push(`Per trade: interfering ${money(I.avg)} against the plan ${money(P.avg)}: a gap of ${plainMoney(P.avg - I.avg)} every time you touch it.`);
  } else lines.push('Rate a few trades below to see what your habits cost.');
  if (worst) lines.push(`Your worst mood costs ${plainMoney(worst.usd)}: ${moodLabel(worst.mood)} (${worst.n} trade${worst.n === 1 ? '' : 's'}).`);
  return { n: trades.length, rated, unrated: trades.length - rated, net, byRating, byMood, worst, streak: st.streak, bestStreak: st.best, tradeDays: st.days, lines };
}

// ------------------------------------------------------------------------------------------------ the weekly review
const addDays = (day, k) => new Date(Date.parse(day + 'T12:00:00Z') + k * 86400000).toISOString().slice(0, 10);
/** Monday of the week of a 'YYYY-MM-DD' day */
export function mondayOf(day) { const wd = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7; return addDays(day, -wd); }

const RULES = {
  interfered: (d) => ({ id: 'interfered', text: 'Once I am in, I do not touch the stop or the target. If I want to, I write one line in the journal first and wait 10 minutes.', why: `Interfering cost ${plainMoney(d)} last week.` }),
  fomo: (d) => ({ id: 'fomo', text: 'No entry after a move I missed. I wait for the bot\'s next setup and take only that one.', why: `Trades taken in FOMO cost ${plainMoney(d)}.` }),
  revenge: (d) => ({ id: 'revenge', text: 'After a loss I step away from the screen for 10 minutes and open the journal before anything else.', why: `Revenge trades cost ${plainMoney(d)}.` }),
  bored: (d) => ({ id: 'bored', text: 'I close the charts outside the bot\'s window (02:00 to 15:30 ET). No bored clicks.', why: `Trades taken bored cost ${plainMoney(d)}.` }),
  tired: (d) => ({ id: 'tired', text: 'If I slept badly I trade the minimum size, or not at all, that day.', why: `Tired trades cost ${plainMoney(d)}.` }),
  hesitated: (d) => ({ id: 'hesitated', text: 'I take every setup the bot sends. Hesitating is a decision too, and I write down why I skipped.', why: `Hesitating cost ${plainMoney(d)}.` }),
  rate: () => ({ id: 'rate', text: 'I rate every trade within 10 seconds of the close, while I still remember it.', why: 'Most of the week is not rated yet, so the dollars are a guess.' }),
  keep: () => ({ id: 'keep', text: 'Same rules next week. The plan is working: keep following it and keep rating.', why: 'Nothing in the journal costs you money this week.' }),
};
/** ONE rule: the habit that cost the most dollars; the rule ladder is fixed so the same journal always gives the same rule */
export function pickRule(ins) {
  if (ins.rated < 2 && ins.n >= 3) return RULES.rate();
  const I = ins.byRating.interfered;
  const cand = [];
  if (I.n && I.usd < 0) cand.push(['interfered', I.usd]);
  if (ins.byRating.hesitated.n && ins.byRating.hesitated.usd < 0) cand.push(['hesitated', ins.byRating.hesitated.usd]);
  for (const [k] of MOODS) if (k !== 'calm' && ins.byMood[k].n && ins.byMood[k].usd < 0) cand.push([k, ins.byMood[k].usd]);
  if (cand.length) { cand.forEach((c, i) => c.push(i)); cand.sort((a, b) => a[1] - b[1] || a[2] - b[2]); return RULES[cand[0][0]](cand[0][1]); }
  return ins.rated < Math.ceil(ins.n / 2) ? RULES.rate() : RULES.keep();
}

/** the week of the latest trade: plain-words lines and ONE rule to try next week */
export function weekly(trades, store) {
  if (!trades.length) return null;
  const last = trades.reduce((m, t) => (t.day > m ? t.day : m), ''), from = mondayOf(last), to = addDays(from, 6);
  const wk = trades.filter((t) => t.day >= from && t.day <= to), ins = insights(wk, store);
  const wins = wk.filter((t) => t.usd > 0).length;
  const lines = [`Week of ${from}: ${wk.length} trade${wk.length === 1 ? '' : 's'}, ${money(ins.net)} in all (${wins} won), ${ins.rated} of ${wk.length} rated.`];
  const I = ins.byRating.interfered, P = ins.byRating.plan;
  if (I.n) lines.push(`You interfered ${I.n} time${I.n === 1 ? '' : 's'}: ${money(I.usd)}.${P.n ? ` Following the plan: ${money(P.usd)} (${P.n}).` : ''}`);
  else if (P.n) lines.push(`You followed the plan on ${P.n} trade${P.n === 1 ? '' : 's'}: ${money(P.usd)}.`);
  if (ins.worst) lines.push(`Worst mood: ${moodLabel(ins.worst.mood)}, ${money(ins.worst.usd)}.`);
  const rule = pickRule(ins);
  return { from, to, n: wk.length, net: ins.net, rated: ins.rated, ins, lines, rule };
}

// ------------------------------------------------------------------------------------------------ export, import, Markdown
export function exportJSON(store) { return JSON.stringify({ v: 1, app: 'mnemosyne', exported: new Date().toISOString().slice(0, 10), entries: store.entries, rule: store.rule, checks: store.checks || [] }, null, 1); }
/** a pasted or loaded JSON text -> { ok, store, n, error }; nothing is trusted: ids, ratings, moods and notes are validated and capped */
export function parseImport(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Nothing to import' };
  if (text.length > MAX_IMPORT) return { ok: false, error: 'That file is too big for a journal' };
  let j;
  try { j = JSON.parse(text); } catch (e) { return { ok: false, error: 'That is not JSON' }; }
  if (!j || typeof j !== 'object' || typeof j.entries !== 'object' || j.entries === null || Array.isArray(j.entries)) return { ok: false, error: 'No journal entries in it' };
  const s = cleanStore(j), n = Object.keys(s.entries).length;
  if (!n && Object.keys(j.entries).length) return { ok: false, error: 'No valid entries in it' };
  return { ok: true, store: s, n };
}
/** merge an imported journal into the current one: the newer entry of the same trade wins */
export function mergeStores(a, b) {
  const out = cleanStore(a);
  for (const [id, e] of Object.entries(b.entries)) { const cur = out.entries[id]; if (!cur || (e.at || 0) >= (cur.at || 0)) out.entries[id] = e; }
  if (b.rule && !out.rule) out.rule = b.rule;
  const have = new Set(out.checks.map((c) => c.at));
  out.checks = out.checks.concat((b.checks || []).filter((c) => !have.has(c.at))).sort((x, y) => x.at - y.at).slice(-CHECK_MAX);
  return out;
}
const esc = (s) => String(s).replace(/[\\`*_{}\[\]<>|#]/g, (c) => '\\' + c);
/** the journal as Markdown (Obsidian): the money, the review, then every trade with its rating, mood and note */
export function markdown(trades, store, opts = {}) {
  const ins = insights(trades, store), wk = weekly(trades, store), day = opts.today || new Date().toISOString().slice(0, 10);
  const L = ['---', 'tags: [journal, trading, mnemosyne]', `date: ${day}`, `demo: ${opts.demo ? 'true' : 'false'}`, '---', '', `# Trade journal: last ${trades.length} trades`, '', '## What my habits cost', ...ins.lines.map((x) => '- ' + esc(x))];
  L.push(`- Days in a row following the plan: ${ins.streak} (best ${ins.bestStreak}).`);
  if (wk) { L.push('', '## Weekly review', ...wk.lines.map((x) => '- ' + esc(x)), '', `**One rule for next week:** ${esc(wk.rule.text)}`, `_${esc(wk.rule.why)}_`); }
  L.push('', '## Trades');
  for (const t of trades) {
    const e = store.entries[t.id] || {};
    L.push('', `### ${t.day} ${esc(etLabel(t.t))} ${t.side}${t.qty ? ` ${t.qty} micro${t.qty === 1 ? '' : 's'}` : ''} ${money(t.usd)}${t.r !== null ? ` (${t.r >= 0 ? '+' : ''}${t.r}R)` : ''} [${srcLabel(t.src)}]`,
           `- Rating: ${e.rating ? ratingLabel(e.rating) : 'not rated'} · Mood: ${e.mood ? moodLabel(e.mood) : 'none'}`);
    if (e.note) L.push(`- Note: ${esc(e.note)}`);
  }
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------------------------------------------ the last 9 trades, in one sentence (the Jarvis card and the weekly recap)
export function recent(trades, store, n = 9) {
  const w = trades.slice(0, n), ins = insights(w, store), I = ins.byRating.interfered, P = ins.byRating.plan;
  let line;
  if (!w.length || !ins.rated) line = 'Rate your last trades to see what interfering costs you.';
  else if (!I.n) line = `You did not interfere on any of your last ${w.length} trades.`;
  else line = `You interfered on ${I.n} of your last ${w.length} trades, it ${I.usd < 0 ? 'cost' : 'made'} ${plainMoney(I.usd)}.`;
  return { n: w.length, rated: ins.rated, interfered: I.n, interferedUsd: I.usd, plan: P.n, planUsd: P.usd, line };
}

// ------------------------------------------------------------------------------------------------ the pre-trade check: 5 yes / no questions from the owner's own journal
/** the 5 questions (newest trades first in `trades`); `good` is the answer that means "the plan is fine"; `hint` is what his own journal says, in dollars */
export function checkQuestions(trades, store) {
  const ins = insights(trades, store), w = ins.worst, I = ins.byRating.interfered, calm = ins.byMood.calm;
  const last2 = trades.slice(0, 2).map((t) => (store.entries[t.id] || {}).rating || null);
  let h2 = '';
  if (last2.length && last2.some((r) => !r)) h2 = 'Rate your last trades and your journal can answer this one.';
  else if (last2.length && last2.every((r) => r === 'plan')) h2 = 'Your journal says: yes, you followed it.';
  else if (last2.length) h2 = 'Your journal says: no (' + last2.map((r) => ratingLabel(r).toLowerCase()).join(', ') + ').';
  const lastT = trades[0];
  return [
    { id: 'calm', text: 'Am I calm right now?', good: 'yes', hint: calm.n ? `Your calm trades: ${money(calm.usd)} on ${calm.n}.` : '' },
    { id: 'plan2', text: 'Did I follow the plan on my last 2 trades?', good: 'yes', hint: h2 },
    { id: 'loss', text: 'Is this because of the last loss?', good: 'no', hint: lastT && lastT.usd < 0 ? `Your last trade was ${money(lastT.usd)}.` : '' },
    { id: 'touch', text: 'Am I about to change what the bot is doing: the stop, the target, the size or an extra trade?', good: 'no', hint: I.n && I.usd < 0 ? `Touching it has cost you ${plainMoney(I.usd)} on ${I.n} trade${I.n === 1 ? '' : 's'}.` : '' },
    w ? { id: 'mood', text: `Am I feeling ${moodLabel(w.mood)} right now?`, good: 'no', hint: `${moodLabel(w.mood)} trades cost you ${plainMoney(w.usd)} on ${w.n}.` }
      : { id: 'mood', text: 'Am I tired, bored or chasing a move I missed?', good: 'no', hint: '' },
  ];
}
/** answers = { calm: 'yes' | 'no', ... } -> { level: open | fine | wait, red, answered, total, headline, why, cost }; the same answers always give the same verdict */
export function checkVerdict(trades, store, answers) {
  const qs = checkQuestions(trades, store), ins = insights(trades, store), I = ins.byRating.interfered, P = ins.byRating.plan, a = answers || {};
  let answered = 0, red = 0;
  for (const q of qs) if (a[q.id] === 'yes' || a[q.id] === 'no') { answered++; if (a[q.id] !== q.good) red++; }
  const s = (n) => (n === 1 ? '' : 's');
  const cost = I.n
    ? `${I.usd < 0 ? `Interfering has cost you ${plainMoney(I.usd)}` : `Interfering made ${money(I.usd)}`} on ${I.n} trade${s(I.n)}${P.n ? `; following the plan made ${money(P.usd)} on ${P.n}.` : '.'}`
    : 'No interfering is rated yet, so there is no cost to show. Rate your trades to see yours.';
  const out = { red, answered, total: qs.length, cost };
  if (answered < qs.length) return { ...out, level: 'open', headline: `${qs.length - answered} question${s(qs.length - answered)} to go`, why: 'Answer them all. It takes about 5 seconds.' };
  if (!red) return { ...out, level: 'fine', headline: 'Fine, the bot is running the plan.', why: 'Looking is fine. Touching it is the habit that costs money, so leave it alone.' };
  return { ...out, level: 'wait', headline: 'Wait 10 minutes.',
           why: red === 1 ? 'One answer says this is not the plan. Put the phone down, set a 10-minute timer, then look again.' : `${red} answers say this is not the plan. Step away from the screen for 10 minutes. The bot keeps running the plan without you.` };
}
/** keep (or, while the answers are not complete, drop) the check made at `at`: one record per sheet opening */
export function addCheck(store, qs, answers, level, at) {
  const t = Math.round(at);
  store.checks = (store.checks || []).filter((c) => c.at !== t);
  if (level !== 'fine' && level !== 'wait') return null;
  const rec = { at: t, a: qs.map((q) => (answers[q.id] === 'yes' ? 'y' : answers[q.id] === 'no' ? 'n' : '-')).join(''), v: level };
  store.checks.push(rec); store.checks = store.checks.slice(-CHECK_MAX);
  return rec;
}
export function checkStats(store) { const c = store.checks || []; return { n: c.length, wait: c.filter((x) => x.v === 'wait').length, last: c.length ? c[c.length - 1] : null }; }

// ------------------------------------------------------------------------------------------------ the Jarvis card
export function card(trades, store, demo, now = Date.now() / 1000) {
  const ins = insights(trades, store), wk = weekly(trades, store), I = ins.byRating.interfered;
  const short = (s, n) => String(s).replace(/[<>&]/g, '').slice(0, n);
  return { v: 1, name: 'MNEMOSYNE', status: { level: demo ? 'off' : ins.unrated > ins.n / 2 ? 'warn' : 'ok', label: demo ? 'Demo journal' : `${ins.rated} of ${ins.n} rated` },
           kpis: [{ label: 'Rated', value: `${ins.rated} of ${ins.n}` }, { label: 'Interfered', value: money(I.usd) }, { label: 'Plan streak', value: `${ins.streak} day${ins.streak === 1 ? '' : 's'}` }],
           lines: [short(recent(trades, store).line, 118), short(wk ? 'Next week: ' + wk.rule.text.split('. ')[0].replace(/\.$/, '') : 'Rate your trades in 10 seconds.', 118)], t: Math.round(now), open: '#', theme: '#13100d', stale_after: 604800 };
}
