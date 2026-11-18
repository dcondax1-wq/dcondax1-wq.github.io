// PLUTUS money plan (ES module, 2026-11-04): the owner's 12-month money roadmap as a card on the Plan tab. Reads roadmap.json (GET, same folder; made by
// python -X utf8 tools/money_roadmap.py from research/props/roadmap.json) and falls back to roadmapfallback.js (the same file, generated, tagged OFFLINE COPY)
// so the card is never blank. The conservative Jul-Oct number comes first, Jan-Jun second. Text only through textContent. Study numbers, not promises.
import { FALLBACK } from './roadmapfallback.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const usd = (v) => (v == null || !Number.isFinite(v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
const VER = { H2: 'Jul-Oct (conservative)', H1: 'Jan-Jun' };
const valid = (d) => !!(d && d.versions && ['H2', 'H1'].every((k) => d.versions[k] && Array.isArray(d.versions[k].months) && d.versions[k].months.length === 12) && Array.isArray(d.accounts) && Array.isArray(d.todo) && Array.isArray(d.caveats));

export async function loadRoadmap(url = 'roadmap.json') {
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 6000) : 0;
    const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); clearTimeout(tm);
    const d = r.ok ? await r.json() : null;
    if (valid(d)) return { doc: d, src: 'file' };
  } catch (_) { /* fall through to the offline copy */ }
  return { doc: FALLBACK, src: 'offline' };
}

/** which of the 12 months today is in: before the start = month 1, after the end = month 12 */
export function monthIndex(months, today) {
  const t = String(today).slice(0, 10);
  if (t < months[0].from) return { i: 0, state: 'before' };
  for (let i = 0; i < months.length; i++) if (t >= months[i].from && t <= months[i].to) return { i, state: 'in' };
  if (t > months[months.length - 1].to) return { i: months.length - 1, state: 'after' };
  return { i: months.length - 1, state: 'in' };       // a weekend gap between two months: the earlier one is still the running month
}
export function thisMonthSentence(doc, today) {
  const m2 = doc.versions.H2.months, m1 = doc.versions.H1.months;
  const { i, state } = monthIndex(m2, today);
  const lead = state === 'before' ? `The plan starts ${m2[0].from}. ` : state === 'after' ? 'The 12 months are over; this is the last one. ' : '';
  return `${lead}This month (month ${i + 1}, ${m2[i].from} to ${m2[i].to}): ${doc.todo[i]} Expected cash: ${usd(m2[i].net)} (conservative), ${usd(m1[i].net)} (Jan-Jun).`;
}

const table = (head, rows, cls) => {
  const t = h('table', 'ptab' + (cls ? ' ' + cls : '')), hr = h('tr');
  head.forEach((x) => hr.append(h('th', '', x))); t.append(hr);
  rows.forEach((r) => { const tr = h('tr', r.cls || ''); r.cells.forEach((c, i) => tr.append(h('td', i === 0 ? 'k' : '', c))); t.append(tr); });
  return t;
};
const det = (title, sum, open, ...kids) => {
  const d = h('details', 'pd'); if (open) d.open = true;
  const s = h('summary'); s.append(h('b', '', title), h('span', '', sum || '')); d.append(s);
  const box = h('div'); box.append(...kids.flat().filter(Boolean)); d.append(box); return d;
};

