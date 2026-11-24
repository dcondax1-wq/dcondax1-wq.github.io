// OLYMPUS NIGHT particle field (day-pillars2 2026-11-24 quality pass): a fixed 2D canvas behind a dashboard. Violet / gold / mint motes
// drifting in 3 depth layers, parallax with scroll and the phone's tilt, a soft glow. GPU-light (no WebGL), <= 90 motes, 30-60 fps
// (drops to 30 on a slow frame), paused on a hidden tab, NOT drawn with reduced motion or in low power (?lite=1, <= 4 cores, Save-Data).
// mount() -> { stats(), stop() } | null. Pointer-events none; it never covers a tap.
const COLORS = ['157,89,238', '241,193,75', '119,219,137', '77,46,118'];
export function lowPower() {
  try {
    if (/[?&]fx=3d/.test(location.search)) return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]lite=1/.test(location.search) || (+navigator.hardwareConcurrency > 0 && +navigator.hardwareConcurrency <= 4) || !!(navigator.connection && navigator.connection.saveData);
  } catch (_) { return true; }
}
export function mount(opts) {
  const o = opts || {};
  if (document.getElementById('olyNightFx') || (lowPower() && !o.force)) return null;
  const c = document.createElement('canvas'); c.id = 'olyNightFx'; c.setAttribute('aria-hidden', 'true');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:.9';
  document.documentElement.style.background = '#000'; document.body.style.background = 'transparent';   // behind the content, above the black
  document.body.prepend(c);
  const g = c.getContext('2d'); if (!g) { c.remove(); return null; }
  const N = Math.min(90, o.n || 70), R = Math.random, M = [];
  for (let i = 0; i < N; i++) M.push({ x: R(), y: R(), z: 1 + Math.floor(R() * 3), r: .6 + R() * 1.8, c: COLORS[i % 7 === 0 ? 1 : i % 5 === 0 ? 2 : i % 3 === 0 ? 3 : 0], a: .25 + R() * .5, vx: (R() - .5) * .006, vy: -.004 - R() * .01, ph: R() * 6.28 });
  const S = { w: 0, h: 0, dpr: 1, tx: 0, ty: 0, px: 0, py: 0, run: false, frames: 0, last: 0, ema: 16, slow: false, stopped: false };
  const size = () => { S.dpr = Math.min(1.5, devicePixelRatio || 1); S.w = innerWidth; S.h = innerHeight; c.width = S.w * S.dpr; c.height = S.h * S.dpr; g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); };
  const tilt = (e) => { if (e.gamma != null) { S.tx = Math.max(-1, Math.min(1, e.gamma / 30)); S.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 40)); } };
  function frame(t) {
    S.run = false; if (S.stopped || document.hidden) return;
    const dt = Math.min(64, t - (S.last || t)); S.last = t; S.ema = S.ema * .9 + dt * .1; if (S.frames > 60 && S.ema > 26) S.slow = true;
    S.px += (S.tx - S.px) * .05; S.py += (S.ty - S.py) * .05;
    const sc = scrollY || 0;
    g.clearRect(0, 0, S.w, S.h);
    for (const m of M) {
      m.x += m.vx * dt / 16 * .1; m.y += m.vy * dt / 16 * .1; if (m.y < -.05) { m.y = 1.05; m.x = R(); } if (m.x < -.05) m.x = 1.05; if (m.x > 1.05) m.x = -.05;
      const k = m.z / 3, x = (m.x * S.w + S.px * 18 * k) % (S.w + 20), y = ((m.y * S.h - sc * .08 * k + S.py * 14 * k) % S.h + S.h) % S.h;
      const tw = .7 + .3 * Math.sin(t / 900 + m.ph), rr = m.r * (.7 + k * .6);
      const grd = g.createRadialGradient(x, y, 0, x, y, rr * 5);
      grd.addColorStop(0, `rgba(${m.c},${m.a * tw})`); grd.addColorStop(1, `rgba(${m.c},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr * 5, 0, 6.283); g.fill();
    }
    S.frames++; schedule();
  }
  function schedule() { if (S.run || S.stopped) return; S.run = true; if (S.slow) setTimeout(() => requestAnimationFrame(frame), 33); else requestAnimationFrame(frame); }
  const onVis = () => { if (!document.hidden) schedule(); };
  size(); addEventListener('resize', size); addEventListener('deviceorientation', tilt); document.addEventListener('visibilitychange', onVis); schedule();
  const api = { stats: () => ({ motes: N, frames: S.frames, slow: S.slow, ema: Math.round(S.ema * 10) / 10 }),
    stop: () => { S.stopped = true; removeEventListener('resize', size); removeEventListener('deviceorientation', tilt); document.removeEventListener('visibilitychange', onVis); c.remove(); } };
  window.__nightfx = api;
  return api;
}
