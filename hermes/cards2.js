// HERMES extra story cards (2026-11-04): four more cards, money first, plain words. Same card contract as cards.js (id, name, colors, mode, ms,
// html with every data text escaped, enter(el, fx), share()). Built only from wrapped.json (the eval block, the period's money and days):
//   passClock   the eval's clock: what is still needed per session against the pace so far, and what the backtest says the median pass takes
//   cushion     how many average losers the room above the floor can take, and the biggest single loss it can absorb
//   weekdays    which weekday paid and which cost, from the all-time days (honest about the small sample)
//   summary     the whole period as one plain text, with a Copy button (for a chat or a note)
import { esc, usd, tone, plural, num } from './data.js';

const kick = (t) => `<p class="kicker">${esc(t)}</p>`;
const kt = (text, cls = 'title') => `<h1 class="${cls} kt">${String(text).split(' ').map((w, i) => `<span class="w"><span style="--i:${i}">${esc(w)}</span></span>`).join(' ')}</h1>`;
const d0 = (v) => usd(v, { sign: false, cents: false });
const primary = (w) => { const E = (w.eval || []).filter((e) => num(e.target) != null); return E.find((e) => /50K/i.test(e.plan || e.name || '')) || E[0] || null; };

export function passClock(w) {
  const e = primary(w);
  if (!e || num(e.to_target) == null) return null;
  const done = e.to_target <= 0, S = num(e.sessions), s = num(e.session);
  const left = S != null && s != null ? Math.max(0, S - s) : null, need = !done && left ? e.to_target / left : null;
  const pace = s ? (num(e.profit) || 0) / s : null, finish = !done && pace && pace > 0 ? Math.ceil(e.to_target / pace) : null;
  const odds = w.odds && num(w.odds.pass_med) != null ? w.odds : null;
  const ahead = need != null && pace != null ? pace >= need : null;
  const verdict = done ? 'The target is reached.' : need == null ? 'The clock has no sessions left to count.' : pace == null ? `You need ${d0(need)} a session.`
    : ahead ? `You are ahead: ${d0(pace)} a session so far against ${d0(need)} needed.` : pace > 0 ? `You are behind: ${d0(pace)} a session so far, ${d0(need)} needed.` : `No profit yet: ${d0(need)} a session is needed.`;
  const cell = (k, v, c = '') => `<div><small>${esc(k)}</small><b class="${c}">${esc(v)}</b></div>`;
  return {
    id: 'passclock', name: 'Pass clock', colors: ['#140f0a', '#304e61', '#6f9bb8'], mode: 6, ms: 8000,
    html: `${kick(`${e.bot || 'Eval'} · ${e.plan || e.name || 'eval'} · pass clock`)}${kt(done ? 'Target reached' : left != null ? `${left} sessions left` : 'The pass clock')}
      <div class="hero" data-z="3"><span class="count xl gold" data-fmt="usd0" data-to="${esc(Math.max(0, num(e.to_target) || 0))}">${esc(usd(0, { cents: false }))}</span><p class="sub">${done ? 'to the target: done' : 'still to bank to pass'}</p></div>
      <div class="split" data-z="2">${cell('Needed a session', need != null ? d0(need) : '—')}${cell('Your pace', pace != null ? usd(pace, { cents: false }) : '—', pace != null ? tone(pace) : '')}${cell(finish ? 'At this pace' : 'Session', finish ? `${finish} more` : S != null && s != null ? `${s} of ${S}` : '—')}</div>
      <p class="fact">${esc(verdict)}</p>
      ${odds ? `<p class="note">Backtest at the live sizing: the median pass takes ${esc(odds.pass_med)} sessions; ${esc(odds.p10)}% pass within 2 weeks, ${esc(odds.f10)}% fail.</p>` : '<p class="note">A pace, not a promise: eval days are few.</p>'}`,
    enter(el, fx) { if (done) fx.burst('confetti', 70, { colors: ['#6f9bb8', '#c8a24a', '#f3ece0'] }); },
    share: () => ({ kicker: 'Evals · pass clock', title: done ? 'Target reached' : 'Still to bank', big: usd(Math.max(0, e.to_target), { cents: false }), tone: ahead === false ? 'down' : 'up', lines: [verdict] }),
  };
}

