// The OLYMPUS effects library in the Data City (v3): olympus/fx-core.js (a classic script on the page) + fx-sky.js / fx-weather.js (ES modules),
// switched by the sky and the weather the city already computes:
//   godRays     volumetric light shafts falling from LIT's tower and from the temple's beam (dusk, night and haze)
//   lensFlare   the sun's glare with its ghost rings (day, clear sky)
//   aurora      curtains in the northern sky on clear nights (VIX under 20)
//   fireflies   over the acropolis and the river bank on calm nights
//   lightning   a bolt that really lights the scene, in a storm (VIX 25+): the city's own flash is kept in step with it
// Everything goes into a child scene (no background, no fog of its own), so the kit never touches the city's fog or sky colour. The kit
// runs its own tiers (OLYMPUS.fx(): ultra / high / low / off; reduced motion = off) on its one shared frame loop. Without fx-core.js
// on the page this file does nothing.
import * as THREE from '../jarvis/three.module.min.js';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const NAMES = ['godRays', 'lensFlare', 'aurora', 'fireflies', 'lightning'];

export class KitFx {
  /** scene: the city's THREE.Scene; camera; spots: the landmarks' positions (temple, ...); L: layout(); R: routes() (the river) */
  constructor(scene, camera, spots, L, R) {
    this.camera = camera; this.spots = spots; this.L = L; this.R = R;
    this.root = new THREE.Scene();                                      // a nested scene: its own (null) background and fog
    this.root.name = 'kit-fx';
    scene.add(this.root);
    this.h = {};                                                        // running effect handles by name
    this.want = {};
    this.ready = false;
    this.sunDir = new THREE.Vector3(0, -1, 0);
    this.lastFlare = null;
    this.strikes = 0;
    this.target = { scene: this.root, camera };
  }

  /** load the effect modules (a no-op without OLYMPUS_FX); resolves true when the library is usable */
  async load() {
    const FX = window.OLYMPUS_FX;
    if (!FX) return false;
    try {
      await Promise.all(['fx-sky.js', 'fx-weather.js'].map((f) => import('../olympus/' + f + '?v=f1')));
    } catch (e) { return false; }
    this.FX = window.OLYMPUS_FX;
    this.ready = NAMES.every((n) => this.FX.has(n));
    return this.ready;
  }

  get tier() { return this.FX?.tier?.() ?? 'off'; }

  _on(name, make) {
    if (this.h[name] && !this.h[name].stopped) return this.h[name];
    return (this.h[name] = make());
  }

  _off(name) {
    if (this.h[name]) { try { this.h[name].stop(); } catch (e) { /* already gone */ } }
    delete this.h[name];
  }

  /** sun: sky.sunOf(); w: sky.weatherOf(); U: the scene's uniforms (uDay, uCloud, uSun) */
  set(sun, w, U, caps) {
    if (!this.ready) return;
    if (caps) this.caps = caps;
    const kc = (this.caps || {}).kit || { godGroups: 2, lens: true, aurora: true, fireflies: true, lightning: true };
    const FX = this.FX, t = this.tier, off = t === 'off', day = sun.day, night = day < 0.12, dusk = sun.dusk;
    const clear = !w.storm && w.rain < 0.1;
    const want = {
      godRays: !off && kc.godGroups > 0 && (dusk > 0.25 || night || w.haze > 0.3),
      lensFlare: !off && kc.lens && t !== 'low' && day > 0.25 && w.haze < 0.4 && !w.storm && sun.elev > 0.05,
      aurora: !off && kc.aurora && t !== 'low' && night && clear && w.vix < 20,
      fireflies: !off && kc.fireflies && night && clear,
      lightning: !off && kc.lightning && !!w.storm,
    };
    this.want = want;
    const sp = this.spots, R = Math.max(150, this.L.bounds.x1 - this.L.bounds.x0);
    const lo = (o) => ({ ...o, tier: t === 'ultra' ? 'high' : 'low' });       // the city is draw-call bound: the library's lighter version of each (fewer cones and ghosts)
    for (const n of NAMES) if (!want[n]) this._off(n);
    if (want.godRays) {
      this._on('godRays', () => {
        const hs = [FX.godRays(this.target, lo({ position: [0, 78, 0], length: 74, intensity: 0.7, spread: 0.16, color: (NEON ? '#9fe9ff' : '#9ebcd2'), seed: 4 }))];
        if (sp.temple && kc.godGroups > 1) hs.push(FX.godRays(this.target, lo({ position: [sp.temple.x, 92, sp.temple.z], length: 90, intensity: 0.66, spread: 0.12, color: (NEON ? '#ffe3a0' : '#deb081'), seed: 9 })));
        return { stopped: false, stop() { hs.forEach((x) => x.stop()); this.stopped = true; } };
      });
    }
    if (want.lensFlare) {
      const d = new THREE.Vector3(U.uSun.value.x, U.uSun.value.y, U.uSun.value.z).normalize();
      if (!this.lastFlare || this.lastFlare.angleTo(d) > 0.06) {
        this._off('lensFlare');
        this.lastFlare = d.clone();
        this.h.lensFlare = FX.lensFlare(this.target, lo({ position: [d.x * 1300, d.y * 1300, d.z * 1300], color: (NEON ? '#ffe6b0' : '#e0b487'), camera: this.camera }));
      }
    } else this.lastFlare = null;
    if (want.aurora) this._on('aurora', () => FX.aurora(this.target, lo({ position: [0, 150, -1050], width: 1300, height: 260, intensity: 1.0, seed: 3 })));
    if (want.fireflies) {
      this._on('fireflies', () => {
        const hs = [FX.fireflies(this.target, lo({ center: [sp.temple?.x ?? -160, 3.5, sp.temple?.z ?? 0], box: [110, 9, 110], count: 80, size: 0.9, color: (NEON ? '#b8ff5a' : '#abb87b') }))];
        const rv = this.R.river[Math.floor(this.R.river.length / 2)];
        if (rv) hs.push(FX.fireflies(this.target, lo({ center: [rv[0], 3, rv[1]], box: [90, 7, 90], count: 60, size: 0.9, color: (NEON ? '#7fe9ff' : '#daa56f') })));
        return { stopped: false, stop() { hs.forEach((x) => x.stop()); this.stopped = true; } };
      });
    }
    if (want.lightning) {
      this._on('lightning', () => FX.lightning(this.target, { position: [0, 190, 0], ground: 0, spread: R * 0.9, width: 0.9, auto: false, flash: 0.8 }));
    }
  }

  /** a bolt now (the city calls this when its own flash fires in a storm) */
  strike() {
    if (this.h.lightning && !this.h.lightning.stopped) { this.h.lightning.strike(); this.strikes++; return true; }
    return false;
  }

  /** what is running (for the HUD and the tests) */
  active() { return Object.keys(this.h).filter((k) => this.h[k] && !this.h[k].stopped); }
}
