// TYCHE glow kit: the canvas textures and additive materials every part of the scene shares. Made once per page.
// Glow comes from additive sprites (no post-processing pass): cheap enough for an iPhone at 60 fps.

export class Glow {
  constructor(THREE) {
    this.T = THREE;
    this.soft = this.texture(64, (g, s) => {                 // a round soft light
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(243, 236, 224,1)');
      r.addColorStop(0.25, 'rgba(243, 236, 224,.55)');
      r.addColorStop(0.6, 'rgba(243, 236, 224,.12)');
      r.addColorStop(1, 'rgba(243, 236, 224,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    });
    this.ring = this.texture(128, (g, s) => {                // the Kelly halo: a thin bright ring
      g.strokeStyle = 'rgba(243, 236, 224,.95)';
      g.lineWidth = 5;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(243, 236, 224,.25)';
      g.lineWidth = 12;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2); g.stroke();
    });
    this.face = this.texture(128, (g, s) => {                // a coin face: rim, ring of dots, a star in the middle
      g.fillStyle = '#dcd8d4'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#f3ece0'; g.lineWidth = 7;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f3ece0';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.beginPath(); g.arc(s / 2 + Math.cos(a) * (s / 2 - 17), s / 2 + Math.sin(a) * (s / 2 - 17), 2.4, 0, Math.PI * 2); g.fill();
      }
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 13 : 32;
        g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(88, 81, 72,.6)'; g.lineWidth = 2;
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 26, 0, Math.PI * 2); g.stroke();
    });
    this.reeds = this.texture(128, (g, s) => {               // a milled coin edge: fine vertical reeds (a bump map, wrapped round)
      g.fillStyle = '#8d8173'; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 4) {
        const r = g.createLinearGradient(x, 0, x + 4, 0);
        r.addColorStop(0, '#35302b'); r.addColorStop(0.5, '#f3ece0'); r.addColorStop(1, '#35302b');
        g.fillStyle = r; g.fillRect(x, 0, 4, s);
      }
    }, true);
    this.reeds.colorSpace = THREE.NoColorSpace;
    this.reeds.repeat.set(6, 1);
    this.fade = this.texture(64, (g, s) => {                 // vertical fade for the column of light (bright at the foot)
      const r = g.createLinearGradient(0, 0, 0, s);
      r.addColorStop(0, 'rgba(243, 236, 224,.05)');
      r.addColorStop(0.5, 'rgba(243, 236, 224,.35)');
      r.addColorStop(1, 'rgba(243, 236, 224,.9)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    this.windows = this.texture(64, (g, s) => {              // skyline windows: a lit grid
      g.fillStyle = '#23201d'; g.fillRect(0, 0, s, s);
      for (let y = 4; y < s; y += 10) for (let x = 5; x < s; x += 12) {
        g.fillStyle = (x * 7 + y * 3) % 5 === 0 ? '#635b51' : '#f3ece0';
        g.fillRect(x, y, 6, 5);
      }
    }, true);
    this.floor = this.texture(512, (g, s) => {               // the ground: a soft gold pool of light with fine rings
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(200, 162, 74,.30)');
      r.addColorStop(0.4, 'rgba(224, 160, 96,.10)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(200, 162, 74,.18)'; g.lineWidth = 1.5;
      for (let i = 1; i < 12; i++) { g.beginPath(); g.arc(s / 2, s / 2, (i / 12) * (s / 2), 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(155, 171, 99,.10)';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * s / 2, s / 2 + Math.sin(a) * s / 2); g.stroke();
      }
    });
  }

  texture(size, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new this.T.CanvasTexture(c);
    t.colorSpace = this.T.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = this.T.RepeatWrapping;
    return t;
  }

  /** An additive glow sprite. */
  sprite(color, scale, opacity = 1, map = this.soft) {
    const T = this.T;
    const s = new T.Sprite(new T.SpriteMaterial({ map, color: new T.Color(color), transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, fog: true }));
    s.scale.setScalar(scale);
    return s;
  }

  /** Additive, vertex-coloured points (dust, fountain, motes). */
  points(n, size, opacity = 1) {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new T.PointsMaterial({ size, map: this.soft, vertexColors: true, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const p = new T.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  /** Glowing metal: a lit standard material with its own light (emissive), so it reads at night without an env map. */
  metal(color, emissive = 0.35, opts = {}) {
    const T = this.T, c = new T.Color(color);
    return new T.MeshStandardMaterial({ color: c, metalness: 0.75, roughness: 0.32, emissive: c, emissiveIntensity: emissive, ...opts });
  }

  /** Minted metal: polished under a clear coat, so the scene's environment map (scene.js environment()) shines in it; only a
   *  faint glow of its own, so the reflections carry the look. The coins (reeded edge, embossed face) and the wheel's gold. */
  coin(color, opts = {}) {
    const T = this.T, c = new T.Color(color);
    return new T.MeshPhysicalMaterial({ color: c, metalness: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, emissive: c, emissiveIntensity: 0.16,
      envMapIntensity: 1.6, ...opts });
  }

  /** A light that ignores the lights: for things that are light themselves. */
  light(color, opacity = 1, opts = {}) {
    const T = this.T;
    return new T.MeshBasicMaterial({ color: new T.Color(color), transparent: opacity < 1, opacity, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, ...opts });
  }
}
