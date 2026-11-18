// Fly-through camera modes of the Data City (the manual orbit is the fourth). Each mode is a closed Catmull-Rom path the camera
// rides while orbit.drive() steers it (a drag, a pinch or a tap on a building hands the camera back):
//   skim   low over the districts, through every district gate and across its middle, the streets and windows at eye level
//   drone  a wide, high loop round the whole city looking in at the plaza (the skyline, the streams, the outskirts)
//   grand  the landmarks in turn: the forum, the Pharos, the Gate of Poseidon, the temple on its acropolis
// flight(mode, L, spots, from) -> { step(dt) -> { pos, look }, info() }; pure maths on three.js vectors (no DOM).
import * as THREE from '../jarvis/three.module.min.js';

export const MODES = [
  { key: 'orbit', label: 'ORBIT', hint: 'Orbit: drag to turn, pinch to zoom' },
  { key: 'skim', label: 'STREET', hint: 'Street: low at eye level through the district gates' },
  { key: 'drone', label: 'FLY', hint: 'Fly: a wide, high loop over the whole skyline' },
  { key: 'walk', label: 'WALK', hint: 'Walk: along the streets at eye level, drag to look round and pick the next street' },
  { key: 'grand', label: 'GRAND', hint: 'Grand tour: the forum, the Pharos, the Poseidon gate, the temple' },
];
const SPEED = { skim: 24, drone: 36, grand: 20 };
const ease = (t) => t * t * (3 - 2 * t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function curve(pts) { return new THREE.CatmullRomCurve3(pts, true, 'centripetal'); }

/** the path points for a mode; for 'grand' also the chunk centres the camera looks at */
export function route(mode, L, spots) {
  const ds = L.districts.filter((d) => d.kind !== 'harbor').slice().sort((a, b) => Math.atan2(a.cz, a.cx) - Math.atan2(b.cz, b.cx));
  const b = L.bounds, R = Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.46;
  if (mode === 'skim') {
    const pts = [];
    ds.forEach((d) => {
      const g = spots['gate:' + d.key];
      if (g) pts.push(V(g.x, 20, g.z));
      pts.push(V(d.cx, 30, d.cz));
      const len = Math.hypot(d.cx, d.cz) || 1;
      pts.push(V(d.cx - (d.cx / len) * d.half * 0.9 + (d.cz / len) * 14, 26, d.cz - (d.cz / len) * d.half * 0.9 - (d.cx / len) * 14));
    });
    return { pts, looks: null };
  }
  if (mode === 'drone') {
    const pts = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; pts.push(V(Math.cos(a) * R, 105 + Math.sin(a * 3) * 22, Math.sin(a) * R * 0.9)); }
    return { pts, looks: null };
  }
  const order = ['forum', 'pharos', 'poseidon', 'temple'].filter((k) => spots[k]), pts = [], looks = [];
  order.forEach((k, j) => {
    const s = spots[k], a0 = Math.atan2(-s.z, -s.x) + 0.6 * (j % 2 ? -1 : 1), rr = s.r * 0.62;
    for (let i = 0; i < 4; i++) { const a = a0 + i * 0.75 * (j % 2 ? -1 : 1); pts.push(V(s.x + Math.cos(a) * rr, 16 + s.h * 0.4, s.z + Math.sin(a) * rr)); looks.push(V(s.x, Math.min(s.h * 0.55, 30), s.z)); }
  });
  return { pts, looks, order };
}

/** from: { pos, look } the camera's state now (the first 1.8 s blends from it) */
export function flight(mode, L, spots, from) {
  const { pts, looks, order } = route(mode, L, spots);
  if (!pts.length) return null;
  const c = curve(pts), len = c.getLength(), speed = SPEED[mode] || 24;
  let u = 0, t = 0;
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), tmp = new THREE.Vector3();
  const sample = () => {
    c.getPointAt(u % 1, pos);
    if (looks) {                                         // grand: look at this landmark, turning to the next near the chunk's end
      const f = (u % 1) * looks.length, i = Math.floor(f) % looks.length, fr = f - Math.floor(f);
      const ch = Math.floor(i / 4), n = Math.floor(((i + 1) % looks.length) / 4);
      a.copy(looks[i]); b.copy(looks[(i + 1) % looks.length]);
      look.copy(a).lerp(b, ease(fr));
      void ch; void n;
    } else {
      c.getPointAt((u + (mode === 'drone' ? 0.12 : 0.02)) % 1, tmp);
      look.copy(tmp);
      if (mode === 'drone') look.multiplyScalar(0.35).y = 8;
      else look.y = Math.max(8, look.y - 14);
    }
  };
  return {
    mode, length: len,
    step(dt) {
      t += dt;
      u += (speed * dt) / len;
      sample();
      const k = ease(Math.min(1, t / 1.8));
      if (k < 1 && from) return { pos: tmp.copy(from.pos).lerp(pos, k).clone(), look: new THREE.Vector3().copy(from.look).lerp(look, k) };
      return { pos: pos.clone(), look: look.clone() };
    },
    info() {
      const cap = mode === 'grand' && order ? order[Math.floor(((u % 1) * order.length))] : null;
      return { mode, u: +(u % 1).toFixed(3), t: +t.toFixed(1), landmark: cap };
    },
  };
}
