/* THE FOUR PILLARS, the temple (pillars/pillars-scene.js, ES module, loaded after the first paint by pillars.js and hero.js).
 * day-pillars-cinema 2026-11-24 (owner: "those can look WAY better"): an Olympus temple at night. Four fluted Doric columns (entasis,
 * 20 flutes, gold capitals, Attic bases) on a 3-step stylobate under an entablature (triglyphs) and a pediment, on a mirror-black obsidian
 * floor, under stars, god rays and drifting mist. Each column is a pillar: its flutes fill with liquid light up to its level (LIVE = full and
 * breathing, OFF = dim marble with a faint ember at the foot, ORDER FLOW = tick days / 60), a bright ring marks the level and a thin stream
 * of motes rises off every live capital.
 * three.js r160 from cdnjs (pinned 0.160.0), else the site's own r160 copy (../jarvis/three.module.min.js). cdnjs hosts only the core
 * module for r160 (no examples/jsm), so the add-ons are written here on core three: a RoomEnvironment-style light room through PMREM, an
 * UnrealBloom-style HDR bloom (bright pass + 4-level blur chain, ACES + vignette + grain in the composite), baked AO in vertex colours,
 * soft shadows (PCFSoft, rendered once: the temple never moves), fog sprites and a fake reflection (the temple mirrored under a glossy floor).
 * create(canvas, cols, cfg) -> Promise<api | null>
 *   cols = [{ id, name, color, fill 0..1, dim }]
 *   cfg  = { onPick(id), onLost(), onFrame(project), reduce, low, compact (the hero strips: no labels, a wide shot), alpha (a clear backdrop),
 *            inset (share of the canvas bottom the page covers), pad (extra air), localFirst (the site's three.js copy before cdnjs) }
 *   api  = { select(id, focus), setFill(map), project(id, where), stats(), dispose() }
 * Quality: 'hq' (bloom, shadows, mirror, all motes), 'low' (no bloom / shadows / mirror, DPR 1, fewer motes, 30 fps). It starts at hq unless
 * the phone asks for less (Save-Data, ?lite=1, <= 2 cores, <= 2 GB) and steps down by itself on slow frames: DPR -> no bloom -> low.
 * ?fx=hq pins hq (screenshots). Reduced motion: no intro, no sway, no flow; it draws only when touched. Paused on a hidden tab / off screen. */
export const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
const THREE_LOCAL = '../jarvis/three.module.min.js';
async function loadThree(localFirst) {   // the Pillars page: cdnjs first; the hero on Home / NQ: the site's own copy first (those pages load nothing off the site, and NQ shares the module)
  for (const u of localFirst ? [THREE_LOCAL, THREE_CDN] : [THREE_CDN, THREE_LOCAL]) { try { return await import(u); } catch (_) { /* offline / blocked: the next */ } }
  return null;
}
export function isLowPower(w) {
  const n = (w && w.navigator) || {}, q = String((w && w.location && w.location.search) || '');
  if (/[?&]fx=(hq|3d)/.test(q)) return false;
  if (/[?&]lite=1/.test(q)) return true;
  return (+n.hardwareConcurrency > 0 && +n.hardwareConcurrency <= 2) || (+n.deviceMemory > 0 && +n.deviceMemory <= 2) || !!(n.connection && n.connection.saveData);
}

/* ---------------- the temple's measures (world units; the floor is y = 0) ---------------- */
const STEP = .11, NSTEP = 3, TOPY = STEP * NSTEP;        // the crepidoma: 3 steps
const BASE_H = .15, HS = 2.5, R0 = .2, R1 = .168;          // Attic base, shaft height, shaft radius at the foot / the neck (entasis)
const SY = TOPY + BASE_H;                                   // the shaft's foot
const CAP_H = .22, TOP = SY + HS + CAP_H;                   // capital, the top of the columns
const GAP = 1.04, FLUTES = 20, DEPTH = .075;
const COL_Z = .1;
const EXPO = .9;

const GLSL_NOISE = `float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
 return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }`;

/* ---------------- small geometry kit (core three has no mergeGeometries) ---------------- */
function merge(THREE, list) {
  const parts = list.map((g) => (g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()])));
  let nv = 0, ni = 0; for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of parts) {
    const n = g.attributes.position.count; if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, ov * 3); else col.fill(1, ov * 3, (ov + n) * 3);
    const I = g.index.array; for (let k = 0; k < I.length; k++) idx[oi + k] = I[k] + ov;
    ov += n; oi += I.length;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1)); m.computeBoundingSphere(); return m;
}
const ao = (THREE, g, f) => { const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) c.fill(f(p.getX(i), p.getY(i), p.getZ(i)), i * 3, i * 3 + 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
const box = (THREE, w, h, d, x, y, z, f) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return f ? ao(THREE, g, f) : g; };

/** a Doric shaft: 20 concave flutes with arrises, entasis, baked AO; per vertex aGroove (0 arris .. 1 deepest), aH (0 foot .. 1 neck), aFlute */
function shaftGeometry(THREE, low) {
  const per = low ? 4 : 12, cols = FLUTES * per, rings = low ? 24 : 96;
  const P = [], UV = [], G = [], Hh = [], F = [], C = [], I = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, y = v * HS, r = R0 + (R1 - R0) * v + .012 * Math.sin(Math.PI * Math.min(1, v * 1.25));
    for (let i = 0; i <= cols; i++) {
      const a = i / cols * Math.PI * 2, t = (i % per) / per, groove = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)), rr = r * (1 - DEPTH * groove);
      P.push(Math.cos(a) * rr, y, Math.sin(a) * rr); UV.push(i / cols * 2, v * 3); G.push(groove); Hh.push(v); F.push(Math.floor(i / per) % FLUTES);
      const o = (.5 + .5 * Math.min(1, v / .05)) * (.62 + .38 * Math.min(1, (1 - v) / .05)) * (1 - .28 * groove);
      C.push(o, o, o);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('aGroove', new THREE.Float32BufferAttribute(G, 1)); g.setAttribute('aH', new THREE.Float32BufferAttribute(Hh, 1));
  g.setAttribute('aFlute', new THREE.Float32BufferAttribute(F, 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
/** the gold capital: three annulets + a fillet at the necking, an echinus (an ovolo cushion, lathe), a bead ring, the abacus slab + a thin top plate */
function capitalGeometry(THREE, low) {
  const s = low ? 20 : 64, pts = [], k = low ? 10 : 22;
  for (let j = 0; j <= k; j++) { const t = j / k, sw = Math.sin(t * Math.PI / 2) ** .8, bulge = low ? 0 : .012 * Math.sin(t * Math.PI);   // the echinus: a gentle ovolo
    pts.push(new THREE.Vector2(R1 * 1.02 + (.29 - R1 * 1.02) * sw + bulge, .03 + t * .11)); }
  const ech = new THREE.LatheGeometry(pts, s);
  const ring = (r, tube, y) => { const g = new THREE.TorusGeometry(r, tube, low ? 6 : 10, s); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; };
  const list = [ech, ring(R1 * 1.03, .014, .012), ring(R1 * 1.03, .014, .03)];
  if (!low) { list.push(ring(R1 * 1.035, .007, .046), ring(R1 * .99 + .02, .008, -.045));   // a third annulet + the hypotrachelion groove line below
    const fil = new THREE.CylinderGeometry(R1 * 1.0, R1 * 1.0, .02, s, 1, true); fil.translate(0, .056, 0); list.push(fil);
    list.push(ring(.288, .009, .137)); }                                                       // a bead ring under the abacus
  const abacus = new THREE.BoxGeometry(.64, .065, .64); abacus.translate(0, .14 + .0325, 0); list.push(abacus);
  if (!low) { const top = new THREE.BoxGeometry(.6, .016, .6); top.translate(0, .14 + .065 + .008, 0); list.push(top); }   // a crisp plate on top (a second gold edge)
  return merge(THREE, list);
}
/** the Attic base: plinth, lower torus, scotia, upper torus */
function baseGeometry(THREE, low) {
  const s = low ? 20 : 40, plinth = new THREE.BoxGeometry(.58, .06, .58); plinth.translate(0, .03, 0);
  const t1 = new THREE.TorusGeometry(R0 + .045, .04, 8, s); t1.rotateX(Math.PI / 2); t1.translate(0, .095, 0);
  const sc = new THREE.CylinderGeometry(R0 + .01, R0 + .03, .03, s, 1, true); sc.translate(0, .125, 0);
  const t2 = new THREE.TorusGeometry(R0 + .02, .022, 8, s); t2.rotateX(Math.PI / 2); t2.translate(0, .14, 0);
  return merge(THREE, [plinth, t1, sc, t2].map((g) => ao(THREE, g, (x, y) => .7 + .3 * Math.min(1, y / .12))));
}

/* ---------------- procedural textures (canvas, once) ---------------- */
function noise2(seed) {
  const P = new Uint8Array(512); for (let i = 0; i < 256; i++) P[i] = i; let s = seed || 7;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const g = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  return (x, y) => { const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y); const u = x * x * (3 - 2 * x), v = y * y * (3 - 2 * y);
    const a = P[X] + Y, b = P[X + 1] + Y; return (1 - v) * ((1 - u) * g(P[a], x, y) + u * g(P[b], x - 1, y)) + v * ((1 - u) * g(P[a + 1], x, y - 1) + u * g(P[b + 1], x - 1, y - 1)); };
}
function marbleTexture(THREE, size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), img = g.createImageData(size, size), n = noise2(11), m = noise2(29);
  const fbm = (x, y, nz) => { let v = 0, a = .5, f = 1; for (let o = 0; o < 5; o++) { v += a * nz(x * f, y * f); f *= 2; a *= .5; } return v; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * 4, v = y / size * 4, w = fbm(u, v, n) * 3.2;
    const vein = Math.pow(1 - Math.abs(Math.sin((u * .9 + v * 1.7 + w) * Math.PI)), 14), fine = Math.pow(1 - Math.abs(Math.sin((u * 2.3 - v * .8 + fbm(u + 3, v, m) * 4) * Math.PI)), 30);
    const cloud = .5 + .5 * fbm(u * 1.5, v * 1.5, m);
    let r = 214 + cloud * 26, gg = 208 + cloud * 24, b = 228 + cloud * 22;            // a cool lilac-white marble
    r -= vein * 120 + fine * 40; gg -= vein * 132 + fine * 46; b -= vein * 84 + fine * 26;   // violet-grey veins
    const gold = Math.pow(1 - Math.abs(Math.sin((u * .6 - v * 1.1 + w * 1.3 + 1.7) * Math.PI)), 60);
    r += gold * 50; gg += gold * 36; b -= gold * 30;                                  // a rare thread of gold
    const i = (y * size + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function cloudTexture(THREE) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S), n = noise2(5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - .5, dy = y / S - .5, d = Math.sqrt(dx * dx + dy * dy) * 2;
    let v = 0, a = .5, f = 3; for (let o = 0; o < 5; o++) { v += a * n(x / S * f, y / S * f); f *= 2; a *= .5; }
    const al = Math.max(0, Math.min(1, (.55 + v * 1.3) * Math.max(0, 1 - d) ** 1.6)), i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = al * 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); return t;
}
/** a RoomEnvironment-style light room (core three only): dark violet walls, a big cool skylight, a gold and a violet panel, a mint strip */
function lightRoom(THREE) {
  const room = new THREE.Scene(), bx = new THREE.BoxGeometry();
  const wall = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: new THREE.Color(.018, .01, .03), side: THREE.BackSide })); wall.scale.set(16, 10, 16); room.add(wall);
  const lamp = (r, g, b, k, s, p) => { const m = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: new THREE.Color(r * k, g * k, b * k) })); m.scale.set(...s); m.position.set(...p); room.add(m); };
  lamp(.92, .88, 1, 2.2, [7, .1, 5], [0, 4.9, 0]);          // skylight: moon-white
  lamp(1, .8, .42, 9, [.1, 3, 4], [-7.9, 1.5, 1]);       // gold panel
  lamp(.62, .35, .93, 7, [.1, 3, 5], [7.9, 1.2, -1]);    // violet panel
  lamp(.75, .7, 1, 1.2, [6, 2.5, .1], [0, 1.5, 7.9]);       // the front: soft lilac
  lamp(.47, .86, .54, 2, [4, .3, .1], [0, .3, -7.9]);     // a low mint strip behind
  return room;
}

