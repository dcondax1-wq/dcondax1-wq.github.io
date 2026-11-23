// HELIOS core (ES module, no DOM, no network): the morning briefing. One scroll for the phone at about 01:45, 07:00 and 10:45 New York time: how today looks (calm / busy / careful, from Pythia's events.json), the drawdown left
// per account (home.json), deals that are ending (money/index.json), the three best actions (a light copy of Compass's urgent rules: a test keeps the two in agreement), whether today's Lyceum quiz is done (lyceum.v1, read only)
// and one sentence about what the bots do today (the LIT rules). Pure, so tests/test_helios_page.py calls it in node. Every dollar carries its R. It only informs: it never trades, buys or changes anything. Paper only.

export const LIT = { entryFrom: '02:00', entryTo: '15:30', flat: '15:55', target: '8R' };       // the live LIT rules (STRATEGY.md): entries 02:00-15:30 ET, flat 15:55, one trade a day, target banked at 8R
export const ACCOUNTS = {
  zlarior: { key: 'zlarior', name: 'Zlarior', size: '50K', mll: 2000, risk: 425 },
  atlas: { key: 'atlas', name: 'ATLAS', size: '25K', mll: 1000, risk: 150 },
  blitz: { key: 'blitz', name: 'BLITZ', size: '25K', mll: 1000, risk: 120 },
};
export const ORDER = ['zlarior', 'atlas', 'blitz'];
export const SLOTS = {
  pre: { key: 'pre', at: '01:45', title: 'Before London', hello: 'Good night, early bird', next: 'Entries open at 02:00 ET.' },
  morning: { key: 'morning', at: '07:00', title: 'Morning', hello: 'Good morning', next: 'The bot is in its London-to-New York window, one trade a day at most.' },
  ny: { key: 'ny', at: '10:45', title: 'Before the New York afternoon', hello: 'Good day', next: `Entries stay open until ${LIT.entryTo} ET, then everything is flat by ${LIT.flat} ET.` },
};
const IMPACT_RANK = { closed: 4, high: 3, med: 2, low: 1, calm: 0 };
export const LOOK = { calm: 'calm', busy: 'busy', careful: 'careful' };

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rWord(usd, risk, est) { const u = num(usd), k = num(risk); if (u == null || !k) return '0.0R'; const r = Math.round((u / k) * 10) / 10; return (est ? '~' : '') + (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R'; }
export const both = (usd, risk, est) => `${moneyS(usd)} (${rWord(usd, risk, est)})`;
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;
export function hoursText(h) { return h < 1 ? 'under an hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; }
export function timeWord(hm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); if (!m) return ''; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'} ET`; }

// ------------------------------------------------------------------------------------------------ the clock (New York)
export function etParts(nowMs) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nowMs)), g = (t) => p.find((x) => x.type === t).value;
    return { ymd: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute') };
  } catch (_) { return { ymd: new Date(nowMs).toISOString().slice(0, 10), min: 0 }; }
}
export const dowOf = (ymd) => (new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7;       // Monday = 0, like Pythia's events.json
export function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** which briefing it is: before 05:00 ET the 01:45 one, before 09:30 the 07:00 one, else the 10:45 one */
export function slotOf(nowMs, force) {
  if (force && SLOTS[force]) return SLOTS[force];
  const m = etParts(nowMs).min;
  return m < 300 ? SLOTS.pre : m < 570 ? SLOTS.morning : SLOTS.ny;
}

// ------------------------------------------------------------------------------------------------ how today looks (Pythia's events.json)
/** today's events, dated ones plus the weekly rules (a light copy of Pythia's eventsOn; a test keeps them in agreement) */
export function eventsOn(j, ymd) {
  if (!isObj(j)) return [];
  const out = (Array.isArray(j.events) ? j.events : []).filter((e) => isObj(e) && e.date === ymd && str(e.title)).map((e) => ({ time: /^\d{1,2}:\d{2}$/.test(String(e.time || '')) ? e.time : null, kind: str(e.kind, 12), title: str(e.title, 120), impact: ['high', 'med', 'low'].includes(e.impact) ? e.impact : 'low', closed: e.closed === true, partial: e.partial === true, closeEt: str(e.close_et, 5) || null }));
  for (const w of Array.isArray(j.weekly) ? j.weekly : []) {
    if (!isObj(w) || num(w.dow) == null || dowOf(ymd) !== w.dow || (Array.isArray(w.skip) && w.skip.includes(ymd)) || !str(w.title) || out.some((e) => e.kind === w.kind)) continue;
    out.push({ time: /^\d{1,2}:\d{2}$/.test(String(w.time || '')) ? w.time : null, kind: str(w.kind, 12), title: str(w.title, 120), impact: ['high', 'med', 'low'].includes(w.impact) ? w.impact : 'low', closed: false, partial: false, closeEt: null });
  }
  return out.sort((a, b) => ((a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0));
}
export function dayRisk(evs) { let best = 'calm'; for (const e of evs) { const r = e.closed ? 'closed' : e.impact; if (IMPACT_RANK[r] > IMPACT_RANK[best]) best = r; } return best; }
/** "today looks calm / busy / careful": careful = a high-impact release or a closed or early-closing market, busy = a medium one, calm = nothing or only a light one */
export function lookOf(j, ymd) {
  const evs = eventsOn(j, ymd), risk = dayRisk(evs), early = evs.some((e) => e.partial || e.kind === 'early');
  const look = risk === 'closed' || risk === 'high' || early ? 'careful' : risk === 'med' ? 'busy' : 'calm';
  const top = evs.filter((e) => IMPACT_RANK[e.closed ? 'closed' : e.impact] === IMPACT_RANK[risk]).concat(evs.filter((e) => e.partial || e.kind === 'early'))[0] || null;
  const why = !evs.length ? 'Nothing is scheduled today.' : risk === 'closed' ? 'The market is closed: no signals and no trade.' : look === 'careful' ? `${top ? top.title : 'A big release'}${top && top.time ? ' at ' + timeWord(top.time) : ''}: the price can spike both ways.` : look === 'busy' ? `${top.title}${top.time ? ' at ' + timeWord(top.time) : ''}: a medium release, a little extra movement.` : `Only light releases today (${evs.map((e) => e.title).slice(0, 2).join(', ')}).`;
  return { look, word: look, risk, why, events: evs, have: isObj(j) && Array.isArray(j.events) };
}

// ------------------------------------------------------------------------------------------------ the accounts, deals, quiz
export function matchKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}
export function accountView(key, a) {
  const P = ACCOUNTS[key], base = { key, name: P.name, size: P.size, has: false, mll: P.mll, room: null, dll: null, dllUsed: 0, today: null, risk: P.risk, est: true, connected: null, paused: false };
  if (!isObj(a)) return base;
  const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : a, pnl = isObj(a.pnl) ? a.pnl : {}, st = isObj(a.stats) ? a.stats : {}, conn = isObj(a.conn) ? a.conn : {};
  const loss = num(st.avg_loss) || num(a.risk), mll = num(ev.mll) || P.mll, room = num(ev.room);
  return { ...base, has: true, mll, room: room == null ? null : Math.max(0, Math.min(mll, room)), dll: num(ev.dll), dllUsed: Math.max(0, num(ev.dll_used) != null ? num(ev.dll_used) : num(a.dllUsed) || 0),
    today: num(pnl.today) != null ? num(pnl.today) : num(ev.today) != null ? num(ev.today) : num(a.today), risk: loss ? Math.abs(loss) : P.risk, est: !loss, connected: typeof conn.connected === 'boolean' ? conn.connected : typeof a.connected === 'boolean' ? a.connected : null, paused: !!a.paused };
}
// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the published file says "hidden_bots" (top or board),
// the Zenith page's window.OLY_HIDDEN when there; a hidden BLITZ is left out
const hiddenOf = (h) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : null;
  return (k) => (L ? L.map(String).includes(k) : !!(globalThis.OLY_HIDDEN && globalThis.OLY_HIDDEN.has(k))); };
