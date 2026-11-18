// COMPASS core (ES module, no DOM, no network): "what is the next best action?" It reads the site's published JSON (home.json, money/index.json, ledger/rules.json, odeon/trades.json) and the two stores kept on
// this phone (the journal ratings and the Ledger, read only), runs a TABLE OF RULES and ranks at most 5 actions for today by urgency and dollars, in plain words. Pure, so tests/test_compass_page.py calls it in node.
// Every rule has a $ or 'free' tag and a why. It only SUGGESTS: it never places an order, buys or changes anything. Paper only.
//
// A rule is { id, name, dir, tag: 'usd' | 'free', when: 'plain words for the how-it-decides list', run(ctx) -> null | { title, why, usd, urgency, tone, sig } }
//   urgency 0-100 (how soon), usd = dollars at stake or to gain (an estimate, or null), tone bad | warn | info | ok, sig = what makes it "a different action" for Done / Snooze.
//   score = urgency + min(30, usd / 30): urgency decides, dollars break ties. dir = the compass bearing the needle points to (0 north = the money at risk now, 90 east = money to gain, 180 south = habits, 270 west = feeds).

export const MAX_ACTIONS = 5;
export const SNOOZE_HOURS = 4;
export const OLD_FEED_H = 36;          // home / odeon files older than this are old (weekends are quiet, so not shorter)
export const OLD_MIN = 6 * 60;         // money streams older than this are old
export const UNRATED_DAYS = 14;        // trades of the last 14 days that have no journal rating
export const EXPORT_OLD_DAYS = 10;     // a Ledger copy older than this is old
export const RULES_OLD_DAYS = 30;      // the MFFU rulebook is re-checked every 30 days
const TONE_RANK = { bad: 0, warn: 1, info: 2, ok: 3 };

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function hoursText(h) { return h < 1 ? 'under an hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; }
export function daysText(d) { return d < 1 ? 'today' : d < 1.5 ? '1 day ago' : `${Math.round(d)} days ago`; }
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;

// ------------------------------------------------------------------------------------------------ reading the inputs
/** home.json -> accounts we can use (never throws) */
export function accountsOf(home) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [];
  return list.filter((a) => isObj(a) && !a.error).map((a) => {
    const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, conn = isObj(a.conn) ? a.conn : {};
    const target = num(ev.target) != null ? num(ev.target) : null, toTarget = num(ev.to_target);
    return { name: str(a.name || a.id, 40) || 'Account', room: num(ev.room), mll: num(ev.mll), dllUsed: num(ev.dll_used) || 0, dll: num(ev.dll), today: num(pnl.today) != null ? num(pnl.today) : num(ev.today),
      connected: typeof conn.connected === 'boolean' ? conn.connected : null, paused: !!a.paused, funded: String(a.kind || '').toLowerCase() === 'funded', target, toTarget };
  });
}
/** file age in hours from a time field (epoch seconds, epoch ms or ISO text); null when there is none */
export function ageH(obj, nowMs) {
  if (!isObj(obj)) return null;
  for (const k of ['t', 'generated_at', 'asof', 'updated', 'upto']) {
    const v = obj[k]; let ms = null;
    if (typeof v === 'number' && Number.isFinite(v)) ms = v < 1e11 ? v * 1000 : v; else if (typeof v === 'string' && Number.isFinite(Date.parse(v))) ms = Date.parse(v);
    if (ms != null) return Math.max(0, (nowMs - ms) / 3600000);
  }
  return null;
}
/** an item's `expires` (ISO date or date-time) -> ms; a date alone means the END of that day (UTC) */
export function expiresMs(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return null;
  const t = v.trim(), ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T23:59:59Z' : t);
  return Number.isFinite(ms) ? ms : null;
}
export function streamsOf(m) { return isObj(m) && Array.isArray(m.streams) ? m.streams.filter((s) => isObj(s) && str(s.id)) : []; }

