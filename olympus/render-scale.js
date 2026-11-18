// OLYMPUS render scale (tools/web_public/olympus/render-scale.js, 2026-11-14, team P2 "fast and crisp"; docs/OLYMPUS_PERF.md "Perf v2").
// ONE adaptive resolution governor for every 3D canvas on a page: the render core (olympus/render.js) and the hero stage (olympus/hero-stage.js)
// feed it their drawn frames and size their canvases from it. Plain ES module, no three.js, no DOM needed (the policy runs in node for the tests).
//
//   import { governor, range } from './render-scale.js';
//   const RQ = governor();                                   // the page's one governor (window.OLYMPUS_RQ)
//   const r = range({ tier: 'high', chosen: false, maxDpr: 2 });   // { floor, budget, ceil } in device pixels per CSS pixel
//   RQ.frame(now, { gap, work });                            // after every drawn frame (rAF time; gap = the kit's deliberate frame gap; work = CPU ms of the frame)
//   const dpr = RQ.dpr(r);                                   // the pixel ratio to render at right now
//   RQ.on((s) => resize());                                  // told when the scale changes
//
// The policy, in plain words:
//   - every canvas has a budget pixel ratio (its tier's / its app's, as before), a floor (half of it, never under 1) and a ceiling: the full
//     device pixel ratio up to 3 on Auto and on Ultra 4K (true retina / 4K crispness), the budget itself on a chosen High or Battery.
//     Ultra 4K starts AT the ceiling; Auto starts at the budget and climbs toward the ceiling only while every frame keeps full rate.
//   - one shared level q for the page: q < 0 renders under the budget (x 0.84 per step, -30% pixels), q > 0 above it (x 1.19 per step).
//   - slow frames (the median of a 30-frame or 1.5 s window over 24 ms, or over the kit's deliberate gap + 33%) step DOWN one level: smooth, 1.2 s apart.
//     Frames slowed by the page's own JavaScript (the frame's CPU work is most of the interval) never lower the resolution: that would only blur.
//   - full-rate frames (a mean <= 17.5 ms, uncapped) for 2.5 s step UP one level, toward the ceiling (or back to where it was).
//   - never thrash: an up-step followed by a down-step within 4 s marks that level as failed; the wait before trying it again doubles
//     (8 s, 16 s ... 64 s) and after 3 failures it is never tried again this session. Slowness is judged on a window's median (a GC hitch never
//     lowers the resolution); one pause over 1 s (a tab switch, a sheet) starts the window again, two in a row are a GPU that slow.

export const VERSION = 'rq1';
/** device pixels per CSS pixel each tier may reach at most (Ultra 4K = 3: the iPhone's full retina, a 4K screen at 200% is 2) */
export const CAPS = Object.freeze({ ultra: 3, high: 2, low: 1.5, off: 1 });
export const DOWN = 0.84, UP = 1 / 0.84;
export const POLICY = Object.freeze({ window: 30, warm: 20, slowMs: 24, fullMs: 17.5, capSlack: 1.33, cooldownMs: 1200, upAfterMs: 2500,
  failWithinMs: 4000, backoffMs: 4000, backoffMax: 64000, maxFails: 3, minQ: -4, maxQ: 6, cpuShare: 0.7 });

const devDpr = () => { try { return Math.max(1, Math.min(4, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)); } catch (e) { return 1; } };
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * range({ tier, chosen, maxDpr, saver, software, device }) -> { floor, budget, ceil }
 *   tier      'ultra' | 'high' | 'low' | 'off' (what the canvas renders at)
 *   chosen    the owner picked the level (OLYMPUS.chosen()): a chosen High / Battery never climbs over its budget
 *   maxDpr    the app's own cap (its budget). On Ultra 4K and on Auto an app cap of 1.5 or more is the budget only: the ceiling is the device's;
 *             a cap under 1.5 (a soft backdrop, a tiny buffer) is kept as the ceiling too
 *   saver     battery saver: <= 1.5, no climbing;  software: a software GL (no GPU): the budget, no climbing
 */
