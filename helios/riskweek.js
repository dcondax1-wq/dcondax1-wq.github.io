// HELIOS: the next 7 days of market risk (day-arenas 2026-11-20, the audit's "Pythia -> Helios" merge). Pythia's own pure core and its
// generated events.json (tools/money/pythia_dates.py), shown as one fixed-height list inside the morning brief: each day's colour word
// (red / amber / light / calm / closed), its biggest event and the time in New York. Read only, text via textContent. Pythia keeps its full page.
import * as P from '../pythia/pythiacore.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const RANK = { closed: 4, high: 3, med: 2, low: 1, calm: 0 };

export function rows(events, nowSec, days) {
  const n = P.normEvents(events); if (!n) return null;
  const today = P.etParts(nowSec).ymd, cal = P.calendar(n, today, 10).filter((d) => d.dow < 5).slice(0, days || 5);
  return cal.map((d) => {
    const top = d.events.slice().sort((a, b) => (RANK[b.closed ? 'closed' : b.impact] || 0) - (RANK[a.closed ? 'closed' : a.impact] || 0))[0] || null;
    return { ymd: d.ymd, word: d.ymd === today ? 'Today' : d.word, risk: d.risk, riskWord: P.RISKWORD[d.risk], cls: P.RISKCLS[d.risk] || 'calm',
      what: top ? `${top.title}${top.time ? ' · ' + P.hmWord(top.time) : ''}` : 'No big release', more: Math.max(0, d.events.length - 1) };
  });
}

async function boot() {
  const box = document.getElementById('riskWeek'); if (!box) return;
  let ev = null; try { const r = await fetch('../pythia/events.json', { cache: 'no-cache' }); ev = r.ok ? await r.json() : null; } catch (e) { ev = null; }
  const list = box.querySelector('ul'), R = ev ? rows(ev, Date.now() / 1000, 5) : null;
  list.replaceChildren();
  if (!R) { list.appendChild(el('li', 'rw-row rw-empty', 'The risk calendar file is missing: open Pythia for the dates.')); return; }
  for (const d of R) {
    const li = el('li', 'rw-row'), m = el('div', 'rw-main');
    m.append(el('span', 'rw-day', `${d.word} · ${d.riskWord}`), el('span', 'rw-what', d.what + (d.more ? ` (+${d.more} more)` : '')));
    li.append(el('i', 'rw-dot ' + d.cls), m); list.appendChild(li);
  }
  box.classList.add('ready');
}
if (typeof document !== 'undefined') boot().catch(() => {});
