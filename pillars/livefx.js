// Micro-animations on live numbers (day-pillars2 2026-11-24 quality pass): when a $ / % / R number on the page CHANGES (a PC post lands,
// a refresh), its element glows once (gold up, a soft red down, violet otherwise) and the live dots breathe. It never rewrites the text
// (screen readers and tests read the real number at once). Off with reduced motion. watch(root) -> { stop(), pulses() }.
const RX = /[$]\s?-?[\d,]+|[+-]?\d+(?:\.\d+)?\s?(?:%|R\b)/;
const CSS = `@keyframes lfxUp{0%{text-shadow:0 0 0 rgba(241,193,75,0)}30%{text-shadow:0 0 14px rgba(241,193,75,.95)}100%{text-shadow:0 0 0 rgba(241,193,75,0)}}
@keyframes lfxDn{0%{text-shadow:0 0 0 rgba(255,107,138,0)}30%{text-shadow:0 0 14px rgba(255,107,138,.9)}100%{text-shadow:0 0 0 rgba(255,107,138,0)}}
@keyframes lfxEq{0%{text-shadow:0 0 0 rgba(157,89,238,0)}30%{text-shadow:0 0 12px rgba(157,89,238,.9)}100%{text-shadow:0 0 0 rgba(157,89,238,0)}}
.lfx-up{animation:lfxUp .9s ease-out}.lfx-dn{animation:lfxDn .9s ease-out}.lfx-eq{animation:lfxEq .9s ease-out}
@keyframes lfxBreath{0%,100%{box-shadow:0 0 0 0 rgba(119,219,137,.0)}50%{box-shadow:0 0 0 5px rgba(119,219,137,.18)}}
.lvl.ok,.pc i.ok,.dot.on{animation:lfxBreath 2.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.lfx-up,.lfx-dn,.lfx-eq,.lvl.ok,.pc i.ok,.dot.on{animation:none}}`;
const num = (t) => { const m = RX.exec(t || ''); if (!m) return null; const v = parseFloat(m[0].replace(/[$,\s%R+]/g, '')); return Number.isFinite(v) ? v : null; };
export function watch(root) {
  const R = root || document.body;
  if (!document.getElementById('lfxCss')) { const s = document.createElement('style'); s.id = 'lfxCss'; s.textContent = CSS; document.head.append(s); }
  let n = 0;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { stop() {}, pulses: () => 0 }; } catch (_) { /* fine */ }
  const seen = new WeakMap();
  const hit = (elx, before, after) => {
    const a = num(before), b = num(after); if (b === null || before === after) return;
    const cls = a === null || a === b ? 'lfx-eq' : b > a ? 'lfx-up' : 'lfx-dn';
    elx.classList.remove('lfx-up', 'lfx-dn', 'lfx-eq'); void elx.offsetWidth; elx.classList.add(cls); n += 1;
    setTimeout(() => elx.classList.remove(cls), 1000);
  };
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      const t = r.type === 'characterData' ? r.target.parentElement : r.target;
      if (r.type === 'childList') for (const n of r.addedNodes) if (n.nodeType === 1) learn(n);   // a re-rendered panel: its numbers become the baseline
      if (!t || t.nodeType !== 1 || t.closest('#olyNightFx, script, style')) continue;
      const now = t.textContent || '', before = seen.has(t) ? seen.get(t) : (r.type === 'characterData' ? r.oldValue : null);
      if (now.length < 40 && RX.test(now)) { if (before != null) hit(t, before, now); seen.set(t, now); }
    }
  });
  // remember the first numbers (no glow on first paint), then glow on change
  const SEL = 'b, span, strong, td, small, .td, .usd, .num';
  const learn = (root) => { const list = root.matches && root.matches(SEL) ? [root, ...root.querySelectorAll(SEL)] : [...root.querySelectorAll(SEL)];
    for (const e of list) { if (seen.has(e)) continue; const t = e.textContent || ''; if (t.length < 40 && RX.test(t)) seen.set(e, t); } };
  learn(R);
  mo.observe(R, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
  const api = { stop: () => mo.disconnect(), pulses: () => n };
  window.__livefx = api;
  return api;
}
