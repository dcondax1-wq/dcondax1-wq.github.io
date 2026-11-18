// EPILOGUE core (pure: no DOM, no network, no storage): "your week in 60 seconds". Builds the Sunday review from published files only:
// home.json (the accounts), odeon/trades.json (the bot's trades), money/index.json (the money machines) and the Journal's ratings (journal.v1 entries, read only).
// Money words: every dollar result carries its R (marked ~ when the risk is a stand-in); drawdown is "used $X, left $Y of $max loss". Node-tested by tests/test_epilogue_page.py.

export const PLANS = {
  zlarior: { key: 'zlarior', name: 'MFFU 50K', bot: 'LIT', mll: 2000, risk: 425, dll: 1000 },
  atlas: { key: 'atlas', name: 'ATLAS 25K', bot: 'ATLAS', mll: 1000, risk: 150, dll: 600 },
  blitz: { key: 'blitz', name: 'BLITZ 25K', bot: 'BLITZ', mll: 1000, risk: 120, dll: 600 },
};
export const ORDER = ['zlarior', 'atlas', 'blitz'];
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);

export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rFmt(r, est) { const v = num(r); if (v == null) return 'R n/a'; const x = Math.round(v * 10) / 10 || 0; return (est ? '~' : '') + (x > 0 ? '+' : x < 0 ? '-' : '') + Math.abs(x).toFixed(1) + 'R'; }
export const both = (usd, r, est) => moneyS(usd) + ' (' + rFmt(r, est) + ')';

// ------------------------------------------------------------------------------------------------ dates (ymd strings, UTC arithmetic)
const okYmd = (s) => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = Date.parse(s + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; };
export const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export function localYmd(now) { const d = now instanceof Date ? now : new Date(now); const p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
/** the Monday of the week that holds ymd (a week runs Monday to Sunday) */
export function mondayOf(ymd) { const wd = new Date(Date.parse(ymd + 'T00:00:00Z')).getUTCDay(); return addDays(ymd, -((wd + 6) % 7)); }
export const weekDays = (monday) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (ymd) => MON[parseInt(ymd.slice(5, 7), 10) - 1] + ' ' + parseInt(ymd.slice(8, 10), 10);
export const weekLabel = (monday) => dayLabel(monday) + ' to ' + dayLabel(addDays(monday, 6));

// ------------------------------------------------------------------------------------------------ accounts and trades
export function matchKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source, a.bot, a.label].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}

/** one account of home.json (or of the demo fixture) -> { key, name, has, mll, room, used, usedPct, dll, dllUsed, weekHome, risk, est } */
export function accountView(key, a) {
  const P = PLANS[key], base = { key, name: P.name, has: false, mll: P.mll, room: null, used: null, usedPct: null, dll: P.dll, dllUsed: 0, weekHome: null, risk: P.risk, est: true };
  if (!isObj(a)) return base;
  const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, st = isObj(a.stats) ? a.stats : {};
  const mll = num(ev.mll) || num(a.mll) || P.mll, roomRaw = num(ev.room) != null ? num(ev.room) : num(a.room), room = roomRaw == null ? null : Math.max(0, Math.min(mll, roomRaw));
  const loss = num(st.avg_loss) || num(a.risk), wk = num(pnl.week) != null ? num(pnl.week) : num(a.week);
  return { ...base, has: true, mll, room, used: room == null ? null : r2(mll - room), usedPct: room == null ? null : Math.round(((mll - room) / mll) * 100), dll: num(ev.dll) || num(a.dll) || P.dll, dllUsed: num(ev.dll_used) || num(a.dllUsed) || 0,
    weekHome: wk, risk: loss ? Math.abs(loss) : P.risk, est: !loss };
}

// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the real home.json says "hidden_bots" (top or
// board); a hidden BLITZ has no card (the DEMO keeps its three)
const hiddenIn = (h, k) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : [];
  return L.map(String).includes(k); };
export function buildAccounts(home, fxAccounts) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [], found = {};
  for (const a of list) { const k = matchKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const real = Object.keys(found).length > 0;
  return { demo: !real, accounts: ORDER.filter((k) => !(real && k === 'blitz' && hiddenIn(home, 'blitz'))).map((k) => (real ? accountView(k, found[k]) : accountView(k, (Array.isArray(fxAccounts) ? fxAccounts : []).find((x) => x && x.key === k) || null))) };
}