/** the journal store ('journal.v1' on this phone, read only): { entries: { tradeId: { rating } } } -> the set of rated ids */
export function ratedIds(raw) {
  let j = raw;
  if (typeof raw === 'string') { if (raw.length > 400000) return new Set(); try { j = JSON.parse(raw); } catch (_) { return new Set(); } }
  const s = new Set();
  if (isObj(j) && isObj(j.entries)) for (const [id, e] of Object.entries(j.entries).slice(0, 5000)) if (isObj(e) && ['plan', 'hesitated', 'interfered'].includes(e.rating)) s.add(String(id));
  return s;
}
/** the Ledger store ('ledger.v1' on this phone, read only) -> { n: entries, lastExportMs: ms | null } (the Ledger may record `lastExport`; without it the date of the last copy is unknown) */
export function ledgerInfo(raw) {
  let j = raw;
  if (typeof raw === 'string') { if (raw.length > 4000000) return { n: 0, lastExportMs: null }; try { j = JSON.parse(raw); } catch (_) { return { n: 0, lastExportMs: null }; } }
  if (!isObj(j)) return { n: 0, lastExportMs: null };
  const n = Array.isArray(j.entries) ? j.entries.length : 0;
  let ms = null; const v = j.lastExport != null ? j.lastExport : j.lastExportAt;
  if (typeof v === 'number' && Number.isFinite(v)) ms = v < 1e11 ? v * 1000 : v; else if (typeof v === 'string' && Number.isFinite(Date.parse(v))) ms = Date.parse(v);
  return { n, lastExportMs: ms };
}
/** the trades of the last UNRATED_DAYS days (from odeon/trades.json) that carry no rating */
export function unratedTrades(odeon, rated, nowMs) {
  const list = isObj(odeon) && Array.isArray(odeon.trades) ? odeon.trades : [], from = new Date(nowMs - UNRATED_DAYS * 86400000).toISOString().slice(0, 10), to = new Date(nowMs).toISOString().slice(0, 10);
  const out = [];
  for (const t of list) { if (!isObj(t) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.day || '')) || t.day < from || t.day > to || num(t.usd) == null) continue; if (!rated.has(String(t.id))) out.push({ id: str(t.id, 80), day: t.day, usd: num(t.usd) }); }
  return out;
}

/** the context every rule reads: the published files (any may be missing) and what this phone keeps */
export function context(inp, nowMs) {
  const i = isObj(inp) ? inp : {}, now = num(nowMs) != null ? nowMs : 0;
  const accts = accountsOf(i.home), money_ = streamsOf(i.money), rated = ratedIds(i.journal);
  return { now, home: i.home, money: i.money, rules: i.rules, odeon: i.odeon, accts, streams: money_, haveHome: isObj(i.home) && Array.isArray(i.home.accounts), haveMoney: money_.length > 0, haveOdeon: isObj(i.odeon) && Array.isArray(i.odeon.trades),
    unrated: unratedTrades(i.odeon, rated, now), ledger: ledgerInfo(i.ledger) };
}

// ------------------------------------------------------------------------------------------------ the rules table
const worstAcct = (c) => c.accts.filter((a) => a.room != null && a.mll).sort((x, y) => x.room / x.mll - y.room / y.mll)[0] || null;
const calm = (c) => !c.accts.some((a) => a.connected === false || a.paused) && !(worstAcct(c) && worstAcct(c).room / worstAcct(c).mll < 0.5) && !c.accts.some((a) => a.dll && a.dllUsed / a.dll >= 0.8);

