// FORUM core (ES module, no DOM, no network, no clock of its own): the morning briefing as plain functions.
//   etParts(date)                 -> { day 'YYYY-MM-DD', h (decimal hours), dow 0 Sunday .. 6 Saturday } in New York time
//   parseClock('08:40')           -> 8.667 (or null)
//   nextEvent(p)                  -> { id, name, at (decimal hours), mins (until it), tomorrow } the next point of the trading day
//   phase(h)                      -> { id: 'night' | 'dawn' | 'morning' | 'open' | 'afternoon' | 'dusk', name }
//   sky(h)                        -> { sun: -1..1 (height of the sun), az: 0..1 (east to west), day: 0..1 (how much daylight) }
//   brief(pan, home, p)           -> the six scrolls of the avenue, each { id, title, glyph, tone, stat, line, body, color }
//   oath()                        -> the three pledges
//   streak(sealed, today)         -> { cur, best } market days in a row the oath was sealed (today counts once sealed)
// Data it reads (all already published by the site): ../pantheon/pantheon.json (the Council of the Gods: gauge, VIX, rates,
// calendar) and ../home.json accounts[].eval (balance, floor, target). Nothing here is a signal: the Forum only reads the
// morning out loud, in plain words. The strategy text mirrors STRATEGY.md (LIT, paper / Sim only).

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : null);
const txt = (x, n = 140) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '').replace(/\s+/g, ' ').trim().slice(0, n);

