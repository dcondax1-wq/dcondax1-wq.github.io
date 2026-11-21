// MONEY FX (day-archive 2026-11-20, owner: "It needs some 3D, it needs some effects. Go run this on every dashboard quickly"; NO gold).
// One module for Board, Ledger and Hera. A page adds ONE card and this tag:
//   <section class="ag-card card mfx-card" data-moneyfx="payout">          <- the funded payout goal: 3D vault + an "earliest" ring
//     <div class="mfx-vault" data-mfx-vault></div><div class="mfx-ring" data-mfx-ring><b data-mfx-pct>0%</b></div>
//     <p class="note" data-mfx-note>...</p></section>
//   <script type="module" src="../olympus/moneyfx.js?v=1"></script>
// and may call window.MONEYFX.roll(el) on a number it just wrote (the number rolls up to its own text).
// Numbers: the PC's last post over home.json (olympus/truth.js), each funded account in MFFU's own terms (pc_feed.js mffuView:
// balance = profit; goal = the full request at buffer + max; earliest = buffer + min). Effects: DESIGN's kit (olympus/nqfx.js: navy /
// cyan / blue / violet), loaded after load + idle, never on the first paint; the boxes have a fixed size (no layout shift); reduced motion
// and no WebGL get the still 2D picture (the kit's rule); without the kit the note still says every number. Read only.
import * as T from './truth.js';
import '../pc_feed.js?v=n7';

const later = (fn) => { const run = () => { try { fn(); } catch (_) { /* the page still works */ } }; if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 80); };
const afterLoad = () => new Promise((ok) => { if (document.readyState === 'complete') later(ok); else addEventListener('load', () => later(ok), { once: true }); });
const usd = (v) => (v == null || !Number.isFinite(+v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
let kitP = null;
// OLYMPUS NIGHT (owner 16:00 ET): the kit's colour slots -> black, violet glow, lavender highlight, a bright gold tip at 100%, mint wins
export const NIGHT = { base: '#000000', cyan: '#9d59ee', cyanHi: '#dacbf0', blue: '#4d2e76', violet: '#f1c14b', win: '#77db89', loss: '#ef4444', steel: '#898497' };
/** DESIGN's effects kit (window.OLYMPUS_NQFX) after load + idle; null when it cannot load (every caller then keeps its text) */
export function kit() {
  if (kitP) return kitP;
  kitP = afterLoad().then(() => new Promise((res) => {
    if (window.OLYMPUS_NQFX) { window.OLYMPUS_NQFX.ready().then(() => res(window.OLYMPUS_NQFX), () => res(null)); return; }
    const t = document.createElement('script'); t.src = new URL('./nqfx.js?v=n5', import.meta.url).href; t.async = true;
    t.onload = () => { const F = window.OLYMPUS_NQFX; if (!F || !F.ready) { res(null); return; } F.ready().then(() => res(F), () => res(null)); };
    t.onerror = () => res(null); document.head.appendChild(t);
  }));
  return kitP;
}
/** the funded accounts and their payout lines, in MFFU's terms (pure on the given home / now) */
export function payouts(home) {
  const F = globalThis.PC_FEED, A = T.accountsOf(home), rows = [A.lit, A.atlas, ...T.extraOf(home)].filter((a) => a && a.has && a.kind === 'funded' && !a.paper);
  return rows.map((a) => ({ a, v: F && F.mffuView ? F.mffuView({ ...a, kind: 'funded' }) : null })).filter((x) => x.v && x.v.balance != null);
}
/** roll a number up to the text the page already wrote (the text stays the truth for screen readers and no-JS) */
export function roll(el) {
  if (!el) return;
  const txt = String(el.textContent || ''), m = /-?\$?-?[\d,]+(\.\d+)?/.exec(txt);
  if (!m) return;
  const to = parseFloat(m[0].replace(/[$,]/g, ''));
  if (!Number.isFinite(to) || Math.abs(to) < 1) return;
  kit().then((F) => { try { if (F && F.roll) F.roll(el, { to, from: 0, duration: 1.1 }); } catch (_) { /* the text is already right */ } });
}
async function fillPayout(card) {
  const vault = card.querySelector('[data-mfx-vault]'), ring = card.querySelector('[data-mfx-ring]'), pct = card.querySelector('[data-mfx-pct]'), note = card.querySelector('[data-mfx-note]');
  let home = null;
  try { const r = await fetch(new URL('../home.json', import.meta.url).href, { cache: 'no-cache' }); home = r.ok ? await r.json() : null; } catch (_) { home = null; }
  if (!home) return;
  const fed = await T.withPcFeed(home), list = payouts(fed);
  if (!list.length) { if (note) note.textContent = 'No funded account yet: the payout vault fills once an eval passes.'; return; }
  const { a, v } = list[0], G = v.goal, E = v.earliest, frac = Math.max(0, Math.min(1, v.balance / G.at)), early = Math.max(0, Math.min(1, v.balance / E.at));
  const ages = T.agesOf(fed, Date.now() / 1000), age = ages && ages.pc && ages.pc.t ? ` From the PC's report ${ages.pc.words} ago.` : '';
  const label = `${usd(v.balance)} of ${usd(G.at)}`;
  if (note) note.textContent = `${a.name} ${v.size} funded: MFFU shows ${usd(v.balance)} (a funded sim starts at $0). Goal ${usd(G.ask)} at ${usd(G.at)}, ${usd(G.need)} to go; earliest ${usd(E.ask)} at ${usd(E.at)}.${age}`;
  if (pct) pct.textContent = `${Math.round(early * 100)}%`;
  if (ring) ring.setAttribute('aria-label', `Earliest payout: ${Math.round(early * 100)}% of ${usd(E.at)}`);
  card.dataset.mfxReady = '1';
  const F = await kit();
  if (!F) return;
  try { if (F.theme) F.theme(NIGHT); } catch (_) { /* the kit's own colours */ }
  try { if (vault && F.vault) F.vault(vault, { value: frac, label, aria: `Payout goal: ${label}` }); } catch (_) { /* the note says it */ }
  try { if (ring && F.ring) F.ring(ring, { value: early, stroke: 7 }); if (pct && F.roll) F.roll(pct, { to: Math.round(early * 100), from: 0, duration: 1.1 }); } catch (_) { /* the % is written */ }
}
function start() {
  for (const c of document.querySelectorAll('[data-moneyfx="payout"]')) fillPayout(c).catch(() => { /* the card keeps its text */ });
  kit().then(() => { for (const el of document.querySelectorAll('[data-mfx-roll]')) roll(el); });   // after load + idle: the page has written its numbers
}
window.MONEYFX = { kit, roll, payouts };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
