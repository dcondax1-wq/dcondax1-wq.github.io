// ARES war-room dress (2026-11-04): real bronze and steel (an image-based environment from the OLYMPUS kit's studio room, ACES tone mapping),
// four battle-standard banners that stir, torches on the pillars with real fire (the effects library), a hologram table under the tower
// and light shafts from above. Nothing here changes a number; it only dresses the scene the page already draws. LITE (and the library's
// low / off tiers) drop the fire, the hologram and the shafts and keep the bronze. Never needed: any failure leaves the room as it was.
import * as THREE from '../jarvis/three.module.min.js';
import { RoomEnvironment } from '../olympus/three-addons/RoomEnvironment.js';
import * as AT from '../olympus/fx-atmos.js';        // JOB 4+5 follow-up: a reflective floor under the platform, contact shadows, rising embers

const FX = () => window.OLYMPUS_FX || null;
const RM_STILL = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const H = 4;
const bronze = () => new THREE.MeshPhysicalMaterial({ color: 0xb0763c, metalness: 1, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 1.15 });
const steel = () => new THREE.MeshPhysicalMaterial({ color: 0xbbb4ac, metalness: 1, roughness: 0.28, clearcoat: 0.2, envMapIntensity: 1.1 });

function bannerTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#663727'); g.addColorStop(1, '#361d15'); x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  x.strokeStyle = '#c8a24a'; x.lineWidth = 6; x.strokeRect(6, 6, 116, 244);
  x.strokeStyle = '#c8a24a'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(64, 40); x.lineTo(64, 200); x.stroke();                                // the spear
  x.beginPath(); x.moveTo(64, 28); x.lineTo(50, 56); x.lineTo(78, 56); x.closePath(); x.fillStyle = '#c8a24a'; x.fill();
  x.beginPath(); x.moveTo(34, 150); x.lineTo(94, 150); x.stroke();                               // the crossbar
  x.fillStyle = '#c8a24a'; x.font = '700 46px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; x.textAlign = 'center'; x.fillText('Α', 64, 232);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BVS = `uniform float uTime; uniform float uPh; varying vec2 vUv; varying float vShade;