export function normTrades(raw) {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.trades) ? raw.trades : [];
  const out = [];
  for (const t of list) {
    if (!isObj(t) || !okYmd(t.day)) continue;
    const usd = num(t.usd); if (usd == null) continue;
    const s = [t.bot, t.strat, t.label].map((x) => String(x || '')).join(' ').toLowerCase(), key = /blitz/.test(s) ? 'blitz' : /atlas/.test(s) ? 'atlas' : 'zlarior';
    out.push({ id: str(t.id, 80), day: t.day, key, src: ['real', 'paper', 'backtest'].includes(t.src) ? t.src : 'paper', side: /short/i.test(str(t.side, 8)) ? 'SHORT' : 'LONG', qty: num(t.qty), usd: r2(usd), r: num(t.r), risk: num(t.risk_usd),
      exit: str(t.exit && typeof t.exit === 'object' ? t.exit.kind : t.exit, 12).toUpperCase(), planRr: num(t.plan_rr), t: num(t.entry && t.entry.t) });
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (b.t || 0) - (a.t || 0)));
}

const RATINGS = new Set(['plan', 'hesitated', 'interfered']), MOODS = new Set(['calm', 'fomo', 'revenge', 'bored', 'tired']);
/** the Journal's ratings ({ [tradeId]: { rating, mood } }); accepts the whole journal.v1 store or just its entries */
export function normEntries(raw) {
  const src = isObj(raw) ? (isObj(raw.entries) ? raw.entries : raw) : {}, out = {};
  for (const [id, e] of Object.entries(src).slice(0, 2000)) { if (!/^[\w.\-]{1,80}$/.test(id) || !isObj(e)) continue; const o = {}; if (RATINGS.has(e.rating)) o.rating = e.rating; if (MOODS.has(e.mood)) o.mood = e.mood; if (o.rating || o.mood) out[id] = o; }
  return out;
}

// ------------------------------------------------------------------------------------------------ the rule a trade followed or broke
export const HABITS = {
  interfered: { name: 'Touching a trade by hand', rule: 'The stop and the target are set before the entry; the stop never moves away, and at 1R it goes to break-even.', goal: 'stop' },
  hesitated: { name: 'Hesitating on a valid setup', rule: 'If the rules say go, go. Size already follows the stop, so the risk is small and fixed.', goal: 'go' },
  fomo: { name: 'Chasing (FOMO)', rule: 'No setup, no trade. One trade a day, entries only 02:00 to 15:30.', goal: 'one' },
  revenge: { name: 'Revenge trading', rule: 'After a loss the day is done: one trade a day.', goal: 'one' },
  bored: { name: 'Trading from boredom', rule: 'Quiet days are normal: the plan wants 2 to 4 trades a week.', goal: 'one' },
  tired: { name: 'Trading when tired', rule: 'Tired means smaller or off, never bigger.', goal: 'flat' },
};

/** { verdict: 'followed' | 'broke' | 'info', text } for one trade, from its exit and R (and the Journal rating when there is one) */
export function ruleFor(t, entry) {
  const r = t.r, rr = r == null ? '' : ' (' + rFmt(r) + ')';
  if (entry && entry.rating === 'interfered') return { verdict: 'broke', text: 'Broke the rule: you touched this trade by hand (your Journal). The stop and target are set before the entry.' };
  if (entry && entry.rating === 'hesitated') return { verdict: 'broke', text: 'Broke the rule: you hesitated on a valid setup (your Journal). If the rules say go, go.' };
  const k = String(t.exit && typeof t.exit === 'object' ? t.exit.kind : t.exit || '').toUpperCase();
  if (k === 'STOP') return r != null && r < -1.25 ? { verdict: 'broke', text: 'Broke the rule: the loss ran past 1R' + rr + '. The stop should hold it at the protected level.' } : { verdict: 'followed', text: 'Followed the rule: the stop sat at the protected level and held the loss near 1R' + rr + '.' };
  if (k === 'TARGET') return { verdict: 'followed', text: 'Followed the rule: one target, banked' + rr + '. No greed.' };
  if (k === 'BE') return { verdict: 'followed', text: 'Followed the rule: break-even at 1R kept the day clean' + rr + '.' };
  if (k === 'EOD' || k === 'FLAT') return { verdict: 'followed', text: 'Followed the rule: flat on time (15:55)' + rr + '.' };
  if (k.indexOf('CUT') === 0) return { verdict: 'followed', text: 'Followed the rule: the 15-minute cut freed you from a trade that was not working' + rr + '.' };
  return { verdict: 'info', text: 'No rule note for this exit' + rr + '.' };
}

