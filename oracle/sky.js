// ORACLE sky: the starfield and the dome, the aurora (the market's weather: VIX sets its colour, the ATR regime its strength,
// trend vs range its flow), the session clock ring under the column (Asia / London / NY, killzones lit, a radar sweep at the
// New York time, the LIT entry window as a gold rim) and the stage constellation above it (the Brain's ten stages).
import { STAGES } from './data.js';
import { SESSIONS, etParts, LIT_WINDOW } from './time.js';
import { glowTexture, glowSprite, labelSprite, setLabel, hex } from './glow.js';
import { Y_MAX } from './layers.js';

const CLOCK_Y = -Y_MAX - 2, CLOCK_R = [7.4, 8.3];
const STAR = { done: 0xebd092, now: 0xebc262, todo: 0x66593a, skip: 0x6a453a };

/** The weather's colours: calm teal at a low VIX, violet in between, magenta / red when fear is high. */
export function weatherOf(w) {
  const vix = w && w.vix && w.vix.vix, reg = (w && w.regime) || {};
  const pal = vix == null ? [0xc8a24a, 0xe0b060] : vix < 15 ? [0x9aaa62, 0xc8a24a] : vix < 21 ? [0xc8a24a, 0xe0b060]
    : vix < 28 ? [0xe0a060, 0xc0603f] : [0xc0603f, 0x8a3a2a];
  const vol = reg.vol || (w && w.atr != null ? 'normal' : 'quiet');
  return { a: pal[0], b: pal[1], intensity: vol === 'high' ? 1.0 : vol === 'quiet' ? 0.45 : 0.72,
    flow: reg.trend === 'up' ? 1 : reg.trend === 'down' ? -1 : 0, trend: reg.trend || 'range', vol };
}

// The aurora as a volume: each curtain sums up to four folded sheets one behind the other (parallax with the camera's
// azimuth), each with the bright green-white lower fringe of a real aurora, rays that rise from it and a body that fades
// with height into the second colour. Still one draw call per curtain; LITE sums two sheets.
const AURORA_FRAG = `uniform float uT; uniform float uFlow; uniform float uI; uniform float uLayers; uniform float uPar;
  uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main(){
    float drift = uT * (0.02 + 0.05 * abs(uFlow)) * (uFlow < 0.0 ? -1.0 : 1.0);
    float sway = uFlow == 0.0 ? 0.08 * sin(uT * 0.3 + vUv.x * 4.0) : 0.0;
    vec3 col = vec3(0.0);
    for (int L = 0; L < 4; L++) {
      float fl = float(L);
      if (fl >= uLayers) break;
      float x = vUv.x + fl * 0.047 + uPar * (0.010 + fl * 0.008);
      float q = n(vec2(x * 6.0 + drift * 3.0 + sway + fl * 3.1, uT * 0.07 + fl)) * 0.65 + n(vec2(x * 17.0 - drift * 5.0, uT * 0.11 - fl)) * 0.35;
      float base = 0.14 + 0.24 * q + fl * 0.03;
      float hgt = vUv.y - base;
      float fringe = exp(-hgt * hgt * 3200.0) * step(-0.02, hgt);
      float body = smoothstep(-0.01, 0.02, hgt) * exp(-max(hgt, 0.0) * (2.2 + fl * 0.9));
      float rays = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(x * 150.0 + q * 11.0 + uFlow * uT * 0.8 + fl * 1.7), 2.5);
      float fold = smoothstep(0.22, 0.72, q + 0.12 * sin(uT * 0.4 + x * 9.0 + fl));
      float a = (body * 0.9 + fringe * 0.75) * rays * fold / (1.0 + fl * 0.55);
      vec3 c = mix(mix(uA, vec3(0.85, 1.0, 0.9), fringe * 0.55), uB, clamp(hgt * 2.6 + fl * 0.12, 0.0, 1.0));
      col += c * a;
    }
    float side = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
    gl_FragColor = vec4(col * uI * side * 1.15, 1.0);
  }`;