/* ---------------- shaders ---------------- */
const SKY_VS = `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`;
const SKY_FS = `precision highp float; uniform float uT; uniform float uA; varying vec3 vD;
${GLSL_NOISE}
float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main(){ vec3 d = normalize(vD); float h = d.y;
 vec3 c = mix(vec3(.002, .001, .005), vec3(.008, .003, .018), smoothstep(.6, -.05, h));                     // deep night, a violet horizon
 c += vec3(.03, .011, .065) * exp(-pow(length(vec2(d.x * 1.3, (h - .1) * 2.6)), 2.) * 2.5) + vec3(.05, .02, .11) * exp(-pow(length(vec2(d.x * 1.6, (h - .3) * 2.)), 2.) * 3.);                 // the glow behind the temple
 vec3 m = normalize(vec3(-.27, .37, -.89)); float md = max(dot(d, m), 0.);
 c += vec3(.55, .48, .9) * pow(md, 160.) * .22 + vec3(.25, .18, .5) * pow(md, 12.) * .07 + vec3(1., .96, .9) * smoothstep(.99975, .99985, md) * 1.15 * (.85 + .15 * vnoise(d.xy * 900.));   // the moon
 float neb = vnoise(d.xy * 3. + d.z) * vnoise(d.zy * 5. - 1.3); c += vec3(.022, .008, .04) * neb * smoothstep(0., .5, h);   // a faint nebula
 vec3 q = d * 210.; vec3 id = floor(q); float s = h13(id);
 if (s > .985 && h > -.02) { vec3 f = fract(q) - .5; float r = length(f); float tw = .55 + .45 * sin(uT * (1. + s * 3.) + s * 60.);
   float b = smoothstep(.5, 0., r) * (s - .985) / .015 * tw; c += mix(vec3(.75, .7, 1.), vec3(1., .88, .6), step(.996, s)) * b * 2.2 * smoothstep(-.02, .25, h); }
 gl_FragColor = vec4(c, uA); }`;

