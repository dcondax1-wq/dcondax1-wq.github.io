// PLUTUS plus (ES module, 2026-11-04): four decision blocks from plutuscore.js (rankPlans, buyPlan, payoutRace, cashCushion): the plan that pays the most
// per dollar of fees, how many evals to buy for a funded account, who pays first, and how deep the bad case dips. Static markup in index.html, text
// only through textContent; every block says what to do when no account is picked. Study numbers, not promises. Never blank, no network.
import { rankPlans, buyPlan, payoutRace, cashCushion, usd } from './plutuscore.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const fill = (el, ...kids) => { if (el) el.replaceChildren(...kids.flat().filter(Boolean)); };
const table = (head, rows) => {
  const t = h('table', 'ptab'), hr = h('tr');
  head.forEach((x) => hr.append(h('th', '', x))); t.append(hr);
  rows.forEach((r) => { const tr = h('tr', r.cls || ''); r.cells.forEach((c, i) => tr.append(h('td', i === 0 ? 'k' : (c && c.cls) || '', c && c.t != null ? c.t : c))); t.append(tr); });
  return t;
};
const bars = (rows, label, val, txt) => { const box = h('div', 'rbars'); rows.forEach((r) => { const line = h('div', 'rb'), i = h('i'); i.style.width = `${Math.max(3, Math.round(val(r) * 100))}%`; const bar = h('span', 'bar'); bar.append(i); line.append(h('span', 'n', label(r)), bar, h('span', 'v', txt(r))); box.append(line); }); return box; };

export function renderPlus(S, P) {
  const doc = S.doc, span = P.span;
  // ---- the best plan per dollar
  const R = rankPlans(doc, span);
  $('plusRankS').textContent = R.best ? `${R.best.name} first` : '';
  const owned = (id) => (S.st.counts[id] || 0) > 0;
  fill($('plusRank'), [h('p', 'plain', R.plain),
    table(['Plan', 'Fees', 'Net 6 mo', 'Back per $1'], R.rows.map((r, i) => ({ cls: i === 0 ? 'me' : owned(r.id) ? 'mine' : '', cells: [r.name, usd(r.fees), { t: usd(r.net6), cls: r.net6 >= 0 ? 'good' : 'bad' }, r.roi >= 0 ? r.roi.toFixed(0) + 'x' : '-' + Math.abs(r.roi).toFixed(1) + 'x'] }))),
    h('p', 'note', 'Net = payouts minus fees over 6 months, the study mean, bot trades and costs in. Your own accounts are tinted. A cap of 1 means the firm allows one account.')]);

  // ---- how many evals to buy
  const sel = S.buyId && doc.plans.some((p) => p.id === S.buyId) ? S.buyId : (doc.plans.find((p) => owned(p.id)) || doc.plans[0]).id;
  S.buyId = sel;
  const plan = doc.plans.find((p) => p.id === sel), B = buyPlan(plan, span);
  $('plusBuyS').textContent = B.pass > 0 ? `${B.eEvals.toFixed(1)} evals per funded` : '';
  const seg = h('div', 'row seg2', null); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Plan');
  doc.plans.forEach((p) => { const b = h('button', '', p.name.replace(/^Builder /, 'MFFU ').replace(/ 50K$/, ' 50K')); b.type = 'button'; b.dataset.buy = p.id; b.setAttribute('aria-pressed', String(p.id === sel)); b.addEventListener('click', () => { S.buyId = p.id; renderPlus(S, P); }); seg.append(b); });
  fill($('plusBuy'), [seg, h('p', 'plain', B.plain),
    table(['Evals bought', 'Fees', 'At least one funded'], B.rows.map((r) => ({ cells: [String(r.n), usd(r.fees), { t: `${Math.round(r.atLeastOne * 100)}%`, cls: r.atLeastOne >= 0.9 ? 'good' : '' }] }))),
    h('p', 'note', 'Each eval is bought again when it fails, so the fees add up until one passes. The pass chance is the study\'s share of evals that reach the target inside 60 sessions.')]);

  // ---- who pays first
  const RC = payoutRace(doc, span);
  $('plusRaceS').textContent = RC.first ? `${RC.first.name}: ${Math.round(RC.first.weeks)} weeks` : '';
  fill($('plusRace'), [h('p', 'plain', RC.plain),
    RC.rows.length ? bars(RC.rows, (r) => r.name, (r) => r.bar, (r) => `${Math.round(r.weeks)} wk`) : null,
    h('p', 'note', 'Weeks to the first payout in the study\'s middle case (5 sessions a week). A shorter bar pays sooner.')]);

  // ---- the cash cushion
  const C = cashCushion(P);
  $('plusCushionS').textContent = C.has ? (C.dip < 0 ? `bad case ${usd(C.dip)}` : 'stays above zero') : 'pick an account';
  fill($('plusCushion'), [h('p', 'plain', C.plain), C.has ? h('p', 'note', `Drawdown here means money out of your pocket, not the account's max loss: fees paid before the payouts arrive.`) : null]);
  renderKeep(P);
}

/** AGORA (2026-11-09): what you keep, and which account earns it. Plain money first; study numbers, not promises. */
function renderKeep(P) {
  const box = $('keepBody');
  if (!box) return;
  if (!P || !P.accounts) { fill(box, [h('p', 'plain', 'Pick an account above and this shows what you would keep each month, and which account earns it.')]); return; }
  const tax = Math.max(0, P.steady_raw - P.steady), grid = h('div', 'keepgrid');
  [['First 6 months', P.avg6, 'a month, after tax'], ['After that', P.steady, 'a month, after tax'], ['Set aside for tax', tax, 'a month (your slider)']].forEach(([k, v, s]) => {
    const c = h('div', 'keepc'); c.append(h('span', 'ag-cap', k), h('b', 'ag-money' + (v < 0 ? ' neg' : ''), usd(v)), h('small', 'ag-cap', s)); grid.append(c);
  });
  const top = Math.max(1, ...P.rows.map((r) => Math.abs(r.six))), list = h('div', 'rbars');
  P.rows.forEach((r) => {
    const line = h('div', 'rb'), i = h('i'), bar = h('span', 'bar');
    i.style.width = `${Math.max(3, Math.round((Math.abs(r.six) / top) * 100))}%`; if (r.six < 0) i.style.background = 'var(--ag-terra, #c96a4a)'; bar.append(i);
    line.append(h('em', '', `${r.n} x ${r.name}`), bar, h('b', r.six >= 0 ? 'good' : 'bad', usd(r.six)));
    list.append(line);
  });
  fill(box, [grid, h('p', 'note', 'Net of fees over the first 6 months, per account type. Bad case at the end of the plan: ' + usd(P.p10M) + ' in total (about ' + usd(P.p10M / Math.max(1, P.months)) + ' a month).'), list]);
}
