// TYCHE caustics: the light the glass coins throw on the wheel. One additive disc just above the wheel's face; its shader
// draws the bright, moving net of a water-caustic and shows it only near each coin, tinted in that coin's colour (up to 16
// coins). HDR (above 1) so the render core's bloom takes the brightest lines. One draw call, no extra pass, no texture.
// update(coins, t, still): coins = the wheel's coin records (mesh.position, r, color); still = reduced motion (a frozen net).
export const MAX = 16;

export class Caustics {
  constructor(THREE, radius, lite) {
    const T = THREE;
    this.T = T;
    this.u = { uT: { value: 0 }, uN: { value: 0 }, uC: { value: Array.from({ length: MAX }, () => new T.Vector4()) },
      uK: { value: Array.from({ length: MAX }, () => new T.Vector3()) }, uGold: { value: new T.Color('#c8a24a') } };
    this.mesh = new T.Mesh(new T.CircleGeometry(radius, lite ? 40 : 72), new T.ShaderMaterial({ uniforms: this.u, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT; uniform int uN; uniform vec4 uC[${MAX}]; uniform vec3 uK[${MAX}]; uniform vec3 uGold; varying vec2 vP;
        float caustic(vec2 p, float t) {
          vec2 i = p; float c = 1.0;
          for (int n = 0; n < ${lite ? 2 : 3}; n++) {
            float tt = t * (1.0 - 3.5 / float(n + 1));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / (length(vec2(p.x / (sin(i.x + tt) / 0.012 + 1e-4), p.y / (cos(i.y + tt) / 0.012 + 1e-4))) + 1e-3);   // no 0 / 0: a NaN would flood the bloom
          }
          c /= ${lite ? '2.0' : '3.0'};
          return pow(clamp(c * 0.9, 0.0, 1.0), 3.0);        // the bright net of the focused light: thin lines on a dim ground
        }
        void main() {
          // vP is the disc's own plane (x, y) = the wheel's (x, z)
          float net = caustic(vP * 0.55, uT * 0.42 + 23.0);
          vec3 tint = vec3(0.0); float near = 0.0;
          for (int i = 0; i < ${MAX}; i++) {
            if (i >= uN) break;
            vec2 d = vP - uC[i].xy; float r = uC[i].z, g = exp(-dot(d, d) / (r * r * 5.5));
            tint += uK[i] * g; near += g;
          }
          float rr = length(vP) / ${'3.3'};
          float edge = 1.0 - smoothstep(0.86, 1.0, rr);
          vec3 col = (tint * 0.85 + uGold * 0.06) * net * edge;
          col = clamp(col, 0.0, 2.0);
          if (isnan(col.r) || isnan(col.g) || isnan(col.b)) col = vec3(0.0);
          gl_FragColor = vec4(col, 1.0);
        }` }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.renderOrder = 2;
    this.tmp = new T.Color();
  }

  update(coins, t, still) {
    const u = this.u;
    u.uT.value = still ? 4 : t;
    let n = 0;
    coins.forEach((c) => {
      if (n >= MAX) return;
      // the net sits in the disc's own plane: the wheel group's (x, z) -> the disc's (x, -z) after its quarter turn
      u.uC.value[n].set(c.mesh.position.x, -c.mesh.position.z, c.r * 1.9, 0);
      this.tmp.set(c.color);
      u.uK.value[n].set(this.tmp.r, this.tmp.g, this.tmp.b);
      n++;
    });
    u.uN.value = n;
  }
}
