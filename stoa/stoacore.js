// STOA core (ES module, no DOM, no network): "what needs me now?" from the site's published JSON. Pure, so the tests call it in node.
// Inputs (every one optional): home (home.json: accounts), money (money/index.json), kalshi (the public kalshi.json feed), alerts (../alerts.json: { alerts: [{ text, level }] } if the site has it).
// Six fixed slots (the six columns): bots, drawdown, today, deals, feeds, alerts. Each card says what to do in ONE plain sentence. Paper only: nothing here acts.
export const SLOTS = ['bots', 'drawdown', 'today', 'deals', 'feeds', 'alerts'];
export const LABELS = { bots: 'Bots', drawdown: 'Drawdown', today: 'Today', deals: 'Deals', feeds: 'Feeds', alerts: 'Alerts' };
export const SNOOZE_HOURS = 4;
export const OLD_MIN = 6 * 60;       // money streams older than this are old
export const OLD_FEED_H = 36;        // home / kalshi files older than this are old (weekends are quiet, so not shorter)
const TONE_RANK = { bad: 0, warn: 1, info: 2, ok: 3, off: 4 };

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function moneyS(x) { const v = num(x); const m = money(v); return v != null && v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function hoursText(h) { return h < 1 ? 'under an hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; }

/** home.json -> accounts we can use (never throws) */
export function accountsOf(home) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [];
  return list.filter((a) => isObj(a) && !a.error).map((a) => {
    const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : {}, pnl = isObj(a.pnl) ? a.pnl : {}, conn = isObj(a.conn) ? a.conn : {};
    return { name: str(a.name || a.id, 40) || 'Account', room: num(ev.room), mll: num(ev.mll), dllUsed: num(ev.dll_used) || 0, dll: num(ev.dll),
      today: num(pnl.today) != null ? num(pnl.today) : num(ev.today), connected: typeof conn.connected === 'boolean' ? conn.connected : null, paused: !!a.paused };
  });
}
/** file age in hours from a time field (epoch seconds, epoch ms or ISO text); null when there is none */
export function ageH(obj, nowMs) {
  if (!isObj(obj)) return null;
  for (const k of ['t', 'generated_at', 'asof', 'updated']) {
    const v = obj[k]; let ms = null;
    if (num(v) != null) ms = v < 1e11 ? v * 1000 : v; else if (typeof v === 'string' && Number.isFinite(Date.parse(v))) ms = Date.parse(v);
    if (ms != null) return Math.max(0, (nowMs - ms) / 3600000);
  }
  return null;
}
/** an item's `expires` (ISO date or date-time) -> ms; a date alone means the END of that day (UTC); anything else -> null */
export function expiresMs(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v.trim())) return null;
  const t = v.trim(), ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T23:59:59Z' : t);
  return Number.isFinite(ms) ? ms : null;
}
export function streamsOf(money_) { return isObj(money_) && Array.isArray(money_.streams) ? money_.streams.filter((s) => isObj(s) && str(s.id)) : []; }

const card = (slot, tone, title, say, sig, needs, extra) => ({ id: slot, slot, label: LABELS[slot], tone, needs: !!needs, title, say, key: slot + ':' + sig, ...(extra || {}) });