// ------------------------------------------------------------------------------------------------ habits, lessons, goals
export function habitsOf(trades, entries) {
  const b = {}, add = (k, t) => { const x = b[k] || (b[k] = { n: 0, usd: 0, r: 0, nr: 0 }); x.n++; x.usd += t.usd; if (t.r != null) { x.r += t.r; x.nr++; } };
  let rated = 0, plan = 0;
  for (const t of trades) { const e = entries[t.id]; if (!e) continue; if (e.rating) { add(e.rating, t); rated++; if (e.rating === 'plan') plan++; } if (e.mood && e.mood !== 'calm') add(e.mood, t); }
  const base = b.plan || null, baseUsd = base ? base.usd / base.n : 0, baseR = base && base.nr ? base.r / base.nr : null, out = [];
  for (const k of Object.keys(HABITS)) { const x = b[k]; if (!x) continue; const cost = Math.max(0, x.n * (baseUsd - x.usd / x.n)); if (cost <= 0) continue; out.push({ key: k, ...HABITS[k], n: x.n, usd: x.usd, cost: r2(cost), costR: baseR != null && x.nr ? Math.max(0, r2(x.nr * (baseR - x.r / x.nr))) : null }); }
  out.sort((a, c) => c.cost - a.cost);
  return { top: out, rated, plan };
}

export const GOALS = [
  { id: 'stop', text: 'Set every stop 1 tick beyond the sweep extreme and never move it away.' },
  { id: 'rate', text: 'Rate every trade in the Journal the same evening.' },
  { id: 'quiz', text: 'Finish the Lyceum quiz on 5 days.' },
  { id: 'one', text: 'One trade a day, and the day is done after a loss.' },
  { id: 'go', text: 'Take every setup the rules give, with the size the stop allows.' },
  { id: 'flat', text: 'Be flat by 15:55 every day. No holding.' },
];
export const goalById = (id) => GOALS.find((g) => g.id === id) || null;

/** exactly three lessons, each one plain sentence, from the week's trades and the Journal's ratings */
export function lessons(week, hab, entriesCount) {
  const out = [], tr = week.trades;
  if (hab.top.length) { const h = hab.top[0]; out.push({ id: 'habit', title: 'Your costliest habit: ' + h.name.toLowerCase(), text: h.n + ' trade' + (h.n === 1 ? '' : 's') + ' cost you about ' + money(h.cost) + (h.costR != null ? ' (about ' + h.costR.toFixed(1) + 'R)' : ' (R n/a)') + ' against your followed-plan trades (estimate). ' + h.rule }); }
  if (hab.rated) out.push({ id: 'plan', title: 'You followed the plan ' + hab.plan + ' of ' + hab.rated + ' rated trades', text: hab.plan === hab.rated ? 'Every rated trade followed the plan. Keep the same routine.' : 'The ones that did not are where the week leaked. Rate them the same evening and read the rule before the next session.' });
  const big = tr.filter((t) => t.exit === 'STOP' && t.r != null && t.r < -1.25), losses = tr.filter((t) => t.usd < 0);
  if (big.length) out.push({ id: 'stop', title: 'A loss ran past 1R', text: big.length + ' stop' + (big.length === 1 ? '' : 's') + ' lost more than 1R (worst ' + both(Math.min(...big.map((t) => t.usd)), Math.min(...big.map((t) => t.r))) + '). The stop belongs 1 tick beyond the sweep extreme and does not move away.' });
  else if (losses.length) out.push({ id: 'stop', title: 'The stop did its job', text: 'Every loss was held near 1R (' + losses.length + ' loss' + (losses.length === 1 ? '' : 'es') + '). That is the plan working.' });
  out.push({ id: 'freq', title: tr.length + ' trade' + (tr.length === 1 ? '' : 's') + ' this week', text: tr.length === 0 ? 'No trades. Quiet weeks happen; the plan does not force a trade.' : tr.length < 2 ? 'Under the 2 to 4 a week the plan expects. Fine if there was no setup; check you did not skip one.' : tr.length > 4 ? 'Above the 2 to 4 a week the plan expects. Check that each one was a valid setup.' : 'Inside the 2 to 4 a week the plan expects.' });
  if (!entriesCount) out.push({ id: 'rate', title: 'Rate your trades', text: 'Mark each trade in the Journal (followed plan, hesitated, interfered, and your mood) and next week\'s lessons will name your habits in dollars.' });
  const win = tr.filter((t) => t.usd > 0).sort((a, b) => b.usd - a.usd)[0];
  if (win) out.push({ id: 'win', title: 'Your best trade', text: both(win.usd, win.r) + ' on ' + dayLabel(win.day) + '. Repeat what the plan said, not what it felt like.' });
  out.push({ id: 'calm', title: 'Look after the basics', text: 'Flat at 15:55, one trade a day, and size that follows the stop. The boring rules pay.' });
  const seen = new Set(), res = []; for (const l of out) if (!seen.has(l.id) && res.length < 3) { seen.add(l.id); res.push(l); }
  return res;
}