const FLOOR_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FS = `precision highp float; uniform vec3 uC[4]; uniform vec2 uP[4]; uniform float uF[4]; uniform float uT; uniform float uMirror; varying vec3 vW;
${GLSL_NOISE}
void main(){ vec3 v = normalize(cameraPosition - vW); float ndv = clamp(v.y, 0., 1.), fres = .04 + .96 * pow(1. - ndv, 5.);
 vec2 p = vW.xz; float d = length(p * vec2(.75, 1.));
 vec3 c = vec3(.006, .004, .011) * (.75 + .5 * vnoise(p * 3.1));                                         // obsidian
 vec2 g = abs(fract(p * .5 + .5) - .5); float seam = 1. - smoothstep(.0, .012, min(g.x, g.y)); c += vec3(.09, .06, .15) * seam * .25 * exp(-d * .25);
 for (int i = 0; i < 4; i++) { vec2 q = p - uP[i]; float rip = .8 + .2 * vnoise(vec2(q.x * 9., q.y * 2.5 - uT * .3));
   c += uC[i] * uF[i] * (exp(-(q.x * q.x * 12. + max(q.y, 0.) * max(q.y, 0.) * .07 + min(q.y, 0.) * min(q.y, 0.) * 6.)) * 1.05 * rip + exp(-(q.x * q.x * 1.6 + q.y * q.y * .5)) * .08); }   // wet-stone light streaks under each pillar
 c += vec3(.03, .012, .06) * fres * .8;
 c += vec3(.16, .08, .3) * exp(-d * d * .05) * .12;
 float far = smoothstep(7., 26., length(cameraPosition.xz - vW.xz)); c = mix(c, vec3(.006, .002, .014), far);
 float a = mix(1., clamp(.5 - fres * .3 + d * .05, .28, 1.), uMirror); a = mix(a, 1., far);   // see-through (the mirrored temple) near the temple, solid far away
 gl_FragColor = vec4(c, a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

const RAY_VS = `attribute float aA; attribute float aS; varying vec2 vU; varying float vA; varying float vS; void main(){ vU = uv; vA = aA; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`;
const RAY_FS = `precision highp float; uniform float uT; uniform vec3 uC; varying vec2 vU; varying float vA; varying float vS;
${GLSL_NOISE}
void main(){ float x = 1. - abs(vU.x - .5) * 2.; float along = smoothstep(1., .82, vU.y) * smoothstep(0., .55, vU.y);
 float sh = .65 + .35 * vnoise(vec2(vU.x * 6. + vS * 9., vU.y * 2. - uT * .08)); float a = pow(x, 2.2) * along * vA * sh * (.8 + .2 * sin(uT * .5 + vS * 6.));
 gl_FragColor = vec4(uC * a, a);
 #include <colorspace_fragment>
}`;

const FOG_VS = `attribute vec4 aF; uniform float uT; varying vec2 vU; varying float vA; varying float vSeed;
void main(){ vU = uv; vSeed = aF.w; vec3 c = (instanceMatrix * vec4(0., 0., 0., 1.)).xyz; float s = length(instanceMatrix[0].xyz);
 c.x = mod(c.x + uT * aF.x + 9., 18.) - 9.; c.y += sin(uT * .2 + aF.w * 6.) * .05;
 vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
 vec3 p = c + right * position.x * s + up * position.y * s * aF.y; vA = aF.z * smoothstep(9., 6., abs(c.x));
 gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`;
const FOG_FS = `precision highp float; uniform sampler2D uTex; uniform float uT; uniform vec3 uC; varying vec2 vU; varying float vA; varying float vSeed;
void main(){ vec2 u = vU; u = (u - .5) * mat2(cos(vSeed * 6.), -sin(vSeed * 6.), sin(vSeed * 6.), cos(vSeed * 6.)) + .5; float t = texture2D(uTex, u + vec2(uT * .004, 0.)).a;
 float a = t * vA; gl_FragColor = vec4(uC * a, a);
 #include <colorspace_fragment>
}`;

const PT_VS = `attribute float aS; attribute vec3 aC; attribute float aA; uniform float uPx; varying vec3 vC; varying float vAl;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; vC = aC; vAl = aA; gl_PointSize = clamp(aS * uPx / max(.1, -mv.z), 1., 96.); }`;
const PT_FS = `precision highp float; varying vec3 vC; varying float vAl; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard;
 float g = pow(1. - r, 2.5); gl_FragColor = vec4(vC * g * vAl, g * vAl);
 #include <colorspace_fragment>
}`;

// a volumetric light shaft per column: an open cone of light from the entablature down to the step, soft at its silhouette (view angle),
// fading down, with slow noise drifting through it; per instance colour + strength (1 draw call for all four)
const SHAFT_VS = `attribute vec3 aC; attribute float aK; varying vec3 vC; varying float vK; varying float vY; varying vec3 vN; varying vec3 vV; varying vec2 vU;
void main(){ vC = aC; vK = aK; vU = uv; vY = position.y; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
 vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHAFT_FS = `precision highp float; uniform float uT; varying vec3 vC; varying float vK; varying float vY; varying vec3 vN; varying vec3 vV; varying vec2 vU;
${GLSL_NOISE}
void main(){ float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0., 1.), 1.6);                 // thick through the middle, soft at the rim
 float y = clamp(vY + .5, 0., 1.);                                                                             // 0 floor .. 1 top
 float fall = smoothstep(0., .18, y) * mix(.45, 1., y) * smoothstep(1., .9, y);
 float n = .55 + .45 * vnoise(vec2(vU.x * 9., y * 3. + uT * .35)) * vnoise(vec2(vU.x * 4. + 3.1, y * 6. + uT * .2));
 float a = edge * fall * n * vK; gl_FragColor = vec4(vC * a, a);
 #include <colorspace_fragment>
}`;
// dust in the shafts: the GPU moves every mote (no CPU), each one belongs to a column (aI) and glows with that column's shaft
const DUST_VS = `attribute vec4 aD; uniform float uT; uniform float uPx; uniform vec3 uC[4]; uniform float uK[4]; uniform vec2 uX[4]; uniform float uY0; uniform float uH; varying vec3 vC; varying float vAl;
void main(){ int i = int(aD.w); float k = 0.; vec3 c = vec3(0.); vec2 x0 = vec2(0.);
 for (int j = 0; j < 4; j++) { if (j == i) { k = uK[j]; c = uC[j]; x0 = uX[j]; } }
 float y = fract(aD.y - uT * (.012 + aD.z * .02));                                                         // dust sinks slowly through the light
 float r = (.12 + .5 * aD.x) * mix(1., .55, y), a = aD.z * 40. + uT * (.05 + aD.x * .08) + y * 3.;
 vec3 p = vec3(x0.x + cos(a) * r, uY0 + y * uH, x0.y + sin(a) * r * .8);
 vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
 float tw = .6 + .4 * sin(uT * (1.3 + aD.z * 2.) + aD.x * 30.);
 vC = mix(c, vec3(1., .95, .86), .35); vAl = k * tw * smoothstep(0., .1, y) * smoothstep(1., .8, y);
 gl_PointSize = clamp((.018 + aD.z * .02) * uPx / max(.1, -mv.z), 1., 12.); }`;

// post: a fullscreen triangle
const POST_VS = `varying vec2 vU; void main(){ vU = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;
const BRIGHT_FS = `precision highp float; uniform sampler2D tIn; uniform float uThr; uniform float uKnee; uniform vec2 uTx; varying vec2 vU;
void main(){ vec3 c = .25 * (texture2D(tIn, vU + uTx * vec2(-.5, -.5)).rgb + texture2D(tIn, vU + uTx * vec2(.5, -.5)).rgb + texture2D(tIn, vU + uTx * vec2(-.5, .5)).rgb + texture2D(tIn, vU + uTx * vec2(.5, .5)).rgb);
 float l = max(c.r, max(c.g, c.b)); float w = smoothstep(uThr, uThr + uKnee, l); gl_FragColor = vec4(min(c * w, vec3(24.)), 1.); }`;
const DOWN_FS = `precision highp float; uniform sampler2D tIn; uniform vec2 uTx; varying vec2 vU;
void main(){ gl_FragColor = vec4(.25 * (texture2D(tIn, vU + uTx * vec2(-1., -1.)).rgb + texture2D(tIn, vU + uTx * vec2(1., -1.)).rgb + texture2D(tIn, vU + uTx * vec2(-1., 1.)).rgb + texture2D(tIn, vU + uTx * vec2(1., 1.)).rgb), 1.); }`;
const BLUR_FS = `precision highp float; uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vU;
void main(){ vec3 c = texture2D(tIn, vU).rgb * .2270270270;
 c += (texture2D(tIn, vU + uDir * 1.3846153846).rgb + texture2D(tIn, vU - uDir * 1.3846153846).rgb) * .3162162162;
 c += (texture2D(tIn, vU + uDir * 3.2307692308).rgb + texture2D(tIn, vU - uDir * 3.2307692308).rgb) * .0702702703; gl_FragColor = vec4(c, 1.); }`;
const COMP_FS = `precision highp float; uniform sampler2D tScene; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;
uniform float uBloom; uniform float uExp; uniform float uT; uniform float uAlpha; uniform vec2 uRes; uniform float uVig; varying vec2 vU;
uniform sampler2D tDof; uniform sampler2D tDepth; uniform float uDof; uniform float uFocus; uniform float uRange; uniform float uNear; uniform float uFar;
vec3 oRRT(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 oAces(vec3 c){ const mat3 I = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
 const mat3 O = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602)); c = I * (c / .6); c = oRRT(c); return clamp(O * c, 0., 1.); }