function botsCard(accts, kalshi, haveHome) {
  if (!haveHome) return card('bots', 'warn', 'Account numbers are missing', 'Open the bot PC, check the bot is running, then reload this page.', 'nohome', true);
  const off = accts.filter((a) => a.connected === false), paused = accts.filter((a) => a.paused);
  if (off.length) return card('bots', 'bad', `Bot not connected: ${off.map((a) => a.name).join(', ')}`, 'Open NinjaTrader on the PC and check the connection.', 'off:' + off.map((a) => a.name).join(), true);
  if (paused.length) return card('bots', 'warn', `Bot paused: ${paused.map((a) => a.name).join(', ')}`, 'Resume it on the bot page if you want it trading.', 'paused:' + paused.map((a) => a.name).join(), true);
  if (isObj(kalshi) && kalshi.running === false) return card('bots', 'warn', 'The Kalshi bot is not running', 'Check the Oracle VM (the Kalshi server) and restart the bot there.', 'kalshi', true);
  return card('bots', 'ok', accts.length ? 'Bots are connected' : 'No bots reported', 'Nothing to do.', 'ok', false);
}
function drawdownCard(accts) {
  const w = accts.filter((a) => a.room != null && a.mll).sort((x, y) => x.room / x.mll - y.room / y.mll)[0];
  if (!w) return card('drawdown', 'off', 'No drawdown numbers yet', 'Nothing to do until the bot reports an account.', 'none', false);
  const f = w.room / w.mll, t = `Drawdown left ${money(w.room)} of ${money(w.mll)} max loss (${w.name})`;
  if (f < 0.25) return card('drawdown', 'bad', t, 'Stay small: one more big loss could end the eval, so no extra trades by hand.', 'bad', true);
  if (f < 0.5) return card('drawdown', 'warn', t, 'Half the room is used: skip any extra trade by hand.', 'warn', true);
  return card('drawdown', 'ok', t, 'Safe distance. Nothing to do.', 'ok', false);
}
function todayCard(accts, kalshi) {
  const have = accts.filter((a) => a.today != null), sum = have.reduce((s, a) => s + a.today, 0);
  const near = accts.filter((a) => a.dll && a.dllUsed / a.dll >= 0.8);
  const k = isObj(kalshi) && num(kalshi.today_pnl) != null ? ` Kalshi today ${moneyS(kalshi.today_pnl)}.` : '';
  if (near.length) return card('today', 'warn', `Daily loss nearly used: ${near.map((a) => a.name).join(', ')}`, 'Stop for the day: the rule ends the account if the daily loss is hit.' + k, 'dll:' + near.map((a) => a.name).join(), true);
  if (!have.length && !k) return card('today', 'off', 'No money numbers today yet', 'Nothing to do.', 'none', false);
  return card('today', 'ok', `Today ${moneyS(sum)} on ${have.length} account${have.length === 1 ? '' : 's'}`, 'Nothing to do. The bot trades about 2 to 4 times a week, so quiet days are normal.' + k, 'ok', false);
}
function dealsCard(streams, nowMs) {
  let best = null;
  for (const s of streams) { if (s.status === 'sample') continue; for (const i of Array.isArray(s.items) ? s.items : []) {
    if (!isObj(i) || !str(i.title)) continue;
    const em = expiresMs(i.expires), exp = em != null ? (em - nowMs) / 3600000 : null;
    if (exp != null && exp < 0) continue;
    if (exp == null && s.id !== 'mercury') continue;   // only the deal watcher's items are "deals"; a dated item from any stream counts
    const score = num(i.score) || 0, soon = exp != null && exp <= 48;
    if (!soon && score < 60) continue;
    const w = (soon ? 1000 - exp : 0) + score;
    if (!best || w > best.w) best = { w, s, i, exp, soon };
  } }
  if (!best) return card('deals', 'ok', 'No deals worth your time', 'Nothing to do.', 'none', false);
  const usd = num(best.i.usd), t = best.soon ? `Deal ends in ${hoursText(best.exp)}: ${str(best.i.title, 70)}` : `Deal found: ${str(best.i.title, 70)}`;
  return card('deals', best.soon ? 'warn' : 'info', t, `Open ${str(best.s.name || best.s.id, 20)}, check it on the firm's own page, and use it only if you were buying anyway${usd ? ` (about ${money(usd)}, an estimate)` : ''}.`, (best.soon ? 'soon:' : 'deal:') + str(best.i.title, 40), true, { stream: str(best.s.id, 20) });
}
function feedsCard(m, nowMs) {
  const bad = [];
  if (!m.haveHome) bad.push('account numbers');
  else { const a = ageH(m.home, nowMs); if (a != null && a > OLD_FEED_H) bad.push(`account numbers (${hoursText(a)} old)`); }
  if (!m.haveMoney) bad.push('money data');
  else { const old = streamsOf(m.money).filter((s) => s.status === 'stale' || (num(s.age_min) != null && s.age_min > OLD_MIN && s.status !== 'sample')); if (old.length) bad.push('money: ' + old.map((s) => str(s.name || s.id, 16)).join(', ')); }
  if (isObj(m.kalshi)) { const a = ageH(m.kalshi, nowMs); if (a != null && a > OLD_FEED_H) bad.push(`Kalshi (${hoursText(a)} old)`); }
  if (!bad.length) return card('feeds', 'ok', 'All feeds are fresh', 'Nothing to do.', 'ok', false);
  const money_ = bad.some((b) => b.startsWith('money'));
  return card('feeds', 'warn', `Old or missing: ${bad.join('; ')}`, (money_ ? 'Double-click RUN_MONEY.bat on the PC for the money data. ' : '') + (bad.some((b) => b.startsWith('account')) ? 'For the accounts, check the bot PC is on and online.' : '').trim(), 'bad:' + bad.length + ':' + bad.join('|').slice(0, 80), true);
}
function alertsCard(alerts) {
  const list = (isObj(alerts) && Array.isArray(alerts.alerts) ? alerts.alerts : Array.isArray(alerts) ? alerts : []).filter((a) => isObj(a) && str(a.text));
  if (!list.length) return card('alerts', 'ok', 'No alerts', 'Nothing to do.', 'none', false);
  const bad = list.some((a) => a.level === 'bad');
  return card('alerts', bad ? 'bad' : 'warn', `${list.length} alert${list.length === 1 ? '' : 's'}: ${str(list[0].text, 90)}`, 'Read it, then tap Done when you have dealt with it.', list.length + ':' + str(list[0].text, 40), true);
}