export function buildAccounts(home) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [], found = {};
  for (const a of list) { const k = matchKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const hid = hiddenOf(home);
  return { have: isObj(home) && Array.isArray(home.accounts), accounts: ORDER.filter((k) => !(k === 'blitz' && hid('blitz'))).map((k) => accountView(k, found[k])) };
}
export function health(a) {
  if (!a.has || a.room == null) return 'off';
  const f = a.room / a.mll, d = a.dll ? a.dllUsed / a.dll : 0;
  return a.room <= 0 || f < 0.25 || d >= 0.8 ? 'bad' : f < 0.5 || d >= 0.5 ? 'warn' : 'ok';
}
export function accountLine(a) {
  if (!a.has || a.room == null) return `${a.name} ${a.size}: no live numbers yet (max loss ${money(a.mll)}).`;
  const day = a.today != null ? ` Today ${both(a.today, a.risk, a.est)}.` : '';
  return `${a.name} ${a.size}: ${drawdownLine(a.room, a.mll)}.${day} One full stop costs about ${money(a.risk)} (1.0R${a.est ? ', an estimate' : ''}).`;
}
export function expiresMs(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return null;
  const t = v.trim(), ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T23:59:59Z' : t);
  return Number.isFinite(ms) ? ms : null;
}
/** deals that end within 48 hours, soonest first: [{ title, hours, usd, stream }] (example streams are ignored) */
export function dealsEnding(money_, nowMs) {
  const out = [], rows = isObj(money_) && Array.isArray(money_.streams) ? money_.streams : [];
  for (const s of rows) {
    if (!isObj(s) || s.status === 'sample') continue;
    for (const i of Array.isArray(s.items) ? s.items : []) {
      if (!isObj(i) || !str(i.title)) continue; const em = expiresMs(i.expires); if (em == null) continue; const h = (em - nowMs) / 3600000;
      if (h >= 0 && h <= 48) out.push({ title: str(i.title, 90), hours: h, usd: num(i.usd), stream: str(s.name || s.id, 20) });
    }
  }
  return out.sort((a, b) => a.hours - b.hours);
}
/** the Lyceum quiz today (lyceum.v1 read only): { done, score, streak, known } */
export function quizStatus(raw, ymd) {
  let j = raw;
  if (typeof raw === 'string') { if (raw.length > 400000) return { known: false, done: false, score: null, streak: 0 }; try { j = JSON.parse(raw); } catch (_) { j = null; } }
  if (!isObj(j) || !isObj(j.days)) return { known: false, done: false, score: null, streak: 0 };
  const d = j.days[ymd], done = isObj(d) && num(d.score) != null;
  let day = done ? ymd : addDays(ymd, -1), n = 0;
  while (isObj(j.days[day]) && n < 400) { n++; day = addDays(day, -1); }
  return { known: true, done, score: done ? Math.max(0, Math.min(5, Math.round(num(d.score)))) : null, streak: n };
}