export const RULES = [
  { id: 'bots_off', name: 'A bot is not connected', dir: 0, tag: 'free', when: 'An account reports no connection to NinjaTrader.',
    run: (c) => { const off = c.accts.filter((a) => a.connected === false); return off.length ? { title: `Bot not connected: ${off.map((a) => a.name).join(', ')}`, why: 'Open NinjaTrader on the PC and check the connection. A bot that is not connected cannot take its setup.', usd: null, urgency: 96, tone: 'bad', sig: off.map((a) => a.name).join() } : null; } },
  { id: 'dll_near', name: 'The daily loss is nearly used', dir: 0, tag: 'usd', when: 'Eighty percent of the daily loss is used today.',
    run: (c) => { const n = c.accts.filter((a) => a.dll && a.dllUsed / a.dll >= 0.8); if (!n.length) return null; const left = n.reduce((s, a) => s + Math.max(0, a.dll - a.dllUsed), 0); return { title: `Stop for the day: daily loss nearly used (${n.map((a) => a.name).join(', ')})`, why: `Only ${money(left)} of the daily loss is left. Take no extra trade by hand; tomorrow is a new day.`, usd: left, urgency: 92, tone: 'warn', sig: 'dll:' + n.map((a) => a.name).join() }; } },
  { id: 'dd_low', name: 'Drawdown is very low', dir: 0, tag: 'usd', when: 'Less than a quarter of the max loss is left.',
    run: (c) => { const w = worstAcct(c); if (!w || w.room / w.mll >= 0.25) return null; return { title: `${drawdownLine(w.room, w.mll)} (${w.name})`, why: 'Stay small: one more big loss could end the eval, so no extra trades by hand.', usd: w.room, urgency: 90, tone: 'bad', sig: 'low:' + w.name }; } },
  { id: 'dd_half', name: 'Drawdown is under half', dir: 0, tag: 'usd', when: 'Less than half of the max loss is left.',
    run: (c) => { const w = worstAcct(c); if (!w || w.room / w.mll < 0.25 || w.room / w.mll >= 0.5) return null; return { title: `${drawdownLine(w.room, w.mll)} (${w.name})`, why: 'Half the room is used: skip any extra trade by hand and let the bot size down.', usd: w.room, urgency: 68, tone: 'warn', sig: 'half:' + w.name }; } },
  { id: 'feeds_old', name: 'Feeds are old', dir: 270, tag: 'free', when: 'The accounts file or the trades file is older than 36 hours, or a money stream is older than 6 hours, or a file is missing.',
    run: (c) => {
      const bad = [];
      if (!c.haveHome) bad.push('account numbers missing'); else { const a = ageH(c.home, c.now); if (a != null && a > OLD_FEED_H) bad.push(`account numbers ${hoursText(a)} old`); }
      if (!c.haveMoney) bad.push('money data missing'); else { const old = c.streams.filter((s) => s.status === 'stale' || (num(s.age_min) != null && s.age_min > OLD_MIN && s.status !== 'sample')); if (old.length) bad.push('money: ' + old.map((s) => str(s.name || s.id, 16)).join(', ')); }
      if (c.haveOdeon) { const a = ageH(c.odeon, c.now); if (a != null && a > OLD_FEED_H * 2) bad.push(`trades ${hoursText(a)} old`); }
      if (!bad.length) return null;
      return { title: 'Feeds are old: open the PC and run STATUS.bat', why: `Old or missing: ${bad.join('; ')}. STATUS.bat shows what is stuck; RUN_MONEY.bat refreshes the money data.`, usd: null, urgency: 66, tone: 'warn', sig: bad.join('|') };
    } },
  { id: 'deal_soon', name: 'A deal is ending', dir: 90, tag: 'usd', when: 'A deal in the money file ends within 48 hours.',
    run: (c) => {
      let best = null;
      for (const s of c.streams) { if (s.status === 'sample') continue; for (const i of Array.isArray(s.items) ? s.items : []) {
        if (!isObj(i) || !str(i.title)) continue; const em = expiresMs(i.expires); if (em == null) continue; const h = (em - c.now) / 3600000; if (h < 0 || h > 48) continue;
        if (!best || h < best.h) best = { h, i, s };
      } }
      if (!best) return null;
      const usd = num(best.i.usd);
      return { title: `A deal ends in ${hoursText(best.h)}: ${str(best.i.title, 70)}`, why: `Check it on the firm's own page and use it only if you were buying anyway${usd ? ` (about ${money(usd)}, an estimate)` : ''}.`, usd, urgency: Math.round(62 + (48 - best.h) / 48 * 22), tone: 'warn', sig: 'soon:' + str(best.i.title, 40) };
    } },
  { id: 'eval_close', name: 'An eval is close to its target', dir: 90, tag: 'usd', when: 'An eval account has 80 percent of its profit target.',
    run: (c) => { const a = c.accts.filter((x) => !x.funded && x.target && x.toTarget != null && x.toTarget > 0 && x.toTarget / x.target <= 0.2).sort((x, y) => x.toTarget - y.toTarget)[0]; return a ? { title: `${a.name} is ${money(a.toTarget)} from its target`, why: 'Keep the risk small and let the bot finish it: passing is worth more than any extra trade.', usd: a.toTarget, urgency: 58, tone: 'info', sig: 'target:' + a.name } : null; } },
  { id: 'deal_found', name: 'A deal worth a look', dir: 90, tag: 'usd', when: 'The deal watcher found an item scored 60 or more.',
    run: (c) => {
      let best = null;
      for (const s of c.streams) { if (s.status === 'sample' || s.id !== 'mercury') continue; for (const i of Array.isArray(s.items) ? s.items : []) { const sc = num(i && i.score) || 0, em = expiresMs(i && i.expires); if (!isObj(i) || !str(i.title) || sc < 60 || (em != null && (em < c.now || (em - c.now) / 3600000 <= 48))) continue; if (!best || sc > best.sc) best = { sc, i }; } }
      if (!best) return null; const usd = num(best.i.usd);
      return { title: `Deal found: ${str(best.i.title, 70)}`, why: `Open Mercury, check it on the firm's own page, and use it only if you were buying anyway${usd ? ` (about ${money(usd)}, an estimate)` : ''}.`, usd, urgency: 42, tone: 'info', sig: 'deal:' + str(best.i.title, 40) };
    } },
  { id: 'rules_old', name: 'The MFFU rulebook is old', dir: 270, tag: 'free', when: 'The rulebook in ledger/rules.json was built more than 30 days ago.',
    run: (c) => {
      const built = isObj(c.rules) && isObj(c.rules.source) ? c.rules.source.built : null, ms = typeof built === 'string' ? Date.parse(built) : NaN;
      if (!Number.isFinite(ms)) return null; const d = (c.now - ms) / 86400000; if (d <= RULES_OLD_DAYS) return null;
      return { title: `Re-check the MFFU rules (last checked ${daysText(d)})`, why: 'The limits are from MFFU\'s pages on that date. Re-check them before the next payout request: a rule that changed can cost a payout.', usd: null, urgency: 40, tone: 'info', sig: 'rules:' + built };
    } },
  { id: 'unrated', name: 'Trades without a journal rating', dir: 180, tag: 'free', when: 'Trades of the last 14 days have no rating in Mnemosyne.',
    run: (c) => { const n = c.unrated.length; if (!n) return null; return { title: `Journal ${n} unrated ${n === 1 ? 'trade' : 'trades'}`, why: 'Rating takes a few seconds each and unlocks your habit costs: what following the plan was worth and what interfering cost.', usd: null, urgency: Math.min(48, 28 + n * 3), tone: 'info', sig: 'n:' + n }; } },
  { id: 'export', name: 'The Ledger has no recent copy', dir: 180, tag: 'free', when: 'The Ledger has entries and its last export is unknown or more than 10 days old.',
    run: (c) => {
      if (!c.ledger.n) return null;
      if (c.ledger.lastExportMs == null) return { title: 'Export your Ledger (no export on record)', why: `Your ${c.ledger.n} entries live only on this phone. One tap on Export JSON keeps a copy if the phone is lost or cleared.`, usd: null, urgency: 36, tone: 'info', sig: 'never' };
      const d = (c.now - c.ledger.lastExportMs) / 86400000; if (d <= EXPORT_OLD_DAYS) return null;
      return { title: `Export your Ledger (last export ${daysText(d)})`, why: `Your ${c.ledger.n} entries live only on this phone. One tap on Export JSON keeps a copy if the phone is lost or cleared.`, usd: null, urgency: Math.min(46, 30 + Math.round(d / 2)), tone: 'info', sig: 'old:' + Math.floor(d / 7) };
    } },
  { id: 'idle', name: 'Do nothing', dir: 45, tag: 'free', when: 'Every account is connected and has a safe distance: waiting is the action.',
    run: (c) => {
      if (!c.accts.length || !calm(c)) return null; const w = worstAcct(c);
      return { title: 'Do nothing: the bots are watching', why: `${w ? drawdownLine(w.room, w.mll) + ` (${w.name}). ` : ''}The bot trades about 2 to 4 times a week, so quiet days are normal. Forcing a trade is the usual way to lose.`, usd: null, urgency: 34, tone: 'ok', sig: 'ok' };
    } },
];

