// Small satellite neighborhoods: scenery only, never part of L.items or any research statistic.
// Forty-eight named-by-coordinate clusters are kept in one InstancedMesh; quality profiles thin towers
// evenly across every town so even LITE retains the complete outer network.
import * as THREE from '../jarvis/three.module.min.js';
import * as SH from './shaders.js?v=dcgfx12';
import { archUniforms, towerGeo } from './skyline.js?v=dcgfx16';
import { PROFILES } from './caps.js?v=dcgfx3';
import { SATELLITE_TOWNS } from './satellites.js?v=dcgfx1';
import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble

const MAX_PER_TOWN = 12;
const POSITIONS = [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1],[0,-2],[-1,2],[1,2]];
const PALETTE = [(NEON ? 0xff8737 : 0xd39657), (NEON ? 0xffa243 : 0xd5995c), (NEON ? 0xffbf57 : 0xd79e64), (NEON ? 0xf77e35 : 0xd29353), (NEON ? 0xffd06a : 0xd9a26b)];
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };

export class SatelliteTowns {
  constructor(L, U, quality, caps = PROFILES.full) {
    const layout = L.satellites;
    const total = SATELLITE_TOWNS * MAX_PER_TOWN;
    const colors = new Float32Array(total * 3), data = new Float32Array(total * 4), state = new Float32Array(total * 4);
    const seed = new Float32Array(total), look = new Float32Array(total * 4), m4 = new THREE.Matrix4(), color = new THREE.Color();
    const mesh = new THREE.InstancedMesh(towerGeo(4), new THREE.ShaderMaterial({ vertexShader: SH.BUILD_VS, fragmentShader: SH.BUILD_FS,
      uniforms: { uTime: U.uTime, uFog: U.uFog, uFogD: U.uFogD, uHaze: U.uHaze, uDay: U.uDay, uToday: { value: 0 }, uWet: U.uWet, uGrow: U.uGrow,
        uMirror: { value: 0 }, uDusk: U.uDusk, uCloud: U.uCloud, uSun: U.uSun, uAccent: U.uAccent, uFlash: U.uFlash, ...archUniforms() } }), total);

    // Interleave tower ranks: every neighborhood keeps a recognizable core at the smallest profile.
    for (let rank = 0; rank < MAX_PER_TOWN; rank++) {
      for (let i = 0; i < SATELLITE_TOWNS; i++) {
        const town = layout.towns[i], [u, v] = POSITIONS[rank], tangent = town.angle + Math.PI / 2;
        const jitter = hash(i * 19 + rank * 7) - 0.5;
        const x = town.x + Math.cos(tangent) * u * 2.15 + Math.cos(town.angle) * v * 2.15;
        const z = town.z + Math.sin(tangent) * u * 2.15 + Math.sin(town.angle) * v * 2.15;
        const h = rank === 0 ? 10.5 + hash(i + 1) * 4.5 : 2.4 + hash(i * 23 + rank) * 6.2;
        const w = rank === 0 ? 2.0 : 1.2 + hash(i * 11 + rank) * 0.45;
        const accent = town.accent && rank < 5;
        const hex = accent ? (rank < 3 ? (NEON ? 0x38d88a : 0x9cac63) : (NEON ? 0x43dfff : 0x8a7f6e)) : PALETTE[Math.floor(hash(i * 31 + rank * 13) * PALETTE.length)];
        const j = rank * SATELLITE_TOWNS + i;
        m4.makeScale(w, h, w).setPosition(x, 0, z);
        mesh.setMatrixAt(j, m4);
        color.setHex(hex); colors.set([color.r, color.g, color.b], j * 3);
        data.set([h, 0.72 + hash(i * 5 + rank) * 0.24, rank === 0 && town.accent ? 0.3 : 0, 0], j * 4);
        state[j * 4 + 2] = 1;
        seed[j] = hash(i * 47 + rank * 101 + 3);
        look.set([11, 0.62 + jitter * 0.22, rank === 0 ? 0.62 : 0.3, 0.3], j * 4);
      }
    }
    const g = mesh.geometry;
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    g.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
    g.setAttribute('aState', new THREE.InstancedBufferAttribute(state, 4));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    g.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), layout.worldRadius + 12);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.userData.decor = true;
    this.mesh = mesh;
    this.total = total;
    this.townCount = SATELLITE_TOWNS;
    this.group = new THREE.Group();
    this.group.add(mesh);
    this.setQuality(quality, caps);
  }

  setQuality(_quality, caps = PROFILES.full) {
    this.mesh.count = Math.min(this.total, caps?.townTowers ?? this.total);
  }
}
