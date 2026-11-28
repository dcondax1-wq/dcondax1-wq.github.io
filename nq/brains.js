// THE FOUR BRAINS page (nq/brains.html, day-brains 2026-11-27): LIT, ATLAS, BLITZ, POSEIDON side by side (wide) or one at a time with
// chips (phone). One read of the PC's post (../pc_feed.js PC_FEED.fetchLatest) shared by the four brainview mounts (getState), every 60 s.
import { mount, STRATS } from './brainview.js?v=1';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const S = { lite: null, pick: 'lit', views: [] };
const q = new URLSearchParams(location.search).get('s');
if (q && STRATS.some((x) => x.s === q)) S.pick = q;

async function read() {
  try {
    const F = window.PC_FEED;
    if (!F || !F.fetchLatest) return null;
    return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 12000))]);
  } catch (_) { return null; }
}
function pick(s) {
  S.pick = s;
  for (const b of document.querySelectorAll('#brainChips button')) b.setAttribute('aria-pressed', b.dataset.s === s ? 'true' : 'false');
  for (const a of document.querySelectorAll('#brainGrid > article')) a.dataset.on = a.dataset.s === s ? '1' : '0';
  try { history.replaceState(null, '', `?s=${s}`); } catch (_) { /* file:// */ }
}
function build() {
  const chips = $('brainChips'), grid = $('brainGrid');
  for (const x of STRATS) {
    const b = el('button', 'bz-chip', x.name); b.type = 'button'; b.dataset.s = x.s; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => pick(x.s)); chips.appendChild(b);
    const a = el('article', 'bz-card'); a.dataset.s = x.s; a.setAttribute('aria-label', `${x.name} brain`); grid.appendChild(a);
    S.views.push(mount(a, { s: x.s, getState: () => (S.lite ? { lite: S.lite } : null) }));
  }
  pick(S.pick);
}
build();
try { const O = window.OLYMPUS; if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
const refresh = async () => { const p = await read(); if (p) S.lite = p; const st = $('brainAge'); if (st) st.textContent = S.lite ? 'Live from the PC\'s 15-minute report' : 'Waiting for the PC\'s report...'; for (const v of S.views) v.update(); };
refresh(); setInterval(refresh, 60000);