/** inputs -> six cards, sorted: what needs you first (bad, warn, info), then the calm ones */
export function buildCards(inp, nowMs) {
  const i = isObj(inp) ? inp : {}, now = num(nowMs) != null ? nowMs : 0;
  const accts = accountsOf(i.home), m = { home: i.home, money: i.money, kalshi: i.kalshi, haveHome: isObj(i.home) && Array.isArray(i.home.accounts), haveMoney: streamsOf(i.money).length > 0 };
  const cards = [botsCard(accts, i.kalshi, m.haveHome), drawdownCard(accts), todayCard(accts, i.kalshi), dealsCard(streamsOf(i.money), now), feedsCard(m, now), alertsCard(i.alerts)];
  return cards.map((c, n) => ({ ...c, n })).sort((a, b) => (TONE_RANK[a.tone] - TONE_RANK[b.tone]) || a.n - b.n);
}

// ------------------------------------------------------------------------------------------------ Done / Snooze (state = { key: { done: ms } | { until: ms } })
export function cleanState(st) { const o = {}; if (isObj(st)) for (const k of Object.keys(st).slice(0, 60)) { const v = st[k]; if (isObj(v) && (num(v.done) != null || num(v.until) != null)) o[k] = num(v.done) != null ? { done: v.done } : { until: v.until }; } return o; }
export function markDone(st, key, nowMs) { return { ...cleanState(st), [key]: { done: nowMs } }; }
export function snooze(st, key, nowMs, hours) { return { ...cleanState(st), [key]: { until: nowMs + (hours || SNOOZE_HOURS) * 3600000 } }; }
export function clearKey(st, key) { const o = cleanState(st); delete o[key]; return o; }
/** a card is quiet when it was marked Done today (local day) or is snoozed; a changed card (new key) is never quiet */
export function isQuiet(st, c, nowMs) {
  const v = cleanState(st)[c.key]; if (!v) return false;
  if (v.until != null) return v.until > nowMs;
  const d = new Date(v.done), n = new Date(nowMs);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
/** -> { open: cards that need you and are not quiet, quiet: needs-you cards set aside, calm: nothing needed } */
export function split(cards, st, nowMs) {
  const open = [], quiet = [], calm = [];
  for (const c of cards) { if (!c.needs) calm.push(c); else if (isQuiet(st, c, nowMs)) quiet.push(c); else open.push(c); }
  return { open, quiet, calm };
}
export function headline(sp) {
  const n = sp.open.length;
  if (!n) return { level: 'ok', title: 'Nothing needs you now', why: sp.quiet.length ? `${sp.quiet.length} thing${sp.quiet.length === 1 ? ' is' : 's are'} set aside (Done or Snoozed).` : 'Everything is calm. Quiet days are normal.' };
  const worst = sp.open[0].tone === 'bad' ? 'bad' : 'warn';
  return { level: worst, title: n === 1 ? 'One thing needs you' : `${n} things need you`, why: sp.open[0].title + '.' };
}
/** the six columns for the scene: lit = needs you and not set aside */
export function columns(cards, st, nowMs) {
  return SLOTS.map((s) => { const c = cards.find((x) => x.slot === s); const lit = !!c && c.needs && !isQuiet(st, c, nowMs); return { id: s, label: LABELS[s], lit, tone: c ? c.tone : 'off' }; });
}
export function jarvisCard(cards, st, nowMs) {
  const sp = split(cards, st, nowMs), hd = headline(sp);
  return { v: 1, name: 'Stoa', status: { level: hd.level, label: sp.open.length ? `${sp.open.length} need you` : 'All calm' },
    kpis: [{ label: 'Need you', value: String(sp.open.length) }, { label: 'Set aside', value: String(sp.quiet.length) }, { label: 'Calm', value: String(sp.calm.length) }],
    lines: sp.open.slice(0, 2).map((c) => str(c.title, 110)), t: Math.floor((num(nowMs) || 0) / 1000), open: '#', theme: '#14110e', stale_after: 21600 };
}
