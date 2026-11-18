// THE FORGE set (PROMETHEUS): what the fire burns on. Built on the OLYMPUS render core's materials, lit by its night sky:
//   - a polished obsidian floor (physical: clear-coat, reflects the sky and the glow of the flames),
//   - cracks of lava in it (one additive shader: voronoi edges that breathe, HDR so the bloom takes them),
//   - a molten gold ring around the arena (a flowing noise shader, white-gold hot spots) inside a brushed-gold band,
//   - six gold braziers on the rim with live coals,
//   - a dark sky dome that glows ember-red at the horizon, and two warm lights that flicker (one per fire, not per flame).
// update(t, still, pixelRatio): the only per-frame work (uniform writes; nothing is allocated).
const NOISE = `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 h22(vec2 p) { return vec2(h21(p), h21(p + 17.3)); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { return 0.55 * vn(p) + 0.3 * vn(p * 2.1 + 4.3) + 0.15 * vn(p * 4.3 + 9.1); }
`;

export function buildForgeSet(THREE, scene, o) {
  const R = o.ARENA_R, parts = {}, U = { uT: { value: 0 } };
  const lite = !!o.lite;

  // ---- sky dome: a dusk, indigo overhead and amber at the horizon (no fog, no depth)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 16, 8), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: U, vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; varying vec3 vD;
      void main(){ float h = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(vec3(0.20, 0.17, 0.22), vec3(0.62, 0.40, 0.20), exp(-abs(h) * 3.2)) * (0.55 + 0.25 * (1.0 - h));
        gl_FragColor = vec4(c, 1.0); }` }));
  dome.renderOrder = -10; scene.add(dome);

  // ---- floor: polished obsidian
  const floorMat = o.metal({ kind: 'gunmetal', color: '#4a3a2c', roughness: 0.5, clearcoat: 0.3, envMapIntensity: 0.9 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2.9, lite ? 40 : 64), floorMat);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // ---- lava cracks: voronoi edges baked ONCE into a small texture on the CPU (R = crack, G = glow, B = the cell's own phase),
  // so the per-pixel shader is one texture read and a sine: it breathes, it is brightest near the rim and fades toward the middle
  const S = R + 2.8, N = lite ? 256 : 448, px = new Uint8Array(N * N * 4);
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const wx = (i / (N - 1) * 2 - 1) * S, wz = (j / (N - 1) * 2 - 1) * S;
    const qx = wx * 0.42 + Math.sin(wz * 0.31) * 0.5 + Math.sin(wx * 0.17 + wz * 0.23) * 0.4, qz = wz * 0.42 + Math.sin(wx * 0.29 + 1.7) * 0.5 + Math.cos(wx * 0.21 - wz * 0.13) * 0.4;
    const gx = Math.floor(qx), gz = Math.floor(qz), fx = qx - gx, fz = qz - gz;
    let d1 = 9, d2 = 9, id = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const rx = a + hash(gx + a, gz + b) - fx, rz = b + hash(gx + a + 17.3, gz + b + 17.3) - fz, d = rx * rx + rz * rz;
      if (d < d1) { d2 = d1; d1 = d; id = hash(gx + a + 3.1, gz + b + 9.7); } else if (d < d2) d2 = d;
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1), t = Math.max(0, Math.min(1, 1 - e / 0.075)), g = Math.max(0, Math.min(1, 1 - e / 0.34));
    const k = (j * N + i) * 4;
    px[k] = Math.round(255 * t * t * (3 - 2 * t)); px[k + 1] = Math.round(255 * g * g * 0.4); px[k + 2] = Math.round(255 * id); px[k + 3] = 255;
  }
  const crackTex = new THREE.DataTexture(px, N, N, THREE.RGBAFormat);
  crackTex.magFilter = crackTex.minFilter = THREE.LinearFilter; crackTex.generateMipmaps = false; crackTex.needsUpdate = true;
  const crack = new THREE.Mesh(new THREE.CircleGeometry(S, lite ? 40 : 80), new THREE.ShaderMaterial({ uniforms: Object.assign({ tCrack: { value: crackTex } }, U),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT; uniform sampler2D tCrack; varying vec2 vW;
      void main(){
        vec4 c = texture2D(tCrack, vW / ${(2 * S).toFixed(2)} + 0.5);
        float pulse = 0.62 + 0.38 * sin(uT * 0.9 + c.b * 40.0);
        float rr = length(vW) / ${S.toFixed(2)};
        float mask = smoothstep(0.22, 0.95, rr) * (1.0 - smoothstep(0.97, 1.0, rr));
        vec3 hot = mix(vec3(1.0, 0.26, 0.05), vec3(1.0, 0.72, 0.22), c.b);
        gl_FragColor = vec4(hot * (c.r * 1.25 + c.g * 0.6) * pulse * mask, 1.0); }` }));
  crack.rotation.x = -Math.PI / 2; crack.position.y = 0.012; crack.renderOrder = 1; scene.add(crack);

  // ---- molten gold ring (flowing noise, HDR) inside a brushed gold band
  const ringR = R + 2.45;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.2, 8, lite ? 72 : 120), new THREE.ShaderMaterial({ uniforms: U, fog: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; varying vec2 vU;
      ${NOISE}
      void main(){ vec2 q = vec2(vU.x * 38.0 - uT * 0.55, vU.y * 5.0);
        float n = fbm2(q + vec2(fbm2(q * 0.7 + uT * 0.2) * 2.0, 0.0));
        vec3 c = mix(vec3(0.95, 0.22, 0.03), vec3(1.0, 0.72, 0.2), smoothstep(0.25, 0.7, n));
        c = mix(c, vec3(1.0, 0.95, 0.7), smoothstep(0.66, 0.9, n));
        gl_FragColor = vec4(c * (0.8 + 1.5 * n), 1.0); }` }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.18; scene.add(ring);
  const bandMat = o.metal({ kind: 'gold', roughness: 0.28 });
  for (const [r, y] of [[R + 2.78, 0.2], [R + 2.12, 0.16]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.11, 6, lite ? 72 : 120), bandMat);
    band.rotation.x = Math.PI / 2; band.position.y = y; scene.add(band);
  }

  // ---- braziers: gold lathe bowls on short stems with coals that glow
  const prof = [[0.0, 0.0], [0.3, 0.0], [0.34, 0.06], [0.12, 0.32], [0.1, 0.62], [0.2, 0.78], [0.46, 1.02], [0.52, 1.1], [0.46, 1.1], [0.38, 0.98], [0.0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.LatheGeometry(prof, lite ? 10 : 16);
  const goldMat = o.metal({ kind: 'gold', roughness: 0.22 });
  const coalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.36, 0.08).multiplyScalar(3.2), fog: false });
  const coals = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.26, x = Math.cos(a) * (R + 3.55), z = Math.sin(a) * (R + 3.55);
    const b = new THREE.Mesh(bowl, goldMat); b.position.set(x, 0, z); b.scale.setScalar(1.15); scene.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 4), coalMat); c.position.set(x, 1.12, z); c.scale.y = 0.35; scene.add(c);
    coals.push(c);
  }

  // ---- lights: one warm fill over the arena, one flicker low by the ring (a point light each, no shadows)
  const key = new THREE.PointLight(0xff8a3c, 0, 40, 1.6); key.position.set(0, 5.5, 0); scene.add(key);
  const rim = new THREE.PointLight(0xffb450, 0, 24, 1.8); rim.position.set(R + 1, 1.2, 0); scene.add(rim);
  key.intensity = 22; rim.intensity = 10;

  return {
    ring, floor, crack, dome, key, rim,
    update(t, still, pr) {
      U.uT.value = still ? 0 : t;
      if (!still) {
        key.intensity = 22 * (1 + 0.08 * Math.sin(t * 7.1) + 0.05 * Math.sin(t * 17.3));
        rim.position.set(Math.cos(t * 0.25) * (R + 1), 1.2, Math.sin(t * 0.25) * (R + 1));
        rim.intensity = 10 * (1 + 0.15 * Math.sin(t * 11.0));
        for (let i = 0; i < coals.length; i++) coals[i].scale.y = 0.33 + 0.05 * Math.sin(t * 5 + i * 1.7);
      }
      void pr;
    },
  };
}
