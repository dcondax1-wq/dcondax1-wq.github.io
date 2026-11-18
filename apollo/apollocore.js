// APOLLO core (ES module, no DOM, no network): the weekly review. This week's trades from the site's odeon/trades.json, what went right, what went wrong, the discipline line from
// Mnemosyne's card (localStorage 'journal.card.v1', read only) and ONE rule for next week. Pure, so the tests call it in node. Dates are New York trading days (YYYY-MM-DD).
// Money words: every dollar sits next to its R (R = the trade's own R from the file; ~ when it has to be estimated from the risk).

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rWord(r, est) { const v = num(r); if (v == null) return '0.0R'; const q = Math.round(v * 10) / 10; return (est ? '~' : '') + (q > 0 ? '+' : q < 0 ? '-' : '') + Math.abs(q).toFixed(1) + 'R'; }
export const both = (usd, r, est) => `${moneyS(usd)} (${rWord(r, est)})`;

// ------------------------------------------------------------------------------------------------ dates (no time zones: the days are already New York days)
export function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function mondayOf(ymd) { const d = new Date(ymd + 'T12:00:00Z'), k = (d.getUTCDay() + 6) % 7; return addDays(ymd, -k); }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWord(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : ''; }
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// ------------------------------------------------------------------------------------------------ trades
export function normTrades(odeon) {
  const list = isObj(odeon) && Array.isArray(odeon.trades) ? odeon.trades : [], out = [];
  for (const t of list) {
    if (!isObj(t) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.day || ''))) continue;
    const usd = num(t.usd); if (usd == null) continue;
    const risk = num(t.risk_usd), r = num(t.r);
    out.push({ id: str(t.id, 80), day: t.day, side: str(t.side, 8).toUpperCase(), qty: num(t.qty), usd: r2(usd), risk, r: r != null ? r : risk ? r2(usd / risk) : null, est: r == null, mfe: num(t.mfe_r), mae: num(t.mae_r),
      held: num(t.held_min), exit: str(t.exit && t.exit.kind, 12).toUpperCase(), t: num(t.entry && t.entry.t) || 0, bot: str(t.bot || t.strat, 12) });
  }
  return out.sort((a, b) => (b.day < a.day ? -1 : b.day > a.day ? 1 : b.t - a.t));
}
/** the fixture keeps its trades as offsets in days from the Monday of the current week (0 = Monday); this gives them real dates */
export function demoTrades(fixture, todayYmd) {
  const list = isObj(fixture) && Array.isArray(fixture.trades) ? fixture.trades : [], mon = mondayOf(todayYmd);
  return normTrades({ trades: list.map((t, i) => ({ ...t, day: addDays(mon, t.wk * 7 + t.dow), id: 'demo.' + (i + 1), entry: { t: 1793000000 + (t.wk * 7 + t.dow) * 86400 + i } })) });
}
/** the trades grouped Monday to Sunday, newest week first: { from, to, trades } (only weeks that have a trade) */
export function weeks(trades) {
  const m = new Map();
  for (const t of trades) { const k = mondayOf(t.day); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([from, list]) => ({ from, to: addDays(from, 6), label: `Week of ${dayWord(from)}`, trades: list.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : a.t - b.t) }));
}
/** which week to open: the one that holds today when it has trades, else the newest */
export function pickWeek(ws, todayYmd) { const mon = mondayOf(todayYmd); return Math.max(0, ws.findIndex((w) => w.from === mon)); }