// ------------------------------------------------------------------------------------------------ the New York clock
export function etParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day: `${p.year}-${p.month}-${p.day}`, h: (+p.hour % 24) + +p.minute / 60, dow };
}
export function parseClock(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] + +m[2] / 60 : null;
}
export const clockText = (h) => { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const minsText = (m) => (m < 60 ? `${Math.max(0, Math.round(m))} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`);

const DAILY = [{ id: 'london', name: 'London session', at: 3 }, { id: 'ny', name: 'NY open', at: 9.5 }, { id: 'flat', name: 'Bot flat', at: 15 + 55 / 60 }, { id: 'close', name: 'Cash close', at: 16 },
  { id: 'globex', name: 'Futures reopen', at: 18 }];

export function nextEvent(p) {
  const open = p.dow >= 1 && p.dow <= 5, sunday = p.dow === 0;
  if (sunday) return p.h < 18 ? { id: 'globex', name: 'Futures reopen', at: 18, mins: (18 - p.h) * 60, tomorrow: false } : { id: 'london', name: 'London session', at: 3, mins: (24 - p.h + 3) * 60, tomorrow: true };
  if (p.dow === 6) return { id: 'globex', name: 'Futures reopen (Sunday)', at: 18, mins: (24 - p.h + 18) * 60, tomorrow: true };
  if (p.dow === 5 && p.h >= 16) return { id: 'globex', name: 'Futures reopen (Sunday)', at: 18, mins: (24 - p.h + 24 + 18) * 60, tomorrow: true };
  for (const e of DAILY) if (open && e.at > p.h) return { ...e, mins: (e.at - p.h) * 60, tomorrow: false };
  return { id: 'london', name: 'London session', at: 3, mins: (24 - p.h + 3) * 60, tomorrow: true };
}

export function phase(h) {
  if (h < 3 || h >= 20) return { id: 'night', name: 'Night' };
  if (h < 6.5) return { id: 'dawn', name: 'Before the dawn' };
  if (h < 9.5) return { id: 'morning', name: 'Pre-market' };
  if (h < 15.9) return { id: 'open', name: 'The market is open' };
  if (h < 18) return { id: 'afternoon', name: 'After the close' };
  return { id: 'dusk', name: 'Evening' };
}

/** the sun by the New York hour: up from 6 to 18, highest at noon; az runs east (0) to west (1) */
export function sky(h) {
  const t = (h - 6) / 12, up = t > 0 && t < 1;
  const sun = up ? Math.sin(Math.PI * t) : -Math.min(1, Math.abs(Math.sin(Math.PI * ((h + 6) % 24) / 12)) * 0.6 + 0.2);
  return { sun, az: Math.max(0, Math.min(1, t)), day: Math.max(0, Math.min(1, (sun + 0.15) / 0.5)) };
}

// ------------------------------------------------------------------------------------------------ the scrolls
const fmtUsd = (x) => { const v = Math.round(+x || 0), s = '$' + Math.abs(v).toLocaleString('en-US'); return v < 0 ? '-' + s : s; };
const godOf = (pan, key) => (isObj(pan) && Array.isArray(pan.gods) ? pan.gods.find((g) => isObj(g) && g.key === key) : null) || null;
const readingOf = (g) => (g && isObj(g.reading) ? txt(g.reading.text, 24) : '');
const changeOf = (g) => (g && isObj(g.change) ? [txt(g.change.text, 24), txt(g.change.window, 20)].filter(Boolean).join(' / ') : '');

export function evalOf(home) {
  const accts = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [];
  const a = accts.find((x) => isObj(x) && isObj(x.eval) && /50k/i.test(String(x.plan || x.id || '')) && x.kind !== 'paper');
  if (!a) return null;
  const e = a.eval, bal = num(e.balance), floor = num(e.floor), tgt = num(e.target_balance);
  if (bal == null || floor == null || tgt == null) return null;
  return { name: txt(a.name || a.plan, 30), balance: bal, floor, target: tgt, room: bal - floor, toTarget: tgt - bal, session: num(e.session), sessions: num(e.sessions), locked: !!e.locked, status: txt(e.status, 20), mll: num(e.mll) };
}

export function brief(pan, home, p) {
  const out = [];
  const C = isObj(pan) && isObj(pan.council) ? pan.council : null;
  // 1. the Council
  if (C && num(C.gauge) != null) {
    const g = num(C.gauge), lean = g >= 62 ? 'lean risk-on' : g <= 38 ? 'lean risk-off' : 'are split';
    out.push({ id: 'council', title: 'The Council', glyph: 'Σ', tone: g >= 62 ? 'calm' : g <= 38 ? 'storm' : 'watch', stat: `${txt(C.label, 12) || 'Mixed'} ${Math.round(g)}`,
      line: `The gods ${lean}.`, body: `${txt(C.text, 220)} ${txt(C.honesty, 160)}`.trim(), color: '#e0b060' });
  } else out.push({ id: 'council', title: 'The Council', glyph: 'Σ', tone: 'info', stat: 'Silent', line: 'No verdict published yet.', body: 'The Pantheon has not published a council verdict. The Forum never guesses one.', color: '#e0b060' });
  // 2. fear (VIX)
  const ares = godOf(pan, 'ares'), vix = ares && isObj(ares.reading) ? num(ares.reading.value) : null;
  if (vix != null) {
    const band = vix < 15 ? ['calm', 'Calm waters'] : vix < 20 ? ['calm', 'Normal'] : vix < 27 ? ['watch', 'Lively'] : ['storm', 'Stormy'];
    out.push({ id: 'fear', title: 'Fear (VIX)', glyph: 'Ω', tone: band[0], stat: `VIX ${readingOf(ares)}`, line: `${band[1]}. ${changeOf(ares)}`.trim(),
      body: `${band[1]}: the VIX is ${readingOf(ares)} (${changeOf(ares) || 'no change shown'}). The bot's target is a VIX-band move, so a livelier day means a wider target and a wider stop, never a bigger bet: size follows the stop.`, color: '#c96a4a' });
  } else out.push({ id: 'fear', title: 'Fear (VIX)', glyph: 'Ω', tone: 'info', stat: 'No VIX', line: 'The volatility reading is missing.', body: 'The Pantheon has no volatility reading right now.', color: '#c96a4a' });
  // 3. the calendar
  const ath = godOf(pan, 'athena'), when = readingOf(ath);
  if (when) {
    const tone = /today/i.test(when) ? 'storm' : /tomorrow/i.test(when) ? 'watch' : 'calm';
    out.push({ id: 'calendar', title: 'The calendar', glyph: 'Α', tone, stat: when, line: changeOf(ath) || 'The next high-impact release.', body: `${txt(C && C.caution, 200) || `Next high-impact release: ${when}.`} Big news can move NQ in seconds; the bot has no news filter, so know the time.`, color: '#e0b060' });
  } else out.push({ id: 'calendar', title: 'The calendar', glyph: 'Α', tone: 'info', stat: 'No data', line: 'No calendar reading.', body: 'The macro calendar is not in the Pantheon feed right now.', color: '#e0b060' });
  // 4. the money tide (rates + liquidity)
  const zeus = godOf(pan, 'zeus'), pos = godOf(pan, 'poseidon');
  if (zeus || pos) out.push({ id: 'money', title: 'The money tide', glyph: 'Π', tone: 'info', stat: readingOf(zeus) ? `10y ${readingOf(zeus)}` : readingOf(pos),
    line: [readingOf(zeus) && `10y yield ${readingOf(zeus)} (${changeOf(zeus)})`, readingOf(pos) && `liquidity ${readingOf(pos)}`].filter(Boolean).join(', '),
    body: `Rates and liquidity set the tide NQ floats on: ${readingOf(zeus) ? `the 10-year yield is ${readingOf(zeus)} (${changeOf(zeus)})` : 'no yield reading'}${readingOf(pos) ? `; liquidity ${readingOf(pos)} (${changeOf(pos)})` : ''}. Context only: it did not predict the next day in 2021-26.`, color: '#4b7a99' });
  else out.push({ id: 'money', title: 'The money tide', glyph: 'Π', tone: 'info', stat: 'No data', line: 'No rates or liquidity reading.', body: 'Rates and liquidity are not in the Pantheon feed right now.', color: '#4b7a99' });
  // 5. the eval
  const ev = evalOf(home);
  if (ev) {
    const tone = ev.room < 600 ? 'storm' : ev.room < 1200 ? 'watch' : 'calm';
    out.push({ id: 'eval', title: 'The eval', glyph: 'Φ', tone, stat: `${fmtUsd(ev.room)} room`, line: `${fmtUsd(ev.toTarget)} to the target${ev.session ? `, session ${ev.session}${ev.sessions ? ' of ' + ev.sessions : ''}` : ''}.`,
      body: `${ev.name}: balance ${fmtUsd(ev.balance)}, floor ${fmtUsd(ev.floor)}${ev.locked ? ' (locked)' : ''}, target ${fmtUsd(ev.target)}. You are ${fmtUsd(ev.room)} above the floor and ${fmtUsd(ev.toTarget)} below the target. One full stop-out is about one trade; the Labyrinth shows what a size does to that.`, color: '#e0b060' });
  } else out.push({ id: 'eval', title: 'The eval', glyph: 'Φ', tone: 'info', stat: 'No eval', line: 'No eval account is published.', body: 'The site does not show a Builder 50K eval right now.', color: '#e0b060' });
  // 6. the plan
  out.push({ id: 'plan', title: "Today's plan", glyph: 'Λ', tone: 'info', stat: 'LIT, hands off', line: 'One trade at most. The bot does the work.',
    body: 'LIT: a sweep of a level, then a 5-minute CISD entry. One trade a day, entries 02:00-15:30 ET, the stop one tick beyond the sweep extreme, the target banked at 8R, breakeven at 1R, flat at 15:55. Paper and Sim only. Your job today: do not touch it.', color: '#aeb86e' });
  return out;
}

/** The desk: four more tablets beside the avenue, from what the site already publishes (home.json accounts, an optional home.kalshi) and the
 *  Planner on this phone (planner: { tasks: [{ title, date, done }], events: [{ title, date }] } or null). Always four, never blank, never a guess. */
export function desk(home, planner, p) {
  const out = [], day = p && p.day ? p.day : '1970-01-01', tomorrow = addDays(day, 1);
  const signed = (v) => (v < 0 ? '-' : '+') + fmtUsd(Math.abs(v));
  const accts = isObj(home) && Array.isArray(home.accounts) ? home.accounts.filter(isObj) : [];
  if (accts.length) {
    const ev = accts.filter((a) => isObj(a.eval)), parts = accts.slice(0, 3).map((a) => {
      const e = isObj(a.eval) ? a.eval : null, b = e ? num(e.balance) : null, s0 = e ? num(e.start_balance) : null;
      return `${txt(a.name || a.id, 22)}${b != null && s0 != null ? ' ' + signed(b - s0) : ''}`;
    });
    out.push({ id: 'bots', title: 'The bots', glyph: 'Ζ', tone: 'calm', stat: `${accts.length} account${accts.length === 1 ? '' : 's'}`, line: `${ev.length} on an eval. ${parts.join(' · ')}` });
  } else out.push({ id: 'bots', title: 'The bots', glyph: 'Ζ', tone: 'info', stat: 'No accounts', line: 'The site publishes no account list right now.' });
  const k = isObj(home) && isObj(home.kalshi) ? home.kalshi : null, kb = k ? num(k.balance) : null, kw = k ? num(k.week_pnl) : null;
  if (k && (kb != null || kw != null)) out.push({ id: 'kalshi', title: 'Kalshi', glyph: 'Κ', tone: kw != null && kw < 0 ? 'watch' : 'calm', stat: kw != null ? `${signed(kw)} this week` : `${fmtUsd(kb)} balance`,
    line: `${kb != null ? 'Balance ' + fmtUsd(kb) + '. ' : ''}${k.running === false ? 'The bot reports it is stopped.' : 'Real money, the prediction bot.'}` });
  else out.push({ id: 'kalshi', title: 'Kalshi', glyph: 'Κ', tone: 'info', stat: 'No feed here', line: 'The Kalshi bot is not in this site\'s data yet. The Kalshi app has its own feed.' });
  const dateOf = (v) => { const s = txt(v, 30); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };
  const evs = isObj(planner) && Array.isArray(planner.events) ? planner.events.filter(isObj) : [], tasks = isObj(planner) && Array.isArray(planner.tasks) ? planner.tasks.filter(isObj) : [];
  const today = evs.filter((e) => dateOf(e.date) === day), next = evs.filter((e) => dateOf(e.date) === tomorrow);
  if (isObj(planner)) out.push({ id: 'events', title: 'Calendar', glyph: 'Ε', tone: today.length ? 'watch' : 'calm', stat: today.length ? `${today.length} today` : 'Clear today',
    line: today.length ? today.slice(0, 2).map((e) => txt(e.title || e.name, 40)).join(' · ') : next.length ? `Tomorrow: ${txt(next[0].title || next[0].name, 40)}` : 'Nothing on your calendar until later.' });
  else out.push({ id: 'events', title: 'Calendar', glyph: 'Ε', tone: 'info', stat: 'No planner', line: 'Open the Planner on this phone and its events show here.' });
  const open = tasks.filter((t) => !t.done && dateOf(t.date) && dateOf(t.date) <= day), done = tasks.filter((t) => t.done && dateOf(t.date) === day);
  if (isObj(planner)) out.push({ id: 'todos', title: 'To-dos', glyph: 'Τ', tone: open.length > 3 ? 'watch' : 'calm', stat: open.length ? `${open.length} open` : 'All clear',
    line: open.length ? open.slice(0, 2).map((t) => txt(t.title || t.name, 40)).join(' · ') : `${done.length} done today. Nothing is waiting.` });
  else out.push({ id: 'todos', title: 'To-dos', glyph: 'Τ', tone: 'info', stat: 'No planner', line: 'Your tasks show here once the Planner has some.' });
  return out;
}

export const oath = () => [
  { id: 'plan', text: 'I follow the plan: no manual orders' },
  { id: 'revenge', text: 'No revenge trade, whatever happens' },
  { id: 'journal', text: 'I write the journal tonight' },
];

// ------------------------------------------------------------------------------------------------ the streak
const utc = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const addDays = (day, n) => new Date(utc(day) + n * 864e5).toISOString().slice(0, 10);
const isMarket = (day) => { const w = new Date(utc(day)).getUTCDay(); return w >= 1 && w <= 5; };

/** consecutive market days sealed. Today does not break the streak while it is still open; weekends are skipped. */
export function streak(sealed, today) {
  const s = isObj(sealed) ? sealed : {};
  const days = Object.keys(s).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && isMarket(d)).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    let p = prev && addDays(d, -1);
    while (p && !isMarket(p) && p > prev) p = addDays(p, -1);
    run = prev && p === prev ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }
  let cur = 0, d = isMarket(today) && !s[today] ? addDays(today, -1) : today;
  while (!isMarket(d)) d = addDays(d, -1);
  while (s[d] && isMarket(d)) { cur++; d = addDays(d, -1); while (!isMarket(d)) d = addDays(d, -1); }
  return { cur, best: Math.max(best, cur) };
}

