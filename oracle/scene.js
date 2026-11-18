// ORACLE scene: the renderer, the camera rig (drag to turn, pinch / wheel to zoom, double tap to re-centre, a slow idle
// orbit), the price -> height scale that follows the live price, and the two worlds it draws (layers.js on the column,
// sky.js around it). setWorld(w) when the data changes; frame(nowT) every animation frame.
import { createRenderer } from '../olympus/render.js';
import { Market, Y_MAX } from './layers.js';
import { Arena } from './arena.js?v=oracle-phone-budget-4';
import { Temple } from './temple.js';
import { Polis } from './polis.js?v=oracle-phone-budget-3';
import { Sky, weatherOf, fitPoints } from './sky.js?v=oracle-phone-budget-2';
import { newSweeps } from './data.js';

const EL = [-0.12, 0.95];



/** The visible half range in points: the nearest levels each side, the open position, at least 4 ATR. */
function halfRange(w) {
  if (!w || w.price == null) return 60;
  const c = [4 * (w.atr || 12), 30];
  const up = w.levels.filter((l) => !l.taken && l.dist > 0).map((l) => l.dist).sort((a, b) => a - b);
  const dn = w.levels.filter((l) => !l.taken && l.dist < 0).map((l) => -l.dist).sort((a, b) => a - b);
  const near = 6 * (w.atr || 12);                    // the second level each side too, unless it is far away
  for (const side of [up, dn]) if (side.length) c.push(side[1] != null && side[1] <= Math.max(near, side[0] * 3) ? side[1] : side[0]);
  const p = w.position;
  if (p) for (const x of [p.entry, p.stop, p.target]) if (x != null) c.push(Math.abs(x - w.price));
  return Math.min(450, Math.max(...c) * 1.12);
}