/** the one goal for next week, chosen from the weakest spot, plus two other choices */
export function suggestGoal(week, hab, entriesCount) {
  let id = 'quiz';
  if (hab.top.length) id = hab.top[0].goal; else if (week.trades.some((t) => t.exit === 'STOP' && t.r != null && t.r < -1.25)) id = 'stop'; else if (!entriesCount) id = 'rate';
  const main = goalById(id), rest = GOALS.filter((g) => g.id !== id);
  return { goal: main, others: [rest[0], rest[1]].filter(Boolean) };
}

// ------------------------------------------------------------------------------------------------ the money machines (money/index.json, written by tools/money_engine.py)
export function normMoney(idx) {
  const list = isObj(idx) && Array.isArray(idx.streams) ? idx.streams : [];
  const out = list.filter(isObj).map((s) => {
    const items = Array.isArray(s.items) ? s.items.filter(isObj) : [], top = items[0] || null, um = isObj(s.usd_month) ? s.usd_month : {};
    return { id: str(s.id, 24), name: str(s.name, 40) || str(s.id, 24), status: ['ok', 'stale', 'sample', 'none'].includes(s.status) ? s.status : 'stale', headline: str(s.headline, 200), base: num(um.base), low: num(um.low), high: num(um.high), top: top ? { title: str(top.title, 100), usd: num(top.usd) } : null };
  }).filter((s) => s.id && s.status !== 'none');
  const t = isObj(idx) && isObj(idx.total) ? num(idx.total.base) : null;
  return { streams: out.slice(0, 6), total: t };
}

// ------------------------------------------------------------------------------------------------ the history (this phone, localStorage 'epilogue.v1')
export const emptyHist = () => ({ v: 1, weeks: {} });
export function cleanHist(h) {
  const out = emptyHist();
  if (!isObj(h) || !isObj(h.weeks)) return out;
  for (const k of Object.keys(h.weeks).filter(okYmd).sort().slice(-26)) {
    const w = h.weeks[k]; if (!isObj(w) || num(w.usd) == null) continue;
    const g = isObj(w.goal) && goalById(w.goal.id) ? { id: w.goal.id, done: !!w.goal.done } : null;
    out.weeks[k] = { usd: r2(num(w.usd)), trades: Math.max(0, Math.min(999, Math.round(num(w.trades) || 0))), rated: Math.max(0, Math.round(num(w.rated) || 0)), plan: Math.max(0, Math.round(num(w.plan) || 0)), goal: g };
  }
  return out;
}
/** keep this week's numbers; the goal and its tick are kept as they were unless a new goal is given */
export function saveWeek(h, monday, rec) {
  const prev = h.weeks[monday] || {}, goal = rec.goal !== undefined ? rec.goal : prev.goal || null;
  return cleanHist({ ...h, weeks: { ...h.weeks, [monday]: { ...prev, ...rec, goal } } });
}
export function tickGoal(h, monday, done) { const w = h.weeks[monday]; if (!w || !w.goal) return h; return cleanHist({ ...h, weeks: { ...h.weeks, [monday]: { ...w, goal: { ...w.goal, done: !!done } } } }); }
export function pastWeeks(h, monday) { return Object.keys(h.weeks).filter((k) => k < monday).sort().reverse().slice(0, 12).map((k) => ({ week: k, label: weekLabel(k), ...h.weeks[k] })); }

