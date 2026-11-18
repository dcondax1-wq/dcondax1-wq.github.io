// KALSHI CITY effects layer (ES module): the OLYMPUS fx library (olympus/fx-*.js, docs/OLYMPUS_FX.md) plus the city's own light show.
//   god rays      light shafts over the city at dusk and dawn                          (OLYMPUS_FX.godRays)
//   lightning     a storm of real bolts and flashes when the weather is storm or the risk of ruin is high   (OLYMPUS_FX.lightning)
//   aurora        curtains over the Vault at night (not in a storm)                      (OLYMPUS_FX.aurora)
//   lens flares   the Exchange's spire at night, the sun or moon by day                  (OLYMPUS_FX.lensFlare)
//   fireworks     a rocket and a burst over every edge the engine just learned to DO MORE (own GPU points)
//   neon signs    the names of the tallest edges in neon tubes; fading edges flicker, dead ones say STOP (own sprites)
//   wet streets   when it rains, every glowing building leaves a neon reflection streak on the asphalt (own instanced quads)
//   scanner       the edge scanner: a radar ring and sweep from Downtown when the engine learns something new, the buildings it learned light up (own)
// Tiers follow the render core (ultra / high / low / off); reduced motion or off = no moving effect (the signs and the wet streaks stay as still pictures).
// createCityFx({ scene, camera, rc, O, sound() }) -> { rebuild(world, L, model, bIndex), update(st), strike(), fireworks(ids), scan(ids), stats(), dispose() }
import * as THREE from '../jarvis/three.module.min.js';
import { STATUS_COLOR } from './cityfeed.js';
import { rng } from './citylayout.js';

const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const BURST_N = { ultra: 110, high: 80, low: 44, off: 0 };
const SIGNS = { ultra: 14, high: 12, low: 8, off: 0 };