// ------------------------------------------------------------------------------------------------ the numbers of one week
export function summarize(list) {
  const n = list.length, wins = list.filter((t) => t.usd > 0), losses = list.filter((t) => t.usd < 0), be = list.filter((t) => t.usd === 0);
  const gw = wins.reduce((s, t) => s + t.usd, 0), gl = -losses.reduce((s, t) => s + t.usd, 0), net = r2(list.reduce((s, t) => s + t.usd, 0));
  const netR = r2(list.reduce((s, t) => s + (t.r || 0), 0)), anyEst = list.some((t) => t.est && t.r != null);
  const byDay = DOW.map(() => ({ usd: 0, r: 0, n: 0 }));
  for (const t of list) { const i = (new Date(t.day + 'T12:00:00Z').getUTCDay() + 6) % 7; if (i < 5) { byDay[i].usd = r2(byDay[i].usd + t.usd); byDay[i].r = r2(byDay[i].r + (t.r || 0)); byDay[i].n++; } }
  const sorted = [...list].sort((a, b) => b.usd - a.usd), exits = {};
  for (const t of list) { const k = t.exit || 'CLOSED'; exits[k] = (exits[k] || 0) + 1; }
  const gaveBack = list.filter((t) => t.mfe != null && t.r != null && t.mfe - t.r >= 1.5 && t.mfe >= 1.5);
  const bigLoss = losses.filter((t) => t.r != null && t.r <= -1.25);
  return { n, wins: wins.length, losses: losses.length, be: be.length, winPct: n ? Math.round((wins.length / n) * 100) : null, net, netR, anyEst, pf: gl > 0 ? Math.round((gw / gl) * 100) / 100 : gw > 0 ? null : 0,
    best: n ? sorted[0] : null, worst: n ? sorted[sorted.length - 1] : null, byDay, exits, gaveBack, bigLoss, avgHold: n && list.every((t) => t.held != null) ? Math.round(list.reduce((s, t) => s + t.held, 0) / n) : null };
}
export const EXIT_WORD = { TARGET: 'reached its target', STOP: 'was stopped out', BE: 'closed at breakeven', CUT: 'was cut after 15 minutes', FLAT: 'was closed flat at 15:55' };

/** plain-words lists: what went right, what went wrong. Every line carries its dollars and R. */
export function notes(s, trades) {
  const right = [], wrong = [];
  if (!s.n) return { right: ['A quiet week costs nothing. The bot trades about 2 to 4 times a week and waits for a clean setup.'], wrong: [] };
  if (s.net > 0) right.push(`The week made ${both(s.net, s.netR, s.anyEst)} from ${s.n} trade${s.n === 1 ? '' : 's'}.`);
  if (s.best && s.best.usd > 0) right.push(`Best trade: ${s.best.side.toLowerCase() || 'a trade'} on ${dayWord(s.best.day)}, ${both(s.best.usd, s.best.r, s.best.est)}${s.best.exit && EXIT_WORD[s.best.exit] ? ` (it ${EXIT_WORD[s.best.exit]})` : ''}.`);
  const kept = trades.filter((t) => t.usd < 0 && t.r != null && t.r >= -1.25).length;
  if (s.losses) right.push(kept === s.losses ? `Every loss stayed near 1R: the stop did its job (${s.losses} of ${s.losses}).` : `${kept} of ${s.losses} losses stayed near 1R.`);
  if (s.exits.BE) right.push(`${s.exits.BE} trade${s.exits.BE === 1 ? '' : 's'} closed at breakeven: the move to breakeven protected the account.`);
  if (s.exits.TARGET) right.push(`${s.exits.TARGET} trade${s.exits.TARGET === 1 ? '' : 's'} reached the target.`);
  if (s.net < 0) wrong.push(`The week lost ${both(s.net, s.netR, s.anyEst)} over ${s.n} trade${s.n === 1 ? '' : 's'}. One normal losing week; look at the size of the losses, not at the sign.`);
  if (s.worst && s.worst.usd < 0) wrong.push(`Worst trade: ${s.worst.side.toLowerCase() || 'a trade'} on ${dayWord(s.worst.day)}, ${both(s.worst.usd, s.worst.r, s.worst.est)}${s.worst.exit && EXIT_WORD[s.worst.exit] ? ` (it ${EXIT_WORD[s.worst.exit]})` : ''}.`);
  if (s.bigLoss.length) wrong.push(`${s.bigLoss.length} loss${s.bigLoss.length === 1 ? ' was' : 'es were'} bigger than 1.25R (${s.bigLoss.map((t) => both(t.usd, t.r, t.est)).join(', ')}): a fast market filled past the stop. Check the fills.`);
  if (s.gaveBack.length) wrong.push(`${s.gaveBack.length} trade${s.gaveBack.length === 1 ? '' : 's'} were up 1.5R or more and gave a lot of it back. The bot banks at its target on purpose: do not close early by hand.`);
  if (s.exits.CUT && s.exits.CUT >= 2) wrong.push(`${s.exits.CUT} trades were cut after 15 minutes without moving: the setup was slow.`);
  if (!wrong.length) wrong.push('Nothing went wrong that the data can see. That is the goal: the same plan again.');
  if (!right.length) right.push('The plan was followed. A losing week still counts as a week of discipline.');
  return { right, wrong };
}

