// KRATOS core (ES module, no DOM, no network): the discipline score. A 0-100 score for each trading day from the bot's published trades (odeon/trades.json) and the owner's own journal ratings
// (localStorage 'journal.v1', READ ONLY). Six parts, each explained in one plain sentence with dollars and R. Pure, so tests/test_kratos_page.py calls it in node.
// It is a mirror, not a judge: it never changes anything. Where a part cannot be seen in the data it says so and counts a neutral share, marked as an estimate.
// Times are New York time (the trade's own UTC offset when given). 1R = the trade's planned risk.

export const PARTS = [
  { key: 'plan', name: 'Followed the plan', max: 25 },
  { key: 'stop', name: 'Stop at the protected level', max: 20 },
  { key: 'size', name: 'Size matched the stop', max: 20 },
  { key: 'flat', name: 'Flat by 15:55', max: 15 },
  { key: 'hours', name: 'Traded only 02:00-15:30', max: 10 },
  { key: 'nomove', name: 'Did not move the stop', max: 10 },
];
export const OPEN_MIN = 120, LAST_ENTRY_MIN = 930, FLAT_MIN = 955;       // 02:00, 15:30, 15:55 ET
export const UNRATED_CREDIT = 0.7;                                          // a trade nobody rated counts 70% of the "followed the plan" part (an estimate)
const RATING_CREDIT = { plan: 1, hesitated: 0.5, interfered: 0 };
const MOVED_RE = /(moved|widen|wider|removed|cancel|took off)[^.]{0,30}\bstop|\bstop[^.]{0,30}(moved|widen|wider|removed|cancel)/i;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export function rWord(r, est) { const v = num(r); if (v == null) return '0.0R'; const q = Math.round(v * 10) / 10; return (est ? '~' : '') + (q > 0 ? '+' : q < 0 ? '-' : '') + Math.abs(q).toFixed(1) + 'R'; }
export const both = (usd, risk, est) => `${moneyS(usd)} (${rWord(risk ? usd / risk : 0, est)})`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWord(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : ''; }
export function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function clockOf(min) { const m = num(min); return m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

/** the label of a score */
export function label(score) { const s = num(score); return s == null ? 'No score' : s >= 90 ? 'Very disciplined' : s >= 75 ? 'Disciplined' : s >= 55 ? 'Mostly on plan' : 'Off plan'; }
export function level(score) { const s = num(score); return s == null ? 'off' : s >= 75 ? 'ok' : s >= 55 ? 'warn' : 'bad'; }

// ------------------------------------------------------------------------------------------------ trades
/** minute of the New York day for an epoch (seconds): with the trade's own UTC offset when it has one, else Intl */
export function minuteET(t, off) {
  const e = num(t); if (e == null) return null;
  const o = num(off);
  if (o != null) return Math.floor((((e + o) % 86400) + 86400) % 86400 / 60);
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(e * 1000));
    const hh = +p.find((x) => x.type === 'hour').value, mm = +p.find((x) => x.type === 'minute').value;
    return hh * 60 + mm;
  } catch (_) { return null; }
}

/** published trades -> the trades Kratos can score (needs a day, dollars, an entry time). Newest first. */
export function normTrades(odeon) {
  const list = isObj(odeon) && Array.isArray(odeon.trades) ? odeon.trades : [], out = [];
  for (const t of list) {
    if (!isObj(t) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.day || ''))) continue;
    const usd = num(t.usd); if (usd == null) continue;
    const risk = num(t.risk_usd), r = num(t.r), en = isObj(t.entry) ? t.entry : {}, ex = isObj(t.exit) ? t.exit : {};
    const em = minuteET(en.t, t.off), held = num(t.held_min);
    let xm = ex.t != null ? minuteET(ex.t, t.off) : null;
    if (xm == null && em != null && held != null) xm = em + held;
    out.push({ id: str(t.id, 80), day: t.day, side: str(t.side, 8).toUpperCase(), qty: num(t.qty), usd: r2(usd), risk, r: r != null ? r : risk ? r2(usd / risk) : null, est: r == null,
      riskPts: num(t.risk_pts), stop: num(t.stop), exit: str(ex.kind, 12).toUpperCase(), entryMin: em, exitMin: xm, t: num(en.t) || 0, bot: str(t.bot || t.strat, 12) });
  }
  return out.sort((a, b) => (b.day < a.day ? -1 : b.day > a.day ? 1 : b.t - a.t));
}

/** the fixture keeps its trades as days back from today with a minute of the day; this gives them real dates. Ratings come with them as a made-up journal. */
export function demoTrades(fixture, today) {
  const list = isObj(fixture) && Array.isArray(fixture.trades) ? fixture.trades : [];
  const trades = [], entries = {};
  list.forEach((t, i) => {
    if (!isObj(t) || num(t.back) == null) return;
    const id = 'demo.' + String(i + 1).padStart(2, '0'), day = addDays(today, -Math.round(t.back));
    const epoch = Math.floor(Date.parse(day + 'T12:00:00Z') / 1000) - 12 * 3600 + (num(t.entry_min) || 0) * 60 + 14400;      // a New York clock of UTC-4 for the demo (local minute = entry_min)
    trades.push({ id, day, side: t.side, qty: t.qty, usd: t.usd, risk_usd: t.risk_usd, r: t.r, risk_pts: t.risk_pts, stop: 1, held_min: num(t.exit_min) - num(t.entry_min), off: -14400, entry: { t: epoch }, exit: { kind: t.exit, t: epoch + (num(t.exit_min) - num(t.entry_min)) * 60 } });
    if (typeof t.rating === 'string') entries[id] = { rating: t.rating, note: str(t.note, 140) };
  });
  return { odeon: { trades }, store: { v: 1, entries } };
}