// ------------------------------------------------------------------------------------------------ the three actions (a light copy of Compass's urgent rules; tests/test_helios_page.py keeps the two in agreement)
const ageH = (obj, now) => {
  if (!isObj(obj)) return null;
  for (const k of ['t', 'generated_at', 'asof', 'updated', 'upto']) {
    const v = obj[k]; let ms = null;
    if (typeof v === 'number' && Number.isFinite(v)) ms = v < 1e11 ? v * 1000 : v; else if (typeof v === 'string' && Number.isFinite(Date.parse(v))) ms = Date.parse(v);
    if (ms != null) return Math.max(0, (now - ms) / 3600000);
  }
  return null;
};
export function actions(inp, nowMs) {
  const accts = buildAccounts(inp.home).accounts.filter((a) => a.has), out = [];
  const worst = accts.filter((a) => a.room != null && a.mll).sort((x, y) => x.room / x.mll - y.room / y.mll)[0] || null;
  const add = (id, title, why, usd, urgency, tone) => out.push({ id, title, why, usd: usd != null && usd > 0 ? Math.round(usd) : null, urgency, score: urgency + (usd > 0 ? Math.min(30, usd / 30) : 0), tone });
  const off = accts.filter((a) => a.connected === false);
  if (off.length) add('bots_off', `Bot not connected: ${off.map((a) => a.name).join(', ')}`, 'Open NinjaTrader on the PC and check the connection. A bot that is not connected cannot take its setup.', null, 96, 'bad');
  const dll = accts.filter((a) => a.dll && a.dllUsed / a.dll >= 0.8);
  if (dll.length) { const left = dll.reduce((s, a) => s + Math.max(0, a.dll - a.dllUsed), 0); add('dll_near', `Stop for the day: daily loss nearly used (${dll.map((a) => a.name).join(', ')})`, `Only ${money(left)} of the daily loss is left. Take no extra trade by hand; tomorrow is a new day.`, left, 92, 'warn'); }
  if (worst && worst.room / worst.mll < 0.25) add('dd_low', `${drawdownLine(worst.room, worst.mll)} (${worst.name})`, 'Stay small: one more big loss could end the eval, so no extra trades by hand.', worst.room, 90, 'bad');
  else if (worst && worst.room / worst.mll < 0.5) add('dd_half', `${drawdownLine(worst.room, worst.mll)} (${worst.name})`, 'Half the room is used: skip any extra trade by hand and let the bot size down.', worst.room, 68, 'warn');
  const haveHome = isObj(inp.home) && Array.isArray(inp.home.accounts), streams = isObj(inp.money) && Array.isArray(inp.money.streams) ? inp.money.streams.filter((s) => isObj(s) && str(s.id)) : [], haveMoney = streams.length > 0;
  const bad = [];
  if (!haveHome) bad.push('account numbers missing'); else { const a = ageH(inp.home, nowMs); if (a != null && a > 36) bad.push(`account numbers ${hoursText(a)} old`); }
  if (!haveMoney) bad.push('money data missing'); else { const old = streams.filter((s) => s.status === 'stale' || (num(s.age_min) != null && s.age_min > 360 && s.status !== 'sample')); if (old.length) bad.push('money: ' + old.map((s) => str(s.name || s.id, 16)).join(', ')); }
  if (bad.length) add('feeds_old', 'Feeds are old: open the PC and run tools/bat/STATUS.bat', `Old or missing: ${bad.join('; ')}. tools/bat/STATUS.bat shows what is stuck; tools/bat/RUN_MONEY.bat refreshes the money data.`, null, 66, 'warn');
  const deal = dealsEnding(inp.money, nowMs)[0];
  if (deal) add('deal_soon', `A deal ends in ${hoursText(deal.hours)}: ${deal.title}`, `Check it on the firm's own page and use it only if you were buying anyway${deal.usd ? ` (about ${money(deal.usd)}, an estimate)` : ''}.`, deal.usd, Math.round(62 + (48 - deal.hours) / 48 * 22), 'warn');
  const calm = accts.length && !off.length && !accts.some((a) => a.paused) && !(worst && worst.room / worst.mll < 0.5) && !dll.length;
  if (calm) add('idle', 'Do nothing: the bots are watching', `${worst ? drawdownLine(worst.room, worst.mll) + ` (${worst.name}). ` : ''}The bot trades about 2 to 4 times a week, so quiet days are normal. Forcing a trade is the usual way to lose.`, null, 34, 'ok');
  return out.sort((a, b) => (b.score - a.score));
}

