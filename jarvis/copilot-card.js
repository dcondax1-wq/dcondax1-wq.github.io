// Jarvis home: the money copilot card (J1, 2026-11-13). ONE card under the three tiles, and what it shows follows the New York clock:
//   01:45 ET  Morning plan   GO / CAREFUL / SIT OUT with the main reason, what each account can lose today, the bot's game plan, news, Kalshi
//   10:45 ET  Midday plan    the same, for the rest of the day (BLITZ's window and the New York session)
//   16:05 ET  Day summary    today's $ per account, drawdown left, the trades, Kalshi, tomorrow's big news (before 01:45 and on weekends: the last session)
// Every number comes from copilot.js over the published files (window.JARVIS_API.skills.card() when the brain's skills are up, else its own
// read of the same files through jdata.js); the card's foot names each file and how old it is. A tap on a line asks Jarvis the full question
// (data-say: the shell's own handler). ?demo=1 shows example numbers, labelled. Read only: nothing here trades, arms or sends.
//   window.__jarvisCopilot = { render(), refresh(), card(), model(), sources() }        (tests; sources() also feeds briefing.js's day lines)
// Safari 16: plain ES2020 module, no optional chaining.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const demo = /[?&]demo=1(?:&|$)/.test(location.search);
const $ = (id) => document.getElementById(id);
let host = null, last = null, busy = false, lastAt = 0, cp = null, jd = null, cache = null, cacheAt = 0;
const TONES = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'off', off: 'off' };
const dot = (t) => `<i class="hc-dot ${TONES[t] || 'off'}" aria-hidden="true"></i>`;

export const DEMO = { slot: '01:45', kind: 'morning', title: 'Morning plan', kicker: 'Money copilot · example numbers', verdict: 'CAREFUL', tone: 'warn',
  rows: [{ text: 'CAREFUL · News today: CPI at 08:30 ET (high impact).', tone: 'warn', say: 'Should I trade today?' },
    { text: 'Zlarior 50K: can lose $1,000 today; $1,420 before the eval fails (3 full losses).', tone: 'ok', say: 'How much can I lose today?' },
    { text: 'Kalshi: +$4.10 today, 2 open bets ($18 at risk).', tone: 'off', say: 'Kalshi exposure today' }],
  foot: 'Example numbers: your own appear once home.json loads.', asof: Date.now(), demo: true };

function style() {
  if ($('cpStyle')) return;
  const s = document.createElement('style'); s.id = 'cpStyle';
  s.textContent = '.cp-card .cp-k{margin:0 0 6px;color:var(--oly-th-n27, #b9ae9b);font:500 13.5px/1.4 var(--fb)}'
    + '.cp-chip{margin-left:auto;padding:2px 10px;border-radius:999px;font:600 13px/1.5 var(--fm);border:1px solid var(--dim2);color:var(--txt)}'
    + '.cp-chip.ok{border-color:var(--ok);color:var(--ok)}.cp-chip.warn{border-color:var(--warn);color:var(--warn)}.cp-chip.bad{border-color:var(--bad);color:var(--bad)}'
    + '.cp-card .hc-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.cp-card .hc-age{margin-top:6px}';
  document.head.appendChild(s);
}
export function html(c) {
  if (!c) return '';
  const chip = c.verdict ? `<span class="cp-chip ${esc(c.tone)}">${esc(c.verdict)}</span>` : c.total != null ? `<span class="cp-chip ${esc(c.tone)}">${esc((c.total > 0 ? '+' : c.total < 0 ? '−' : '') + '$' + Math.abs(Math.round(c.total)).toLocaleString('en-US'))}</span>` : '';
  const rows = (c.rows || []).map((r) => `<li><button class="hc-row" type="button" data-say="${esc(r.say || 'Should I trade today?')}">${dot(r.tone)}<span>${esc(r.text)}</span><b aria-hidden="true">›</b></button></li>`).join('');
  return `<section class="hc-sec cp-card" id="hcCopilot" data-slot="${esc(c.slot)}" data-kind="${esc(c.kind)}" aria-labelledby="cpT"><h2 id="cpT">${esc(c.title)}${chip}</h2>`
    + `<p class="cp-k">${esc(c.kicker)}</p><ul class="hc-list">${rows}</ul>${c.foot ? `<p class="hc-age">${esc(c.foot)}</p>` : ''}</section>`;
}
export function render(c) {
  if (!host) return '';
  const h = html(c);
  if (host.__html !== h) { host.innerHTML = h; host.__html = h; }
  host.setAttribute('data-ready', '1');
  return h;
}
async function mods() {
  if (!cp) { const m = await import('./copilot.js'); let store = null; try { store = window.localStorage; } catch (_) { store = null; } cp = m.createCopilot({ storage: store }); }
  if (!jd) jd = await import('./jdata.js');
  return { cp, jd };
}
async function sources() {
  if (cache && Date.now() - cacheAt < 120000) return cache;
  const { jd: J } = await mods();
  const S = await J.loadSources({ fetch: (...a) => fetch(...a), now: () => Date.now() });
  let f = null; try { f = window.__jarvis && window.__jarvis.facts ? window.__jarvis.facts() : null; } catch (_) { f = null; }
  if (f && f.kalshi && typeof f.kalshi === 'object') { S.kalshi = f.kalshi; S.at.kalshi = Date.now(); }
  cache = S; cacheAt = Date.now(); return S;
}
export async function card(opts) {
  if (demo) return DEMO;
  const api = window.JARVIS_API, sk = api && api.skills;
  if (sk && typeof sk.card === 'function' && !(opts && opts.own)) { try { const c = await sk.card(); if (c) return c; } catch (_) { /* our own read below */ } }
  if (opts && opts.force) cache = null;
  const { cp: C } = await mods();
  return C.card(await sources(), Date.now());
}
export async function refresh(opts) {
  if (busy || !host) return last;
  busy = true;
  try { const c = await card(opts); if (c) { last = c; lastAt = Date.now(); } } catch (_) { /* keep the last card */ }
  busy = false;
  if (last) render(last); else render({ slot: '', kind: 'missing', title: 'Money copilot', kicker: 'Money copilot', rows: [{ text: 'The copilot could not read the published files yet. Pull down to refresh.', tone: 'off', say: 'Are my feeds stale?' }], foot: '' });
  return last;
}
const visible = () => !document.hidden && document.documentElement.getAttribute('data-mode') === 'jarvis';
function start() {
  host = $('hcopilot');
  if (!host) return;
  style();
  host.innerHTML = '<section class="hc-sec cp-card" aria-busy="true"><h2>Money copilot</h2><p class="cp-k">Reading your numbers…</p></section>';
  setTimeout(() => refresh(), 600);                                                 // after the first paint: the tiles come first
  setInterval(() => { if (visible()) refresh(Date.now() - lastAt > 5 * 60e3 ? { force: true } : {}); }, 60000);   // the slot follows the clock
  document.addEventListener('visibilitychange', () => { if (visible()) refresh({ force: Date.now() - lastAt > 5 * 60e3 }); });
  document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-hc="refresh"]'); if (t) refresh({ force: true }); });
  window.__jarvisCopilot = { render: () => last && render(last), refresh, card, model: () => last, sources };   // sources(): the briefing's Work / weather / headlines lines read S.day
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