export function cushion(w, p) {
  const e = primary(w);
  if (!e || num(e.room) == null) return null;
  const losses = num(p.losses) || 0, lost = Math.abs(num(p.lost_usd) || 0), al = losses ? lost / losses : null;
  const biggest = p.worst && num(p.worst.pnl) != null ? Math.abs(p.worst.pnl) : al;
  const n = al ? Math.floor(e.room / al) : null, frac = num(e.mll) ? Math.max(0, Math.min(1, e.room / e.mll)) : null;
  const level = frac == null ? 'ok' : frac < 0.25 ? 'bad' : frac < 0.5 ? 'warn' : 'ok';
  const cell = (k, v, c = '') => `<div><small>${esc(k)}</small><b class="${c}">${esc(v)}</b></div>`;
  return {
    id: 'cushion', name: 'Cushion', colors: level === 'ok' ? ['#100c08', '#243b4a', '#9bab63'] : ['#110d09', '#402d22', '#e0907a'], mode: 2, ms: 7500,
    html: `${kick(`${e.bot || 'Eval'} · the floor`)}${kt(n != null ? 'Losers you can afford' : 'The cushion')}
      <div class="hero" data-z="3"><span class="count xl ${level === 'ok' ? 'up' : 'down'}" data-fmt="int" data-to="${esc(n != null ? n : 0)}">0</span><p class="sub">${n != null ? 'average losers before the floor' : 'no losing trade in this period to size it by'}</p></div>
      <div class="split" data-z="2">${cell('Room left', d0(e.room), level === 'ok' ? 'up' : 'down')}${cell('Average loser', al != null ? '−' + d0(al) : '—', 'down')}${cell('Worst loser', biggest != null ? '−' + d0(biggest) : '—', 'down')}</div>
      <p class="fact">${esc(n != null ? `The room above the floor is ${d0(e.room)}${frac != null ? ` (${Math.round(frac * 100)}% of the allowed drawdown)` : ''}. At ${d0(al)} a loser, that is ${n} of them in a row. ${level === 'ok' ? 'Comfortable.' : level === 'warn' ? 'Keep the size small.' : 'Close to the floor: protect it.'}` : `The room above the floor is ${d0(e.room)}.`)}</p>
      <p class="note">One stop at a time: the size follows the stop. Losers in a row are rarer than they sound, but the floor does not care.</p>`,
    enter() { /* nothing to burst */ },
    share: () => ({ kicker: 'The floor', title: 'Losers you can afford', big: n != null ? String(n) : d0(e.room), tone: level === 'ok' ? 'up' : 'down', lines: [`${d0(e.room)} above the floor`, al != null ? `average loser ${d0(al)}` : ''].filter(Boolean) }),
  };
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], WDL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export function weekdayStats(days) {
  const rows = WD.map((n, i) => ({ n, long: WDL[i], net: 0, days: 0, green: 0 }));
  for (const d of days || []) {
    if (!Array.isArray(d) || num(d[1]) == null || !/^\d{4}-\d{2}-\d{2}/.test(String(d[0]))) continue;
    const wd = (new Date(String(d[0]).slice(0, 10) + 'T12:00:00Z').getUTCDay() + 6) % 7;
    if (wd > 4) continue;
    rows[wd].net += d[1]; rows[wd].days++; if (d[1] > 0) rows[wd].green++;
  }
  return rows;
}
export function weekdays(w) {
  const rows = weekdayStats((w.periods.all || {}).days), n = rows.reduce((s, r) => s + r.days, 0);
  if (n < 5) return null;
  const used = rows.filter((r) => r.days), best = used.slice().sort((a, b) => b.net - a.net)[0], worst = used.slice().sort((a, b) => a.net - b.net)[0];
  const mx = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const bars = rows.map((r, i) => `<div class="dbar ${tone(r.net)}" style="--h:${Math.max(4, Math.abs(r.net) / mx * 100).toFixed(1)}%;--i:${i}"><i></i><b>${esc(r.n)}</b></div>`).join('');
  return {
    id: 'weekdays', name: 'Weekdays', colors: ['#080705', '#412d19', '#c8a24a'], mode: 4, ms: 7500,
    html: `${kick('All time · by weekday')}${kt(best && best.net > 0 ? `${best.long} pays` : 'Which weekday pays')}
      <div class="hero" data-z="3">${best ? `<span class="count xl ${tone(best.net)}" data-fmt="usd0" data-to="${esc(best.net)}">${esc(usd(0))}</span><p class="sub">${esc(best.long)}, the best weekday (${esc(plural(best.days, 'day'))})</p>` : ''}</div>
      <div class="bars" aria-label="P&amp;L by weekday">${bars}</div>
      <div class="split">${used.slice(0, 3).length ? `<div><small>Best</small><b class="${tone(best.net)}">${esc(best.n)} ${esc(usd(best.net, { cents: false }))}</b></div><div><small>Worst</small><b class="${tone(worst.net)}">${esc(worst.n)} ${esc(usd(worst.net, { cents: false }))}</b></div><div><small>Days counted</small><b>${n}</b></div>` : ''}</div>
      <p class="note">${esc(plural(n, 'trading day'))} is a small sample: a hint about when the setups appear, not a rule to skip a day.</p>`,
    enter() { /* nothing to burst */ },
    share: () => ({ kicker: 'All time · by weekday', title: best ? `${best.long} pays` : 'By weekday', big: best ? usd(best.net, { cents: false }) : '', tone: best ? tone(best.net) : 'flat', lines: [worst ? `${worst.long} is the weakest: ${usd(worst.net, { cents: false })}` : ''].filter(Boolean) }),
  };
}

