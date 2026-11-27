// THE DECEMBER CARD: the model (night-nq-main 2026-11-27). Pure ES module (no DOM / fetch): node-tested (tests/test_nq_december.py).
// Source = nq/december.json (tools/december_plan.py: CME hours, news, the roll, MFFU 7-day clocks, the forecast from research/plans/rank.py).
// Nothing is made up: no file = has false + an honest line; a month that is over says so; every odd is labelled with its market path.
// API: december(J, nowS) -> { has, line, made, over, summary: {...}, accts: [...], weeks: [{ cells: [day|null x5] }], days: Map-like obj, pick, flagged: [...] }
//      dayDetail(day) -> { title, lines: [...], tone }
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const short = (iso) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || '')); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : ''; };
const pct = (v) => (num(v) === null ? null : Math.max(0, Math.min(100, Math.round(num(v)))));
function etDay(nowS) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowS * 1000)); }
  catch (_) { return new Date(nowS * 1000).toISOString().slice(0, 10); }
}
const TAG = { k7: '7-day deadline', news: 'High news', roll: 'Contract roll', 'early close': 'Half day', closed: 'CME closed' };

export function december(J, nowS) {
  if (!isObj(J) || J.kind !== 'december-plan' || !arr(J.days).length) {
    return { has: false, line: 'The December plan is not on the site yet (nq/december.json): nothing to show, nothing made up.', accts: [], weeks: [], days: {}, flagged: [], pick: null };
  }
  const today = etDay(num(nowS) ?? Date.now() / 1000), month = String(J.month || '').slice(0, 7);
  const over = today.slice(0, 7) > month, before = today.slice(0, 7) < month;
  const K7 = arr(isObj(J.k7) ? J.k7.accounts : null).filter(isObj);
  const days = {};
  for (const d of arr(J.days)) {
    if (!isObj(d) || !/^\d{4}-\d\d-\d\d$/.test(String(d.day))) continue;
    const k7 = K7.filter((a) => a.safe_by === d.day), hard = K7.filter((a) => a.mffu_last_day === d.day);
    const flags = arr(d.flags).map(String).filter((f) => TAG[f]);
    if (k7.length) flags.unshift('k7');
    days[d.day] = { day: d.day, n: +d.day.slice(8), wd: String(d.wd || ''), market: String(d.market || 'open'), halt: d.halt || null,
      news: arr(d.news).filter(isObj).map((n) => ({ t: String(n.t || ''), what: String(n.what || ''), high: n.impact === 'high' })),
      roll: !!d.roll, flags, tags: flags.map((f) => TAG[f]), bots: String(d.bots || ''), k7: k7.map((a) => ({ name: String(a.name || a.id), on: !!a.keepalive_on, hard: a.mffu_last_day })),
      hard: hard.map((a) => String(a.name || a.id)), today: d.day === today, past: d.day < today };
  }
  // closed weekdays (Dec 25) may be missing from days[]: the grid still shows them
  const [y, m] = month.split('-').map(Number), weeks = [];
  if (y && m) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let wk = null;
    for (let i = 1; i <= last; i++) {
      const dt = new Date(Date.UTC(y, m - 1, i)), wd = dt.getUTCDay(); if (wd === 0 || wd === 6) continue;
      const iso = `${month}-${String(i).padStart(2, '0')}`;
      if (!wk || wd === 1) { wk = { cells: [null, null, null, null, null] }; weeks.push(wk); }
      if (!days[iso]) days[iso] = { day: iso, n: i, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd], market: 'closed', halt: null, news: [], roll: false,
        flags: ['closed'], tags: [TAG.closed], bots: 'CME closed: no session, no trades.', k7: [], hard: [], today: iso === today, past: iso < today };
      wk.cells[wd - 1] = iso;
    }
  }
  const flagged = Object.values(days).filter((d) => d.flags.length).sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => d.day);
  const pick = days[today] ? today : (flagged.find((d) => d >= today) || flagged[0] || null);
  const S = isObj(J.summary) ? J.summary : {};
  const summary = { sessions: num(S.sessions), half: num(S.half_days), closed: arr(S.closed).length, lit: num(S.lit_trades_month), atlas: num(S.atlas_trades_month),
    news: arr(S.news_high).length, roll: S.roll_day ? short(S.roll_day) : '' };
  const accts = arr(J.accounts).filter(isObj).map((a) => {
    const funded = a.stage === 'funded', G = isObj(a['2026-like']) ? a['2026-like'] : {}, B = isObj(a['2021-25-like']) ? a['2021-25-like'] : {};
    const k = funded ? 'payout_by_month_end_pct' : 'pass_by_month_end_pct';
    return { key: String(a.key || ''), name: String(a.name || a.key || ''), bots: String(a.bots || ''), funded, what: funded ? 'payout by Dec 31' : 'pass by Dec 31',
      good: pct(G[k]), bad: pct(B[k]), failGood: funded ? null : pct(G.fail_by_month_end_pct), failBad: funded ? null : pct(B.fail_by_month_end_pct),
      day: short(funded ? G.earliest_day : G.median_pass_day), dayWord: funded ? 'earliest' : 'median pass',
      profit: num(a.profit_now), room: num(a.room_now) };
  });
  const made = String(J.made || '');
  return { has: true, month, over, before, made, madeShort: short(made), today, summary, accts, weeks, days, flagged, pick,
    line: over ? `December is over: this is the plan as it was made on ${short(made)}.` : '',
    note: String(J.note || ''), caveats: arr(J.caveats).map(String), payout: isObj(J.atlas_payout) ? J.atlas_payout : null, taxes: isObj(J.taxes) ? String(J.taxes.rule || '') : '' };
}

export function dayDetail(d) {
  if (!isObj(d) || !d.day) return { title: '', lines: [], tone: 'calm' };
  d = { ...d, tags: arr(d.tags), k7: arr(d.k7), hard: arr(d.hard), flags: arr(d.flags), bots: String(d.bots || '') };
  const title = `${d.wd} ${short(d.day)}${d.tags.length ? ' · ' + d.tags.join(' · ') : ''}`;
  const lines = [];
  if (d.k7.length) lines.push(`7-day clock: ${d.k7.map((a) => a.name).join(', ')} must have a trade by today (MFFU's last day ${short(d.k7[0].hard)}); the keep-alive is ${d.k7.every((a) => a.on) ? 'on for all of them' : 'OFF on some: switch it on'}.`);
  if (d.hard.length && !d.k7.length) lines.push(`MFFU's last day for ${d.hard.join(', ')} with no trade.`);
  for (const p of d.bots.split(/;\s+/).map((s) => s.trim()).filter(Boolean)) lines.push(p.charAt(0).toUpperCase() + p.slice(1).replace(/\.?$/, '.'));
  const tone = d.market === 'closed' ? 'off' : d.flags.includes('k7') ? 'gold' : d.flags.length ? 'warn' : 'calm';
  return { title, lines, tone };
}