void main() { vUv = uv; vec3 p = position; float k = (1.0 - uv.y) * (1.0 - uv.y);
  float w = sin(uTime * 1.6 + uPh + uv.y * 5.0) * 0.07 * k + sin(uTime * 2.7 + uPh * 2.0 + uv.y * 9.0) * 0.025 * k; p.z += w; vShade = 0.8 + w * 2.2;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const BFS = `uniform sampler2D uMap; uniform vec3 uLight; varying vec2 vUv; varying float vShade;
void main() { vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb * vShade * uLight, 1.0); }`;

/** dress a Room (ares.js) in place; returns { update(dt, t), handles } */
export function dressRoom(room) {
  const S = room.scene, R = room.renderer, lite = room.lite, extra = { handles: [], mats: [] };
  try {
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    const pm = new THREE.PMREMGenerator(R);
    S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    [room.ring, room.floorDisk, room.topDisk, room.slabRisk, room.slabWin, room.halo].forEach((m) => { if (m && m.material) m.material.toneMapped = false; });   // the verdict colours stay the verdict colours
  } catch (e) { /* no environment: the plain look */ }
  const B = bronze(), St = steel();
  S.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.radiusTop === 3.3) { o.material = B; } });          // the platform
  if (room.spikes) room.spikes.material = St;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.09, 12, 80), B); rim.rotation.x = Math.PI / 2; rim.position.y = -0.03; S.add(rim);
  // pillars, banners, torches at the four corners
  const tex = bannerTexture(), light = new THREE.Color(1, 0.92, 0.88), torches = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.cos(a) * 4.5, z = Math.sin(a) * 4.5;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 5.4, 18), St); col.position.set(x, 2.5, z); S.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.34, 18), B); cap.position.set(x, 5.3, z); S.add(cap);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.12, 0.2, 16, 1, true), B); bowl.material = B; bowl.position.set(x, 5.55, z); S.add(bowl);
    torches.push([x, 5.6, z]);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPh: { value: i * 1.7 }, uMap: { value: tex }, uLight: { value: light } }, vertexShader: BVS, fragmentShader: BFS, side: THREE.DoubleSide });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.0, 1, lite ? 6 : 14), mat); ban.position.set(x + Math.cos(a) * 0.02, 4.0, z); ban.rotation.y = -a + Math.PI / 2; ban.translateZ(0.2); S.add(ban);
    extra.mats.push(mat);
  }
  // the room's floor and shadows (fx-atmos): a polished stone floor that reflects the torches, a soft shadow under the platform and each pillar, embers off the torches
  setTimeout(() => { try {                                                                  // the atmosphere joins 0.9 s after the room: the first paint (and the shader compile on a slow GPU) is the room itself
    if (/[?&]noatmos=1/.test(location.search)) throw new Error('atmosphere off');          // a perf probe: the room without the atmosphere kit
    const list = [];
    const fl = AT.polishedFloor({ size: 70, color: '#13100c', y: -0.37, roughness: 0.28, metalness: 0.5, env: 0.55 }); S.add(fl.object); list.push(fl);
    const ap = AT.contactAO({ radius: 4.7, depth: 4.7, strength: 0.85 }); ap.object.position.set(0, -0.36, 0); S.add(ap.object); list.push(ap);
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, ao = AT.contactAO({ radius: 0.6, strength: 0.7 }); ao.object.position.set(Math.cos(a) * 4.5, -0.355, Math.sin(a) * 4.5); S.add(ao.object); list.push(ao); }
    const em = AT.embers({ count: 90, origin: [torches[0][0], torches[0][1] + 0.05, torches[0][2]], spread: [0.2, 0, 0.2], rise: 2.4, colors: ['#f0dca0', '#e0a060', '#c96a4a'], size: 5, wind: 0.2, seed: 5 }); S.add(em.object); list.push(em);
    const em2 = AT.embers({ count: 90, origin: [torches[1][0], torches[1][1] + 0.05, torches[1][2]], spread: [0.2, 0, 0.2], rise: 2.4, colors: ['#f0dca0', '#e0a060', '#c96a4a'], size: 5, wind: -0.2, seed: 9 }); S.add(em2.object); list.push(em2);
    extra.at = list; AT.setQuality(list, lite ? 'low' : 'high'); room.dirty = true;
  } catch (e) { /* the plain room */ } }, 900);
  const fx = FX();
  if (fx && !lite) {
    Promise.all(['fx-sky.js', 'fx-weather.js', 'fx-surface.js'].map((f) => import('../olympus/' + f + '?v=f1'))).then(() => {
      const t = { scene: S, camera: room.camera, renderer: R };
      const table = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.04, 64), new THREE.MeshBasicMaterial({ visible: false })); table.position.y = 0.05; S.add(table);
      extra.handles.push(fx.hologram(t, { target: table, color: '#c96a4a' }));
      torches.slice(0, 2).forEach(([x, y, z]) => extra.handles.push(fx.fire(t, { position: [x, y - 0.1, z], height: 1.0, radius: 0.12, size: 0.36, light: 5, count: 160 })));
      extra.handles.push(fx.godRays(t, { position: [0, H + 4.5, 0], color: '#e0a060', intensity: 0.28, length: 8, count: 4 }));
      extra.handles.push(fx.dust(t, { color: '#e0a060', box: [9, 6, 9], center: [0, 2.6, 0], count: 260, size: 0.05 }));
      extra.handles.push({ stop() { S.remove(table); table.geometry.dispose(); table.material.dispose(); } });
      room.dirty = true;
    }).catch(() => {});
  } else {                                                      // LITE: static flame glows, no fire
    torches.forEach(([x, y, z]) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: room.glow, color: 0xe0a060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 })); s.scale.set(0.9, 0.9, 1); s.position.set(x, y + 0.15, z); S.add(s); });
  }
  extra.update = (dt, t) => { extra.mats.forEach((m) => { m.uniforms.uTime.value = t; }); if (extra.at) AT.update(extra.at, RM_STILL ? 0 : t, R.getPixelRatio()); };
  return extra;
}