export class Scene {
  constructor(THREE, canvas, { quality, reduced }) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2a1d14, 0.0046);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
    // the OLYMPUS render core (docs/OLYMPUS_RENDER.md): ACES + sRGB, the environment light, bloom, 4x MSAA on HD, FXAA on LITE. 'display'
    // space: the glow shaders keep the colours they were tuned in. The pixel size comes from resize() (the band logic below).
    this.rc = createRenderer({ canvas, scene: this.scene, camera: this.camera, space: 'display', env: 'night', tint: '#c8a24a', theme: { sky: '#4a3626', fog: '#2a1d14', emissive: '#c8a24a', bloom: '#e0b060', accent: '#c8a24a' }, autoSize: false,
      fitCamera: false, adapt: false, maxDpr: 1.75, exposure: 1, bloom: { strength: 0.24, radius: 0.55, threshold: 0.9 },
      grade: { vignette: 0.34, grain: 0.03 } });
    this.renderer = this.rc.renderer;
    this.renderer.setClearColor(0x2a1d14, 1);
    // night-3d look (olympus/look.js): a dusk grade in the finish pass on every tier, and on HD a soft depth of field round the free band
    // (the column sharp, the far polis and sky soft). No draw call; optional (the scene is the same without it).
    this.lookFx = null;
    import('../olympus/look.js').then((L) => { this.lookFx = L.polish(this.rc, { grade: 'dusk', mix: 0.4, focus: this.focusSpot() }); }).catch(() => {});
    this.rig = { az: -0.55, el: 0.2, zoom: 1, vaz: 0, idle: 0, fit: 40, target: new THREE.Vector3(0, 0.5, 0) };
    this.cam = { right: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(0, 0, 1), q: this.camera.quaternion };
    this.map = { center: null, half: 60, y: (p) => ((p - this.map.center) / this.map.half) * Y_MAX };
    this.sky = new Sky(THREE, this.scene, { quality, reduced });
    this.arena = new Arena(THREE, this.scene, { quality, reduced });
    try { this.polis = new Polis(THREE, this.scene, { quality, reduced }); } catch (_) { this.polis = null; }
    try { this.temple = new Temple(THREE, this.scene, { quality, reduced }); } catch (e) { this.temple = null; }   // braziers, incense, fog, shafts: optional
    this.market = new Market(THREE, this.scene, { quality, reduced });
    this.fitPts = fitPoints(THREE);
    this.probe = new THREE.PerspectiveCamera();
    this._p = new THREE.Vector3();
    this.H = innerHeight;
    this.world = null;
    this.goal = { center: null, half: 60 };
    this.t = 0;
    this.bindControls();
    this.setQuality(quality);
  }

  setQuality(q) {
    this.quality = q;
    this.rc.setQuality(this.rc.forced || (window.OLYMPUS && window.OLYMPUS.fx() === 'off' ? 'off' : this.rc.software ? 'low' : q === 'low' ? 'low' : ['ultra', 'high'].includes(this.rc.quality()) ? this.rc.quality() : 'high'));
    this.arena.setQuality(q);
    this.syncCityQuality();
    if (this.temple) this.temple.setQuality(q);
    if (this.sky.lite !== (q === 'low')) { this.sky.setQuality(q); this.market.setQuality(q); }
    this.resize();
  }

  // The shared render kit can change its tier outside Oracle's HD/LITE button
  // (including global 3D Off and software rendering). Keep the skyline's draw
  // count and conduits in the effective tier rather than the button's label.
  syncCityQuality() {
    const tier = this.rc.quality();
    if (this.polis && this.polis.quality !== tier) this.polis.setQuality(tier);
  }

  /** the sharp spot of the depth of field: the free band's centre, its radius a little inside the band (screen units, height = 1) */
  focusSpot() {
    const W = this.canvas.clientWidth || innerWidth, H = this.canvas.clientHeight || innerHeight, b = this.band || { x0: 0, y0: 0, x1: W, y1: H };
    return { x: (b.x0 + b.x1) / 2 / W, y: (b.y0 + b.y1) / 2 / H, r: Math.max(0.18, 0.42 * Math.min(b.x1 - b.x0, b.y1 - b.y0) / H), amount: 2.4 };
  }

  /** The free part of the screen between the HUD panels ({x0, y0, x1, y1} in CSS px): the scene is centred and fitted there. */
  setBand(b) {
    this.band = b;
    this.resize();
  }

  resize() {
    const W = this.canvas.clientWidth || innerWidth, H = this.canvas.clientHeight || innerHeight;
    const full = { x0: 0, y0: 0, x1: W, y1: H }, b0 = this.band || full;
    const b = b0.x1 - b0.x0 < 140 || b0.y1 - b0.y0 < 180 ? full : b0;      // a band too small to use: the whole screen
    this.rc.resize(W, H);
    this.H = H;
    this.camera.aspect = W / H;
    // shift the projection centre to the band's centre, then fit the column + clock (height ~26) and the rings (width ~17)
    this.camera.setViewOffset(W, H, W / 2 - (b.x0 + b.x1) / 2, H / 2 - (b.y0 + b.y1) / 2, W, H);
    this.camera.updateProjectionMatrix();
    this.rig.fit = this.fitDistance(b, W, H);
    if (this.lookFx) this.lookFx.setFocus(this.focusSpot());
  }

  /** The nearest camera distance (default angle) at which the constellation and the clock ring stay inside the band. */
  fitDistance(b, W, H) {
    const c = this.probe.copy(this.camera), r = this.rig, v = this.fitPts[0].clone();
    for (let d = 12; d < 200; d *= 1.03) {
      c.position.set(r.target.x, r.target.y + Math.sin(0.2) * d, r.target.z + Math.cos(0.2) * d);
      c.lookAt(r.target);
      c.updateMatrixWorld();
      const ok = this.fitPts.every((p) => {
        v.copy(p).project(c);
        const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H;
        return sx >= b.x0 + 4 && sx <= b.x1 - 4 && sy >= b.y0 + 4 && sy <= b.y1 - 4;
      });
      if (ok) return d;
    }
    return 200;
  }

  /** New data. Returns the levels swept since the last World (each one already struck). */
  setWorld(w, { strikes = true } = {}) {
    const swept = newSweeps(this.world, w);
    this.world = w;
    this.market.setWorld(w);
    this.arena.setWorld(w);
    if (this.polis) this.polis.setWorld(w);
    this.sky.setStages(w.stages);
    this.sky.setWeather(weatherOf(w));
    this.goal = { center: w.price, half: halfRange(w) };
    if (this.map.center == null && w.price != null) Object.assign(this.map, this.goal);
    if (strikes) for (const l of swept) this.market.strike(l, this.map, this.cam);
    return swept;
  }

  /** The screen y (CSS px) of a price on the column, from the last rendered camera (the ladder reads it every frame). */
  screenY(price) {
    if (this.map.center == null) return -1;
    return ((1 - this._p.set(0, this.map.y(price), 0).project(this.camera).y) / 2) * this.H;
  }

  /** The price range the column shows now ([lo, hi]). */
  range() {
    const k = (Y_MAX + 0.6) / Y_MAX;
    return this.map.center == null ? [0, 0] : [this.map.center - this.map.half * k, this.map.center + this.map.half * k];
  }

  /** A theme's colours (OLYMPUS themes): the column and the comet take the accent, the sky the background. */
  applyTheme(accent, bg) {
    const T = this.renderer && this.market.T;
    if (accent) { this.market.colMats[0].uniforms.uC.value.set(accent); this.market.comet.children[0].material.color.set(accent); this.arena.applyTheme(accent); if (this.polis) this.polis.applyTheme(accent); if (this.temple) this.temple.applyTheme(accent); }
    if (bg && T) { this.renderer.setClearColor(new T.Color(bg), 1); this.scene.fog.color.set(bg); }
  }

  bindControls() {
    const c = this.canvas, pts = new Map();
    let pinch = 0, lastTap = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      this.rig.idle = 0;
      if (pts.size === 1) {
        const now = performance.now();
        if (now - lastTap < 300) {                     // re-centre: the camera glides back the short way round (frame() eases it)
          const r = this.rig, d = Math.atan2(Math.sin(r.az + 0.55), Math.cos(r.az + 0.55));
          r.az -= d; r.el = 0.2; r.zoom = 1; r.vaz = 0;
        }
        lastTap = now;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        const dx = e.clientX - p[0], dy = e.clientY - p[1];
        this.rig.az -= dx * 0.006;
        this.rig.vaz = -dx * 0.006;
        this.rig.el = Math.max(EL[0], Math.min(EL[1], this.rig.el + dy * 0.004));
      }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.rig.zoom = Math.max(0.45, Math.min(1.8, this.rig.zoom * (pinch / d)));
        pinch = d;
      }
      this.rig.idle = 0;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.rig.zoom = Math.max(0.45, Math.min(1.8, this.rig.zoom * (1 + e.deltaY * 0.001))); }, { passive: false });
  }

  frame(nowT, dt) {
    this.syncCityQuality();
    const r = this.rig;
    dt = Math.min(0.1, Math.max(0, dt));
    this.t += dt;
    // the scale glides to the live price and its range (never jumps)
    if (this.goal.center != null) {
      const k = this.reduced ? 1 : 1 - Math.exp(-dt * 2.2);
      this.map.center += (this.goal.center - this.map.center) * k;
      this.map.half += (this.goal.half - this.map.half) * k;
    }
    // camera: inertia after a drag, then a slow idle orbit that eases in (night-3d: it used to start at full speed after 3 s)
    r.idle += dt;
    if (!this.reduced) {
      r.az += r.vaz;
      r.vaz *= Math.pow(0.04, dt);
      if (r.idle > 3) r.az += dt * 0.05 * Math.min(1, (r.idle - 3) / 2.5) ** 2;
    }
    // what the camera shows glides to the rig's goal (frame-rate independent): a re-centre or a pinch never jumps
    const v = r.v || (r.v = { az: r.az, el: r.el, zoom: r.zoom }), k = this.reduced ? 1 : 1 - Math.exp(-dt * 9);
    v.az += (r.az - v.az) * k; v.el += (r.el - v.el) * k; v.zoom += (r.zoom - v.zoom) * k;
    const d = r.fit * v.zoom;
    this.camera.position.set(r.target.x + Math.sin(v.az) * Math.cos(v.el) * d, r.target.y + Math.sin(v.el) * d, r.target.z + Math.cos(v.az) * Math.cos(v.el) * d);
    this.camera.lookAt(r.target);
    this.cam.dir.copy(this.camera.position).sub(r.target).setY(0).normalize();
    this.cam.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    if (this.map.center != null) this.market.frame(this.t, dt, this.map, this.cam);
    this.sky.frame(this.t, dt, nowT, this.cam);
    this.arena.frame(this.t, this.market.cometWorld(), this.renderer.getPixelRatio());
    if (this.polis) this.polis.frame(this.t);
    if (this.temple) this.temple.frame(this.t, dt, this.renderer.getPixelRatio());
    this.rc.render();
  }
}