export function range(o) {
  const x = o || {}, dev = x.device || devDpr(), tier = CAPS[x.tier] ? x.tier : 'high';
  const app = x.maxDpr > 0 ? x.maxDpr : 2;
  let budget = Math.min(dev, CAPS[tier], app);
  let ceil = budget;
  const soft = app < 1.5;
  if (!soft && !x.software && !x.saver && (tier === 'ultra' || (tier === 'high' && !x.chosen))) ceil = Math.min(dev, CAPS.ultra);
  if (tier === 'ultra' && !soft && !x.software && !x.saver) budget = ceil;              // Ultra 4K: start crisp
  if (x.saver) { budget = Math.min(budget, 1.5); ceil = Math.min(ceil, 1.5); }
  // the floor: half the budget on Auto, two thirds of it on a level the owner chose (Ultra 4K on a 3x iPhone never falls under 2x), never under 1 pixel per
  // CSS pixel; a 1x screen (a budget of 1 or less) may go to 3/4 of it
  const floor = budget <= 1 ? budget * 0.75 : Math.min(budget, Math.max(1, budget * (x.chosen ? 0.67 : 0.5)));
  return { floor: r2(floor), budget: r2(budget), ceil: r2(Math.max(budget, ceil)) };
}

/** the pixel ratio for a range at level q */
export function dprAt(rg, q) {
  const b = rg.budget;
  const d = q >= 0 ? Math.min(rg.ceil, b * Math.pow(UP, q)) : Math.max(rg.floor, b * Math.pow(DOWN, -q));
  return r2(d);
}

/** a fresh policy state */
export function initial() {
  return { q: 0, warm: POLICY.warm, tWarm: 0, win: [], work: 0, tWin: 0, tChange: 0, tUp: -1e9, upQ: null, fails: {}, wait: {}, locked: {}, steps: 0, ups: 0, downs: 0,
    fps: 0, maxQ: POLICY.maxQ, minQ: POLICY.minQ, gap: 0, why: '' };
}
const median = (xs) => { const a = xs.slice().sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const clearWin = (s) => { s.win.length = 0; s.work = 0; s.tWin = 0; };

/**
 * the policy as a pure function: one frame sample -> the next state (tests drive it with synthetic frames).
 *   s: state (mutated and returned); t: the frame's time (ms); ms: the interval since the last drawn frame; gap: the deliberate frame gap (ms, 0 = none);
 *   work: CPU ms of the frame (its JavaScript + the draw submission); maxQ / minQ: how far up / down the canvases on the page can go.
 * A window is 30 frames, or 1.5 s with at least 4 frames (a slow GPU at 4 fps is judged as fast as a quick one). Slowness is judged on the
 * window's MEDIAN (one GC hitch never lowers the resolution), a climb needs the MEAN at full rate (any hitch blocks it). An interval over
 * 1 s once is a pause (a tab switch, a sheet, the debugger), not a frame: the window starts again; over 1 s twice in a row is a slow GPU.
 */
export function step(s, t, ms, gap, work, maxQ, minQ) {
  const P = POLICY;
  if (maxQ !== undefined) s.maxQ = maxQ;
  if (minQ !== undefined) s.minQ = minQ;
  // the first frame, or a pause (a tab switch, a sheet): over 1 s once is a pause; over 1 s twice in a row is a GPU that slow (4K on a weak
  // or software GPU): those are frames, counted as 1 s each, so the resolution still comes down
  if (ms > 1000) s.long = (s.long || 0) + 1; else s.long = 0;
  if (!(ms > 0) || (ms > 1000 && s.long < 2)) { clearWin(s); s.warm = Math.max(s.warm, 5); s.tWarm = 0; return s; }
  if (ms > 1000) { ms = 1000; s.warm = 0; }
  if ((gap || 0) !== s.gap) { s.gap = gap || 0; clearWin(s); s.warm = Math.max(s.warm, 10); s.tWarm = 0; return s; }   // a new deliberate cap
  if (s.warm > 0) {                                                                            // warm-up: 20 frames or 1 s, whichever is first
    if (!s.tWarm) s.tWarm = t;
    if (--s.warm > 0 && t - s.tWarm < 1000) return s;
    s.warm = 0;
  }
  if (!s.tWin) s.tWin = t - ms;
  s.win.push(ms); s.work += Math.max(0, work || 0);
  if (s.win.length < P.window && !(s.win.length >= 4 && t - s.tWin >= 1500)) return s;
  const n = s.win.length, med = median(s.win), avg = s.win.reduce((x, y) => x + y, 0) / n, cpu = s.work / n;
  s.fps = Math.round(1000 / avg); clearWin(s);
  if (t - s.tChange < P.cooldownMs) return s;
  const slowAt = s.gap ? s.gap * P.capSlack : P.slowMs;
  if (med > slowAt) {
    if (cpu > med * P.cpuShare) { s.why = 'cpu-bound: resolution kept'; return s; }        // the page's own JavaScript: a smaller buffer would only blur
    if (s.q <= s.minQ) { s.why = 'at the floor'; return s; }
    if (s.upQ !== null && s.q === s.upQ && t - s.tUp < P.failWithinMs) {                   // the last climb did not hold: that level failed
      const k = s.upQ, f = (s.fails[k] || 0) + 1;
      s.fails[k] = f;
      s.wait[k] = Math.min(P.backoffMax, P.backoffMs * Math.pow(2, f));
      if (f >= P.maxFails) s.locked[k] = true;
    }
    s.q--; s.downs++; s.steps++; s.tChange = t; s.upQ = null; s.why = 'slow ' + Math.round(med) + ' ms';
    return s;
  }
  if (!s.gap && avg <= P.fullMs && s.q < s.maxQ) {                                          // full rate, uncapped: climb one level
    const k = s.q + 1;
    if (s.locked[k]) { s.why = 'level ' + k + ' failed ' + P.maxFails + 'x'; return s; }
    const need = Math.max(P.upAfterMs, s.wait[k] || 0);
    if (t - s.tChange < need) return s;
    s.q = k; s.ups++; s.steps++; s.tChange = t; s.tUp = t; s.upQ = k; s.why = 'full rate';
  }
  return s;
}

/**
 * true when this renderer's browser compiles shaders in parallel (KHR_parallel_shader_compile on a real GPU). On a software GL (SwiftShader,
 * llvmpipe: no GPU) the GPU process compiles in order, so the first status query holds the page for the whole compile anyway, and compiling
 * the scene up front would also compile its hidden materials: there the first frame compiles what it draws, as it always did.
 */
const PARALLEL = typeof WeakMap === 'function' ? new WeakMap() : null;
export function parallelCompile(renderer) {
  if (!renderer) return false;
  if (PARALLEL && PARALLEL.has(renderer)) return PARALLEL.get(renderer);
  let ok = false;
  try {
    const E = renderer.extensions;
    ok = !!(E && (typeof E.has === 'function' ? E.has('KHR_parallel_shader_compile') : E.get && E.get('KHR_parallel_shader_compile')));
    const gl = ok && renderer.getContext ? renderer.getContext() : null, d = gl && gl.getExtension ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    if (d && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)))) ok = false;
  } catch (e) { ok = false; }
  if (PARALLEL) PARALLEL.set(renderer, ok);
  return ok;
}