// ------------------------------------------------------------------------------------------------ Mnemosyne's card (journal.card.v1), checked like any foreign input
export function parseCard(raw) {
  let j = raw;
  if (typeof raw === 'string') { if (raw.length > 20000) return null; try { j = JSON.parse(raw); } catch (_) { return null; } }
  if (!isObj(j) || j.v !== 1 || !Array.isArray(j.lines)) return null;
  const lines = j.lines.filter((x) => typeof x === 'string').map((x) => str(x, 160)).filter(Boolean).slice(0, 3);
  const kpis = Array.isArray(j.kpis) ? j.kpis.filter((k) => isObj(k)).map((k) => ({ label: str(k.label, 24), value: str(k.value, 28) })).filter((k) => k.label && k.value).slice(0, 3) : [];
  const st = isObj(j.status) ? { level: ['ok', 'warn', 'bad', 'off'].includes(j.status.level) ? j.status.level : 'off', label: str(j.status.label, 48) } : { level: 'off', label: '' };
  if (!lines.length && !kpis.length) return null;
  const rule = lines.map((l) => /^next week:\s*(.+)$/i.exec(l)).filter(Boolean).map((m) => m[1])[0] || '';
  return { name: str(j.name, 40), status: st, kpis, lines, rule, t: num(j.t) };
}

// ------------------------------------------------------------------------------------------------ the ONE rule
/** ladder: the owner's own rule from Mnemosyne, else one rule from the week's facts. { id, text, why } */
export function oneRule(s, card) {
  if (card && card.rule) return { id: 'journal', text: card.rule.replace(/^\s*(.)/, (m) => m.toUpperCase()), why: 'This is your own rule, written in Mnemosyne. Apollo only repeats it.' };
  if (!s.n) return { id: 'quiet', text: 'Do nothing, and do not force a trade.', why: 'No trade this week is a normal week (the bot waits for a clean setup).' };
  if (s.bigLoss.length) return { id: 'fills', text: 'Look at the fill prices of the big losses before changing anything.', why: `${s.bigLoss.length} loss${s.bigLoss.length === 1 ? '' : 'es'} went past 1.25R, which usually means slippage, not a wrong idea.` };
  if (s.gaveBack.length >= 2) return { id: 'hold', text: 'Let the bot bank at its target. No early manual exits.', why: `${s.gaveBack.length} trades gave back 1.5R or more; the target is where the edge is paid.` };
  if (s.net < 0) return { id: 'size', text: 'Same plan, same size. Add nothing after a loss.', why: 'A losing week is part of the plan; chasing it is what costs money.' };
  return { id: 'steady', text: 'Keep doing nothing: let the bot trade its plan.', why: 'The week was clean. The best change is no change.' };
}

export function jarvisCard(s, week, rule) {
  const lvl = !s.n ? 'off' : s.net > 0 ? 'ok' : 'warn';
  return { v: 1, name: 'Apollo', status: { level: lvl, label: (week ? week.label : 'No trades yet').slice(0, 48) }, kpis: [{ label: 'Week', value: s.n ? moneyS(s.net) : '$0' }, { label: 'R', value: s.n ? rWord(s.netR, s.anyEst) : '0.0R' }, { label: 'Trades', value: String(s.n) }],
    lines: [str(s.n ? `${s.n} trades, ${both(s.net, s.netR, s.anyEst)} this week.` : 'No trades this week.', 118), str('Next week: ' + rule.text, 118)], t: 1793394000, theme: '#14110e' };
}
