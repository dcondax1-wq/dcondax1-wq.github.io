// THE DECEMBER CARD on nq/ (night-nq-main 2026-11-27). Its own module, code-split: nq.js adds it when #decCard nears the screen or the
// browser is idle. Reads ./december.json once (tools/december_plan.py); the model is decore.js. textContent / createElement only.
// Summary row, each account's pass / payout odds by Dec 31 on two market paths (2026-like vs 2021-25-like), the month as a Mon-Fri grid
// with the flagged days, and a tap on a day = what the bots do that day.
import { december, dayDetail, short } from './decore.js?v=1';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
let M = null, pick = null;

function stat(k, v, s) { const t = el('div', 'dc-stat'); t.appendChild(el('span', 'dc-k', k)); t.appendChild(el('b', 'dc-v ag-num', v)); if (s) t.appendChild(el('span', 'dc-s', s)); return t; }
function bar(label, v, cls) {
  const r = el('div', 'dc-bar ' + cls); r.appendChild(el('span', 'dc-bl', label));
  const tr = el('i', 'dc-bt'), f = el('i', 'dc-bf'); f.style.width = v === null ? '0%' : `${v}%`; tr.appendChild(f); r.appendChild(tr);
  r.appendChild(el('b', 'dc-bv ag-num', v === null ? '-' : `${v}%`)); return r;
}
function drawDetail() {
  const box = $('decDay'); if (!box || !M) return;
  clear(box); const D = dayDetail(M.days[pick]);
  box.className = 'dc-day tone-' + D.tone;
  box.appendChild(el('b', 'dc-dt', D.title || 'Tap a day'));
  for (const l of D.lines) box.appendChild(el('p', 'dc-dl', l));
  for (const b of document.querySelectorAll('#decCard .dc-cell[data-day]')) b.setAttribute('aria-pressed', b.dataset.day === pick ? 'true' : 'false');
}
function draw(J) {
  const box = $('decCard'); if (!box) return;
  M = december(J, Date.now() / 1000); pick = M.pick;
  clear(box); box.hidden = false;
  const hd = el('div', 'dc-head'), h2 = el('h2', 'dc-h', 'December plan'); h2.id = 'decH'; hd.appendChild(h2);
  hd.appendChild(el('span', 'pill ' + (M.has ? (M.over ? 'warn' : 'ok') : 'warn'), M.has ? `made ${M.madeShort}` : 'NOT PUBLISHED'));
  box.appendChild(hd);
  if (!M.has) { box.appendChild(el('p', 'dc-none', M.line)); return; }
  if (M.line) box.appendChild(el('p', 'dc-none', M.line));
  const S = M.summary, row = el('div', 'dc-sum');
  row.appendChild(stat('Sessions', S.sessions ?? '-', `${S.half ? S.half + ' half day' + (S.half > 1 ? 's' : '') : 'no half day'}${S.closed ? ` · ${S.closed} closed` : ''}`));
  row.appendChild(stat('LIT trades', S.lit === null ? '-' : `~${Math.round(S.lit)}`, 'expected this month'));
  row.appendChild(stat('ATLAS trades', S.atlas === null ? '-' : `~${Math.round(S.atlas)}`, 'expected this month'));
  row.appendChild(stat('High news', S.news, S.roll ? `roll ${S.roll}` : ''));
  box.appendChild(row);
  const od = el('div', 'dc-odds'); od.setAttribute('role', 'list');
  for (const a of M.accts) {
    const c = el('article', 'dc-acc'); c.setAttribute('role', 'listitem');
    c.setAttribute('aria-label', `${a.name}: ${a.what} ${a.good ?? '-'}% if December trades like 2026, ${a.bad ?? '-'}% if it trades like 2021-25`);
    const t = el('div', 'dc-at'); t.appendChild(el('b', '', a.name)); t.appendChild(el('span', 'dc-ab', a.bots)); c.appendChild(t);
    c.appendChild(el('span', 'dc-aw', a.what));
    c.appendChild(bar('2026-like', a.good, 'good')); c.appendChild(bar('bad years', a.bad, 'bad'));
    const f = [a.day ? `${a.dayWord} ${a.day}` : '', a.failGood !== null ? `fail ${a.failGood}% / ${a.failBad}%` : ''].filter(Boolean).join(' · ');
    if (f) c.appendChild(el('span', 'dc-af', f));
    od.appendChild(c);
  }
  box.appendChild(od);
  const cal = el('div', 'dc-cal'); cal.setAttribute('role', 'group'); cal.setAttribute('aria-label', 'December trading days: tap a day to see what the bots do');
  for (const w of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) cal.appendChild(el('span', 'dc-wd', w));
  for (const wk of M.weeks) for (const iso of wk.cells) {
    if (!iso) { cal.appendChild(el('span', 'dc-blank')); continue; }
    const d = M.days[iso], b = el('button', 'dc-cell ' + d.flags.map((x) => 'f-' + x.replace(/\s+/g, '-')).join(' ') + (d.today ? ' today' : '') + (d.past ? ' past' : ''));
    b.type = 'button'; b.dataset.day = iso; b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${d.wd} ${short(iso)}${d.tags.length ? ': ' + d.tags.join(', ') : ''}`);
    b.appendChild(el('b', '', d.n)); if (d.flags.length) b.appendChild(el('i', 'dc-dot', ''));
    b.addEventListener('click', () => { pick = iso; drawDetail(); });
    cal.appendChild(b);
  }
  box.appendChild(cal);
  const key = el('div', 'dc-key');
  for (const [c, t] of [['k7', '7-day deadline'], ['news', 'High news'], ['roll', 'Roll'], ['early-close', 'Half day'], ['closed', 'Closed']]) { const s = el('span', 'dc-kk f-' + c); s.appendChild(el('i', 'dc-dot')); s.appendChild(document.createTextNode(t)); key.appendChild(s); }
  box.appendChild(key);
  const det = el('div', 'dc-day'); det.id = 'decDay'; det.setAttribute('aria-live', 'polite'); box.appendChild(det);
  const fn = el('details', 'dc-fine'); fn.appendChild(el('summary', '', 'Where these numbers come from'));
  for (const t of [M.note, ...M.caveats, M.taxes ? 'Taxes: ' + M.taxes : '']) if (t) fn.appendChild(el('p', '', t));
  box.appendChild(fn);
  drawDetail();
}
fetch('./december.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then(draw);