/** all rules run on a context -> the actions, ranked. Each action: { id, key, title, why, tag, usd, urgency, score, tone, dir, rule } */
export function actions(ctx) {
  const out = [];
  RULES.forEach((r, n) => {
    let a = null;
    try { a = r.run(ctx); } catch (_) { a = null; }
    if (!a) return;
    const usd = num(a.usd), urgency = Math.max(0, Math.min(100, Math.round(a.urgency)));
    out.push({ id: r.id, key: r.id + ':' + str(a.sig, 120), title: str(a.title, 160), why: str(a.why, 300), tag: usd != null && usd > 0 && r.tag === 'usd' ? 'usd' : 'free', usd: usd != null && usd > 0 ? Math.round(usd) : null, urgency, score: urgency + (usd != null && usd > 0 ? Math.min(30, usd / 30) : 0), tone: TONE_RANK[a.tone] != null ? a.tone : 'info', dir: r.dir, rule: r.name, n });
  });
  return out.sort((a, b) => (b.score - a.score) || a.n - b.n);
}
export const tagText = (a) => (a.tag === 'usd' && a.usd ? `${money(a.usd)} at stake or to gain (estimate)` : 'free');

/** a plain-words copy of the table for the "How Compass decides" list */
export function ruleTable() { return RULES.map((r) => ({ id: r.id, name: r.name, tag: r.tag, when: r.when, dir: r.dir })); }

