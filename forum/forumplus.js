// FORUM plus (ES module, 2026-11-04): "Money today" (drawdown left of the max loss, the pace to pass, what size the room allows at four stop widths,
// the news rule) and "The trading day" (the bot's day as a bar with a now marker and a countdown). From forumcore.js (moneyToday, riskPlan,
// tradingDay, newsGate). Text only through textContent; never blank (the demo eval fills it); read-only, a plan to read, never a signal.
import { moneyToday, riskPlan, tradingDay, newsGate, evalOf } from './forumcore.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const usd = (x) => { const v = Math.round(+x || 0), s = '$' + Math.abs(v).toLocaleString('en-US'); return v < 0 ? '-' + s : s; };
const TONE = { calm: '#7f8a52', watch: '#c8a24a', storm: '#c96a4a', info: '#4b7a99' };

export function renderMoney(box, home, pan) {
  if (!box) return null;
  const ev = evalOf(home), M = moneyToday(ev), R = riskPlan(ev, 0.4), N = newsGate(pan, Date.now());
  box.replaceChildren();
  box.append(h('p', 'dhead', 'Money today'));
  const card = h('div', 'mcard'); card.style.setProperty('--dtone', TONE[M.has ? M.tone : 'info']);
  if (M.has) {
    const bar = h('span', 'mbar'), i = h('i'); i.style.width = `${Math.round(M.frac * 100)}%`; bar.append(i);
    const hero = h('div', 'mhero');
    [['Drawdown left', usd(M.room), `of ${usd(M.mll)} max loss`, M.tone], ['To the target', usd(M.toTarget), M.toTarget <= 0 ? 'reached' : 'still to make', 'calm'],
      ['A session needs', M.perSession == null ? '-' : usd(M.perSession), M.left ? `${M.left} session${M.left === 1 ? '' : 's'} left in the 2 weeks` : 'no session count yet', 'info']].forEach(([k, v, n, tn]) => {
      const c = h('div', 'mh'); c.style.setProperty('--mt', TONE[tn] || TONE.info); c.append(h('span', 'ag-cap', k), h('b', 'ag-money', v), h('small', 'ag-cap', n)); hero.append(c);
    });
    card.append(hero);
    card.append(h('b', 'mdd', M.ddText), bar, h('p', 'mline', `${M.paceText}${M.locked ? ' The floor is locked at start + $100.' : ''}`));
    const t = h('table', 'mtab'), hr = h('tr');
    ['Stop', 'Size', 'Risk', 'A 2R win'].forEach((x) => hr.append(h('th', '', x))); t.append(hr);
    R.rows.forEach((r) => { const tr = h('tr'); tr.append(h('td', 'k', `${r.pts} pts`), h('td', '', r.n ? `${r.n} MNQ` : 'none'), h('td', '', usd(r.risk)), h('td', 'good', r.n ? '+' + usd(r.win2) : '-')); t.append(tr); });
    card.append(t, h('p', 'mnote', R.text));
  } else card.append(h('b', 'mdd', 'No eval published'), h('p', 'mline', 'When an eval account is on the site, this card shows the drawdown left, the pace to pass and the size the room allows.'));
  const news = h('p', 'mnews', N.line); news.style.setProperty('--ntone', TONE[N.tone] || TONE.info);
  card.append(news);
  box.append(card);
  return { M, R, N };
}

export function renderDay(box, p) {
  if (!box) return null;
  const D = tradingDay(p);
  box.replaceChildren();
  box.append(h('p', 'dhead', 'The trading day (ET)'));
  const bar = h('div', 'dbar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', D.line);
  D.segs.forEach((s) => { const e = h('i', 'ds ' + s.kind); e.style.width = `${((s.b - s.a) / 24) * 100}%`; e.title = s.name; bar.append(e); });
  const now = h('span', 'dnow'); now.style.left = `${Math.max(0, Math.min(100, (D.now / 24) * 100))}%`; bar.append(now);
  const ticks = h('div', 'dticks'); ['00', '06', '12', '18', '24'].forEach((x) => ticks.append(h('span', '', x)));
  box.append(bar, ticks, h('p', 'dline', D.line));
  box.dataset.state = D.state;
  return D;
}

/** AGORA (2026-11-09): the first card's hero: the drawdown left in one big number, and where the bot's day is. */
export function renderHero(box, home, p) {
  if (!box) return;
  const M = moneyToday(evalOf(home)), D = tradingDay(p);
  box.replaceChildren();
  box.append(h('span', 'ag-cap', M.has ? 'Drawdown left today' : 'Your eval'));
  box.append(h('b', 'ag-money', M.has ? usd(M.room) : 'No eval published'));
  if (M.has) {
    const bar = h('span', 'mbar'), i = h('i'); i.style.width = `${Math.round(M.frac * 100)}%`; bar.append(i);
    box.append(bar, h('small', 'ag-cap', M.room > M.mll ? `floor locked: more than the ${usd(M.mll)} max loss is still in reach` : `of ${usd(M.mll)} max loss`));
  }
  box.append(h('p', 'heroline', D.line));
}