/**
 * compile a scene's materials without holding the page, and never wait for ever (render.js and hero-stage.js use it before a first frame).
 * three's own compileAsync polls every 10 ms until every program says it is ready, and a program deleted meanwhile (a material disposed, or
 * rebuilt when an environment map arrived) never says so: it polled for ever (225 ms of script a second on an idle hero page, found by the
 * perf probe). Here a deleted program counts as done, the poll is once a frame, and after maxMs (8 s) it gives up and lets the frame compile.
 * -> Promise<boolean> (true = every program reported ready)
 */
export function compileQuietly(renderer, scene, camera, maxMs) {
  return new Promise((done) => {
    if (!parallelCompile(renderer)) { done(true); return; }                     // no parallel compile here: the first frame compiles, as before
    let mats = null;
    try { mats = renderer.compile(scene, camera); } catch (e) { done(false); return; }
    const props = renderer.properties, t0 = typeof performance !== 'undefined' ? performance.now() : Date.now(), cap = maxMs || 8000;
    if (!props || !mats || !mats.size) { done(true); return; }
    const check = () => {
      try {
        mats.forEach((m) => {
          const p = props.get(m) && props.get(m).currentProgram;
          if (!p || !p.program || p.isReady()) mats.delete(m);                       // ready, or deleted meanwhile (destroy() clears .program)
        });
      } catch (e) { mats.clear(); }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!mats.size) done(true); else if (now - t0 > cap) done(false); else setTimeout(check, 16);
    };
    check();
  });
}

