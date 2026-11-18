// Street-level walk of the Data City (no geometry, no draw calls: only a camera). The camera strolls at eye height along the
// city's streets; at every junction it takes the street that best matches where you are looking. One finger drags: sideways turns
// your head (and so picks the next street), up / down tilts it. No joystick, no buttons; a pinch or two fingers ends the walk.
// walker(L, from) -> { step(dt) -> { pos, look }, steer(dx, dy), info() }; pure maths on three.js vectors (no DOM).
import * as THREE from '../jarvis/three.module.min.js';

const EYE = 2.4, SPEED = 7, JOIN = 7;

export function walker(L, from) {
  const segs = (L.streets || []).filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 4);
  if (!segs.length) return null;
  // start on the street nearest the camera's ground point (or the plaza ring), heading away from the plaza
  const cx = from?.pos?.x ?? 0, cz = from?.pos?.z ?? 0;
  const dist = (s, x, z) => { const vx = s[2] - s[0], vz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * vx + (z - s[1]) * vz) / (vx * vx + vz * vz))); return Math.hypot(x - s[0] - vx * t, z - s[1] - vz * t); };
  let cur = 0, best = 1e9;
  segs.forEach((s, i) => { const d = dist(s, cx, cz); if (d < best) { best = d; cur = i; } });
  let a = new THREE.Vector2(segs[cur][0], segs[cur][1]), b = new THREE.Vector2(segs[cur][2], segs[cur][3]);
  if (Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y)) [a, b] = [b, a];            // walk outwards first
  let u = 0, yaw = Math.atan2(b.y - a.y, b.x - a.x), look = 0, pitch = -0.03, t = 0;
  const pos = new THREE.Vector3(a.x, EYE, a.y), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
  const turn = (e) => Math.atan2(Math.sin(e), Math.cos(e));
  function junction(px, pz, heading) {
    // the street whose start or end lies at the junction and whose direction best matches the way you look
    let pick = null, score = -2;
    for (const s of segs) for (const rev of [false, true]) {
      const x0 = rev ? s[2] : s[0], z0 = rev ? s[3] : s[1], x1 = rev ? s[0] : s[2], z1 = rev ? s[1] : s[3];
      if (Math.hypot(x0 - px, z0 - pz) > JOIN) continue;
      const len = Math.hypot(x1 - x0, z1 - z0), c = Math.cos(turn(Math.atan2(z1 - z0, x1 - x0) - heading));
      if (c > score && len > 4) { score = c; pick = [x0, z0, x1, z1]; }
    }
    return pick;
  }
  return {
    mode: 'walk',
    steer(dx, dy) { look = Math.max(-1.35, Math.min(1.35, look + dx * 0.006)); pitch = Math.max(-0.55, Math.min(0.5, pitch - dy * 0.004)); },
    step(dt) {
      t += dt;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      u += (SPEED * Math.min(dt, 0.1)) / len;
      if (u >= 1) {
        const nx = junction(b.x, b.y, yaw + look);
        if (nx) { a = new THREE.Vector2(nx[0], nx[1]); b = new THREE.Vector2(nx[2], nx[3]); } else { const q = a; a = b; b = q; }   // a dead end: turn round
        u = 0;
      }
      yaw += turn(Math.atan2(b.y - a.y, b.x - a.x) - yaw) * Math.min(1, dt * 3);
      look *= Math.pow(0.5, dt);                                                  // the head eases back to the way ahead
      pos.set(a.x + (b.x - a.x) * u, EYE + Math.sin(t * 5.5) * 0.06, a.y + (b.y - a.y) * u);
      const h = yaw + look;
      dir.set(Math.cos(h) * Math.cos(pitch), Math.sin(pitch), Math.sin(h) * Math.cos(pitch));
      tgt.copy(pos).addScaledVector(dir, 20);
      return { pos: pos.clone(), look: tgt.clone() };
    },
    info() { return { mode: 'walk', u: +u.toFixed(3), t: +t.toFixed(1), x: +pos.x.toFixed(1), z: +pos.z.toFixed(1) }; },
  };
}