vec3 oSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float oH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){ vec4 s = texture2D(tScene, vU);
 if (uDof > .001) {                                                                                       // depth of field on the selected column
   float z = texture2D(tDepth, vU).r; float vz = uNear * uFar / (uFar - z * (uFar - uNear));               // the view distance of this pixel
   float coc = clamp(abs(vz - uFocus) / uRange - .12, 0., 1.); coc = coc * coc * (3. - 2. * coc) * uDof;
   s.rgb = mix(s.rgb, texture2D(tDof, vU).rgb, coc); }
 vec3 b = texture2D(tB0, vU).rgb * .55 + texture2D(tB1, vU).rgb * .75 + texture2D(tB2, vU).rgb * .9 + texture2D(tB3, vU).rgb * 1.1;
 vec3 c = (s.rgb + b * uBloom) * uExp;
 vec2 q = (vU - .5) * vec2(uRes.x / uRes.y, 1.); float vig = smoothstep(1.25, .25, length(q * vec2(.85, 1.))); c *= mix(1., vig, uVig);
 c = oSrgb(oAces(c));
 c += (oH(vU * uRes + fract(uT) * 91.) - .5) * .022 * (1. - c.g * .6);   // film grain
 float a = mix(1., clamp(max(s.a, max(c.r, max(c.g, c.b)) * 1.4), 0., 1.), uAlpha);
 gl_FragColor = vec4(c, a); }`;

/* ---------------- the scene ---------------- */
export async function create(canvas, cols, cfg) {
  cfg = cfg || {};
  const THREE = await loadThree(!!cfg.localFirst); if (!THREE) return null;
  const q = String(location.search || ''), pinHQ = /[?&]fx=hq/.test(q), compact = !!cfg.compact, reduce = !!cfg.reduce, clear = !!cfg.alpha;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !!cfg.low, alpha: clear, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false }); } catch (_) { return null; }
  if (!renderer || !renderer.getContext()) return null;
  const gl2 = renderer.capabilities.isWebGL2, N = cols.length;
  let soft = false;   // no real GPU (a software rasteriser): start in the low tier
  try { const g = renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '')); } catch (_) { soft = false; }
  const ST = { q: cfg.low || (soft && !pinHQ) ? 3 : 0, t0: performance.now(), last: 0, ema: 16, slowN: 0, frames: 0, hidden: false, off: false, lost: false, running: false,
    sel: null, focus: false, focusT: 0, settle: 0, yaw: 0, vy: 0, intro: reduce ? 1 : 0, calls: 0, dprCap: 2 };
  // quality steps: 0 hq, 1 hq at a lower DPR, 2 no bloom, 3 low (no shadows / mirror / point lights, fewer motes, 30 fps)
  const lowGeo = ST.q >= 3;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !lowGeo && !compact; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, clear ? 0 : 1);

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x06030c, compact ? .022 : .03);
  const camera = new THREE.PerspectiveCamera(compact ? 26 : 30, 1, .1, 120);
  const X = cols.map((_, i) => (i - (N - 1) / 2) * GAP);
  const temple = new THREE.Group(); scene.add(temple);

  // ---- light: the PMREM room, a moon with soft shadows, a violet rim, a pool of colour at every pillar ----
  const pmrem = new THREE.PMREMGenerator(renderer); const envRT = pmrem.fromScene(lightRoom(THREE), .035); scene.environment = envRT.texture; pmrem.dispose();
  const hemi = new THREE.HemisphereLight(0x3b2a63, 0x050208, .22); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xd6c8ff, 1.25); moon.position.set(-4.5, 9, 6.5); moon.target.position.set(0, 1.5, 0); scene.add(moon, moon.target);
  if (renderer.shadowMap.enabled) {
    moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024); const sc = moon.shadow.camera; sc.left = -3.4; sc.right = 3.4; sc.top = 5; sc.bottom = -1.5; sc.near = 4; sc.far = 20;
    moon.shadow.bias = -.0004; moon.shadow.normalBias = .02;
  }
  const rim = new THREE.DirectionalLight(0x9d59ee, 3.2); rim.position.set(3, 4.5, -6); scene.add(rim);
  const warm = new THREE.DirectionalLight(0xf1c14b, .3); warm.position.set(5, 2, 4); scene.add(warm);
  const pls = lowGeo ? [] : cols.map((c, i) => { const l = new THREE.PointLight(new THREE.Color(c.color), 0, 3.2, 1.6); l.position.set(X[i], TOPY + .2, COL_Z + 1.05); scene.add(l); return l; });

  // ---- materials: physical (hq) or Lambert (low: a cheap phone or a slow GPU; the same liquid light in the flutes) ----
  const marbleMap = marbleTexture(THREE, lowGeo ? 128 : 256);
  const U = { uT: { value: 0 }, uSelAny: { value: 0 } };
  const hookShaft = (cheap) => (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aGroove; attribute float aH; attribute float aFlute; attribute float iFill; attribute vec3 iCol; attribute float iDim; attribute float iSel;
varying float vGroove; varying float vH; varying float vFlute; varying float vFill; varying vec3 vCol; varying float vDim; varying float vSel;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGroove = aGroove; vH = aH; vFlute = aFlute; vFill = iFill; vCol = iCol; vDim = iDim; vSel = iSel;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uT; uniform float uSelAny; varying float vGroove; varying float vH; varying float vFlute; varying float vFill; varying vec3 vCol; varying float vDim; varying float vSel;
${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${cheap ? '' : `{ vec2 mu = vMapUv; float w = vnoise(mu * vec2(2.2, 1.1)) * 1.6 + vnoise(mu * 6.3) * .5;          // procedural veins on top of the marble map
  float vein = pow(1. - abs(sin((mu.x * 1.3 + mu.y * .55 + w) * 3.14159)), 26.), fine = pow(1. - abs(sin((mu.x * 3.7 - mu.y * .9 + w * 1.8) * 3.14159)), 48.);
  diffuseColor.rgb *= (1. - vein * .38 - fine * .16) * (.93 + .14 * vnoise(mu * vec2(40., 14.)));
  diffuseColor.rgb += vec3(.16, .11, .02) * pow(1. - abs(sin((mu.x * .8 - mu.y * .4 + w * 2.3 + 1.7) * 3.14159)), 90.); }`}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${cheap ? '' : `{ vec2 mu = vMapUv * vec2(60., 22.); float h0 = vnoise(mu), hx = vnoise(mu + vec2(.35, 0.)), hy = vnoise(mu + vec2(0., .35));   // chisel grain: a tiny normal tilt
  float arris = smoothstep(.25, 0., vGroove);                                                                  // the sharp ridges between flutes catch a highlight
  normal = normalize(normal + vec3(h0 - hx, h0 - hy, 0.) * (.22 - arris * .1)); }`}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float live = 1. - vDim; float below = 1. - smoothstep(vFill - .012, vFill + .004, vH);
  float g = pow(vGroove, 1.6);
  float seed = hash12(vec2(floor(vMapUv.x * 10. + .5), 3.7));
  float stream = fract(vH * (1.4 + seed) - uT * (.12 + seed * .1) + seed * 7.);                         // liquid light rising in each flute
  float pulse = pow(stream, 7.) * 2.4 + .35 * vnoise(vec2(vFlute * 1.7, vH * 9. - uT * .9));
  float breath = .85 + .15 * sin(uT * 1.6 + vFlute * .3);
  float lvl = exp(-pow((vH - vFill) * 70., 2.)) * step(.04, vFill) * (vFill > .985 ? .35 : 1.);
  vec3 hue = pow(vCol, vec3(1.25)) * 1.15;
  vec3 core = hue * (g * g * (.5 + pulse) * breath * 1.25 + .05) * below * live;                // the flutes fill with light
  core += mix(vCol, vec3(1., .96, .88), .3) * lvl * 2.4 * live;                             // the bright line at the level
  core += vCol * exp(-vH * 9.) * (.55 + .45 * sin(uT * 1.1)) * vDim * .55 * (.4 + .6 * g);  // OFF: a faint ember at the foot
  float sel = mix(1., mix(.72, 1.4, vSel), uSelAny);
  totalEmissiveRadiance += core * sel; }`);
  };
  function buildMats(cheap) {
    const GOLD = new THREE.Color('#f1c14b'), M = {};
    if (cheap) {
      M.marble = new THREE.MeshLambertMaterial({ map: marbleMap, color: 0xa29bb4, vertexColors: true });
      M.gold = new THREE.MeshLambertMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: .12, vertexColors: true });
      M.shaft = new THREE.MeshLambertMaterial({ map: marbleMap, color: 0xb2abc4, vertexColors: true });
    } else {
      M.marble = new THREE.MeshPhysicalMaterial({ map: marbleMap, color: 0x8c859e, roughness: .42, metalness: 0, clearcoat: .35, clearcoatRoughness: .32, envMapIntensity: .32, vertexColors: true });
      M.gold = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: .26, clearcoat: .5, clearcoatRoughness: .2, envMapIntensity: 1.1, emissive: GOLD, emissiveIntensity: .015, vertexColors: true });
      M.shaft = new THREE.MeshPhysicalMaterial({ map: marbleMap, color: 0x9a93ad, roughness: .36, metalness: 0, clearcoat: .45, clearcoatRoughness: .25, envMapIntensity: .36, vertexColors: true });
    }
    M.shaft.onBeforeCompile = hookShaft(cheap); M.shaft.customProgramCacheKey = () => 'olympus-shaft-' + (cheap ? 'l' : 'p');
    return M;
  }
  let MAT = buildMats(lowGeo);
  const marble = MAT.marble, gold = MAT.gold, shaftMat = MAT.shaft;

  // ---- the columns: shafts, capitals, bases (instanced: 1 draw call each) ----
  const shaftGeo = shaftGeometry(THREE, lowGeo);
  const iFill = new Float32Array(N), iCol = new Float32Array(N * 3), iDim = new Float32Array(N), iSel = new Float32Array(N);
  cols.forEach((c, i) => { const k = new THREE.Color(c.color); iCol.set([k.r, k.g, k.b], i * 3); iFill[i] = c.fill; iDim[i] = c.dim ? 1 : 0; });
  const attr = (a, n) => { const b = new THREE.InstancedBufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
  shaftGeo.setAttribute('iFill', attr(iFill, 1)); shaftGeo.setAttribute('iCol', attr(iCol, 3)); shaftGeo.setAttribute('iDim', attr(iDim, 1)); shaftGeo.setAttribute('iSel', attr(iSel, 1));
  const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, N), caps = new THREE.InstancedMesh(capitalGeometry(THREE, lowGeo), gold, N), bases = new THREE.InstancedMesh(baseGeometry(THREE, lowGeo), marble, N);
  const m4 = new THREE.Matrix4();
  cols.forEach((c, i) => { m4.makeTranslation(X[i], SY, COL_Z); shafts.setMatrixAt(i, m4); m4.makeTranslation(X[i], SY + HS - .012, COL_Z); caps.setMatrixAt(i, m4); m4.makeTranslation(X[i], TOPY, COL_Z); bases.setMatrixAt(i, m4); });
  for (const m of [shafts, caps, bases]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); temple.add(m); }

  // ---- the building: crepidoma, back wall with the glowing door, entablature with triglyphs, pediment (one merged mesh) + gold trims ----
  const W = (N - 1) * GAP + .9, parts = [], trims = [];
  for (let k = 0; k < NSTEP; k++) { const o = (NSTEP - 1 - k) * .2; parts.push(box(THREE, W + .5 + o * 2, STEP, 2.3 + o * 2, 0, STEP * (k + .5), -.45, (x, y) => (y < STEP * (k + .5) ? .72 : 1))); }
  const backZ = -1.25;
  parts.push(box(THREE, W - .1, HS + BASE_H + CAP_H, .16, 0, TOPY + (HS + BASE_H + CAP_H) / 2, backZ, (x, y) => .28 + .22 * Math.min(1, (y - TOPY) / 2.2)));
  const eY = TOP;
  parts.push(box(THREE, W + .14, .24, 2.15, 0, eY + .12, -.5, (x, y) => (y < eY + .05 ? .6 : 1)));                     // architrave
  parts.push(box(THREE, W + .1, .025, 2.15, 0, eY + .255, -.5));                                                       // taenia
  parts.push(box(THREE, W + .06, .24, 2.05, 0, eY + .39, -.52));                                                       // frieze
  const tri = 2 * N - 1; for (let k = 0; k < tri; k++) parts.push(box(THREE, .13, .24, .04, (k - (tri - 1) / 2) * GAP / 2, eY + .39, .51 - .02, (x, y, z) => .9));   // triglyphs
  parts.push(box(THREE, W + .42, .1, 2.45, 0, eY + .56, -.45, (x, y) => (y < eY + .54 ? .65 : 1)));                    // cornice
  const pedW = W + .38, pedH = .62, shp = new THREE.Shape(); shp.moveTo(-pedW / 2, 0); shp.lineTo(pedW / 2, 0); shp.lineTo(0, pedH); shp.closePath();
  const ped = new THREE.ExtrudeGeometry(shp, { depth: 2.2, bevelEnabled: false }); ped.translate(0, eY + .61, -1.62);
  ped.deleteAttribute('uv'); { const p = ped.attributes.position, u = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { u[i * 2] = p.getX(i) * .4; u[i * 2 + 1] = (p.getY(i) + p.getZ(i)) * .4; } ped.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  parts.push(ao(THREE, ped, () => .82));
  const slope = Math.atan2(pedH, pedW / 2), rl = Math.hypot(pedW / 2, pedH) + .12;
  for (const s of [-1, 1]) {                                                                                       // raking cornices
    const g = new THREE.BoxGeometry(rl, .09, .2); g.rotateZ(-s * slope); g.translate(s * pedW / 4, eY + .61 + pedH / 2 + .03, .62); parts.push(g);
    const t = new THREE.BoxGeometry(rl, .016, .03); t.rotateZ(-s * slope); t.translate(s * pedW / 4, eY + .61 + pedH / 2 + .082, .73); trims.push(t);
  }
  trims.push(box(THREE, W + .44, .014, .02, 0, eY + .612, .78));                    // a gold hairline along the cornice
  trims.push(box(THREE, W + .56, .012, .02, 0, TOPY - .006, 1.16 - .45 + .02));      // ... and along the top step
  { const t = new THREE.TorusGeometry(.13, .016, 8, 40); t.translate(0, eY + .61 + pedH * .38, .5); trims.push(t);   // the emblem in the tympanum
    const s = new THREE.CircleGeometry(.07, 24); s.translate(0, eY + .61 + pedH * .38, .51); trims.push(s);
    for (const [x, y, k] of [[0, eY + .61 + pedH + .06, 1], [-pedW / 2 + .04, eY + .66, .75], [pedW / 2 - .04, eY + .66, .75]]) { const a = new THREE.OctahedronGeometry(.07 * k, 0); a.scale(.7, 1.5, .7); a.translate(x, y + .06, .55); trims.push(a); } }
  const building = new THREE.Mesh(merge(THREE, parts), marble); building.castShadow = building.receiveShadow = true; temple.add(building);
  const trim = new THREE.Mesh(merge(THREE, trims), gold); temple.add(trim);
  // the door of the cella: warm light far inside
  const doorMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: U.uT },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `precision highp float; uniform float uT; varying vec2 vU; void main(){ vec2 d = abs(vU - .5) * 2.; float a = smoothstep(1., .2, d.x) * smoothstep(1., .5, d.y);
      vec3 c = mix(vec3(.4, .2, .8), vec3(1., .7, .3), pow(1. - vU.y, 2.) * .7) * a * a * (.9 + .1 * sin(uT * .7)) * .16; gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }` });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(.95, 1.9), doorMat); door.position.set(0, TOPY + .95, backZ + .085); temple.add(door);

  // ---- the floor: glossy obsidian; the temple mirrored under it (a fake reflection, no second pass) ----
  const floorMat = new THREE.ShaderMaterial({ vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, transparent: true, depthWrite: true, uniforms: {
    uC: { value: cols.map((c) => new THREE.Color(c.color)) }, uP: { value: X.map((x) => new THREE.Vector2(x, 1.15)) }, uF: { value: cols.map((c) => (c.dim ? .2 : Math.max(.2, c.fill))) },
    uT: U.uT, uMirror: { value: lowGeo ? 0 : 1 } } });
  while (floorMat.uniforms.uC.value.length < 4) { floorMat.uniforms.uC.value.push(new THREE.Color(0)); floorMat.uniforms.uP.value.push(new THREE.Vector2(99, 99)); floorMat.uniforms.uF.value.push(0); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), floorMat); floor.renderOrder = 2; scene.add(floor);
  const mirror = new THREE.Group(); mirror.scale.y = -1; mirror.position.y = -.002;
  for (const m of [building, shafts, caps, bases, trim, door]) { const c = m.isInstancedMesh ? new THREE.InstancedMesh(m.geometry, m.material, m.count) : new THREE.Mesh(m.geometry, m.material);
    if (m.isInstancedMesh) { c.instanceMatrix = m.instanceMatrix; c.computeBoundingSphere(); } else c.position.copy(m.position); c.renderOrder = 1; mirror.add(c); }
  if (!lowGeo) scene.add(mirror);

  // ---- sky (stars, moon, nebula), god rays, mist ----
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, uniforms: { uT: U.uT, uA: { value: 1 } } });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; if (!clear) scene.add(sky);
  const NR = compact ? 4 : 6, rayG = new THREE.PlaneGeometry(1, 1); rayG.translate(0, -.5, 0);
  const rA = new Float32Array(NR), rS = new Float32Array(NR); rayG.setAttribute('aA', new THREE.InstancedBufferAttribute(rA, 1)); rayG.setAttribute('aS', new THREE.InstancedBufferAttribute(rS, 1));
  const rayMat = new THREE.ShaderMaterial({ premultipliedAlpha: true, vertexShader: RAY_VS, fragmentShader: RAY_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: U.uT, uC: { value: new THREE.Color(.62, .52, 1) } } });
  const rays = new THREE.InstancedMesh(rayG, rayMat, NR), ob = new THREE.Object3D();
  for (let i = 0; i < NR; i++) { const f = i / (NR - 1); ob.position.set(-3.2 + f * 4.2 + Math.sin(i * 7.1) * .3, 7.2, -.2 + Math.cos(i * 3.3) * .7); ob.rotation.set(0, 0, -.42 + f * .1); ob.scale.set(.45 + (i % 3) * .3, 8.5, 1);
    ob.updateMatrix(); rays.setMatrixAt(i, ob.matrix); rA[i] = (.07 + (i % 2) * .05) * (compact ? .8 : 1); rS[i] = i * .37; }
  rays.frustumCulled = false; rays.renderOrder = 5; scene.add(rays);
  const NF = lowGeo ? 7 : compact ? 10 : 18, fogG = new THREE.PlaneGeometry(1, 1), aF = new Float32Array(NF * 4);
  fogG.setAttribute('aF', new THREE.InstancedBufferAttribute(aF, 4));
  const fogMat = new THREE.ShaderMaterial({ premultipliedAlpha: true, vertexShader: FOG_VS, fragmentShader: FOG_FS, transparent: true, depthWrite: false, uniforms: { uT: U.uT, uTex: { value: cloudTexture(THREE) }, uC: { value: new THREE.Color(.42, .3, .66) } } });
  const fog = new THREE.InstancedMesh(fogG, fogMat, NF);
  for (let i = 0; i < NF; i++) { const hi = i % 4 === 3; ob.position.set(-8 + (i * 7.3) % 16, hi ? 3.4 + (i % 3) * .5 : .1 + (i % 3) * .12, hi ? -4 - (i % 2) * 2 : -1.5 + ((i * 2.7) % 5.5)); ob.rotation.set(0, 0, 0);
    const s = hi ? 4.5 + (i % 3) : 2.4 + (i % 4) * .7; ob.scale.set(s, s, s); ob.updateMatrix(); fog.setMatrixAt(i, ob.matrix); aF.set([.05 + (i % 5) * .02, hi ? .5 : .3, hi ? .16 : .3, (i * .618) % 1], i * 4); }
  fog.frustumCulled = false; fog.renderOrder = 6; scene.add(fog);

  // ---- motes: a halo at every level + a stream rising off each live capital + sparks up the flutes ----
  const per = lowGeo ? 10 : compact ? 22 : 60, NM = reduce ? 0 : per * N, NP = N + NM;
  const pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3), ps = new Float32Array(NP), pa = new Float32Array(NP), motes = [];
  for (let j = 0; j < NM; j++) { const i = j % N, k = new THREE.Color(cols[i].color).multiplyScalar(2.2); pc.set([k.r, k.g, k.b], (N + j) * 3);
    motes.push({ i, up: Math.random() < .55, a: Math.random() * 6.283, r: Math.random(), y: Math.random(), v: .18 + Math.random() * .35, s: .06 + Math.random() * .08 }); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aC', new THREE.BufferAttribute(pc, 3)); pg.setAttribute('aS', new THREE.BufferAttribute(ps, 1)); pg.setAttribute('aA', new THREE.BufferAttribute(pa, 1));
  const pMat = new THREE.ShaderMaterial({ premultipliedAlpha: true, vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 300 } } });
  const points = new THREE.Points(pg, pMat); points.frustumCulled = false; points.renderOrder = 7; scene.add(points);

  // ---- volumetric light: a soft shaft of the pillar's own colour around every column (brighter when LIVE / selected) + dust drifting in it ----
  const SH_H = TOP - TOPY + .1, shG = new THREE.CylinderGeometry(.34, .66, 1, lowGeo ? 16 : 40, 1, true);
  const shC = new Float32Array(N * 3), shK = new Float32Array(N), shKt = new Float32Array(N);
  shG.setAttribute('aC', new THREE.InstancedBufferAttribute(shC, 3)); shG.setAttribute('aK', attr(shK, 1));
  const shMat = new THREE.ShaderMaterial({ premultipliedAlpha: true, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, uniforms: { uT: U.uT } });
  const beams = new THREE.InstancedMesh(shG, shMat, N);
  cols.forEach((c, i) => { const k = new THREE.Color(c.color).lerp(new THREE.Color(.85, .8, 1), .25); shC.set([k.r, k.g, k.b], i * 3);
    m4.makeScale(1, SH_H, 1).setPosition(X[i], TOPY + SH_H / 2, COL_Z); beams.setMatrixAt(i, m4); });
  beams.frustumCulled = false; beams.renderOrder = 4; scene.add(beams);
  const ND = reduce ? 0 : lowGeo ? 0 : (compact ? 24 : 72) * N, dG = new THREE.BufferGeometry(), aD = new Float32Array(ND * 4);
  for (let j = 0; j < ND; j++) aD.set([Math.random(), Math.random(), Math.random(), j % N], j * 4);
  dG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3)); dG.setAttribute('aD', new THREE.BufferAttribute(aD, 4));
  const dustMat = new THREE.ShaderMaterial({ premultipliedAlpha: true, vertexShader: DUST_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: U.uT, uPx: { value: 300 }, uC: { value: cols.map((c) => new THREE.Color(c.color).multiplyScalar(1.6)) }, uK: { value: Array.from({ length: 4 }, () => 0) },
      uX: { value: X.map((x) => new THREE.Vector2(x, COL_Z + .05)) }, uY0: { value: TOPY + .05 }, uH: { value: SH_H } } });
  while (dustMat.uniforms.uC.value.length < 4) { dustMat.uniforms.uC.value.push(new THREE.Color(0)); dustMat.uniforms.uX.value.push(new THREE.Vector2(99, 99)); }
  const dust = new THREE.Points(dG, dustMat); dust.frustumCulled = false; dust.renderOrder = 8; if (ND) scene.add(dust);

  // ---- post: HDR target + bloom chain ----
  const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), null);
  quad.frustumCulled = false; const qScene = new THREE.Scene(); qScene.add(quad); const qCam = new THREE.Camera();
  const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const brightM = mk(BRIGHT_FS, { tIn: { value: null }, uThr: { value: .9 }, uKnee: { value: .7 }, uTx: { value: new THREE.Vector2() } });
  const downM = mk(DOWN_FS, { tIn: { value: null }, uTx: { value: new THREE.Vector2() } });
  const blurM = mk(BLUR_FS, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
  const compM = mk(COMP_FS, { tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uBloom: { value: compact ? .55 : .62 }, uExp: { value: 1 },
    uT: { value: 0 }, uAlpha: { value: clear ? 1 : 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: compact ? .35 : .6 },
    tDof: { value: null }, tDepth: { value: null }, uDof: { value: 0 }, uFocus: { value: 9 }, uRange: { value: 1.1 }, uNear: { value: .1 }, uFar: { value: 120 } });
  let rtScene = null, L = [], T = [], DF = [];
  const dofOK = !compact && gl2 && !lowGeo;     // depth of field: the Pillars page in hq on WebGL2 (a depth texture of the scene pass)
  const dofM = mk(BLUR_FS, { tIn: { value: null }, uDir: { value: new THREE.Vector2() } });
  const DOF = { k: 0, focus: 9 };
  const rtOpt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  function buildTargets(w, h) {
    for (const r of [rtScene, ...L, ...T, ...DF]) r && r.dispose();
    rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: gl2 ? 4 : 0, depthBuffer: true });
    if (dofOK) { rtScene.depthTexture = new THREE.DepthTexture(w, h); rtScene.depthTexture.type = THREE.UnsignedIntType;
      const hw = Math.max(2, Math.round(w / 2)), hh = Math.max(2, Math.round(h / 2)); DF = [new THREE.WebGLRenderTarget(hw, hh, rtOpt), new THREE.WebGLRenderTarget(hw, hh, rtOpt)]; }
    L = []; T = []; let bw = w, bh = h;
    for (let i = 0; i < 4; i++) { bw = Math.max(2, Math.round(bw / 2)); bh = Math.max(2, Math.round(bh / 2)); L.push(new THREE.WebGLRenderTarget(bw, bh, rtOpt)); T.push(new THREE.WebGLRenderTarget(bw, bh, rtOpt)); }
  }
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  function bloomRender() {
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera); ST.calls = renderer.info.render.calls;
    brightM.uniforms.tIn.value = rtScene.texture; brightM.uniforms.uTx.value.set(1 / rtScene.width, 1 / rtScene.height); pass(brightM, L[0]);
    for (let i = 0; i < L.length; i++) {
      if (i) { downM.uniforms.tIn.value = L[i - 1].texture; downM.uniforms.uTx.value.set(.5 / L[i - 1].width, .5 / L[i - 1].height); pass(downM, L[i]); }
      blurM.uniforms.tIn.value = L[i].texture; blurM.uniforms.uDir.value.set(1 / L[i].width, 0); pass(blurM, T[i]);
      blurM.uniforms.tIn.value = T[i].texture; blurM.uniforms.uDir.value.set(0, 1 / L[i].height); pass(blurM, L[i]);
    }
    const dofOn = dofOK && DF.length && ST.q < 2 && DOF.k > .01;
    compM.uniforms.uDof.value = dofOn ? DOF.k : 0;
    if (dofOn) {                                                     // the scene at half size, blurred twice (a wide soft bokeh) for the out-of-focus parts
      downM.uniforms.tIn.value = rtScene.texture; downM.uniforms.uTx.value.set(.5 / rtScene.width, .5 / rtScene.height); pass(downM, DF[0]);
      for (const sc of [1.6, 3.2]) {
        dofM.uniforms.tIn.value = DF[0].texture; dofM.uniforms.uDir.value.set(sc / DF[0].width, 0); pass(dofM, DF[1]);
        dofM.uniforms.tIn.value = DF[1].texture; dofM.uniforms.uDir.value.set(0, sc / DF[0].height); pass(dofM, DF[0]);
      }
      compM.uniforms.tDof.value = DF[0].texture; compM.uniforms.tDepth.value = rtScene.depthTexture;
      compM.uniforms.uFocus.value = DOF.focus; compM.uniforms.uNear.value = camera.near; compM.uniforms.uFar.value = camera.far;
    }
    compM.uniforms.tScene.value = rtScene.texture; ['tB0', 'tB1', 'tB2', 'tB3'].forEach((k, i) => { compM.uniforms[k].value = L[i].texture; });
    pass(compM, null);
  }

  // ---- camera rig: framing, a 2.5 s intro (dolly in and rise), idle sway, drag with inertia, a smooth move to a tapped column ----
  const CAM = { dist: 9, ty: 2.05, tx: 0, fx: 0, fd: 1, fy: 0, curX: 0, curD: 1, curY: 0 };
  const tmp = new THREE.Vector3();
  function frameFit() {
    const tn = Math.tan(camera.fov * Math.PI / 360), a = camera.aspect, needW = W + (compact ? .9 : 1.3), needH = TOP + .62 + pedH + (compact ? .15 : 1.25);
    const inset = Math.max(0, Math.min(.5, +cfg.inset || 0));          // the share of the canvas bottom that the page covers (the hero's chips)
    CAM.dist = Math.max((needW / 2) / (tn * a), (needH / 2) / (tn * (1 - inset))) * (compact ? 1.02 : 1.04);
    CAM.ty = (compact ? needH / 2 - .02 : needH / 2 - .62) - inset * tn * CAM.dist * .9;
    CAM.dist *= Math.max(.6, +cfg.pad || 1);                            // a little air around it (the Home header)
  }
  function size() {
    const w = canvas.clientWidth || 390, h = canvas.clientHeight || 300;
    const dpr = Math.min(ST.q >= 3 ? 1 : ST.q >= 1 ? 1.25 : ST.dprCap, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); frameFit();
    pMat.uniforms.uPx.value = h * dpr * .9; dustMat.uniforms.uPx.value = h * dpr * .9; compM.uniforms.uRes.value.set(w * dpr, h * dpr);
    if (ST.q < 2) buildTargets(Math.round(w * dpr), Math.round(h * dpr));
    wake();
  }
  ST.dprCap = compact ? 1.5 : 2;
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3), easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function place(tS, dt) {
    const k = 1 - Math.exp(-dt / 1000 * 3.2);
    const i = ST.sel ? cols.findIndex((c) => c.id === ST.sel) : -1;
    CAM.fx = ST.focus && i >= 0 ? X[i] * .92 : i >= 0 && !compact ? X[i] * .12 : 0;
    CAM.fd = ST.focus && i >= 0 ? .7 : 1; CAM.fy = ST.focus && i >= 0 ? -.35 : 0;
    CAM.curX += (CAM.fx - CAM.curX) * k; CAM.curD += (CAM.fd - CAM.curD) * k; CAM.curY += (CAM.fy - CAM.curY) * k;
    const it = reduce ? 1 : easeIO(Math.min(1, ST.intro)), sway = reduce ? 0 : Math.sin(tS * .21) * .1 * it + Math.sin(tS * .13) * .03 * it;
    // a tap: the camera glides to the column, then settles with a small orbit and a slow push-in (ease-out)
    const st = ST.focus && i >= 0 && !reduce ? Math.exp(-(performance.now() - ST.focusT) / 1000 * 1.5) : 0; ST.settle = st;
    const yaw = ST.yaw + sway + (1 - it) * .55 + (ST.focus && i >= 0 ? -X[i] * .07 + (X[i] >= 0 ? 1 : -1) * .16 * st : 0);
    const d = CAM.dist * CAM.curD * (1 + (1 - ease(ST.intro)) * .95) * (1 + .1 * st);
    const camY = (compact ? CAM.ty - .55 : 1.05) + (1 - it) * -.8 + (reduce ? 0 : Math.sin(tS * .17) * .04 * it);
    const ty = CAM.ty + CAM.curY + (1 - it) * -.55;
    camera.position.set(CAM.curX + Math.sin(yaw) * d, Math.max(.18, camY + CAM.curY * .6), Math.cos(yaw) * d + COL_Z);
    camera.lookAt(CAM.curX, ty, COL_Z);
    compM.uniforms.uExp.value = (reduce ? 1 : .1 + .9 * ease(ST.intro * 1.6)) * EXPO;
    renderer.toneMappingExposure = compM.uniforms.uExp.value;
  }
  function project(i, where) {
    if (where === 'label') tmp.set(X[i], 0, COL_Z + 2.15); else if (where === 'base') tmp.set(X[i], SY, COL_Z); else tmp.set(X[i], SY + HS + CAP_H, COL_Z);
    tmp.project(camera);
    return { x: (tmp.x * .5 + .5) * canvas.clientWidth, y: (-tmp.y * .5 + .5) * canvas.clientHeight, z: tmp.z };
  }

  // input: a horizontal drag orbits (inertia), a vertical drag scrolls the page (touch-action: pan-y), a tap picks a column
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null, moved = 0;
  const onDown = (e) => { down = [e.clientX, e.clientY, performance.now()]; moved = 0; ST.vy = 0; wake(); };
  const onMove = (e) => { if (!down) return; const dx = e.clientX - down[0]; moved += Math.abs(dx) + Math.abs(e.clientY - down[1]) * .3; down[0] = e.clientX; down[1] = e.clientY;
    const v = dx * .0042; ST.vy = ST.vy * .5 + v * .5; ST.yaw = Math.max(-.9, Math.min(.9, ST.yaw + v)); wake(); };
  const pickAt = (cx, cy) => {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    for (const m of [shafts, caps, bases]) { const h = ray.intersectObject(m, false)[0]; if (h && h.instanceId != null) return h.instanceId; }
    let best = -1, bd = 1e9;   // near miss: the closest column on screen
    for (let i = 0; i < N; i++) { const top = project(i), bot = project(i, 'base'), x = (top.x + bot.x) / 2, px = cx - r.left, py = cy - r.top;
      const dd = Math.abs(px - x) + (py < top.y - 30 || py > bot.y + 30 ? 200 : 0); if (dd < bd) { bd = dd; best = i; } }
    return bd < 44 ? best : -1;
  };
  const onUp = (e) => {
    if (down && moved < 10 && performance.now() - down[2] < 600) {
      const i = pickAt(e.clientX, e.clientY);
      if (i < 0) { ST.focus = false; wake(); }
      else { const id = cols[i].id; const again = ST.sel === id && ST.focus; api.select(id, !again); cfg.onPick && cfg.onPick(id); }
    }
    down = null;
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ST.lost = true; cfg.onLost && cfg.onLost(); });
  const onVis = () => { ST.hidden = document.hidden; if (!ST.hidden) wake(); };
  document.addEventListener('visibilitychange', onVis); addEventListener('resize', size);
  let io = null;
  if ('IntersectionObserver' in window) { io = new IntersectionObserver((es) => { ST.off = !es.some((x) => x.isIntersecting); if (!ST.off) wake(); }); io.observe(canvas); }

  function degrade() {
    if (pinHQ || ST.q >= 3) return;
    ST.q = ST.ema > 70 ? 3 : ST.q + 1;   // a terrible frame time goes straight to low (each step recompiles: fewer steps, fewer stalls) ST.slowN = 0; ST.ema = 16;   // a very slow frame skips the DPR step
    if (ST.q >= 3) { renderer.shadowMap.enabled = false; scene.remove(mirror); floorMat.uniforms.uMirror.value = 0; pls.forEach((l) => { l.intensity = 0; }); hemi.intensity = .6;
      if (!lowGeo) { const old = MAT; MAT = buildMats(true); building.material = bases.material = MAT.marble; caps.material = trim.material = MAT.gold; shafts.material = MAT.shaft;
        for (const k of ['marble', 'gold', 'shaft']) old[k].dispose(); }
      const keep = Math.min(NM, 10 * N); pg.setDrawRange(0, N + keep); scene.remove(dust); }
    size();
  }
  function frame(now) {
    ST.running = false; if (ST.hidden || ST.lost || ST.off) return;
    const raw = now - (ST.last || now), dt = Math.min(64, raw); ST.last = now; ST.ema = ST.ema * .85 + Math.min(1000, raw) * .15;   // the real frame time decides the quality
    // step down on slow frames: fast when they are terrible (a weak GPU), patient when they are only a little slow
    if (ST.frames === 3) ST.ema = Math.min(ST.ema, 40);                 // the first frames carry the shader upload
    const bad = ST.ema > 70 ? 2 : ST.ema > 40 ? 16 : 45;
    if (ST.frames > 3 && ST.ema > (ST.q >= 2 ? 40 : 24)) { if (++ST.slowN > bad) degrade(); } else ST.slowN = Math.max(0, ST.slowN - 1);
    const tS = (now - ST.t0) / 1000;
    if (!reduce) ST.intro = Math.min(1, (now - ST.t0) / 2500);   // wall clock: the intro ends on time even on a slow phone
    if (!down) { ST.vy *= Math.pow(.93, dt / 16); ST.yaw = Math.max(-.9, Math.min(.9, ST.yaw + ST.vy)); if (Math.abs(ST.vy) < .0004) ST.yaw *= Math.pow(.992, dt / 16); }
    place(tS, dt);
    U.uT.value = reduce ? 4 : tS; compM.uniforms.uT.value = reduce ? 0 : tS;
    // motes
    const anySel = !!ST.sel;
    for (let i = 0; i < N; i++) {
      const c = cols[i], s = ST.sel === c.id, lvl = c.dim ? .04 : c.fill;
      pp.set([X[i], SY + HS * Math.min(1, lvl), COL_Z + (c.fill > .98 && !c.dim ? 0 : R0 * .9)], i * 3);
      ps[i] = (c.dim ? .5 : c.fill > .98 ? 1.3 : 1.05) * (1 + (reduce ? 0 : .08 * Math.sin(tS * 2 + i))); pa[i] = (c.dim ? .35 : .55) * (anySel && !s ? .55 : 1);
      if (c.fill > .98 && !c.dim) pp[i * 3 + 1] = SY + HS + CAP_H + .12;
    }
    for (let j = 0; j < NM; j++) {
      const m = motes[j], c = cols[m.i], top = SY + HS + CAP_H, o = (N + j) * 3, sl = anySel && ST.sel !== c.id ? .5 : 1;
      if (c.dim) { m.y += m.v * .25 * dt / 1000; if (m.y > 1) { m.y = 0; m.a = Math.random() * 6.283; }
        pp.set([X[m.i] + Math.cos(m.a) * (R0 + .06), SY + m.y * .5, COL_Z + Math.sin(m.a) * (R0 + .06)], o); ps[N + j] = m.s * .8; pa[N + j] = .5 * Math.sin(m.y * Math.PI) * sl; continue; }
      if (m.up) {                                                     // the stream off the capital
        m.y += m.v * .45 * dt / 1000; if (m.y > 1) { m.y = 0; m.a = Math.random() * 6.283; m.r = Math.random(); }
        const rr = .05 + m.r * .2 * (.4 + m.y), a = m.a + m.y * 3;
        pp.set([X[m.i] + Math.cos(a) * rr, top - .25 + m.y * 1.7, COL_Z + .42 + m.y * .55 + Math.sin(a) * rr * .5], o); ps[N + j] = m.s * (1.2 - m.y * .6); pa[N + j] = Math.sin(Math.min(1, m.y * 1.4) * Math.PI) * .95 * sl * (c.fill > .5 ? 1 : .35);
      } else {                                                        // sparks rising in the flutes, up to the level
        m.y += m.v * dt / 1000 / Math.max(.3, c.fill); if (m.y > 1) { m.y = 0; m.a = Math.floor(Math.random() * FLUTES) / FLUTES * 6.283 + Math.PI / FLUTES; }
        const yy = m.y * c.fill, r = R0 + (R1 - R0) * yy + .012;
        pp.set([X[m.i] + Math.cos(m.a) * r, SY + yy * HS, COL_Z + Math.sin(m.a) * r], o); ps[N + j] = m.s * .55; pa[N + j] = (1 - m.y) * .9 * sl;
      }
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.aS.needsUpdate = true; pg.attributes.aA.needsUpdate = true;
    // light shafts + dust: LIVE columns glow, the selected one most; eased so a tap fades them, never pops
    const kk = 1 - Math.exp(-dt / 1000 * 4);
    for (let i = 0; i < N; i++) {
      const c = cols[i], s = ST.sel === cols[i].id;
      shKt[i] = (c.dim ? .045 : .1 + .14 * c.fill) * (s && ST.focus ? 1.7 : s ? 1.2 : anySel ? .6 : 1) * (ST.q >= 3 ? .7 : 1) * (reduce ? 1 : .92 + .08 * Math.sin(tS * .9 + i * 1.7));
      shK[i] += (shKt[i] - shK[i]) * (ST.frames ? kk : 1); dustMat.uniforms.uK.value[i] = Math.min(1, shK[i] * 3.2);
    }
    shG.attributes.aK.needsUpdate = true;
    // depth of field: on while the camera sits on a tapped column (hq only); the focus = that column's distance from the camera
    { const i = ST.focus && ST.sel ? cols.findIndex((c) => c.id === ST.sel) : -1;
      DOF.k += ((i >= 0 && dofOK && ST.q < 2 ? .85 : 0) - DOF.k) * kk;
      if (i >= 0) { tmp.set(X[i], SY + HS * .55, COL_Z).applyMatrix4(camera.matrixWorldInverse); DOF.focus = -tmp.z; } }
    for (let i = 0; i < (ST.q >= 3 ? 0 : pls.length); i++) { const c = cols[i]; pls[i].intensity = (c.dim ? .35 : 1.6 + 2.2 * c.fill) * (reduce ? 1 : .9 + .1 * Math.sin(tS * 1.4 + i)) * (anySel && ST.sel !== c.id ? .6 : 1); pls[i].position.y = TOPY + .2 + .25 * (c.dim ? 0 : c.fill); }
    if (ST.q < 2) bloomRender(); else { renderer.setRenderTarget(null); renderer.render(scene, camera); ST.calls = renderer.info.render.calls; }
    ST.frames++;
    if (cfg.onFrame) cfg.onFrame((id, where) => { const i = cols.findIndex((c) => c.id === id); return i < 0 ? null : project(i, where); });
    const moving = down || (ST.settle || 0) > .004 || DOF.k > .01 && Math.abs(DOF.k - .85) > .01 || Math.abs(ST.vy) > .0004 || Math.abs(CAM.fx - CAM.curX) > .002 || Math.abs(CAM.fd - CAM.curD) > .001;
    if (!reduce || moving) schedule();
  }
  function schedule() { if (ST.running) return; ST.running = true; if (ST.q >= 3) setTimeout(() => requestAnimationFrame(frame), 28); else requestAnimationFrame(frame); }
  function wake() { schedule(); }
  const api = {
    select(id, focus) {
      const was = ST.focus && ST.sel; ST.sel = id || null; ST.focus = !!(id && focus);
      if (ST.focus && was !== ST.sel) ST.focusT = performance.now();
      const k = cols.findIndex((c) => c.id === ST.sel); for (let i = 0; i < N; i++) iSel[i] = i === k ? 1 : 0;
      U.uSelAny.value = ST.sel ? 1 : 0; shaftGeo.attributes.iSel.needsUpdate = true; wake();
    },
    setFill(map) {
      cols.forEach((c, i) => { if (map && map[c.id] != null) { c.fill = Math.max(.02, Math.min(1, +map[c.id])); iFill[i] = c.fill; floorMat.uniforms.uF.value[i] = c.dim ? .2 : Math.max(.2, c.fill); } });
      shaftGeo.attributes.iFill.needsUpdate = true; wake();
    },
    project(id, where) { const i = cols.findIndex((c) => c.id === id); return i < 0 ? null : project(i, where); },
    stats() { return { soft, frames: ST.frames, low: ST.q >= 3, quality: ['hq', 'hq-dpr', 'nobloom', 'low'][ST.q], bloom: ST.q < 2, calls: ST.calls, cols: N, motes: NM, mirror: ST.q < 3 && !lowGeo,
      shadows: renderer.shadowMap.enabled, intro: Math.round(ST.intro * 100) / 100, focus: ST.focus, ema: Math.round(ST.ema * 10) / 10, three: THREE.REVISION, dpr: renderer.getPixelRatio(), dof: Math.round(DOF.k * 100) / 100, dust: ND, shafts: N }; },
    dispose() { document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', size); io && io.disconnect(); for (const r of [rtScene, ...L, ...T, ...DF]) r && r.dispose(); envRT.dispose(); renderer.dispose(); },
  };
  if (ST.q >= 3) { renderer.shadowMap.enabled = false; hemi.intensity = .6; }
  size();
  renderer.shadowMap.needsUpdate = true;
  // compile the shaders off the main thread where the browser can (KHR_parallel_shader_compile): no frozen page while they build
  try { if (renderer.compileAsync) { place(0, 16); renderer.setRenderTarget(ST.q < 2 ? rtScene : null); await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]); renderer.setRenderTarget(null); } } catch (_) { /* compiled on the first frame instead */ }
  ST.t0 = performance.now(); ST.last = 0;
  schedule();
  return api;
}