/** the page's one governor (shared by every module copy through window.OLYMPUS_RQ) */
export function governor() {
  const W = typeof window !== 'undefined' ? window : null;
  if (W && W.OLYMPUS_RQ && W.OLYMPUS_RQ.version === VERSION) return W.OLYMPUS_RQ;
  const st = initial(), subs = [], members = new Set();
  let lastT = 0, frameT = 0, frameWork = 0;
  const forced = (() => { try { const v = parseFloat(new URLSearchParams(location.search).get('rs')); return v > 0 && v <= 4 ? v : 0; } catch (e) { return 0; } })();
  function notify() { subs.slice().forEach((fn) => { try { fn(api.state()); } catch (e) { /* one listener never stops the rest */ } }); }
  function bounds() {                                 // how far up / down the page's canvases can still move (the widest member decides)
    let up = 0, down = 0;
    members.forEach((m) => {
      const rg = m.range();
      let u = 0; while (u < POLICY.maxQ && dprAt(rg, u + 1) > dprAt(rg, u)) u++;
      let dn = 0; while (dn > POLICY.minQ && dprAt(rg, dn - 1) < dprAt(rg, dn)) dn--;
      up = Math.max(up, u); down = Math.min(down, dn);
    });
    return [up, down];
  }
  function flush() {               // the previous frame is complete (a later frame arrived): one sample
    if (!frameT) return;
    const ms = lastT ? frameT - lastT : 0, q0 = st.q, [up, down] = bounds();
    lastT = frameT;
    step(st, frameT, ms, api.gap, frameWork, up, down);
    if (st.q > up) st.q = up;
    if (st.q < down) st.q = down;
    frameT = 0; frameWork = 0;
    if (st.q !== q0) notify();
  }
  const api = {
    version: VERSION, gap: 0,
    /** a drawn frame: now (rAF / performance time), { gap: the kit's frame gap, work: CPU ms of this canvas's frame } (several canvases in one frame = one sample) */
    frame(now, o) {
      const t = now || (typeof performance !== 'undefined' ? performance.now() : Date.now()), x = o || {};
      api.gap = x.gap || 0;
      if (frameT && t - frameT < 4) { frameWork += x.work || 0; return; }                // another canvas in the same frame
      if (frameT) flush();
      frameT = t; frameWork = x.work || 0;
    },
    /** the pixel ratio to render a range at now (?rs=<dpr> pins one for screenshots and tests) */
    dpr(rg) { return forced ? Math.min(forced, devDpr()) : dprAt(rg, st.q); },
    /** register a canvas (its range() function) so the governor knows how far the page can climb; -> off() */
    join(m) { members.add(m); return () => members.delete(m); },
    on(fn) { if (typeof fn === 'function') subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    /** back from a hidden tab, a new tier, a new size: the next frames are a warm-up (the level stays) */
    reset(hard) { lastT = 0; clearWin(st); st.warm = POLICY.warm; st.tWarm = 0; if (hard) { const q0 = st.q; Object.assign(st, initial()); if (q0 !== 0) notify(); } },
    /** test hook: feed synthetic frames [ms, ...] (spaced by their own intervals), returns the state */
    simulate(list, o) {
      const x = o || {}, now = typeof performance !== 'undefined' ? performance.now() : 0;
      frameT = 0;                                       // a real frame waiting to be counted is dropped: the synthetic clock takes over
      let t = Math.max(lastT || 0, now, 1000); lastT = t;
      for (const ms of list) { t += ms; api.frame(t, { gap: x.gap || 0, work: x.work || 0 }); flush(); }
      return api.state();
    },
    state() { return { q: st.q, steps: st.steps, ups: st.ups, downs: st.downs, fps: st.fps, why: st.why, fails: Object.assign({}, st.fails), locked: Object.keys(st.locked).map(Number),
      members: members.size, forced: forced || null, gap: api.gap }; },
    _st: st,
  };
  if (W) { try { Object.defineProperty(W, 'OLYMPUS_RQ', { value: api, configurable: true, writable: true }); } catch (e) { W.OLYMPUS_RQ = api; } }
  return api;
}