function signTexture(text, color, broken) {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 96;
  const g = cv.getContext('2d');
  g.font = '800 54px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(text, 192, 50);
  g.shadowColor = color; g.shadowBlur = 26; g.fillStyle = color; g.fillText(text, 192, 50);
  g.shadowBlur = 10; g.fillStyle = '#fff'; g.globalAlpha = broken ? 0.45 : 0.9; g.fillText(text, 192, 50);
  g.globalAlpha = 1; g.shadowBlur = 0; g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(10, 10, 364, 76);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const short = (e) => {
  const parts = e.dims.filter((d) => d !== '*').map((d) => d.replace(/\s*\(.*\)/, '').replace(/ ET$/, ''));
  return (parts.length > 1 ? parts.slice(0, 2).join(' ') : parts[0] || e.label).toUpperCase().slice(0, 14);
};

export function createCityFx({ scene, camera, rc, O = null, sound = () => false }) {
  const FXL = window.OLYMPUS_FX || null;
  let L = null, M = null, bIdx = null, world = null, dead = false, tierName = 'low', t = 0;
  const live = {};                                  // started library effects, by name
  const root = new THREE.Group(); root.name = 'kc-fx'; scene.add(root);
  let signs = [], wet = null, wetU = { uWet: { value: 0 }, uTime: { value: 0 }, uNight: { value: 1 } }, bursts = [], scan = null, loaded = false, lastF = 0, flareKey = '', counts = { fireworks: 0, scans: 0, strikes: 0 };
  const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const sfx = (n) => { try { if (sound() && O && O.sfx) O.sfx(n); } catch (_) { /* the sound is never needed */ } };
  const target = () => ({ scene, camera, renderer: rc.renderer, rc });
  const fxOn = () => !!FXL && loaded && FXL.tier && FXL.tier() !== 'off' && tierName !== 'off';
  if (FXL && FXL.load) FXL.load('3d').then(() => { loaded = true; }).catch(() => {});

  function stopFx(name) { if (live[name]) { try { live[name].stop(); } catch (_) { /* gone */ } delete live[name]; } }
  function startFx(name, opts) { if (!live[name] && FXL && FXL.has(name)) { try { live[name] = FXL[name](target(), opts); } catch (_) { /* an effect never breaks the city */ } } }

  // ---- neon signs and the wet-street streaks (built with the world, freed with it)
  function buildStatic() {
    signs = []; wet = null;
    if (!world || !L) return;
    const n = SIGNS[tierName] || 0;
    if (n) {
      const picks = L.buildings.filter((b) => !b.lab && !b.e.small && b.e.status !== 'DEAD').sort((a, b) => b.fullH - a.fullH).slice(0, n);
      L.buildings.filter((b) => !b.lab && b.e.status === 'DEAD' && !b.e.small).sort((a, b) => b.e.n - a.e.n).slice(0, 3).forEach((b) => picks.push(b));
      // one sign per word, and never the district's own floating name again (two copies of OTHER / BITCOIN read as a double image)
      const used = new Set((L.districts || []).map((d) => String(d.key === 'Downtown' ? 'MARKET HQ' : d.name || '').toUpperCase().slice(0, 14)));
      picks.filter((b) => { if (b.e.status === 'DEAD') return true; const k = short(b.e); if (used.has(k)) return false; used.add(k); return true; }).forEach((b, i) => {
        const dead = b.e.status === 'DEAD', col = dead ? '#ca785c' : STATUS_COLOR[b.e.status];
        const map = signTexture(dead ? 'STOP' : short(b.e), col, dead || b.e.status === 'DECAYING');
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: hdr('#ffffff', 1.5), transparent: true, depthWrite: false, fog: true }));
        const w = Math.max(7, b.w * 3.4);
        sp.scale.set(w, w / 4, 1); sp.position.set(b.x, (dead ? b.h : b.fullH) + w / 8 + 1.4, b.z); sp.renderOrder = 4;
        sp.userData = { flick: dead || b.e.status === 'DECAYING', ph: i * 1.7 };
        world.add(sp); signs.push(sp);
      });
    }
    const real = L.buildings.filter((b) => !b.lab && b.glow > 0.2 && !b.e.small).slice(0, 420);
    if (real.length && tierName !== 'off') {
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial(Object.assign({ fog: false, uniforms: wetU,
        vertexShader: `varying vec2 vUv; varying vec3 vC;
          void main() { vUv = uv; vC = vec3(1.0);
            #ifdef USE_INSTANCING_COLOR
              vC = instanceColor;
            #endif
            gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uWet, uTime, uNight; varying vec2 vUv; varying vec3 vC;
          void main() { float across = 1.0 - abs(vUv.x - 0.5) * 2.0; float along = pow(1.0 - vUv.y, 1.6);
            float rip = 0.78 + 0.22 * sin(vUv.y * 38.0 - uTime * 2.4 + vUv.x * 6.0);
            float a = pow(max(across, 0.0), 1.4) * along * rip * uWet * (0.3 + 0.7 * uNight);
            gl_FragColor = vec4(vC * a * 0.34, 1.0); }` }, ADD));
      wet = new THREE.InstancedMesh(geo, mat, real.length); wet.frustumCulled = false; wet.renderOrder = 1;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
      real.forEach((b, i) => {
        const r = Math.hypot(b.x, b.z) || 1, rx = b.x / r, rz = b.z / r, len = 2 + b.fullH * 0.22, wd = b.w * 0.85 + 0.7;
        q.setFromAxisAngle(up, Math.atan2(-rx, -rz)); p.set(b.x + rx * (len / 2 + b.d * 0.4), 0.36, b.z + rz * (len / 2 + b.d * 0.4)); s.set(wd, 1, len);
        m4.compose(p, q, s); wet.setMatrixAt(i, m4);
        c.set(STATUS_COLOR[b.e.status]).multiplyScalar(0.6 + 1.1 * b.glow); wet.setColorAt(i, c);
      });
      wet.instanceMatrix.needsUpdate = true; if (wet.instanceColor) wet.instanceColor.needsUpdate = true;
      world.add(wet);
    }
  }

  // ---- fireworks: a rocket, then a burst of sparks (GPU: positions come from the clock in the vertex shader)
  const FWV = `attribute vec4 aDir; attribute float aSeed; uniform float uT0, uTime, uPix, uSize; uniform vec3 uBase, uTop; uniform float uMode;
    varying float vA; varying float vH;
    void main() { float tt = uTime - uT0; vec3 p; float a = 0.0;
      if (uMode < 0.5) { float k = clamp(tt / 1.15, 0.0, 1.0); p = mix(uBase, uTop, 1.0 - pow(1.0 - k, 2.2)) + vec3(sin(tt * 30.0) * 0.12, 0.0, cos(tt * 27.0) * 0.12); a = (tt > 0.0 && tt < 1.15) ? 1.0 : 0.0; vH = 0.08; }
      else { float s = tt - 1.15; float sp = aDir.w; p = uTop + aDir.xyz * sp * (1.0 - exp(-s * 1.9)) * 1.9; p.y -= 3.2 * s * s; a = s > 0.0 ? (1.0 - smoothstep(1.4, 2.6, s)) * (0.7 + 0.3 * sin(s * 22.0 + aSeed * 40.0)) : 0.0; vH = aSeed; }
      vA = a; vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uPix * (0.6 + aSeed * 0.8) * a * (260.0 / max(30.0, -mv.z)) + 0.001; }`;
  const FWF = `uniform vec3 uColor, uColor2; varying float vA; varying float vH;
    void main() { float d = length(gl_PointCoord - 0.5); float g = smoothstep(0.5, 0.0, d); vec3 c = mix(uColor, uColor2, vH); gl_FragColor = vec4(c * g * g * vA * 2.6, 1.0); }`;
  function fireworks(ids) {
    if (dead || !L || !bIdx || reduced() || tierName === 'off') return 0;
    let k = 0;
    for (const id of ids.slice(0, 3)) {
      const i = bIdx.get(id); if (i == null || bursts.length >= 4) continue;
      const b = L.buildings[i], n = BURST_N[tierName], r = rng(b.x * 7 + b.z * 3 + 5);
      const pos = new Float32Array(n * 3), dir = new Float32Array(n * 4), seed = new Float32Array(n);
      for (let j = 0; j < n; j++) { const u = r() * 2 - 1, a = r() * 6.2832, s = Math.sqrt(1 - u * u), sp = 7 + r() * 8; dir.set([Math.cos(a) * s, u, Math.sin(a) * s, sp], j * 4); seed[j] = r(); }
      const mk = (mode, count) => {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(mode ? pos : new Float32Array(3), 3));
        g.setAttribute('aDir', new THREE.BufferAttribute(mode ? dir : new Float32Array(4), 4)); g.setAttribute('aSeed', new THREE.BufferAttribute(mode ? seed : new Float32Array(1), 1));
        const u = { uT0: { value: t }, uTime: { value: t }, uPix: { value: rc.renderer.getPixelRatio() }, uSize: { value: mode ? 7 : 11 }, uBase: { value: new THREE.Vector3(b.x, 0.5, b.z) },
          uTop: { value: new THREE.Vector3(b.x, b.fullH + 22 + r() * 8, b.z) }, uMode: { value: mode }, uColor: { value: hdr('#dcaa78', 1) }, uColor2: { value: hdr('#a0af6a', 1) } };
        const pts = new THREE.Points(g, new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: FWV, fragmentShader: FWF, fog: false }, ADD))); pts.frustumCulled = false; pts.userData.u = u; pts.userData.count = count;
        g.setDrawRange(0, count); return pts;
      };
      const rocket = mk(0, 1), burst = mk(1, n), grp = new THREE.Group(); grp.add(rocket, burst); root.add(grp);
      bursts.push({ grp, born: t }); k++; counts.fireworks++;
    }
    if (k) sfx('rankup');
    return k;
  }

  // ---- the edge scanner
  function scanFor(ids, hooks) {
    if (dead || !L || reduced() || tierName === 'off') { if (ids && ids.length && hooks) hooks.highlight(ids, 1.5); return false; }
    if (scan) { root.remove(scan.grp); scan.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const grp = new THREE.Group(), R = Math.max(40, L.extent * 1.1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 128), new THREE.MeshBasicMaterial(Object.assign({ color: hdr('#9fae68', 2.4), side: THREE.DoubleSide, fog: false }, ADD)));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.7;
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 16, 48, 1, true), new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide, fog: false, uniforms: { uA: { value: 1 } },
      vertexShader: 'varying float vY; void main() { vY = position.y / 16.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; varying float vY; void main() { gl_FragColor = vec4(vec3(0.18, 0.95, 0.82) * pow(1.0 - vY, 2.4) * 0.9 * uA, 1.0); }' }, ADD)));
    curtain.position.y = 8;
    const sweep = new THREE.Mesh(new THREE.CircleGeometry(1, 48, 0, 0.7), new THREE.ShaderMaterial(Object.assign({ side: THREE.DoubleSide, fog: false, uniforms: { uA: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; varying vec2 vP; void main() { float ang = atan(vP.y, vP.x) / 0.7; float r = length(vP); gl_FragColor = vec4(vec3(0.2, 1.0, 0.85) * smoothstep(0.0, 1.0, ang) * smoothstep(0.1, 1.0, r) * 0.55 * uA, 1.0); }' }, ADD)));
    sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.8;
    grp.add(ring, curtain, sweep); root.add(grp);
    scan = { grp, ring, curtain, sweep, born: t, R, ids: ids || [], hooks, hit: false }; counts.scans++;
    sfx('portal');
    return true;
  }
  function stepScan() {
    if (!scan) return;
    const k = (t - scan.born) / 4.6;
    if (k >= 1) { root.remove(scan.grp); scan.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); scan = null; return; }
    const r = Math.max(1, k * scan.R), fade = Math.pow(1 - k, 0.8);
    scan.ring.scale.set(r, r, 1); scan.curtain.scale.set(r, 1, r); scan.curtain.material.uniforms.uA.value = fade;
    scan.ring.material.color.copy(hdr('#9fae68', 2.4 * fade));
    scan.sweep.scale.set(scan.R, scan.R, 1); scan.sweep.rotation.z = -t * 2.6; scan.sweep.material.uniforms.uA.value = fade;
    if (!scan.hit && k > 0.28) { scan.hit = true; if (scan.hooks && scan.ids.length) scan.hooks.highlight(scan.ids, 5); }
  }

  // ---- the lifecycle of the library effects, once a frame
  function update(st) {
    if (dead) return;
    t = st.t; tierName = st.tier;
    wetU.uTime.value = st.reduced ? 0 : t; wetU.uNight.value = st.night; wetU.uWet.value = st.wet;
    signs.forEach((s) => { const u = s.userData; s.material.opacity = u.flick && !st.reduced ? (Math.sin(t * 9 + u.ph) * Math.sin(t * 3.1 + u.ph * 2) > 0.55 ? 0.25 : 0.95) : 0.95; s.visible = tierName !== 'off'; });
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], age = t - b.born;
      b.grp.children.forEach((p) => { p.userData.u.uTime.value = t; p.userData.u.uT0.value = b.born; });
      if (age > 4.2) { root.remove(b.grp); b.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); bursts.splice(i, 1); }
    }
    stepScan();
    const on = fxOn() && !st.reduced;
    if (!on) { Object.keys(live).forEach(stopFx); return; }
    const ext = L ? L.extent : 120;
    // god rays at dusk and dawn
    if (st.tw > 0.3 && !live.godRays) startFx('godRays', { position: [st.sun[0] * 0.35, 120, st.sun[2] * 0.35], length: 125, intensity: 0.5, color: '#d9a26b', spread: 0.22 });
    else if (st.tw < 0.12) stopFx('godRays');
    // a storm: weather or a risk of ruin that is high
    if (st.stormy && !live.lightning) startFx('lightning', { position: [0, 95, 0], spread: ext * 0.7, width: 0.5, flash: 0.75, every: [3, 8], color: '#e8dcc0',
      onFlash: (f) => { if (f > 0.5 && lastF <= 0.5) { counts.strikes++; setTimeout(() => sfx('thunder'), 380); } lastF = f; } });
    else if (!st.stormy) stopFx('lightning');
    // aurora over the Vault, at night, not in a storm
    if (st.night > 0.7 && st.weather !== 'storm' && !live.aurora) startFx('aurora', { position: [10, 62, -70], width: 95, height: 30, intensity: 0.12, colors: ['#d9a26b', '#c96a4a', '#b9a98c'] });
    else if (st.night < 0.4 || st.weather === 'storm') stopFx('aurora');
    // lens flares: the Exchange's spire at night; the sun or the moon, moved to where it is now
    if (st.night > 0.6 && !live.spire) { /* the tower itself glows: screen-space flare covered the foreground blocks */ }
    else if (st.night < 0.3) stopFx('spire');
    const key = `${Math.round(st.hour * 2)}|${st.night > 0.5 ? 'n' : 'd'}|${st.stormy ? 1 : 0}`;
    if (key !== flareKey) {
      flareKey = key; stopFx('flare');
      if (!st.stormy && FXL.has('lensFlare')) { try { live.flare = FXL.lensFlare({ scene, camera }, { position: [st.sun[0] * 0.5, Math.max(30, st.sun[1] * 0.5), st.sun[2] * 0.5], color: st.night > 0.5 ? '#e8dcc0' : '#e0b487' }); } catch (_) { /* skip */ } }
    }
  }

  function dispose() {
    dead = true; Object.keys(live).forEach(stopFx);
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    scene.remove(root);
  }

  return {
    rebuild(w, layout, model, index) { world = w; L = layout; M = model; bIdx = index; scan = null; bursts.forEach((b) => root.remove(b.grp)); bursts = []; buildStatic(); },
    update, fireworks, scan: scanFor, dispose,
    strike() { if (live.lightning && live.lightning.strike) { live.lightning.strike(); counts.strikes++; return true; } return false; },
    stats: () => ({ live: Object.keys(live), signs: signs.length, wet: wet ? wet.count : 0, bursts: bursts.length, scanning: !!scan, loaded, tier: tierName, counts: { ...counts } }),
  };
}