// ------------------------------------------------------------------------------------------------ JOB 4+5 follow-up (2026-11-04): money today
// moneyToday (the drawdown left as "$X of $max loss", the room, the pace), riskPlan (what size the room allows at four stop widths),
// tradingDay (the bot's day as a timeline with a countdown), newsGate (the next release and what to do about it). Pure, never a signal.

const MICRO = { pv: 2, comm: 1.9, slip: 0.5 };       // MNQ: $2 a point, $1.90 round turn, 2 ticks of slip (research/lit/mffu_rules.json)

/** the eval in money words: drawdown left of the max loss, the room, the pace to pass inside the 10 sessions of 2 weeks */
export function moneyToday(ev) {
  if (!ev) return { has: false };
  const mll = ev.mll || 2000, room = Math.max(0, ev.room), frac = Math.max(0, Math.min(1, room / mll));
  const total = ev.sessions || 10, done = ev.session != null ? ev.session : null, left = done != null ? Math.max(1, total - done) : null;
  const tone = room <= 0 ? 'storm' : frac < 0.25 ? 'storm' : frac < 0.55 ? 'watch' : 'calm';
  return { has: true, room, mll, frac, tone, balance: ev.balance, floor: ev.floor, locked: ev.locked, toTarget: Math.max(0, ev.toTarget), session: done, sessions: total, left,
    perSession: left ? Math.max(0, ev.toTarget) / left : null,
    ddText: room > mll ? `Drawdown left ${fmtUsd(room)} (floor locked, max loss ${fmtUsd(mll)})` : `Drawdown left ${fmtUsd(room)} of ${fmtUsd(mll)} max loss`,
    paceText: left != null ? (ev.toTarget <= 0 ? 'The target is reached.' : `${fmtUsd(ev.toTarget)} to the target: about ${fmtUsd(Math.max(0, ev.toTarget) / left)} a session over the ${left} session${left === 1 ? '' : 's'} left in the 2 weeks.`) : `${fmtUsd(ev.toTarget)} to the target.` };
}