const CLOCK_FRAG = `uniform float uNow; varying vec2 vP; varying float vR;
  uniform vec3 cAsia; uniform vec3 cLon; uniform vec3 cNy; uniform vec3 cOff;
  float inS(float m, float a, float b){ return a <= b ? step(a, m) * step(m, b - 0.001) : max(step(a, m), step(m, b - 0.001)); }
  void main(){
    float m = mod(atan(vP.y, vP.x) / 6.2831853 * 1440.0 + 1440.0, 1440.0);
    vec3 c = cOff * inS(m, 960.0, 1080.0) + cAsia * inS(m, 1080.0, 120.0) + cLon * inS(m, 120.0, 480.0) + cNy * inS(m, 480.0, 960.0);
    float kz = max(max(inS(m, 1200.0, 1440.0), inS(m, 120.0, 300.0)), max(inS(m, 510.0, 660.0), inS(m, 810.0, 960.0)));
    float lit = inS(m, ${LIT_WINDOW[0].toFixed(1)}, ${LIT_WINDOW[1].toFixed(1)});
    float behind = mod(uNow - m + 1440.0, 1440.0);
    float sweep = exp(-behind / 70.0);
    float needle = smoothstep(5.0, 0.0, min(behind, 1440.0 - behind));
    float tick = smoothstep(0.8, 0.0, abs(mod(m, 60.0) - 30.0) - 29.0);
    float rim = smoothstep(0.86, 0.95, vR) * lit;
    float a = 0.16 + 0.34 * kz + 0.75 * sweep + 0.25 * tick;
    vec3 col = c * a + vec3(1.0, 0.84, 0.45) * rim * (0.55 + 0.45 * sweep) + vec3(1.0) * needle * 1.6;
    float edge = smoothstep(0.0, 0.08, vR) * smoothstep(1.0, 0.97, vR);
    gl_FragColor = vec4(col * edge, 1.0);
  }`;

/** The points that must stay on screen (the scene fits its camera distance to them): the constellation and the clock. */
export function fitPoints(THREE) {
  const top = Y_MAX + 2.9 + 1.6, pts = [new THREE.Vector3(-6.2, top, 0), new THREE.Vector3(6.2, top, 0)];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * (CLOCK_R[1] + 0.3), CLOCK_Y - 0.3, Math.sin(a) * (CLOCK_R[1] + 0.3)));
  }
  return pts;
}

export class Sky {
  constructor(THREE, scene, { quality, reduced }) {
    this.T = THREE;
    this.scene = scene;
    this.reduced = reduced;
    this.g = new THREE.Group();
    scene.add(this.g);
    this.buildDome();
    this.buildClock();
    this.buildConstellation();
    this.weather = weatherOf(null);
    this.setQuality(quality);
  }

  setQuality(q) {
    this.lite = q === 'low';
    this.buildStars(this.lite ? 500 : 1500);
    this.buildAurora(this.lite ? 1 : 3, this.lite ? 32 : 96);
    for (const l of this.stars3.labels) l.visible = !this.lite;
    this.applyStages();
  }