// ------------------------------------------------------------------------------------------------ the plan for the bots today (the LIT rules)
export function planSentence(look, slot) {
  const rules = `LIT trades its normal rules: entries ${LIT.entryFrom} to ${LIT.entryTo} ET, at most one trade, the stop beyond the sweep with the size following the stop, the target banked at ${LIT.target}, flat by ${LIT.flat} ET.`;
  const top = look.events.filter((e) => IMPACT_RANK[e.closed ? 'closed' : e.impact] === IMPACT_RANK[look.risk])[0];
  if (look.risk === 'closed') return 'The market is closed today: no signal and no trade. Nothing for the bots or for you to do.';
  const extra = look.look === 'careful' ? ` ${top ? top.title + (top.time ? ' at ' + timeWord(top.time) : '') : 'A big release'} can move the price both ways; LIT has no news pause, so no change is made for you. Sitting that part out is your call.` : look.look === 'busy' ? ' A medium release is on the calendar: expect a little extra movement.' : '';
  return `${rules}${extra} ${slot.next}`;
}

// ------------------------------------------------------------------------------------------------ the whole briefing
/** inp = { events, home, money, lyceum }; slotKey optional. Returns the model the page shows and the text it copies. */
export function build(inp, nowMs, slotKey) {
  const i = isObj(inp) ? inp : {}, et = etParts(nowMs), slot = slotOf(nowMs, slotKey), look = lookOf(i.events, et.ymd);
  const acc = buildAccounts(i.home), deals = dealsEnding(i.money, nowMs), acts = actions(i, nowMs).slice(0, 3), quiz = quizStatus(i.lyceum, et.ymd);
  const plan = planSentence(look, slot);
  const accOk = acc.accounts.filter((a) => a.has && a.room != null);
  const signs = [
    { id: 'day', ok: look.look === 'calm', text: look.look === 'calm' ? 'The day looks calm' : `The day looks ${look.look}` },
    { id: 'dd', ok: accOk.length > 0 && accOk.every((a) => health(a) === 'ok'), text: accOk.length ? (accOk.every((a) => health(a) === 'ok') ? 'Drawdown is a safe distance on every account' : 'An account is getting close to its floor') : 'No live account numbers yet' },
    // a "connected" is only news when the report is fresh: olympus/truth.js leaves it null for an old PC report, and null is no good sign
    { id: 'bots', ok: accOk.length > 0 && !acc.accounts.some((a) => a.has && (a.connected === false || a.paused)) && acc.accounts.some((a) => a.has && a.connected !== null), text: acc.accounts.some((a) => a.has && a.connected === false) ? 'A bot is not connected' : acc.accounts.some((a) => a.has && a.connected !== null) ? 'The bots are connected' : 'No fresh word from the bots' },
    { id: 'feeds', ok: !acts.some((a) => a.id === 'feeds_old') && acc.have, text: acts.some((a) => a.id === 'feeds_old') || !acc.have ? 'The feeds are old or missing' : 'The feeds are fresh' },
    { id: 'quiz', ok: quiz.done, text: quiz.done ? `Today's quiz is done (${quiz.score} of 5)` : quiz.known ? 'Today\'s quiz is not done yet' : 'No quiz progress on this phone yet' },
    { id: 'calm', ok: acts.length > 0 && acts[0].tone === 'ok', text: acts.length && acts[0].tone === 'ok' ? 'Nothing needs you: waiting is the action' : 'Something needs you' },
  ];
  const good = signs.filter((s) => s.ok).length;
  const m = { ymd: et.ymd, min: et.min, slot, look, accounts: acc.accounts, haveAccounts: acc.have, deals, actions: acts, quiz, plan, signs, good, total: signs.length, rise: Math.round((0.2 + 0.7 * good / signs.length) * 1000) / 1000 };
  m.text = textOf(m);
  return m;
}
export function lookWords(look) { return { calm: 'Today looks calm', busy: 'Today looks busy', careful: 'Today looks careful' }[look.look]; }
/** the briefing as plain text for the Copy button */
export function textOf(m) {
  const L = [`${m.slot.hello}. HELIOS, ${m.slot.title} briefing (${m.slot.at} ET), ${m.ymd}.`, '', `${lookWords(m.look)}. ${m.look.why}`, ''];
  L.push('Accounts:'); for (const a of m.accounts) L.push('- ' + accountLine(a));
  L.push('', 'Deals ending:'); if (m.deals.length) for (const d of m.deals.slice(0, 3)) L.push(`- ${d.title} (${d.stream}), ends in ${hoursText(d.hours)}${d.usd ? `, about ${money(d.usd)} (estimate)` : ''}`); else L.push('- none in the next 48 hours');
  L.push('', 'Do first:'); if (m.actions.length) m.actions.forEach((a, k) => L.push(`${k + 1}. ${a.title} (${a.usd ? money(a.usd) + ' at stake, estimate' : 'free'})`)); else L.push('- nothing');
  L.push('', m.quiz.done ? `Quiz: done today, ${m.quiz.score} of 5, ${m.quiz.streak} day${m.quiz.streak === 1 ? '' : 's'} in a row.` : m.quiz.known ? `Quiz: not done today (${m.quiz.streak} day streak).` : 'Quiz: no progress on this phone yet.', '', `Plan for the bots: ${m.plan}`, '', 'Estimates, not promises. HELIOS only informs: it never trades.');
  return L.join('\n');
}
export function jarvisCard(m) {
  return { name: 'Helios', level: m.look.look === 'careful' ? 'warn' : 'ok', look: m.look.look, good: `${m.good} of ${m.total}`, line: `${lookWords(m.look)}. ${m.actions[0] ? m.actions[0].title : 'Nothing needs you.'}` };
}