/** the period as one plain text (Copy puts it on the clipboard): the money, the win rate, the best and worst, the evals, the one goal */
export function summaryText(w, p) {
  const out = [`${p.label}: ${usd(p.net)} on ${plural(p.trades, 'trade')}`];
  if (num(p.per_month) != null) out.push(`${usd(p.per_month, { cents: false })} a month at this pace`);
  if (p.wins != null && p.losses != null) out.push(`${p.wins} wins, ${p.losses} losses${num(p.win_pct) != null ? ` (${Math.round(p.win_pct)}%)` : ''}`);
  if (p.best && num(p.best.pnl) != null) out.push(`best ${p.best.bot || ''} ${usd(p.best.pnl)}`.replace('  ', ' '));
  if (p.worst && num(p.worst.pnl) != null) out.push(`worst ${p.worst.bot || ''} ${usd(p.worst.pnl)}`.replace('  ', ' '));
  const e = primary(w);
  if (e) out.push(e.to_target <= 0 ? `${e.plan || 'eval'}: target reached` : `${e.plan || 'eval'}: ${d0(e.to_target)} to go, ${d0(e.room)} above the floor`);
  if (w.next && w.next.goal) out.push('next: ' + w.next.goal);
  return out.join(' · ');
}
export function summary(w, p) {
  if (!p.trades) return null;
  const text = summaryText(w, p);
  return {
    id: 'summary', name: 'Summary', colors: ['#19140e', '#304e62', '#b08064'], mode: 1, ms: 9000,
    html: `${kick(`${p.label} · in words`)}${kt('The whole period, one line')}
      <p class="lesson" data-z="2" id="sumText">${esc(text)}</p>
      <div class="end"><button type="button" class="btn gold" data-act="copy-text" data-text="${esc(text)}">Copy as text</button></div>
      <p class="note">For a chat, a note or your coach: plain words, no numbers hidden. Paper and eval accounts, losses included.</p>`,
    enter() { /* nothing to burst */ },
    share: () => ({ kicker: `${p.label} · in words`, title: 'The whole period', big: usd(p.net, { cents: false }), tone: tone(p.net), lines: [text] }),
  };
}

const monday = (d) => { const t = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
/** where this week stands among every week so far (only on the Week page): the rank, the average week, and how far ahead or behind it is */
export function weekRank(w, p) {
  if (p.key !== 'week') return null;
  const m = new Map();
  for (const d of (w.periods.all || {}).days || []) if (Array.isArray(d) && num(d[1]) != null && /^\d{4}-\d{2}-\d{2}/.test(String(d[0]))) m.set(monday(d[0]), (m.get(monday(d[0])) || 0) + d[1]);
  const cur = p.to ? monday(p.to) : null;
  if (!cur || m.size < 2 || !m.has(cur)) return null;
  const weeks = [...m.entries()], mine = m.get(cur), better = weeks.filter(([k, v]) => k !== cur && mine > v).length, others = weeks.length - 1;
  const avg = weeks.filter(([k]) => k !== cur).reduce((a, [, v]) => a + v, 0) / others, rank = weeks.filter(([, v]) => v > mine).length + 1;
  return {
    id: 'weekrank', name: 'This week vs the rest', colors: ['#100d09', '#41472a', '#c8a24a'], mode: 2, ms: 7500,
    html: `${kick('This week · against every week so far')}${kt(rank === 1 ? 'Your best week yet' : `Week ${rank} of ${weeks.length}`)}
      <div class="hero" data-z="3"><span class="count xl ${tone(mine)}" data-fmt="usd0" data-to="${esc(mine)}">${esc(usd(0, { cents: false }))}</span><p class="sub">${esc(`better than ${better} of ${plural(others, 'other week')}`)}</p></div>
      <div class="split" data-z="2"><div><small>Average week</small><b class="${tone(avg)}">${esc(usd(avg, { cents: false }))}</b></div><div><small>This week</small><b class="${tone(mine)}">${esc(usd(mine, { cents: false }))}</b></div><div><small>Difference</small><b class="${tone(mine - avg)}">${esc(usd(mine - avg, { cents: false }))}</b></div></div>
      <p class="note">${esc(plural(weeks.length, 'week'))} of data: a few weeks is a hint, not a trend.</p>`,
    enter() { /* nothing to burst */ },
    share: () => ({ kicker: 'This week vs the rest', title: rank === 1 ? 'Your best week yet' : `Week ${rank} of ${weeks.length}`, big: usd(mine, { cents: false }), tone: tone(mine), lines: [`average week ${usd(avg, { cents: false })}`] }),
  };
}

export const extraCards = [passClock, cushion, weekRank, weekdays, summary];