  buildDome() {
    const T = this.T;
    // the gradient is worked out per pixel from the direction (vD normalized in the fragment), so a coarse sphere draws the same sky:
    // 16 x 8 (224 triangles) instead of 32 x 16 (960), part of the phone budget (2026-11-16)
    this.dome = new T.Mesh(new T.SphereGeometry(300, 16, 8), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new T.Color(0x2b2436) }, uHor: { value: new T.Color(0x6a4a30) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uHor; varying vec3 vD; void main(){ float vY = normalize(vD).y; gl_FragColor = vec4(mix(uHor, uTop, smoothstep(-0.15, 0.6, vY)), 1.0); }',
    }));
    this.g.add(this.dome);
  }

  buildStars(n) {
    const T = this.T;
    if (this.stars) { this.g.remove(this.stars); this.stars.geometry.dispose(); }
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 90, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * r, Math.abs(u) * r * 0.9 - 20, Math.sin(a) * s * r], i * 3);
      const k = 0.5 + Math.random() * 0.5, warm = Math.random() < 0.2;
      col.set([k * (warm ? 1 : 0.75), k * 0.85, k], i * 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    this.stars = new T.Points(g, new T.PointsMaterial({ size: 3.2, sizeAttenuation: false, map: glowTexture(T), vertexColors: true,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    this.g.add(this.stars);
  }

  buildAurora(count, seg) {
    const T = this.T;
    if (this.auroras) for (const a of this.auroras) { this.g.remove(a); a.geometry.dispose(); a.material.dispose(); }
    this.auroras = [];
    for (let k = 0; k < count; k++) {
      const geo = new T.PlaneGeometry(1, 1, seg, 1), p = geo.attributes.position;
      const a0 = -Math.PI / 2 + (k - (count - 1) / 2) * 2.1, arc = 1.9, R = 95 + k * 8;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), a = a0 + x * arc;
        p.setXYZ(i, Math.cos(a) * R, -22 + (y + 0.5) * (46 + k * 6), Math.sin(a) * R);
      }
      const m = new T.Mesh(geo, new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
        uniforms: { uT: { value: k * 13.0 }, uFlow: { value: 0 }, uI: { value: 0.7 }, uA: { value: new T.Color() }, uB: { value: new T.Color() },
          uLayers: { value: this.lite ? 2 : 4 }, uPar: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: AURORA_FRAG,
      }));
      this.auroras.push(m);
      this.g.add(m);
    }
    this.setWeather(this.weather);
  }

  setWeather(wx) {
    this.weather = wx;
    for (const a of this.auroras || []) {
      const u = a.material.uniforms;
      u.uA.value.setHex(wx.a);
      u.uB.value.setHex(wx.b);
      // Keep the VIX hue and movement while giving the city and radar room to read.
      u.uI.value = wx.intensity * 0.62;
      u.uFlow.value = wx.flow;
    }
    if (this.dome) this.dome.material.uniforms.uHor.value.setHex(wx.b).multiplyScalar(0.25).add(new this.T.Color(0x3a2a1c));
  }

  // ---------------------------------------------------------------- the session clock
  buildClock() {
    const T = this.T, c = (s) => new T.Color(SESSIONS.find((x) => x.key === s).color);
    this.clock = new T.Group();
    this.clock.position.y = CLOCK_Y;
    const geo = new T.RingGeometry(CLOCK_R[0], CLOCK_R[1], 288, 1);
    this.clockMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uNow: { value: 0 }, cAsia: { value: c('asia') }, cLon: { value: c('london') }, cNy: { value: c('ny') }, cOff: { value: c('closed') } },
      vertexShader: `varying vec2 vP; varying float vR; void main(){ vP = position.xy; vR = (length(position.xy) - ${CLOCK_R[0].toFixed(2)}) / ${(CLOCK_R[1] - CLOCK_R[0]).toFixed(2)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: CLOCK_FRAG,
    });
    const ring = new T.Mesh(geo, this.clockMat);
    ring.rotation.x = -Math.PI / 2;
    // minutes run counter-clockwise seen from above in the ring's own plane; flip so time runs clockwise like a watch
    ring.scale.y = -1;
    this.dial = new T.Group();
    this.dial.add(ring);
    const at = (m, r) => { const a = -(m / 1440) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; };
    for (const s of SESSIONS.slice(0, 3)) {
      const mid = s.from < s.to ? (s.from + s.to) / 2 : ((s.from + s.to + 1440) / 2) % 1440, [x, z] = at(mid, CLOCK_R[1] + 0.9);
      const l = labelSprite(T, s.label, hex(s.color), 0.62, { weight: 700 });
      l.position.set(x, 0.25, -z);
      this.dial.add(l);
    }
    for (const [m, txt] of [[120, '02:00'], [570, '09:30'], [930, '15:30']]) {
      const [x, z] = at(m, CLOCK_R[0] - 0.7), l = labelSprite(T, txt, '#ebd093', 0.46);
      l.position.set(x, 0.15, -z);
      this.dial.add(l);
    }
    this.clock.add(this.dial, glowSprite(T, 0xebbf59, 7, 0.25));
    this.g.add(this.clock);
  }

  // ---------------------------------------------------------------- the stage constellation
  buildConstellation() {
    const T = this.T, g = new T.Group(), n = STAGES.length, stars = [], labels = [];
    g.position.y = Y_MAX + 2.9;
    const pts = STAGES.map((_, i) => {
      const u = i / (n - 1) * 2 - 1;
      return new T.Vector3(u * 5.6, 0.9 * (1 - u * u) + (i % 2 ? 0.35 : -0.15), 0);
    });
    STAGES.forEach(([, label], i) => {
      const s = glowSprite(T, STAR.todo, 0.8, 1), core = glowSprite(T, 0xf3ece0, 0.22, 0.5);
      s.position.copy(pts[i]);
      core.position.copy(pts[i]);
      const l = labelSprite(T, label, '#c8b78f', 0.44);
      l.position.copy(pts[i]).add(new T.Vector3(0, i % 2 ? 0.62 : -0.62, 0));
      g.add(s, core, l);
      stars.push({ s, core, ignite: 0 });
      labels.push(l);
    });
    const lg = new T.BufferGeometry();
    const lp = [];
    for (let i = 0; i < n - 1; i++) lp.push(...pts[i].toArray(), ...pts[i + 1].toArray());
    lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
    lg.setAttribute('color', new T.BufferAttribute(new Float32Array(lp.length), 3));
    const lines = new T.LineSegments(lg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    g.add(lines);
    this.spark = glowSprite(T, 0xebdfb1, 1.1, 0);
    g.add(this.spark);
    this.g.add(g);
    this.stars3 = { g, stars, labels, lines, pts, states: STAGES.map(() => 'todo'), sparkT: 1, sparkFrom: 0, sparkTo: 0 };
  }

  /** The Brain's stages ([{key, state}]) onto the stars; a stage that just lit sends a spark along the line. */
  setStages(stages) {
    const S = this.stars3, prevNow = S.states.indexOf('now');
    S.states = STAGES.map(([k], i) => (stages && stages[i] && stages[i].key === k ? stages[i].state : 'todo'));
    const now = S.states.indexOf('now');
    if (now > 0 && now !== prevNow) {
      S.stars[now].ignite = 1;
      S.sparkFrom = Math.max(0, prevNow >= 0 && prevNow < now ? prevNow : now - 1);
      S.sparkTo = now;
      S.sparkT = this.reduced ? 1 : 0;
    }
    this.applyStages();
  }

  applyStages() {
    const S = this.stars3;
    if (!S) return;
    const C = S.lines.geometry.attributes.color, tmp = new this.T.Color();
    S.states.forEach((st, i) => {
      S.stars[i].s.material.color.setHex(STAR[st] ?? STAR.todo);
      S.stars[i].core.material.opacity = st === 'todo' || st === 'skip' ? 0.15 : 0.95;
      setLabel(S.labels[i], S.labels[i].userData.label.text, st === 'now' ? '#ebd18e' : st === 'done' ? '#ebd9b0' : '#8c7e5d');
      S.labels[i].visible = !this.lite || st === 'now';
      if (i < S.states.length - 1) {
        const on = (st === 'done' || st === 'now') && (S.states[i + 1] === 'done' || S.states[i + 1] === 'now');
        tmp.setHex(on ? 0xebd092 : 0x403723);
        C.setXYZ(i * 2, tmp.r, tmp.g, tmp.b);
        C.setXYZ(i * 2 + 1, tmp.r, tmp.g, tmp.b);
      }
    });
    C.needsUpdate = true;
  }

  frame(t, dt, nowT, cam) {
    // the clock: the ring turns so New York's time faces the camera; the radar sweep ends at the needle
    const p = etParts(nowT), m = p.mod;
    this.clockMat.uniforms.uNow.value = m;
    this.dial.rotation.y = (m / 1440) * Math.PI * 2 - Math.atan2(cam.dir.z, cam.dir.x);
    const par = Math.atan2(cam.dir.z, cam.dir.x);
    for (const a of this.auroras) { a.material.uniforms.uT.value += this.reduced ? 0 : dt; a.material.uniforms.uPar.value = par; }
    if (!this.reduced) this.stars.rotation.y = t * 0.004;
    // the constellation faces the camera; the now-star breathes; a spark runs to a newly lit star
    const S = this.stars3;
    S.g.quaternion.copy(cam.q);
    S.states.forEach((st, i) => {
      const o = S.stars[i];
      o.ignite = Math.max(0, o.ignite - dt * 0.9);
      const base = st === 'now' ? 1.5 : st === 'done' ? 0.95 : 0.6;
      const breathe = st === 'now' && !this.reduced ? 1 + 0.22 * Math.sin(t * 3.2) : 1;
      o.s.scale.setScalar(base * breathe + o.ignite * 2.6);
      o.s.material.opacity = st === 'todo' ? 0.45 : st === 'skip' ? 0.35 : 1;
    });
    if (S.sparkT < 1) {
      S.sparkT = Math.min(1, S.sparkT + dt * 1.4);
      this.spark.position.copy(S.pts[S.sparkFrom]).lerp(S.pts[S.sparkTo], S.sparkT);
      this.spark.material.opacity = Math.sin(S.sparkT * Math.PI);
    } else this.spark.material.opacity = 0;
  }
}
