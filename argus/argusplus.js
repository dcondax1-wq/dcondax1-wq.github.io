// ARGUS plus (ES module, 2026-11-04): the Money tab. Can the bot trade today (the gates and a countdown to the 02:00 ET entry window), the two evals in
// money words ("Drawdown left $X of $max loss", the 7-day inactivity clock) and what the red lights of the last 14 days cost (entry-window hours,
// trades at risk). From arguscore.js (readiness, moneyLines, blindCost, demoData). Text only through textContent; read only. With no data it says so
// and offers the demo (?demo=1): never a blank pane.
import { readiness, moneyLines, blindCost, histSummary } from './arguscore.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const MARK = { ok: 'ok', warn: 'warn', bad: 'bad', idle: 'idle' };

export function renderMoney(box, R, hist, now) {
  if (!box) return null;
  box.replaceChildren();
  if (!R || !R.hasData) {
    box.append(h('p', 'grp', 'Money'), h('p', 'empty', 'I cannot see the dashboard yet, so I cannot say whether the bot can trade or how much room the evals have. Open this on Wi-Fi once, or look at a recorded day.'));
    const b = h('a', 'demobtn', 'See it with demo data'); b.href = '?demo=1#money'; b.setAttribute('role', 'button'); box.append(b);
    box.append(h('p', 'grp', 'What you will see here'), h('p', 'empty', 'The gates that must be green before 02:00 ET, the drawdown left on Zlarior and ATLAS as "$X of $max loss", the 7-day inactivity clock, and what red lights cost in missed trades.'));
    return null;
  }
  const Rd = readiness(R, now), M = moneyLines(R), B = blindCost(hist, now), S = histSummary(hist, now);
  // ---- AGORA: the money first, in big plain numbers
  const hv = h('div', 'mhero'), left = M.filter((m) => m.has).reduce((t, m) => t + m.room, 0), miss$ = Math.round(B.missed * 365);
  M.forEach((m) => { const c = h('div', 'mh ' + MARK[m.level]); c.append(h('span', 'ag-cap', `${m.label}: drawdown left`), h('b', 'ag-money', m.has ? '$' + Math.round(m.room).toLocaleString('en-US') : '-'), h('small', 'ag-cap', m.has ? `of $${m.mll.toLocaleString('en-US')} max loss` : 'no balance yet')); hv.append(c); });
  const tot = h('div', 'mh total'); tot.append(h('span', 'ag-cap', 'Both evals together'), h('b', 'ag-money', M.some((m) => m.has) ? '$' + Math.round(left).toLocaleString('en-US') : '-'), h('small', 'ag-cap', 'drawdown left in total'));
  const mis = h('div', 'mh total'); mis.append(h('span', 'ag-cap', 'Red lights, 14 days'), h('b', 'ag-money' + (miss$ > 0 ? ' neg' : ''), miss$ > 0 ? `about $${miss$.toLocaleString('en-US')}` : '$0'), h('small', 'ag-cap', 'of trades that may have been missed, at about $365 a trade (the 2026 average)'));
  hv.append(tot, mis); box.append(hv);
  // ---- can the bot trade today
  box.append(h('p', 'grp', 'Can the bot trade today?'));
  const head = h('div', 'rdy ' + (Rd.ready ? (Rd.blockers.length ? 'warn' : 'ok') : 'bad'));
  head.append(h('b', '', Rd.ready ? (Rd.blockers.length ? 'Yes, with a look' : 'Yes') : 'No'), h('span', '', Rd.plain));
  box.append(head, h('p', 'note', Rd.when));
  const list = h('div', 'gates');
  Rd.gates.forEach((g) => { const r = h('div', 'gate ' + MARK[g.level]); r.append(h('i', '', g.level === 'ok' ? '✓' : g.level === 'idle' ? '–' : '!'), h('span', 'gl', g.label), h('span', 'gv', g.value)); list.append(r); });
  box.append(list);
  // ---- the evals in money words
  box.append(h('p', 'grp', 'The evals: drawdown and the 7-day clock'));
  M.forEach((m) => {
    const c = h('div', 'mrow ' + MARK[m.level]);
    c.append(h('b', '', m.label), h('span', 'dd', m.ddText));
    const bar = h('span', 'mbar'), i = h('i'); i.style.width = `${m.frac == null ? 0 : Math.round(m.frac * 100)}%`; bar.append(i); c.append(bar);
    c.append(h('span', 'q ' + MARK[m.quietLevel], `Inactivity ${m.quiet}. ${m.quietText || ''}`.trim()));
    box.append(c);
  });
  // ---- what red lights cost
  box.append(h('p', 'grp', 'What red lights cost (14 days)'), h('p', 'plainp', B.plain));
  box.append(h('p', 'note', `${S.seen} day${S.seen === 1 ? '' : 's'} seen. The estimate counts the share of red time that falls inside the 13.5-hour entry window.`));
  return { Rd, M, B };
}

/** AGORA (2026-11-09): the first screen's hero: the one money fact (drawdown left on both evals) and what to do about it. */
export function renderHero(host, R) {
  if (!host || !R || !R.hasData) return;
  const M = moneyLines(R), have = M.filter((m) => m.has), left = have.reduce((t, m) => t + m.room, 0), mll = have.reduce((t, m) => t + m.mll, 0);
  const lvl = R.verdict.level, box = h('div', 'heroc ' + lvl);
  box.append(h('span', 'ag-cap', have.length ? 'Drawdown left, both evals' : 'Drawdown'), h('b', 'ag-money', have.length ? '$' + Math.round(left).toLocaleString('en-US') : 'no balance yet'));
  if (have.length) {
    const bar = h('span', 'mbar'), i = h('i'); i.style.width = `${Math.round(Math.max(0, Math.min(1, left / mll)) * 100)}%`; bar.append(i);
    box.append(bar, h('small', 'ag-cap', `of $${mll.toLocaleString('en-US')} max loss across ${have.length} eval${have.length === 1 ? '' : 's'}`));
  }
  box.append(h('p', 'heroline', R.verdict.line));
  host.insertBefore(box, host.firstChild);
}
