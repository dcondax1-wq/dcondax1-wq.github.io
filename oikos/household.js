// OIKOS household card (ES module, 2026-11-14): reads ../money/household.json (tools/money_import.py: your own bank exports, served only by the
// PC's private Tailscale link) and shows this month's money in / out by category, subscriptions with their next date, runway, net worth and the
// leaks. A separate module: if it fails, the rest of Oikos is untouched. Text only through textContent; sends nothing; stores nothing.
import { view, usd } from './householdcore.js';

const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const H = { ready: false, doc: null, v: null };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}

function render(v) {
  const card = $('hhCard');
  if (!card) return;
  $('hhPill').textContent = v.pill; $('hhPill').className = 'pill ' + v.pillCls;
  const lines = $('hhLines'); clear(lines); for (const t of v.lines) lines.appendChild(h('p', 'note', t));
  const kv = $('hhKv'); clear(kv); kv.hidden = !v.kpis.length;
  for (const k of v.kpis) { kv.appendChild(h('dt', '', k.label)); kv.appendChild(h('dd', k.cls || '', k.value)); }
  const cats = $('hhCats'); clear(cats); $('hhCatsH').hidden = !v.cats.length;
  for (const c of v.cats) {
    const li = h('li', 'hhcat'), t = h('div', 't'); t.appendChild(h('b', '', c.name)); t.appendChild(h('span', 'usd', usd(c.usd))); li.appendChild(t);
    const b = h('div', 'ag-bar amber'); b.setAttribute('role', 'img'); b.setAttribute('aria-label', `${c.name}: ${usd(c.usd)}`); b.appendChild(h('i')); b.firstChild.style.width = Math.round(Math.max(0.02, c.frac) * 100) + '%'; li.appendChild(b);
    cats.appendChild(li);
  }
  const subs = $('hhSubs'); clear(subs); $('hhSubsH').hidden = !v.subs.length;
  for (const s of v.subs) {
    const li = h('li', ''), t = h('div', 't'); t.appendChild(h('b', '', s.name)); t.appendChild(h('span', 'usd', `${usd(s.usd)} ${s.every}`)); li.appendChild(t);
    li.appendChild(h('p', '', `Next about ${s.next}${s.up > 0 ? `; up ${usd(s.up)} from before` : ''}`));
    subs.appendChild(li);
  }
  const lk = $('hhLeaks'); clear(lk); $('hhLeaksH').hidden = !v.leaks.length;
  for (const x of v.leaks) {
    const li = h('li', 'leak med'), t = h('div', 't'); t.appendChild(h('b', '', x.title)); t.appendChild(h('span', 'usd neg', `${usd(x.usd_month)} a month`)); li.appendChild(t);
    li.appendChild(h('p', '', x.detail)); lk.appendChild(li);
  }
  $('hhNote').textContent = v.notes.join(' ');
  card.hidden = false;
}

async function start() {
  const q = new URLSearchParams(location.search);
  // day-arenas 2026-11-20: household.json is served only over the PC's private link (engine/live_site MONEY_KEEP), never on the public site:
  // the public site does not ask for it (it was a 404 on every open); the PC's link and a local test server still do
  const priv = /^(localhost|127\.|10\.|192\.168\.|100\.)|\.ts\.net$/.test(location.hostname) || q.get('own') === '1';
  H.doc = q.get('demo') === '1' || !priv ? null : await getJSON('../money/household.json');
  H.v = view(H.doc);
  try { render(H.v); } catch (_) { /* the card stays hidden; Oikos itself is not affected */ }
  H.ready = true;
}
window.OIKOS_HOUSEHOLD = { ready: () => H.ready, state: () => (H.v ? H.v.state : null), H };
start();