// ------------------------------------------------------------------------------------------------ Done / Snooze (state = { key: { done: ms } | { until: ms } }, kept on this phone only)
export function cleanState(st) { const o = {}; if (isObj(st)) for (const k of Object.keys(st).slice(0, 80)) { const v = st[k]; if (isObj(v) && (num(v.done) != null || num(v.until) != null)) o[k] = num(v.done) != null ? { done: v.done } : { until: v.until }; } return o; }
export function markDone(st, key, nowMs) { return { ...cleanState(st), [key]: { done: nowMs } }; }
export function snooze(st, key, nowMs, hours) { return { ...cleanState(st), [key]: { until: nowMs + (hours || SNOOZE_HOURS) * 3600000 } }; }
export function clearKey(st, key) { const o = cleanState(st); delete o[key]; return o; }
/** quiet = marked Done today (local day) or snoozed; a changed action (a new key) is never quiet */
export function isQuiet(st, a, nowMs) {
  const v = cleanState(st)[a.key]; if (!v) return false;
  if (v.until != null) return v.until > nowMs;
  const d = new Date(v.done), n = new Date(nowMs);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
/** -> { top: at most 5 open actions, quiet: set aside, more: how many open actions did not fit } */
export function plan(list, st, nowMs) {
  const open = [], quiet = [];
  for (const a of list) (isQuiet(st, a, nowMs) ? quiet : open).push(a);
  return { top: open.slice(0, MAX_ACTIONS), quiet, more: Math.max(0, open.length - MAX_ACTIONS) };
}

/** the compass: the needle's bearing in degrees for the top action (0 north, clockwise); with nothing to do it rests at 45 */
export function bearing(top) { return top && num(top.dir) != null ? top.dir : 45; }
export function headline(p) {
  const a = p.top[0];
  if (!a) return { level: 'ok', title: 'Nothing left to do', why: p.quiet.length ? `${p.quiet.length} thing${p.quiet.length === 1 ? ' is' : 's are'} set aside (Done or Snoozed).` : 'Every rule is quiet.' };
  return { level: a.tone === 'ok' ? 'ok' : a.tone === 'bad' ? 'bad' : 'warn', title: a.title, why: a.why };
}
export function jarvisCard(p) {
  const a = p.top[0];
  return { name: 'Compass', level: a ? (a.tone === 'bad' ? 'bad' : a.tone === 'warn' ? 'warn' : 'ok') : 'off', title: a ? a.title.slice(0, 48) : 'Nothing to do', n: String(p.top.length), tag: a ? tagText(a) : 'free' };
}

// ------------------------------------------------------------------------------------------------ the fixture (DEMO): relative times, made absolute here
/** fixture.json keeps its times as hours / days back from now; this gives the inputs the rules read */
export function demoInputs(fx, nowMs) {
  const f = isObj(fx) ? fx : {}, now = num(nowMs) != null ? nowMs : 0, iso = (h) => new Date(now - h * 3600000).toISOString();
  const home = isObj(f.home) ? JSON.parse(JSON.stringify(f.home)) : { accounts: [] }; home.asof = iso(num(f.home_age_h) != null ? f.home_age_h : 0.2);
  const money_ = isObj(f.money) ? JSON.parse(JSON.stringify(f.money)) : { streams: [] };
  for (const s of money_.streams || []) for (const i of s.items || []) if (num(i.expires_in_h) != null) { i.expires = new Date(now + i.expires_in_h * 3600000).toISOString(); delete i.expires_in_h; }
  const trades = (Array.isArray(f.trades) ? f.trades : []).filter((t) => isObj(t) && num(t.back) != null).map((t, k) => ({ id: 'demo.' + (k + 1), day: new Date(now - t.back * 86400000).toISOString().slice(0, 10), usd: t.usd }));
  const entries = {}; for (const id of Array.isArray(f.rated) ? f.rated : []) entries['demo.' + id] = { rating: 'plan' };
  const ledger = isObj(f.ledger) ? { entries: new Array(Math.max(0, Math.min(500, num(f.ledger.entries) || 0))).fill(0), lastExport: num(f.ledger.last_export_days_ago) != null ? new Date(now - f.ledger.last_export_days_ago * 86400000).toISOString() : null } : null;
  return { home, money: money_, rules: isObj(f.rules) ? f.rules : null, odeon: { trades, upto: iso(2) }, journal: { v: 1, entries }, ledger };
}
