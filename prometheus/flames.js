// THE FORGE: every flame of the arena in ONE draw call. Each flame is an upright billboard quad (it turns with the camera
// about the vertical axis, so flames never tilt); the fragment shader paints the fire from value noise: a teardrop body
// whose edge is torn by two octaves of rising noise (three on HD), a white-hot core, tongues that break off at the top and a
// soft halo at the base. Fitter = taller, wider, hotter (white-gold); the weak burn low and red. The live flame is ice.
//
//   const field = new FlameField(scene, n, lite)
//   field.set(i, pos, W, H, color, heat, alpha, phase, ice)   then field.commit() once a frame;  field.hide(i)
//   field.uniforms.uT (seconds; frozen under reduced motion)
import * as THREE from '../jarvis/three.module.min.js';

const X0 = -1.7, X1 = 1.7, Y0 = -0.32, Y1 = 1.3;     // the quad in flame units: body |x| < 1, 0 < y < 1, the rest is halo

export class FlameField {
  constructor(scene, n, lite) {
    this.n = n;
    const corner = new Float32Array(n * 8), center = new Float32Array(n * 12), size = new Float32Array(n * 8);
    const col = new Float32Array(n * 12), mix = new Float32Array(n * 16), idx = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) {
      corner.set([X0, Y0, X1, Y0, X1, Y1, X0, Y1], i * 8);
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    const dyn = (a, s) => new THREE.BufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));   // unused: the shader builds the quad
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aCenter', (this.center = dyn(center, 3)));
    g.setAttribute('aSize', (this.size = dyn(size, 2)));
    g.setAttribute('aCol', (this.col = dyn(col, 3)));
    g.setAttribute('aMix', (this.mix = dyn(mix, 4)));      // heat, alpha, phase, ice
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.uniforms = { uT: { value: 0 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      defines: lite ? {} : { HD: 1 },
      vertexShader: `attribute vec2 aCorner, aSize; attribute vec3 aCenter, aCol; attribute vec4 aMix;
        varying vec2 vP; varying vec3 vCol; varying vec4 vMix;
        void main() {
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));   // the camera's right, in the world
          right = normalize(vec3(right.x, 0.0, right.z) + vec3(1e-5, 0.0, 0.0));
          vec3 p = aCenter + right * aCorner.x * aSize.x * 0.5 + vec3(0.0, aCorner.y * aSize.y, 0.0);
          vP = aCorner; vCol = aCol; vMix = aMix;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          if (aMix.y <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);    // a hidden flame: off screen
        }`,
      fragmentShader: `uniform float uT; varying vec2 vP; varying vec3 vCol; varying vec4 vMix;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p) { float v = 0.58 * noise(p) + 0.29 * noise(p * 2.03 + 3.7);
        #ifdef HD
          v += 0.13 * noise(p * 4.11 + 9.2);
        #else
          v += 0.065;
        #endif
          return v; }
        // the render core adds light in linear HDR and tone-maps once: the fire is painted in screen colours, so square it (and push the hot core past 1 so it blooms)
        vec3 lin(vec3 c) { return c * c * 1.6 + c * 0.1; }
        void main() {
          float heat = vMix.x, ph = vMix.z, ice = vMix.w;
          vec2 p = vP; float y = clamp(p.y, 0.0, 1.0);
          vec2 hq = (p - vec2(0.0, 0.22)) * vec2(0.62, 1.1);
          float halo = exp(-dot(hq, hq) * 2.2) * (0.18 + 0.32 * heat);
          // the quad's own edges fade to nothing: no visible card around a flame
          float win = (1.0 - smoothstep(1.2, 1.7, abs(p.x))) * smoothstep(-0.32, -0.12, p.y) * (1.0 - smoothstep(1.05, 1.3, p.y));
          if (abs(p.x) > 1.25 || p.y < -0.16) { gl_FragColor = vec4(lin(vCol * halo * vMix.y * win), 1.0); return; }   // halo only: no noise
          float n = fbm(vec2(p.x * 1.7 + ph, p.y * 2.6 - uT * (2.0 + heat) - ph));            // fire rises
          float w = mix(1.0, 0.1, pow(y, 0.85));                                             // the teardrop
          float xx = (p.x + (n - 0.5) * 0.7 * y) / max(0.06, w);
          float body = (1.0 - smoothstep(0.2, 1.0, abs(xx))) * smoothstep(-0.14, 0.06, p.y);
          body *= smoothstep(0.0, 0.32, n + 0.62 - y * (0.95 - 0.25 * heat));                 // torn edge, tongues at the top
          float core = (1.0 - smoothstep(0.0, 0.55, abs(xx))) * (1.0 - smoothstep(0.05, 0.8, y)) * smoothstep(-0.06, 0.1, p.y);
          vec3 deep = mix(vec3(0.55, 0.06, 0.02), vec3(0.5, 0.42, 0.3), ice);
          vec3 white = mix(vec3(1.0, 0.95, 0.78), vec3(1.0, 0.97, 0.9), ice);
          vec3 c = mix(deep, vCol, smoothstep(0.05, 0.55, body * (1.1 - 0.5 * y))) * body
                 + white * core * (0.35 + 0.85 * heat) + vCol * halo;
          gl_FragColor = vec4(lin(max(c, vec3(0.0)) * vMix.y * win), 1.0);
        }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,   // above the floor, never clipped
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  set(i, pos, W, H, color, heat, alpha, phase, ice = 0) {
    for (let v = 0; v < 4; v++) {
      const j = i * 4 + v;
      this.center.setXYZ(j, pos.x, pos.y, pos.z);
      this.size.setXY(j, W, H);
      this.col.setXYZ(j, color.r, color.g, color.b);
      this.mix.setXYZW(j, heat, alpha, phase, ice);
    }
  }

  /** LITE: two noise octaves instead of three (the auto LITE switch recompiles the one shader) */
  setLite(on) { const m = this.mesh.material; m.defines = on ? {} : { HD: 1 }; m.needsUpdate = true; }

  hide(i) { for (let v = 0; v < 4; v++) this.mix.setY(i * 4 + v, 0); }

  commit() { this.center.needsUpdate = this.size.needsUpdate = this.col.needsUpdate = this.mix.needsUpdate = true; }
}