export function renderRoadmap(doc, src, opts = {}) {
  const host = $('mplanBody'); if (!host) return;
  const p = new URLSearchParams(location.search), today = opts.today || (/^\d{4}-\d{2}-\d{2}$/.test(p.get('today') || '') ? p.get('today') : new Date().toISOString().slice(0, 10));
  const which = opts.which === 'H1' ? 'H1' : 'H2';
  const V2 = doc.versions.H2, V1 = doc.versions.H1, paid = doc.paid_already || 0;
  const tag = $('mplanTag'); if (tag) tag.hidden = src === 'file';
  const kids = [];
  kids.push(h('p', 'plain mp-head', doc.headline));
  kids.push(h('p', 'plain mp-now', thisMonthSentence(doc, today)));
  // the two numbers, conservative first
  const box = h('div', 'mp-two');
  for (const k of ['H2', 'H1']) {
    const v = doc.versions[k], c = h('div', 'mp-cell' + (k === 'H2' ? ' first' : ''));
    c.append(h('span', '', k === 'H2' ? 'Conservative (Jul-Oct)' : 'Jan-Jun (second)'), h('b', '', usd(v.mid)), h('small', '', `by month 12 · worst ${usd(v.lo)} · best ${usd(v.hi)}`));
    box.append(c);
  }
  kids.push(box);
  // the version buttons and the 12 monthly rows
  const seg = h('div', 'row seg2 mp-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Which months the plan is judged on');
  for (const k of ['H2', 'H1']) {
    const b = h('button', '', VER[k]); b.type = 'button'; b.dataset.mp = k; b.setAttribute('aria-pressed', String(k === which));
    b.addEventListener('click', () => renderRoadmap(doc, src, { ...opts, which: k, today })); seg.append(b);
  }
  const V = doc.versions[which];
  const tab = table(['Month', 'Cash in', 'Fees', 'Net', 'Total'], V.months.map((r) => ({ cls: monthIndex(V2.months, today).i === r.m - 1 ? 'me' : '', cells: [`${r.m} · ${r.from.slice(5)}`, usd(r.in), usd(r.out), usd(r.net), usd(r.cum - paid)] })), 'mp-months');
  kids.push(det('Month by month', VER[which], true, seg,
    h('p', 'note', `Total = cash after every fee, including the ${usd(paid)} already paid for the three evals now running. Worst case (1 path in 10) ${usd(V.lo)}, best case ${usd(V.hi)} by month 12.`), tab));
  // who pays first
  const first = (a, k) => { const f = a[k].first; return f && f[1] ? `${f[1]} (${f[0]} to ${f[2]})` : '-'; };
  kids.push(det('Who pays first', 'ATLAS', false,
    table(['Account', 'First payout, middle (range)', 'Back in month'], doc.accounts.map((a) => ({ cells: [a.label.replace(' on a 25K', ' 25K').replace(' on the 50K', ' 50K'), first(a, 'H2'), `${a.H2.payback} · Jan-Jun ${a.H1.payback}`] })), 'mp-first'),
    h('p', 'note', 'Conservative (Jul-Oct) dates shown; the range is 1 path in 10 to 9 in 10. Back in month = the month the account has paid back its price.')));
  // the order of buying
  const o = doc.order, wc = o.wait_cost;
  const ord = [h('p', 'plain', `${o.best} Waiting a month between buys costs ${usd(wc.H2[0])} to ${usd(wc.H2[1])} over the year (Jan-Jun: ${usd(wc.H1[0])} to ${usd(wc.H1[1])}). If you must wait: ${o.if_waiting.H2}.`),
    h('p', 'plain', `When an account has had its 5th payout, re-buy ATLAS 25K first: it adds ${usd(o.rebuy.H2.A25)} in the year (conservative), LIT 50K ${usd(o.rebuy.H2.L50)}, BLITZ ${usd(o.rebuy.H2.B25)}.`),
    table(['Second 25K slot', 'Year, all three', 'Alone'], o.second_25k.H2.map((r) => ({ cells: [r.slot.replace(' on the 2nd 25K', '').replace(' (the plan)', ' (plan)'), usd(r.net12), usd(r.alone)] })), 'mp-slot'),
    h('p', 'note', 'Conservative (Jul-Oct). A second ATLAS or a LIT copy earns more than BLITZ in that slot, but check the MFFU rules before copying a strategy to a second account.')];
  kids.push(det('Order of buying', 'all three now', false, ...ord));
  // the caveats, in plain words
  const ul = h('ul', 'mp-cav'); doc.caveats.forEach((c) => ul.append(h('li', '', c)));
  kids.push(det('Read this first', `${doc.caveats.length} points`, false, ul));
  const was = [...host.querySelectorAll('details')].map((d) => d.open);
  host.replaceChildren(...kids);
  if (was.length) host.querySelectorAll('details').forEach((d, i) => { if (was[i] != null) d.open = was[i]; });
  host.dataset.src = src; host.dataset.which = which;
}

export async function startRoadmap() {
  const { doc, src } = await loadRoadmap();
  try { renderRoadmap(doc, src); } catch (e) { const host = $('mplanBody'); if (host) host.replaceChildren(h('p', 'plain', doc.headline || 'The money plan could not be drawn.')); throw e; }
  return { doc, src };
}
