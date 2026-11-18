// TYCHE cash (2026-11-04): the money view's numbers, money first and in plain words. Pure (no DOM, no clock of its own: `now` comes in), derived only from
// the Model (data.js normalize): the bot's own balance, open bets, settled bets and daily P&L. A reading of the numbers, never a forecast, never an order.
//   breakEven(m)  the win rate you need at the price you pay, the one you have, the cushion in points, what fees and slips cost
//   atRisk(m, now) the money on the table: what is open, its share of the balance, the best and worst outcome, and when it comes back
//   pace(m)       today and this week against the usual day, the last 14 days as bars, the green days
//   hours(m)      the New York hours of the day that paid and the ones that cost (from the settled list, with the sample size)
//   moneyLine(m)  one plain sentence for the clipboard
export const usd = (v, sign) => {
  const x = Math.round(Math.abs(v) * 100) / 100, s = '$' + x.toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return v < -0.004 ? '-' + s : sign && v > 0.004 ? '+' + s : s;
};
const sum = (a) => a.reduce((s, x) => s + x, 0);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const pc = (x, d = 1) => (x * 100).toFixed(d) + '%';

export function breakEven(m) {
  const st = (m && m.stats) || {}, set = ((m && m.settled) || []).filter((s) => fin(s.price) && fin(s.contracts) && s.contracts > 0);
  const n = (st.wins || 0) + (st.losses || 0);
  const wr = fin(st.winRate) ? st.winRate : null;
  const cs = sum(set.map((s) => s.contracts)), px = cs > 0 ? sum(set.map((s) => s.price * s.contracts)) / cs : null;
  if (wr == null || n < 5 || px == null) return { ok: false, n, line: 'The break-even meter needs at least 5 settled bets with a price.' };
  const edge = (wr - px) * 100, staked = fin(st.staked) && st.staked > 0 ? st.staked : sum(set.map((s) => s.staked || 0)), pnl = fin(st.pnl) ? st.pnl : sum(set.map((s) => s.pnl));
  const roi = staked > 0 ? pnl / staked : null, drag = Math.max(0, sum(set.map((s) => (s.win ? s.contracts * (1 - s.price) : -s.contracts * s.price) - s.pnl)));     // what each bet would have paid at its price, minus what it did pay: fees and slips
  const winPays = 1 - px, ratio = px / winPays;
  const line = edge >= 0
    ? `You win ${pc(wr)} and need ${pc(px)}: ${edge.toFixed(1)} points of cushion.` + (drag ? ` Fees and slips take about ${usd(drag)}.` : '')
    : `You win ${pc(wr)} but need ${pc(px)}: ${Math.abs(edge).toFixed(1)} points short, so the bets lose on average.`;
  return { ok: true, n, wr, need: px, edge, roi, drag, staked, pnl, ratio, winPays, line, good: edge >= 0 && (roi == null || roi >= 0),
    why: `A win pays ${Math.round(winPays * 100)}¢ on ${Math.round(px * 100)}¢ put in; one loss costs ${ratio < 1.5 ? 'about 1 win' : Math.round(ratio) + ' wins'}.` };
}

const BANDS = [[900, 'Under 15 min'], [3600, 'Under 1 hour'], [6 * 3600, 'Under 6 hours'], [86400, 'Under a day'], [Infinity, 'Later']];
export function atRisk(m, now) {
  const open = ((m && m.open) || []).filter((o) => fin(o.cost) && o.cost > 0), bal = m && fin(m.balance) ? m.balance : null;
  if (!open.length) return { ok: false, n: 0, bands: [], line: 'Nothing is open: no money is at risk right now.' };
  const cost = sum(open.map((o) => o.cost)), win = sum(open.map((o) => (fin(o.contracts) ? Math.abs(o.contracts) * (1 - (fin(o.avg) ? o.avg : 0)) : 0)));
  const share = bal && bal > 0 ? cost / bal : null, big = open.slice().sort((a, b) => b.cost - a.cost)[0];
  const bands = BANDS.map(([lim, label], i) => ({ label, n: 0, cost: 0, back: 0, from: i ? BANDS[i - 1][0] : -Infinity, lim }));
  for (const o of open) {
    const left = fin(o.left) ? o.left : fin(o.closes) ? o.closes - now : Infinity, b = bands.find((x) => left < x.lim && left >= x.from) || bands[bands.length - 1];
    b.n++; b.cost += o.cost; b.back += fin(o.contracts) ? Math.abs(o.contracts) : 0;
  }
  const level = share == null ? 'ok' : share > 0.5 ? 'bad' : share > 0.25 ? 'warn' : 'ok';
  const line = `${open.length} open bet${open.length === 1 ? '' : 's'}: ${usd(cost)} at risk` + (share != null ? ` (${pc(share, 0)} of your balance)` : '') + `. All win: ${usd(win, true)}. All lose: ${usd(-cost)}.`;
  return { ok: true, n: open.length, cost, win, lose: -cost, share, level, big: big ? { title: big.title, cost: big.cost, share: cost > 0 ? big.cost / cost : null } : null, bands: bands.filter((b) => b.n), line };
}

