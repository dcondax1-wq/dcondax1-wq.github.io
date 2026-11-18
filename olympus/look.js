// OLYMPUS look (tools/web_public/olympus/look.js, 2026-11-17, night-3d; docs/OLYMPUS_DESIGN.md "The look pass"): the finishing touches a 3D app
// opts into in one line, at no draw-call cost. Everything here lives in the render core's ONE finish pass (render.js):
//   grade   a colour-grade LUT (render.js GRADES: dawn / golden / day / dusk / night, or { lut, to, k } for a blend) at `mix`, on every tier
//           that has a finish pass (ultra / high / low; off draws straight to the screen): two texture taps a pixel, no draw call
//   focus   a soft depth of field around the subject ({ x, y } of the screen, r = the sharp radius, amount in CSS px), on ultra / high only:
//           LITE keeps a sharp picture and its 2-pass budget. The blur rides the finish pass (8 golden-angle taps, only where k > .35)
//   damp()  frame-rate independent easing for camera rigs (the same feel at 30 and 120 fps)
//
//   import('../olympus/look.js').then((L) => { this.look = L.polish(rc, { grade: 'dusk', mix: 0.45, focus: { x: .5, y: .45, r: .3, amount: 2.5 } }); }).catch(() => {});
//
// Apps import it dynamically and wrapped (offline before the service worker lists it, an old cache): the scene never depends on it.
const HD = { ultra: 1, high: 1 };

/** exponential damping: move `a` toward `b` with rate `lambda` (1/s) over `dt` seconds; frame-rate independent */
export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * Math.max(0, dt || 0));

/** smoothstep ramp 0..1 between e0 and e1 (an idle orbit that eases in instead of starting at full speed) */
export const ramp = (x, e0, e1) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * polish(rc, { grade?, mix?, focus?, focusLite? }) -> { setFocus(partial | null), level(), dispose() }
 *   rc: an OLYMPUS render core (createRenderer). Unknown or missing rc: a no-op handle (never throws).
 */
export function polish(rc, o) {
  const opts = Object.assign({ mix: 0.5 }, o || {});
  const noop = { setFocus() { return false; }, level: () => null, dispose() {}, focus: null };
  if (!rc || typeof rc.quality !== 'function') return noop;
  let focus = opts.focus ? Object.assign({ x: 0.5, y: 0.45, r: 0.3, amount: 2.5 }, opts.focus) : null, on = false, dead = false;
  const apply = (level) => {
    if (dead) return;
    try {
      if (opts.grade && rc.setGrade) {
        const g = typeof opts.grade === 'string' ? { lut: opts.grade } : Object.assign({}, opts.grade);
        g.mix = opts.mix;
        rc.setGrade(g);
      }
      const want = !!focus && !!HD[level] && rc.setFocus;
      if (want) { rc.setFocus(focus); on = true; }
      else if (on && rc.setFocus) { rc.setFocus(null); on = false; }
    } catch (e) { /* an older core: the scene stays as it was */ }
  };
  apply(rc.quality());
  const off = rc.onTier ? rc.onTier(apply) : null;
  return {
    get focus() { return focus; },
    /** move the sharp spot (e.g. the free band between HUD panels) or switch the blur off (null) */
    setFocus(f) {
      focus = f ? Object.assign({}, focus || { x: 0.5, y: 0.45, r: 0.3, amount: 2.5 }, f) : null;
      apply(rc.quality());
      return on;
    },
    level: () => rc.quality(),
    dispose() { dead = true; if (off) off(); try { if (on && rc.setFocus) rc.setFocus(null); } catch (e) { /* gone */ } },
  };
}