// ------------------------------------------------------------------------------------------------ the fixture (DEMO): relative times made absolute
export function demoInputs(fx, nowMs) {
  const f = isObj(fx) ? fx : {}, et = etParts(nowMs), iso = (h) => new Date(nowMs - h * 3600000).toISOString();
  const events = { v: 1, updated: et.ymd, weekly: [], events: (Array.isArray(f.events) ? f.events : []).filter((e) => isObj(e) && num(e.day) != null).map((e) => ({ date: addDays(et.ymd, e.day), time: e.time, kind: e.kind, title: e.title, impact: e.impact })), undated: [] };
  const home = isObj(f.home) ? JSON.parse(JSON.stringify(f.home)) : { accounts: [] }; home.asof = iso(0.2);
  const money_ = isObj(f.money) ? JSON.parse(JSON.stringify(f.money)) : { streams: [] };
  for (const s of money_.streams || []) for (const it of s.items || []) if (num(it.expires_in_h) != null) { it.expires = new Date(nowMs + it.expires_in_h * 3600000).toISOString(); delete it.expires_in_h; }
  const days = {}; const q = isObj(f.quiz) ? f.quiz : {};
  for (let k = q.done_today ? 0 : 1; k < (q.done_today ? 0 : 1) + (num(q.streak) || 0); k++) days[addDays(et.ymd, -k)] = { score: 4, xp: 40, miss: [] };
  return { events, home, money: money_, lyceum: { v: 1, days } };
}