/** the journal store ('journal.v1' kept on this phone, read only), checked like any foreign input: { entries: { id: { rating, note } } } */
export function parseStore(raw) {
  let j = raw;
  if (typeof raw === 'string') { if (raw.length > 400000) return { entries: {} }; try { j = JSON.parse(raw); } catch (_) { return { entries: {} }; } }
  const out = {};
  if (isObj(j) && isObj(j.entries)) {
    for (const [id, e] of Object.entries(j.entries).slice(0, 5000)) {
      if (!isObj(e)) continue;
      const rating = ['plan', 'hesitated', 'interfered'].includes(e.rating) ? e.rating : null, note = typeof e.note === 'string' ? str(e.note, 140) : '';
      if (rating || note) out[String(id).slice(0, 80)] = { rating, note };
    }
  }
  return { entries: out };
}

// ------------------------------------------------------------------------------------------------ scoring
const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** one trade's six parts, each 0..1 (null = cannot be seen) with the plain reason */
export function scoreTrade(t, entry, ctx) {
  const e = entry || {}, c = ctx || {};
  const p = {};
  p.plan = e.rating ? RATING_CREDIT[e.rating] : null;
  p.stop = t.stop != null || (t.riskPts != null && t.riskPts > 0) ? (t.r != null && t.r < -1.15 ? 0 : 1) : null;
  const med = c.medianRisk;
  let sz = null;
  if (t.riskPts != null && t.qty != null && t.risk != null && t.risk > 0) sz = Math.abs(t.qty * t.riskPts * 2 - t.risk) <= 0.08 * t.risk ? 1 : 0;
  if (t.risk != null && med && t.risk > 1.5 * med) sz = 0;
  else if (sz == null && t.risk != null && med) sz = 1;
  p.size = sz;
  p.flat = t.exitMin == null ? null : t.exitMin <= FLAT_MIN ? 1 : 0;
  p.hours = t.entryMin == null ? null : t.entryMin >= OPEN_MIN && t.entryMin <= LAST_ENTRY_MIN ? 1 : 0;
  p.nomove = e.rating === 'interfered' || (e.note && MOVED_RE.test(e.note)) ? 0 : 1;
  return p;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** one day's score. trades = that day's trades, store = parseStore(), ctx = { medianRisk } */
export function scoreDay(day, trades, store, ctx) {
  const ent = (store && store.entries) || {};
  const rows = trades.map((t) => ({ t, p: scoreTrade(t, ent[t.id], ctx), e: ent[t.id] || {} }));
  const n = rows.length, parts = [];
  const net = rows.reduce((s, x) => s + x.t.usd, 0), risk = rows.reduce((s, x) => s + (x.t.risk || 0), 0) / Math.max(1, n);
  const failCost = (k) => rows.filter((x) => x.p[k] === 0).reduce((s, x) => s + x.t.usd, 0);
  for (const P of PARTS) {
    const seen = rows.filter((x) => x.p[P.key] != null), bad = rows.filter((x) => x.p[P.key] === 0);
    let share, text, est = false;
    const unseen = n - seen.length;
    if (P.key === 'plan') {
      const rated = rows.filter((x) => x.e.rating);
      const sum = rated.reduce((s, x) => s + RATING_CREDIT[x.e.rating], 0) + (n - rated.length) * UNRATED_CREDIT;
      share = sum / n; est = rated.length < n;
      const clean = rated.filter((x) => x.e.rating === 'plan').length;
      text = rated.length
        ? `Followed the plan on ${clean} of ${rated.length} rated ${rated.length === 1 ? "trade" : "trades"}${bad.length ? `; the ${bad.length === 1 ? 'trade you interfered with' : 'trades you interfered with'} cost ${both(failCost('plan'), risk, false)}` : `; the day ${both(net, risk, rows.some((x) => x.t.est))}`}${n - rated.length ? `; ${plural(n - rated.length, 'trade')} not rated yet counts 70% (an estimate)` : ''}.`
        : `Not rated yet: rate ${n === 1 ? 'the trade' : 'the trades'} in Mnemosyne. It counts 70% until you do (an estimate); the day was ${both(net, risk, rows.some((x) => x.t.est))}.`;
    } else if (!seen.length) {
      share = UNRATED_CREDIT; est = true;
      text = P.key === 'flat' ? 'No exit time in the data, so this counts 70% (an estimate).' : P.key === 'stop' ? 'No stop or risk in the data, so this counts 70% (an estimate).' : 'This cannot be seen in the data, so it counts 70% (an estimate).';
    } else {
      const good = seen.filter((x) => x.p[P.key] === 1).length;
      share = (good + unseen * UNRATED_CREDIT) / n; est = unseen > 0;
      const cost = bad.length ? both(failCost(P.key), risk, false) : both(net, risk, rows.some((x) => x.t.est));
      if (P.key === 'stop') {
        const worst = rows.slice().sort((a, b) => (a.t.r || 0) - (b.t.r || 0))[0].t;
        text = bad.length ? `${plural(bad.length, 'trade')} lost more than its planned stop: ${both(failCost('stop'), risk, false)}. Wider than planned means the stop was not where it was meant to be.`
          : worst.usd < 0 ? `Every trade kept its loss inside the planned stop; the worst loss was ${both(worst.usd, worst.risk || risk, worst.est)}.`
          : `No trade lost more than its planned stop (none lost money); the day ${both(net, risk, rows.some((x) => x.t.est))}.`;
      } else if (P.key === 'size') {
        text = bad.length ? `${plural(bad.length, 'trade')} ${bad.length === 1 ? 'was' : 'were'} not sized to the stop (more than 8% off, or over 1.5 times your usual risk): ${cost}.`
          : `Size followed the stop on ${good === n ? 'every trade' : plural(good, 'trade')}: about ${money(risk)} risked per trade, the day ${both(net, risk, rows.some((x) => x.t.est))}.`;
      } else if (P.key === 'flat') {
        text = bad.length ? `${plural(bad.length, 'trade')} still open after 15:55 ET: ${cost}. MFFU closes everything at 16:10.` : `Everything was flat by 15:55 ET; the day ${cost}.`;
      } else if (P.key === 'hours') {
        const off = bad.map((x) => clockOf(x.t.entryMin)).join(', ');
        text = bad.length ? `${plural(bad.length, 'entry')} outside 02:00-15:30 ET (${off}): ${cost}.` : `Every entry was between 02:00 and 15:30 ET; the day ${cost}.`;
      } else {
        text = bad.length ? `${plural(bad.length, 'trade')} marked as interfered or noted as a moved stop: ${cost}.` : `No sign of a moved stop (nothing rated as interfered); the day ${cost}.`;
      }
      if (est) text += ` ${plural(unseen, 'trade')} could not be checked (counted 70%).`;
    }
    parts.push({ key: P.key, name: P.name, max: P.max, share: r2(share), pts: Math.round(P.max * share * 10) / 10, text, est, bad: bad.length });
  }
  const score = Math.round(parts.reduce((s, x) => s + x.pts, 0));
  return { day, n, score: Math.max(0, Math.min(100, score)), net: r2(net), risk: Math.round(risk), est: parts.some((x) => x.est), label: label(score), level: level(score), parts, wr: rows.some((x) => x.t.est) };
}

/** the last `span` calendar days up to today: { days: [scored days, newest first], spark: [{day, score|null}] oldest first, avg, latest, best, worst, n } */
export function build(trades, store, today, span) {
  const S = Math.max(7, Math.min(90, span || 30)), from = addDays(today, -(S - 1));
  const win = trades.filter((t) => t.day >= from && t.day <= today);
  const med = median(win.map((t) => t.risk));
  const by = new Map();
  for (const t of win) { if (!by.has(t.day)) by.set(t.day, []); by.get(t.day).push(t); }
  const days = [...by.entries()].map(([d, l]) => scoreDay(d, l.sort((a, b) => a.t - b.t), store, { medianRisk: med })).sort((a, b) => (a.day < b.day ? 1 : -1));
  const spark = []; for (let i = S - 1; i >= 0; i--) { const d = addDays(today, -i), f = days.find((x) => x.day === d); spark.push({ day: d, score: f ? f.score : null }); }
  const sc = days.map((x) => x.score);
  const best = days.length ? days.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.day > a.day) ? b : a)) : null;
  const worst = days.length ? days.reduce((a, b) => (b.score < a.score || (b.score === a.score && b.day > a.day) ? b : a)) : null;
  return { days, spark, span: S, from, to: today, n: days.length, trades: win.length, avg: sc.length ? Math.round(sc.reduce((s, x) => s + x, 0) / sc.length) : null, latest: days[0] || null, best, worst };
}

/** the newest trade day at or before today (the page's "today" when the PC has not traded today) */
export function lastDay(trades, today) { const d = trades.map((t) => t.day).filter((x) => x <= today).sort(); return d.length ? d[d.length - 1] : null; }

export function headline(m, sel) {
  if (!sel) return 'No scored day yet: the score appears after the first trade.';
  return `${dayWord(sel.day)}: ${sel.score} of 100, ${sel.label.toLowerCase()}. ${plural(sel.n, 'trade')}, the day ${both(sel.net, sel.risk, sel.wr)}.`;
}

export function jarvisCard(m, sel) {
  const s = sel || m.latest;
  return { name: 'Kratos', level: s ? level(s.score) : 'off', score: s ? String(s.score) : '-', avg: m.avg == null ? '-' : String(m.avg), line: headline(m, s) };
}
