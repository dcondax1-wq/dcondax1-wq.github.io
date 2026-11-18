// ORACLE glow: the shared light kit (one soft glow texture, text sprites, additive materials, the level palette).
// Additive blending everywhere: overlapping light adds up like bloom, without a post-processing pass (cheap on a phone).

// Each LIT level family has its colour (engine/brain.py level kinds); ring radius grows with the level's timeframe.
const KIND = {
  asia: { color: 0xebc671, r: 3.1, name: 'Asia' },
  london: { color: 0xebbf59, r: 3.6, name: 'London' },
  ny: { color: 0xeba741, r: 2.7, name: 'New York' },
  pre: { color: 0xebc170, r: 2.4, name: 'Premarket' },
  pd: { color: 0xebce5e, r: 4.3, name: 'Prior day' },
  pw: { color: 0xebac75, r: 5.0, name: 'Prior week' },
  pm: { color: 0xeb8d70, r: 5.6, name: 'Prior month' },
  gap: { color: 0xd5eb6a, r: 2.1, name: 'Opening gap' },
  buildup: { color: 0xebe2cd, r: 1.9, name: 'Equal highs / lows' },
  level: { color: 0xebd7a9, r: 3.0, name: 'Level' },
};
export const kindOf = (k) => KIND[k] || KIND.level;
export const COLOR = { up: 0xd5eb6a, down: 0xeb7450, open: 0xf3ece0, entry: 0xebcc84, stop: 0xeb7450, target: 0xd5eb6a, comet: 0xebd9b0 };

let glowTex = null;
/** One radial glow (white core, soft falloff) shared by every sprite and light plane. */
export function glowTexture(THREE) {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(243,236,224,1)');
  grd.addColorStop(0.18, 'rgba(243,236,224,.75)');
  grd.addColorStop(0.45, 'rgba(243,236,224,.18)');
  grd.addColorStop(1, 'rgba(243,236,224,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function additive(THREE, color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, ...extra });
}

export function glowSprite(THREE, color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(THREE), color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

/** A text label as a sprite (canvas texture). `h` = its height in world units; redraw with setLabel(). */
export function labelSprite(THREE, text, color = '#ebe4d5', h = 0.42, opts = {}) {
  const c = document.createElement('canvas'), tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false });
  const s = new THREE.Sprite(m);
  s.userData.label = { c, tex, h, color, weight: opts.weight || 600 };
  setLabel(s, text);
  return s;
}

export function setLabel(sprite, text, color) {
  const L = sprite.userData.label;
  if (L.text === text && (!color || color === L.color)) return;
  L.text = text;
  if (color) L.color = color;
  const px = 44, g = L.c.getContext('2d');
  const font = `${L.weight} ${px}px Georgia, -apple-system, system-ui, sans-serif`;
  g.font = font;
  const w = Math.min(1024, Math.ceil(g.measureText(text).width) + 24), h = px + 16;
  if (L.c.width !== w || L.c.height !== h) L.tex.dispose();     // a new size needs a new GPU texture (three.js keeps it immutable)
  L.c.width = w;
  L.c.height = h;
  g.font = font;
  g.textBaseline = 'middle';
  g.shadowColor = L.color;
  g.shadowBlur = 12;
  g.fillStyle = L.color;
  g.fillText(text, 12, (px + 16) / 2 + 2);
  L.tex.needsUpdate = true;
  sprite.scale.set((L.h * L.c.width) / L.c.height, L.h, 1);
}

/** A flat ring outline (a closed line loop) of radius r in the XZ plane. */
export function ringLine(THREE, r, color, opacity = 1, seg = 96) {
  const pts = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}

/** A flat glowing disc (the "light plane" of a level), radius r, lying in the XZ plane. */
export function lightDisc(THREE, r, color, opacity) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ map: glowTexture(THREE), color, transparent: true,
    opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
