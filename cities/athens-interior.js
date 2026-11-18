// ATHENS temple interior (lite): one marble hall for any app. Instanced columns and beams, a checker floor, a pedestal that shows the
// app name, and a soft orb: warm gold and pulsing when the app needs the owner, calm ivory otherwise. About 12 draw calls, ~3k triangles.
// Not built in LITE (the UI shows a flat card instead). Scenery only: it shows text from the owner's published files and nothing else.
import * as THREE from '../jarvis/three.module.min.js';

const lerp = (a, b, t) => a + (b - a) * t;

function plaque(name, colour, calm) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#2a231b'; x.fillRect(0, 0, 512, 160); x.strokeStyle = '#c8a24a'; x.lineWidth = 6; x.strokeRect(8, 8, 496, 144);
  x.fillStyle = colour; x.fillRect(20, 20, 10, 120);
  x.fillStyle = '#f3ece0'; x.font = '700 64px "Iowan Old Style","Palatino Linotype",Georgia,serif'; x.textBaseline = 'middle'; x.fillText(name.slice(0, 14), 48, 66);
  x.font = '28px Georgia,serif'; x.fillStyle = calm ? '#cfc4b2' : '#f1d9a0'; x.fillText(calm ? 'calm' : 'needs you', 48, 126);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Interior {
  constructor(renderer, opts = {}) {
    this.renderer = renderer; this.reduced = !!opts.reduced; this.yaw = 0; this.pitch = 0; this.own = [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#3a2e22'); this.scene.fog = new THREE.Fog('#3a2e22', 30, 90);
    this.camera = new THREE.PerspectiveCamera(60, 1, .3, 200);
  }
  keep(o) { this.own.push(o); return o; }
  build(app, need) {
    const sc = this.scene, k = (o) => this.keep(o), calm = !need, colour = app.colour || '#c8a24a';
    sc.add(new THREE.HemisphereLight('#ffe3b8', '#6a5440', 1.0));
    const key = new THREE.PointLight('#ffc27a', calm ? 60 : 110, 70, 1.4); key.position.set(0, 9, -6); sc.add(key); this.key = key;
    // floor: a marble checker
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e9dfca'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#c9bb9e'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
    const ft = k(new THREE.CanvasTexture(c)); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(7, 12); ft.colorSpace = THREE.SRGBColorSpace; ft.magFilter = THREE.NearestFilter;
    const floor = new THREE.Mesh(k(new THREE.PlaneGeometry(28, 48).rotateX(-Math.PI / 2)), k(new THREE.MeshLambertMaterial({ map: ft }))); floor.position.z = -4; sc.add(floor);
    const stone = k(new THREE.MeshLambertMaterial({ color: '#e6dcc6' })), dark = k(new THREE.MeshLambertMaterial({ color: '#7d6c55' }));
    // columns, bases and capitals: three instanced meshes
    const rows = 7, d = new THREE.Object3D(), n = rows * 2;
    const shaft = new THREE.InstancedMesh(k(new THREE.CylinderGeometry(.8, .95, 12, 12).translate(0, 6, 0)), stone, n);
    const cap = new THREE.InstancedMesh(k(new THREE.BoxGeometry(2.4, .8, 2.4).translate(0, 12.4, 0)), stone, n);
    const base = new THREE.InstancedMesh(k(new THREE.BoxGeometry(2.4, .6, 2.4).translate(0, .3, 0)), stone, n);
    for (let i = 0; i < n; i++) { d.position.set((i % 2 ? 1 : -1) * 8.5, 0, 12 - Math.floor(i / 2) * 6.5); d.updateMatrix(); for (const m of [shaft, cap, base]) m.setMatrixAt(i, d.matrix); }
    sc.add(shaft, cap, base);
    // ceiling beams and the back wall with two banners in the app's colour
    const beams = new THREE.InstancedMesh(k(new THREE.BoxGeometry(20, .9, 1.2).translate(0, 13.3, 0)), dark, rows);
    for (let i = 0; i < rows; i++) { d.position.set(0, 0, 12 - i * 6.5); d.updateMatrix(); beams.setMatrixAt(i, d.matrix); }
    sc.add(beams);
    const wall = new THREE.Mesh(k(new THREE.BoxGeometry(28, 16, 1)), k(new THREE.MeshLambertMaterial({ color: '#d4c6a8' }))); wall.position.set(0, 8, -27); sc.add(wall);
    const ban = new THREE.InstancedMesh(k(new THREE.PlaneGeometry(2.6, 8)), k(new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide })), 2);
    for (let i = 0; i < 2; i++) { d.position.set(i ? 8 : -8, 7.5, -26.4); d.updateMatrix(); ban.setMatrixAt(i, d.matrix); }
    sc.add(ban);
    // the pedestal, its plaque and the orb
    const ped = new THREE.Mesh(k(new THREE.CylinderGeometry(2.2, 2.8, 3, 16).translate(0, 1.5, 0)), stone); ped.position.set(0, 0, -14); sc.add(ped);
    const top = new THREE.Mesh(k(new THREE.CylinderGeometry(2.6, 2.6, .4, 16).translate(0, 3.2, 0)), k(new THREE.MeshLambertMaterial({ color: '#c8a24a' }))); top.position.copy(ped.position); sc.add(top);
    const pl = new THREE.Mesh(k(new THREE.PlaneGeometry(5.6, 1.75)), k(new THREE.MeshBasicMaterial({ map: k(plaque(app.name, colour, calm)) }))); pl.position.set(0, 1.6, -11.18); sc.add(pl);
    this.orb = new THREE.Mesh(k(new THREE.SphereGeometry(1.5, 20, 14)), k(new THREE.MeshBasicMaterial({ color: calm ? '#f3ead6' : '#ffcf6e' }))); this.orb.position.set(0, 6, -14); sc.add(this.orb);
    this.calm = calm; this.t = 0;
    this.camera.position.set(0, 4.6, 22); this.camera.lookAt(0, 5, -14);
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.fov = h > w ? 70 : 54; this.camera.updateProjectionMatrix(); }
  look(dx, dy) { this.yaw = Math.max(-.6, Math.min(.6, this.yaw - dx * .004)); this.pitch = Math.max(-.2, Math.min(.25, this.pitch + dy * .002)); }
  frame(dt, t) {
    const sway = this.reduced ? 0 : Math.sin(t * .25) * .05;
    this.camera.rotation.set(this.pitch - .05, this.yaw + sway, 0, 'YXZ');
    this.orb.position.y = 6 + (this.reduced ? 0 : Math.sin(t * 1.4) * .25);
    if (!this.calm && !this.reduced) this.key.intensity = 110 + Math.sin(t * 2.4) * 18;
  }
  dispose() { for (const o of this.own) o.dispose && o.dispose(); this.scene.clear(); }
}