// ------------------------------------------------------------------------------------------------ the review
/** every input is optional. current = the week is this week (home.json's week figure may stand in for missing trades). */
export function buildReview(o) {
  const monday = o.monday, days = weekDays(monday), set = new Set(days), entries = o.entries || {};
  const acc = buildAccounts(o.home, o.fxAccounts), all = normTrades(o.trades);
  const wk = all.filter((t) => set.has(t.day) && t.src !== 'backtest');
  const accounts = acc.accounts.map((a) => {
    const tr = wk.filter((t) => t.key === a.key), n = tr.length;
    let usd = r2(tr.reduce((s, t) => s + t.usd, 0)), r = null, est = false, from = 'trades';
    if (n) { const rs = tr.filter((t) => t.r != null); if (rs.length === n) r = r2(tr.reduce((s, t) => s + t.r, 0)); else { r = r2(usd / a.risk); est = true; } }
    else if (o.current && a.has && a.weekHome != null) { usd = r2(a.weekHome); r = r2(usd / a.risk); est = true; from = 'home'; }
    else { r = 0; est = false; from = 'none'; }
    return { ...a, week: usd, weekR: r, weekEst: est || from === 'home', n, from, wins: tr.filter((t) => t.usd > 0).length, losses: tr.filter((t) => t.usd < 0).length };
  });
  const usd = r2(accounts.reduce((s, a) => s + a.week, 0));   // the total is dollars only: accounts risk different amounts per trade, so their R is never added
  const sorted = [...wk].sort((a, b) => b.usd - a.usd), best = sorted.length && sorted[0].usd > 0 ? sorted[0] : null, worst = sorted.length && sorted[sorted.length - 1].usd < 0 ? sorted[sorted.length - 1] : null;
  const pack = (t) => (t ? { ...t, rule: ruleFor(t, entries[t.id]), account: PLANS[t.key].name } : null);
  const hab = habitsOf(wk, entries), entriesCount = Object.keys(entries).length, week = { trades: wk }, ls = lessons(week, hab, entriesCount), sg = suggestGoal(week, hab, entriesCount);
  const perDay = days.map((d) => r2(wk.filter((t) => t.day === d).reduce((s, t) => s + t.usd, 0))), traded = days.map((d) => wk.some((t) => t.day === d));
  const worstRoom = accounts.filter((a) => a.has && a.room != null).sort((a, b) => a.room / a.mll - b.room / b.mll)[0] || null;
  return { monday, label: weekLabel(monday), days, demo: !!o.demo, current: !!o.current, usd, trades: wk.length, accounts, best: pack(best), worst: pack(worst), perDay, traded, hab, lessons: ls, goal: sg, worstRoom,
    money: normMoney(o.money), plan: hab.plan, rated: hab.rated, headline: headline(usd, wk.length, weekLabel(monday)) };
}

function headline(usd, n, label) {
  if (!n && usd === 0) return 'Week of ' + label + ': no trades. A quiet week is a valid week.';
  return 'Week of ' + label + ': ' + moneyS(usd) + ' on ' + n + ' trade' + (n === 1 ? '' : 's') + '.';
}

/** the plain-text summary the Copy button puts on the clipboard (no network) */
export function shareText(m, lastGoal) {
  const L = ['EPILOGUE, my week (' + m.label + ')' + (m.demo ? ' [EXAMPLE numbers, not real]' : ''), 'Total (dollars only, each account has its own 1R): ' + moneyS(m.usd) + ', ' + m.trades + ' trade' + (m.trades === 1 ? '' : 's')];
  for (const a of m.accounts) if (a.has || a.n) L.push('- ' + a.name + ': ' + both(a.week, a.weekR, a.weekEst || a.from === 'home') + ', 1R = ' + money(a.risk) + (a.room != null ? '; drawdown used ' + money(a.used) + ', left ' + money(a.room) + ' of ' + money(a.mll) + ' max loss' : ''));
  if (m.best) L.push('Best: ' + both(m.best.usd, m.best.r) + ' (' + m.best.rule.text.split(':')[0] + ')');
  if (m.worst) L.push('Worst: ' + both(m.worst.usd, m.worst.r) + ' (' + m.worst.rule.text.split(':')[0] + ')');
  L.push('Lessons:'); m.lessons.forEach((l, i) => L.push((i + 1) + '. ' + l.title));
  if (lastGoal) L.push('Last week\'s goal: ' + lastGoal.text + (lastGoal.done ? ' (done)' : ' (not ticked)'));
  L.push('Goal for next week: ' + m.goal.goal.text);
  return L.join('\n');
}

/** the demo moved to this week: fixture trades carry a weekday offset (0 = Monday); one past week sits in the history */
export function demoData(fx, monday) {
  if (!isObj(fx)) return null;
  const trades = (Array.isArray(fx.trades) ? fx.trades : []).map((t) => ({ ...t, day: addDays(monday, Math.max(0, Math.min(6, Math.round(num(t.off) || 0)))) }));
  const prev = addDays(monday, -7), hist = { v: 1, weeks: {} };
  if (isObj(fx.history)) for (const [off, w] of Object.entries(fx.history)) hist.weeks[addDays(monday, -7 * Math.max(1, parseInt(off, 10) || 1))] = w;
  return { trades, entries: normEntries(fx.entries), accounts: fx.accounts, money: fx.money, hist: cleanHist(hist), prev };
}
