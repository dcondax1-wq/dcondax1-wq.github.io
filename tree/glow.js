// DAPHNE glow: the OLYMPUS render core laid over the 2D tree. The tree is still drawn by paint.js on #stage (all the
// logic, the touch and the tests stay there); this module hands that canvas to the core as a texture on a full-screen plane, so
// the luminous branches get real bloom, a film finish (vignette, grain), and a layer of fireflies rises through the canopy.
//   const g = await startGlow($('stage'), $('gl'), { onState })     // null when the core cannot load (the 2D look stays)
//   g.frame(now, redrawn)    after every paint();  g.on  true while the overlay is what the owner sees
// On LITE / off tiers the overlay stands down (the plain 2D tree shows), so a weak phone pays nothing for it.
import * as THREE from '../jarvis/three.module.min.js';

const FLIES = 110;
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FS = 'uniform sampler2D uMap; uniform float uGain; varying vec2 vUv;\n'
  + 'void main() { vec3 c = texture2D(uMap, vUv).rgb; float l = dot(c, vec3(0.3, 0.59, 0.11)); gl_FragColor = vec4(c * (uGain + 0.55 * l), 1.0); }';
const FLY_VS = `attribute float aSeed; attribute vec2 aHome; uniform float uTime, uPx, uAspect; varying float vA; varying float vHue;
void main() {
  float life = fract(uTime * (0.02 + 0.03 * aSeed) + aSeed * 7.0);                       // 0..1 along a slow rise
  vec2 p = aHome + vec2(sin(uTime * 0.4 + aSeed * 40.0) * 0.05 + sin(life * 6.0 + aSeed * 9.0) * 0.03, life * 0.7 - 0.1);
  vA = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.6, 1.0, life)) * (0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 30.0));
  vHue = aSeed;
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = uPx * (2.0 + 4.0 * fract(aSeed * 13.0));
}`;
const FLY_FS = 'varying float vA; varying float vHue;\n'
  + 'void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float k = max(0.0, 1.0 - r); k *= k;\n'
  + '  vec3 col = mix(vec3(0.35, 1.0, 0.62), vec3(1.0, 0.82, 0.38), step(0.82, vHue));\n'
  + '  gl_FragColor = vec4(col * 1.7 * k * vA, k * vA); }';

export async function startGlow(stage, glCanvas, { onState } = {}) {
  const forced = new URLSearchParams(location.search).get('q');                  // ?q=ultra|high|low|off pins the tier (low / off: the plain 2D tree)
  let mod;
  try { mod = await import('../olympus/render.js'); } catch (_) { return null; }
  let sw = stage.width, sh = stage.height;
  let rc = null, tex = null, plane = null, flies = null, on = false, dead = false;
  glCanvas.hidden = false;                                  // sized from its CSS box at birth (a hidden canvas measures 0)
  try {
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    tex = new THREE.CanvasTexture(stage);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uGain: { value: 1.05 } }, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false }));
    plane.frustumCulled = false; scene.add(plane);
    const pos = new Float32Array(FLIES * 3), home = new Float32Array(FLIES * 2), seed = new Float32Array(FLIES);
    let s = 17; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < FLIES; i++) { seed[i] = rnd(); home[i * 2] = (rnd() - 0.5) * 1.7; home[i * 2 + 1] = -0.55 + rnd() * 0.5; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aHome', new THREE.BufferAttribute(home, 2));
    flies = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPx: { value: 2 }, uAspect: { value: 1 } },
      vertexShader: FLY_VS, fragmentShader: FLY_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    flies.frustumCulled = false; scene.add(flies);
    rc = mod.createRenderer({ quality: ['ultra', 'high', 'low', 'off'].includes(forced) ? forced : undefined, canvas: glCanvas, scene, camera, space: 'display', env: 'none', alpha: false, fitCamera: false, maxDpr: 2,
      bloom: { strength: 0.55, radius: 0.7, threshold: 0.5 }, grade: { grain: 0.035, vignette: 0.3, aberration: 0.0012, saturation: 1.04 },
      onQuality: (l) => set(l === 'ultra' || l === 'high') });
  } catch (_) { try { rc && rc.dispose(); } catch (e) { /* nothing to free */ } return null; }

  function set(want) {
    if (dead || want === on) return;
    on = want;
    glCanvas.hidden = !on;
    if (on) rc.resize();
    if (typeof onState === 'function') onState(on);
  }
  set(rc.quality() === 'ultra' || rc.quality() === 'high');

  return {
    get on() { return on; },
    get passes() { return rc.passes(); },
    quality: () => rc.quality(),
    /** draw one frame of the overlay; `redrawn` = paint() just drew into the stage (it always does while the tree moves) */
    frame(now, redrawn = true) {
      if (!on || dead) return false;
      if (stage.width !== sw || stage.height !== sh) { sw = stage.width; sh = stage.height; tex.dispose(); redrawn = true; }   // the canvas was resized: a texture's storage is fixed, so it is made again
      if (redrawn) tex.needsUpdate = true;
      const u = flies.material.uniforms;
      u.uTime.value = now / 1000; u.uPx.value = rc.renderer.getPixelRatio() * 1.4;
      return rc.render();
    },
    dispose() { dead = true; on = false; glCanvas.hidden = true; rc.dispose(); tex.dispose(); },
  };
}
