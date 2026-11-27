// MONEY FX (day-archive 2026-11-20, owner: "It needs some 3D, it needs some effects. Go run this on every dashboard quickly"; NO gold).
// One module for Board, Ledger and Hera. A page adds ONE card and this tag:
//   <section class="ag-card card mfx-card" data-moneyfx="payout">          <- the funded payout goal: 3D vault + an "earliest" ring
//     <div class="mfx-vault" data-mfx-vault></div><div class="mfx-ring" data-mfx-ring><b data-mfx-pct>0%</b></div>
//     <p class="note" data-mfx-note>...</p></section>
//   <script type="module" src="../olympus/moneyfx.js?v=8"></script>
// and may call window.MONEYFX.roll(el) on a number it just wrote (the number rolls up to its own text).
// Numbers: the PC's last post over home.json (olympus/truth.js), each funded account in MFFU's own terms (pc_feed.js mffuView:
// balance = profit; goal = the full request at buffer + max; earliest = buffer + min). Effects: DESIGN's kit (olympus/nqfx.js: navy /
// cyan / blue / violet), loaded after load + idle, never on the first paint; the boxes have a fixed size (no layout shift); reduced motion
// and no WebGL get the still 2D picture (the kit's rule); without the kit the note still says every number. Read only.
// day-archive 2026-11-21 (QA: Board LCP / CLS / KB up): NO static imports. The numbers (truth.js, pc_feed.js) load after load + idle,
// the effects kit (nqfx.js + three.js) only when the card scrolls into view; the card keeps a fixed size from the first paint.
let T = null;
const libs = () => Promise.all([import('./truth.js'), import('../pc_feed.js?v=n10')]).then(([t]) => { T = t; return t; });

const later = (fn) => { const run = () => { try { fn(); } catch (_) { /* the page still works */ } }; if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 80); };
const afterLoad = () => new Promise((ok) => { if (document.readyState === 'complete') later(ok); else addEventListener('load', () => later(ok), { once: true }); });
/** resolves when the element is (nearly) on screen: the 3D kit is never fetched for a card nobody scrolls to */
const seen = (el) => new Promise((ok) => {
  if (typeof IntersectionObserver !== 'function') { ok(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); ok(); } }, { rootMargin: '200px' }); io.observe(el);
});
const usd = (v) => (v == null || !Number.isFinite(+v) ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
let kitP = null;
// OLYMPUS NIGHT (owner 16:00 ET): the kit's colour slots -> black, violet glow, lavender highlight, a bright gold tip at 100%, mint wins
export const NIGHT = { base: '#000000', cyan: '#9d59ee', cyanHi: '#dacbf0', blue: '#4d2e76', violet: '#f1c14b', win: '#77db89', loss: '#ef4444', steel: '#898497' };
/** DESIGN's effects kit (window.OLYMPUS_NQFX) after load + idle; null when it cannot load (every caller then keeps its text) */
export function kit() {
  if (kitP) return kitP;
  kitP = afterLoad().then(() => new Promise((res) => {
    if (window.OLYMPUS_NQFX) { window.OLYMPUS_NQFX.ready().then(() => res(window.OLYMPUS_NQFX), () => res(null)); return; }
    const t = document.createElement('script'); t.src = new URL('./nqfx.js?v=n6', import.meta.url).href; t.async = true;
    t.onload = () => { const F = window.OLYMPUS_NQFX; if (!F || !F.ready) { res(null); return; } F.ready().then(() => res(F), () => res(null)); };
    t.onerror = () => res(null); document.head.appendChild(t);
  }));
  return kitP;
}
/** the funded accounts and their payout lines, in MFFU's terms (pure on the given home / now) */
export function payouts(home) {
  if (!T) return [];
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
  await afterLoad(); await libs();
  let home = null;
  try { const r = await fetch(new URL('../home.json', import.meta.url).href, { cache: 'no-cache' }); home = r.ok ? await r.json() : null; } catch (_) { home = null; }
  if (!home) { if (note) note.textContent = 'No account numbers yet: the site copy did not load. Open again with signal.'; return; }   // never a stuck 'Loading' (QA 2026-11-21)
  const fed = await T.withPcFeed(home), list = payouts(fed);
  if (!list.length) { if (note) note.textContent = 'No funded account yet: the payout vault fills once an eval passes.'; return; }
  const { a, v } = list[0], G = v.goal, E = v.earliest, frac = Math.max(0, Math.min(1, v.balance / G.at)), early = Math.max(0, Math.min(1, v.balance / E.at));
  const ages = T.agesOf(fed, Date.now() / 1000), age = ages && ages.pc && ages.pc.t ? ` From the PC's report ${ages.pc.words} ago.` : '';
  const label = `${usd(v.balance)} of ${usd(G.at)}`;
  if (note) note.textContent = `${a.name} funded: MFFU shows ${usd(v.balance)}. Goal ${usd(G.ask)} at ${usd(G.at)} (${usd(G.need)} to go); earliest ${usd(E.ask)} at ${usd(E.at)}.${age}`;
  if (pct) pct.textContent = `${Math.round(early * 100)}%`;
  if (ring) ring.setAttribute('aria-label', `Earliest payout: ${Math.round(early * 100)}% of ${usd(E.at)}`);
  card.dataset.mfxReady = '1';
  await seen(card);
  const F = await kit();
  if (!F) return;
  try { if (F.theme) F.theme(NIGHT); } catch (_) { /* the kit's own colours */ }
  try { if (vault && F.vault) F.vault(vault, { value: frac, label, aria: `Payout goal: ${label}` }); } catch (_) { /* the note says it */ }
  try { if (ring && F.ring) F.ring(ring, { value: early, stroke: 7 }); if (pct && F.roll) F.roll(pct, { to: Math.round(early * 100), from: 0, duration: 1.1 }); } catch (_) { /* the % is written */ }
}
function start() {
  for (const c of document.querySelectorAll('[data-moneyfx="payout"]')) fillPayout(c).catch(() => { const n = c.querySelector('[data-mfx-note]'); if (n && /^Loading/.test(n.textContent)) n.textContent = 'No account numbers yet.'; });
  const rolls = document.querySelectorAll('[data-mfx-roll]');
  if (rolls.length) kit().then(() => { for (const el of rolls) roll(el); });   // after load + idle: the page has written its numbers
}
window.MONEYFX = { kit, roll, payouts };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
