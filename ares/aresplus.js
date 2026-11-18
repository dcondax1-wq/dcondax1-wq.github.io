// ARES plus (ES module, 2026-11-04): the money maths under the trade and the account. Six blocks, all from arescore.js (oddsPlan, stopLadder,
// streakTable, passPace, dayBudget, payoutCheck): what a win must be worth (R and $), which stop width buys which size, how a losing streak
// eats the drawdown, how fast the pass has to go, the day's loss budget, a funded payout check. The structure is static (index.html), only the
// text changes, so an open block stays open while you type. Text only through textContent. Never blank: with no entry/stop each block says
// what it needs and still shows the part that does not depend on it (the ladder, the day budget, the pace).
import { oddsPlan, stopLadder, streakTable, passPace, dayBudget, payoutCheck, ddText, usd, num } from './arescore.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const fill = (el, ...kids) => { if (el) el.replaceChildren(...kids.flat().filter(Boolean)); };
const table = (head, rows, cls = '') => {
  const t = h('table', 'ptab ' + cls), hr = h('tr');
  head.forEach((x) => hr.append(h('th', '', x))); t.append(hr);
  rows.forEach((r) => { const tr = h('tr', r.cls || ''); r.cells.forEach((c, i) => tr.append(h('td', i === 0 ? 'k' : (c && c.cls) || '', c && c.t != null ? c.t : c))); t.append(tr); });
  return t;
};

export function renderPlus(S, R, rules) {
  const z = R.size;
  const I = { ...S.st, entry: S.st.entry, stop: S.st.stop, balance: z.bal, peak: num(S.st.peak) ?? undefined };

  // ---- what a win must be worth
  const o = oddsPlan(rules, I);
  $('plusOddsS').textContent = o.valid ? `stop-out -${usd(o.lossAll)} (-1.0R) · 2R win +${usd(o.rows.find((r) => r.r === 2).usd)}` : 'enter entry + stop';
  fill($('plusOdds'), o.valid ? [
    h('p', 'plain', `A stop-out costs ${usd(o.lossAll)} (${o.n} ${o.inst}, slippage and commission in). A win pays:`),
    table(['Win', 'Price', 'You make', 'Win rate to break even'], o.rows.map((r) => ({ cells: [`${r.r}R`, r.price.toFixed(2), { t: '+' + usd(r.usd), cls: 'good' }, r.needTxt] }))),
    h('p', 'note', o.ref)] : [h('p', 'plain', 'Enter your entry and your stop: the page shows what 1R, 2R, 3R, 5R and 8R pay in dollars and the win rate each one needs.')]);

  // ---- the stop ladder
  const L = stopLadder(rules, I);
  $('plusLadderS').textContent = `budget ${usd(L.budget)} · ${L.inst}`;
  const cur = z.valid ? z.pts : null;
  fill($('plusLadder'), [
    h('p', 'plain', `With a risk budget of ${usd(L.budget)} (${ddText(L.room, L.mll)}), a wide stop buys fewer contracts. The size follows the stop:`),
    table(['Stop', 'Size', 'Risk', 'Room after'], L.rows.map((r) => ({ cls: cur != null && Math.abs(r.pts - cur) < 3 ? 'me' : r.fits ? '' : 'dim', cells: [`${r.pts} pts`, r.fits ? `${r.n} ${L.inst}` : 'none', usd(r.risk), usd(r.roomAfter)] }))),
    h('p', 'note', 'The bot puts the stop 1 tick beyond the sweep extreme, never a fixed distance, then sizes to it. Bot stops run 8 to 80 points.')]);

  // ---- a losing streak
  const st = streakTable(rules, I, 5);
  $('plusStreakS').textContent = st.valid ? (st.bustAt ? `${st.bustAt} in a row ends it` : `5 in a row: room left`) : 'needs a size';
  fill($('plusStreak'), st.valid ? [
    h('p', 'plain', st.plain),
    table(['Stop-outs in a row', 'Balance', 'Drawdown left'], st.rows.map((r) => ({ cls: r.dead ? 'bad' : '', cells: [String(r.k), usd(r.bal), { t: r.dead ? 'DEAD' : `${usd(r.room)} of ${usd(st.mll)}`, cls: r.dead ? 'bad' : '' }] }))),
    h('p', 'note', 'Each stop-out costs the same dollars here; the floor does not fall when you lose, so the room only shrinks.')] : [h('p', 'plain', st.why || 'Enter an entry and a stop to see a losing streak at your size.')]);

  // ---- the daily loss budget
  const d = dayBudget(rules, I);
  $('plusDayS').textContent = d.has ? `${usd(d.left)} of ${usd(d.dll)} left` : 'no daily limit';
  const bar = h('span', 'pbar'), bi = h('i'); bi.style.width = `${Math.round((d.has ? d.frac : 1) * 100)}%`; bar.append(bi);
  fill($('plusDay'), [h('p', 'plain', d.has ? `${d.text}. ${d.plain}` : d.plain), d.has ? bar : null, h('p', 'note', 'The daily loss limit is soft: hit it and trading pauses for the session, the account stays open. Your own stop-for-the-day rule comes first.')]);

  // ---- the pass pace
  const p = passPace(rules, I, 10);
  $('plusPaceS').textContent = S.st.stage === 'eval' ? `${usd(p.toTarget)} to go` : 'eval only';
  fill($('plusPace'), S.st.stage === 'eval' ? [h('p', 'plain', p.plain), h('p', 'note', 'The bot trades 2-4 times a week; the study passes about 59% of evals inside 2 weeks (Jul-Oct). A bigger size passes faster and also fails faster.')]
    : [h('p', 'plain', 'This account is funded: there is no target to reach, see the payout check.')]);

  // ---- the payout check
  const pc = payoutCheck(rules, I);
  $('plusPayS').textContent = pc.funded ? (pc.ok ? `up to ${usd(pc.gross)}` : 'not yet') : 'after the pass';
  fill($('plusPay'), [h('p', 'plain', pc.plain), pc.funded ? h('p', 'note', `${usd(pc.above)} above the start + ${usd(pc.buffer)} buffer. Five simulated payouts, then a live account.`) : null]);
}