/** what the room allows: one stop-out may cost `frac` of the room (the bot uses 0.8 in an eval; a person should keep it lower), at four stop widths */
export function riskPlan(ev, frac = 0.4) {
  if (!ev) return { has: false, rows: [] };
  const budget = Math.max(0, ev.room) * frac, rows = [10, 20, 30, 40].map((pts) => {
    const loss1 = (pts + MICRO.slip) * MICRO.pv + MICRO.comm, n = Math.floor(budget / loss1);
    return { pts, n, risk: n * loss1, win2: n * (pts * 2 * MICRO.pv - MICRO.comm), roomAfter: ev.room - n * loss1 };
  });
  return { has: true, frac, budget, rows, text: `One stop-out may cost ${fmtUsd(budget)} (${Math.round(frac * 100)}% of the ${fmtUsd(ev.room)} room). The wider the stop, the fewer micros: size follows the stop.` };
}

const seg = (id, name, a, b, kind) => ({ id, name, a, b, kind });
/** the bot's day, ET: segments for a 24 h bar, where "now" is, and one plain line with the countdown (weekends: closed) */
export function tradingDay(p) {
  const segs = [seg('asia', 'Asia', 0, 2, 'rest'), seg('window', 'Bot entry window', 2, 15.5, 'go'), seg('manage', 'Manage / flat 15:55', 15.5, 15 + 55 / 60, 'warn'), seg('after', 'After the close', 15 + 55 / 60, 17, 'rest'), seg('break', 'Break', 17, 18, 'rest'), seg('globex', 'Globex', 18, 24, 'rest')];
  const wk = p.dow >= 1 && p.dow <= 5, h = p.h;
  let line, state;
  if (!wk && !(p.dow === 0 && h >= 18)) { state = 'closed'; line = 'The market is closed for the weekend. The bot waits for Sunday 18:00 ET.'; }
  else if (h >= 2 && h < 15.5 && wk) { state = 'open'; line = `The bot may enter now. The window closes at 15:30 ET, in ${minsText((15.5 - h) * 60)}. One trade a day at most.`; }
  else if (h >= 15.5 && h < 15 + 55 / 60 && wk) { state = 'manage'; line = `No new entries. Any open trade is closed by 15:55 ET, in ${minsText((15 + 55 / 60 - h) * 60)}.`; }
  else if (h < 2 && wk) { state = 'before'; line = `The entry window opens at 02:00 ET, in ${minsText((2 - h) * 60)}. Check the drawdown and the news first.`; }
  else { state = 'after'; line = h < 18 ? 'The day is over. Flat. The next window opens at 02:00 ET.' : 'Futures are open but the bot takes no entries until 02:00 ET.'; }
  return { segs, now: h, state, line };
}

/** the next release from the Council: what it says and the one rule for it (half size or flat, never a guess at direction) */
export function newsGate(pan) {
  const ath = godOf(pan, 'athena'), when = readingOf(ath), caution = isObj(pan) && isObj(pan.council) ? txt(pan.council.caution, 200) : '';
  if (!when && !caution) return { has: false, tone: 'info', line: 'No calendar reading right now. Check the news before you trade.' };
  const today = /today/i.test(when), tomorrow = /tomorrow/i.test(when);
  return { has: true, tone: today ? 'storm' : tomorrow ? 'watch' : 'calm', when, line: `${caution || 'Next high-impact release: ' + when + '.'} ${today ? 'It is today: be flat or half size for 15 minutes either side.' : 'Spreads jump and stops slip around releases: half size or wait 15 minutes.'}` };
}