export function pace(m) {
  const days = ((m && m.days) || []).filter((d) => d && fin(d[1])).slice(-60);
  if (days.length < 3) return { ok: false, n: days.length, line: 'The pace view needs at least 3 days of results.' };
  const vals = days.map((d) => d[1]), last14 = days.slice(-14), prev = vals.slice(0, -1).slice(-14), avg = prev.length ? sum(prev) / prev.length : null;
  const today = m && fin(m.today) ? m.today : vals[vals.length - 1], week = m && fin(m.week) ? m.week : null;
  const g = vals.filter((x) => x > 0.005).length, bi = vals.indexOf(Math.max(...vals)), wi = vals.indexOf(Math.min(...vals));
  const tone = today < -0.004 ? 'down' : avg == null || today >= avg ? 'up' : 'mid';
  const line = avg == null ? `Today ${usd(today, true)}.` : `Today ${usd(today, true)} against a usual day of ${usd(avg, true)} (the last ${prev.length} days).`;
  return { ok: true, n: days.length, today, week, avg, tone, green: g, greenPct: g / vals.length, bars: last14, best: { d: days[bi][0], v: vals[bi] }, worst: { d: days[wi][0], v: vals[wi] }, total: sum(vals), line };
}

const etHour = (t) => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t * 1000)); return +p % 24; } catch (_) { return new Date(t * 1000).getUTCHours(); } };
export function hours(m) {
  const set = ((m && m.settled) || []).filter((s) => fin(s.t) && fin(s.pnl));
  if (set.length < 8) return { ok: false, n: set.length, line: 'The hours view needs at least 8 settled bets.' };
  const h = Array.from({ length: 24 }, (_, i) => ({ h: i, n: 0, pnl: 0 }));
  for (const s of set) { const b = h[etHour(s.t)]; b.n++; b.pnl += s.pnl; }
  const used = h.filter((x) => x.n >= 3), best = used.slice().sort((a, b) => b.pnl - a.pnl)[0], worst = used.slice().sort((a, b) => a.pnl - b.pnl)[0];
  const lab = (x) => (x === 0 ? '12 AM' : x < 12 ? x + ' AM' : x === 12 ? '12 PM' : x - 12 + ' PM');
  const line = best && worst && best !== worst ? `Best hour ${lab(best.h)} ET (${usd(best.pnl, true)} on ${best.n} bets), worst ${lab(worst.h)} ET (${usd(worst.pnl, true)} on ${worst.n}).` : 'Not enough bets in any one hour yet.';
  return { ok: true, n: set.length, hours: h, best, worst, lab, line };
}

export function moneyLine(m) {
  if (!m) return '';
  const be = breakEven(m), bits = [];
  if (fin(m.balance)) bits.push('balance ' + usd(m.balance));
  if (fin(m.today)) bits.push('today ' + usd(m.today, true));
  if (fin(m.week)) bits.push('week ' + usd(m.week, true));
  if (fin(m.total)) bits.push('all time ' + usd(m.total, true));
  if (be.ok) bits.push(`${pc(be.wr)} wins, needs ${pc(be.need)}`);
  return 'Kalshi bot: ' + (bits.join(' · ') || 'no numbers yet') + (m.running === false ? ' · paused' : '');
}
