// ODEON arena (2026-11-03, docs/OLYMPUS_RENDER.md): the Greek amphitheatre the trades are replayed in, on the OLYMPUS render core.
//   - the cavea: eight terraces of polished marble curving round the back of the stage (risers + treads, 2 instanced draws)
//   - the skene: a colonnade of marble columns with gold capitals and a gold architrave, torches (gold bowls with a flame that blooms)
//   - the orchestra: a marble disc under the glass floor, so the floor and the reflection of the tape lie on stone
// The arena is a backdrop: it follows the camera along the tape (parallax) and the floor's height; fog does not touch it (the
// director's fog is for the tape). Draw calls: 9. Nothing here knows the trade.
import * as THREE from '../jarvis/three.module.min.js';
import * as M from '../olympus/materials.js';
import { StageFx } from './stage_fx.js';

const STEPS = 8, R0 = 44, DR = 4.2, DH = 1.5, CZ = -12;       // terraces: radius 44 -> 73, 1.5 high each, centred 12 behind the tape
const COLS = 13, COL_GAP = 5.2, SKENE_Z = -16, COL_H = 7.5;
const TORCH_X = [-34, -17, 17, 34];

export class Arena {
  constructor({ lite = false, reduced = false } = {}) {
    this.reduced = reduced;
    const g = (this.g = new THREE.Group());
    g.name = 'arena';
    const stone = (o) => { const m = M.marble(o); m.fog = false; return m; };
    const gold = M.metal({ kind: 'gold', roughness: 0.3 }); gold.fog = false;

    // the cavea
    const riser = stone({ color: '#cbbfa8', vein: '#8a6f4a', gold: true, scale: 0.05, roughness: 0.3 });
    riser.side = THREE.BackSide;
    const tread = stone({ color: '#a89a82', vein: '#6a5236', gold: false, scale: 0.05, roughness: 0.22 });
    tread.side = THREE.DoubleSide;
    this.risers = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, lite ? 40 : 72, 1, true, Math.PI / 2, Math.PI), riser, STEPS);
    this.treads = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, lite ? 40 : 72, 1, 0, Math.PI).rotateX(-Math.PI / 2), tread, STEPS);
    const at = new THREE.Object3D();
    for (let i = 0; i < STEPS; i++) {
      const r = R0 + i * DR, h = DH * (i + 1);
      at.position.set(0, h / 2, CZ); at.scale.set(r, h, r); at.updateMatrix(); this.risers.setMatrixAt(i, at.matrix);
      at.position.set(0, h, CZ); at.scale.set(r + DR, 1, r + DR); at.updateMatrix(); this.treads.setMatrixAt(i, at.matrix);
    }
    this.risers.frustumCulled = this.treads.frustumCulled = false;

    // the skene: marble columns, gold capitals and bases, a gold architrave and a thin neon frieze
    const colMat = stone({ color: '#e8dfcf', vein: '#8a6f4a', gold: true, scale: 0.35, roughness: 0.24 });
    this.cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.62, COL_H, lite ? 12 : 24, 1), colMat, COLS);
    this.caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), gold, COLS * 2);
    const span = (COLS - 1) * COL_GAP;
    for (let i = 0; i < COLS; i++) {
      const x = -span / 2 + i * COL_GAP;
      at.scale.set(1, 1, 1); at.position.set(x, COL_H / 2, SKENE_Z); at.updateMatrix(); this.cols.setMatrixAt(i, at.matrix);
      at.position.set(x, COL_H + 0.2, SKENE_Z); at.updateMatrix(); this.caps.setMatrixAt(i * 2, at.matrix);
      at.position.set(x, 0.2, SKENE_Z); at.updateMatrix(); this.caps.setMatrixAt(i * 2 + 1, at.matrix);
    }
    this.arch = new THREE.Mesh(new THREE.BoxGeometry(span + 3, 0.7, 1.5), gold);
    this.arch.position.set(0, COL_H + 0.75, SKENE_Z);
    this.frieze = new THREE.Mesh(new THREE.BoxGeometry(span + 3, 0.09, 0.09), M.metal({ kind: 'gold', color: '#b0703a', roughness: 0.4 }));
    this.frieze.position.set(0, COL_H + 1.2, SKENE_Z + 0.78);
    this.cols.frustumCulled = this.caps.frustumCulled = false;

    // torches: a gold bowl on a stem, a flame that blooms (HDR neon), and one warm light shared by all of them
    const bronze = M.metal({ kind: 'gold', color: '#b0703a', roughness: 0.38, clearcoat: 0.35 }); bronze.fog = false;      // the braziers are bronze, the architecture gold
    this.bowls = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.18, 0.5, 14), bronze, TORCH_X.length);
    this.flames = new THREE.InstancedMesh(new THREE.SphereGeometry(0.36, 12, 8), M.neon({ color: '#ff9a3c', intensity: 2.2 }), TORCH_X.length);
    TORCH_X.forEach((x, i) => {
      at.scale.set(1, 1, 1); at.position.set(x, 2.6, SKENE_Z + 4.5); at.updateMatrix(); this.bowls.setMatrixAt(i, at.matrix);
      at.scale.set(1, 1.5, 1); at.position.set(x, 3.2, SKENE_Z + 4.5); at.updateMatrix(); this.flames.setMatrixAt(i, at.matrix);
    });
    this.bowls.frustumCulled = this.flames.frustumCulled = false;
    this.stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 2.4, 8), bronze, TORCH_X.length);
    TORCH_X.forEach((x, i) => { at.scale.set(1, 1, 1); at.position.set(x, 1.2, SKENE_Z + 4.5); at.updateMatrix(); this.stems.setMatrixAt(i, at.matrix); });
    this.stems.frustumCulled = false;

    // the orchestra: stone under the glass floor (translucent: the tape's reflection still shows through)
    const deck = stone({ color: '#3a3026', vein: '#8a6f4a', gold: true, scale: 0.08, roughness: 0.18, clearcoat: 1, envMapIntensity: 0.9 });
    deck.transparent = true; deck.opacity = 0.55; deck.depthWrite = false;
    this.deck = new THREE.Mesh(new THREE.CircleGeometry(80, lite ? 48 : 96).rotateX(-Math.PI / 2), deck);
    this.deck.position.y = -0.05; this.deck.renderOrder = 0;

    // light: the warm key from the skene, the torches, and the head lamp (the candle's colour)
    this.key = new THREE.DirectionalLight(0xffe2b8, 1.5); this.key.position.set(-20, 40, 30);
    this.torch = new THREE.PointLight(0xffa04a, 60, 55, 2); this.torch.position.set(0, 4, SKENE_Z + 5);
    this.lamp = new THREE.PointLight(0xc8a24a, 28, 40, 2); this.lamp.position.set(0, 3, 4);
    g.add(this.deck, this.risers, this.treads, this.cols, this.caps, this.arch, this.frieze, this.stems, this.bowls, this.flames, this.key, this.torch, this.lamp);
    this.lamp.color.set('#c8a24a');
    try { this.fx = new StageFx({ lite }); g.add(this.fx.g); } catch (e) { this.fx = null; }       // flames, incense, mist, contact shadows: optional
    this.dim = 1;
  }

  /** follow the camera along the tape and the floor; the lamp stands over the head candle in the trade's colour */
  update(camX, floorY, head, color, flash, wall) {
    this.g.position.set(camX, floorY, 0);
    if (head) { this.lamp.position.set(head.x - camX, head.y - floorY + 1.5, 3); }
    if (color) this.lamp.color.copy(color);
    this.lamp.intensity = 36 + (flash || 0) * 160;
    this.torch.intensity = 56 + Math.sin(wall * 3.1) * 6;
    this.flames.scale.setScalar(1 + Math.sin(wall * 7) * 0.04);
    if (this.fx) this.fx.frame(wall, this.reduced);
  }

  setLite(on) {
    this.g.traverse((o) => { if (o.isPointLight && o !== this.torch) o.visible = !on; });
    if (this.fx) this.fx.setLite(on);
  }

  applyTheme(accent) {
    if (!accent) return;
    this.frieze.material.color.set(accent).multiplyScalar(2.6);
  }
}
