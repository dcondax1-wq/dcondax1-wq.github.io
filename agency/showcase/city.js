// AGENCY SHOWCASE 3D city (agency/showcase/city.js, day-web 2026-11-20): a small glowing night city of the sites the studio builds. One tower per
// demo (brand.json "demos"), in its colour, with a floating name; a tap on the tower or its name opens that demo. Filler blocks around them are one
// InstancedMesh (one draw call). three.js r160 from the site (no CDN). Phone-safe: pixel ratio <= 1.75, ~40 fps cap, sleeps when off screen or the
// tab is hidden, no post-processing. Loaded by showcase.js only after the page is idle (the words and buttons come first).
import * as THREE from '../../jarvis/three.module.min.js';

export function mount(stage, opts) {
  const o = opts || {}, demos = (o.demos || []).slice(0, 10), href = o.href || ((s) => '../demos/#' + s), onState = o.onState || (() => {});
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.opacity = '0'; canvas.style.transition = 'opacity .6s ease';
  stage.prepend(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { canvas.remove(); onState('still'); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0a24, 0.028);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  // ---- light: a cool moon, a warm city glow from below
  scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1640, 0.9));
  const key = new THREE.DirectionalLight(0xc9d4ff, 1.1); key.position.set(-6, 12, 8); scene.add(key);

  // ---- ground: dark glass with a faint street grid
  const gTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#0c0b26'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(124,92,255,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.35, metalness: 0.6 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // ---- window texture shared by every building (lit windows in rows)
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#151436'; g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 124; y += 10) for (let x = 5; x < 60; x += 12) {
      const on = Math.random() < 0.55; g.fillStyle = on ? (Math.random() < 0.7 ? '#ffd9a0' : '#a8d8ff') : '#1d1c44'; g.fillRect(x, y, 7, 5);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();

  // ---- filler blocks: one InstancedMesh round the demo towers
  const rnd = ((s) => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
  const FILL = 90, box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const fillMat = new THREE.MeshStandardMaterial({ color: 0x2a2860, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, map: winTex, roughness: 0.6, metalness: 0.3 });
  const fill = new THREE.InstancedMesh(box, fillMat, FILL);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < 400 && k < FILL; i++) {
    const a = rnd() * Math.PI * 2, r = 3.2 + rnd() * 13, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 2.2 || demos.some((dm, j) => { const n = demos.length, aa = (j / n) * Math.PI * 2 + 0.3, rr = 3.6 + (j % 2) * 2.2; return Math.hypot(x - Math.cos(aa) * rr, z - Math.sin(aa) * rr) < 1.3; })) continue;
    const h = 0.6 + Math.pow(rnd(), 2) * 4.5 * (1 - r / 20), wd = 0.6 + rnd() * 0.9;
    p3.set(x, 0, z); sc.set(wd, h, 0.6 + rnd() * 0.9); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.4);
    fill.setMatrixAt(k++, m4.compose(p3, q, sc));
  }
  fill.count = k; scene.add(fill);

  // ---- the demo towers: a ring round the centre, each in its own colour with a glowing crown
  const towers = [], glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  demos.forEach((dm, i) => {
    const n = demos.length, a = (i / n) * Math.PI * 2 + 0.3, r = n > 1 ? 3.6 + (i % 2) * 2.2 : 0, h = 3.0 + ((i * 7) % 5) * 0.6;
    const col = new THREE.Color(dm.color || '#7c5cff');
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const body = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x1e1c4a, emissive: col, emissiveMap: winTex, emissiveIntensity: 0.9, map: winTex, roughness: 0.25, metalness: 0.7 }));
    body.scale.set(0.9, h, 0.9); g.add(body);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.96), new THREE.MeshBasicMaterial({ color: col }));
    crown.position.y = h; g.add(crown);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spr.scale.set(2.2, 2.2, 1); spr.position.y = h + 0.2; g.add(spr);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.18, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = h + 3; g.add(beam);
    body.userData.i = i; scene.add(g);
    towers.push({ g, body, spr, h, dm });
  });

  // ---- floating names (HTML: crisp text, real links, 44 px-ish targets)
  const tags = stage.querySelector('#tags') || stage.appendChild(Object.assign(document.createElement('div'), { className: 'tags' }));
  tags.removeAttribute('aria-hidden');
  const links = towers.map((t) => {
    const a = document.createElement('a'); a.href = href(t.dm.slug); a.textContent = t.dm.label; a.style.setProperty('--c', t.dm.color || '#7c5cff');
    a.setAttribute('aria-label', 'Open the ' + t.dm.label + ' demo site'); tags.appendChild(a); return a;
  });

  // ---- size, camera, input
  let W = 1, H = 1;
  function size() {
    const r = stage.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W < 500 ? 48 : 40; camera.updateProjectionMatrix();
  }
  size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => size()) : null; if (ro) ro.observe(stage);
  let yaw = 0.6, yawV = 0, drag = null;
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, moved: 0 }; });
  addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(e.clientY - drag.y)); yaw = drag.yaw - dx * 0.008; });
  addEventListener('pointerup', (e) => {
    if (!drag) return; const was = drag; drag = null;
    if (was.moved < 8) {                       // a tap: the tower under the finger opens its demo
      const r = canvas.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(v, camera);
      const hit = ray.intersectObjects(towers.map((t) => t.body))[0];
      if (hit) location.href = href(towers[hit.object.userData.i].dm.slug);
    }
  });

  // ---- the loop: ~40 fps, asleep off screen / hidden
  let on = true, raf = 0, last = 0, t = 0, first = true;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { on = es[es.length - 1].isIntersecting; if (on) kick(); }, { threshold: 0 }) : null;
  if (io) io.observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  const tmp = new THREE.Vector3();
  function frame(now) {
    raf = 0;
    if (!on || document.hidden) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 24) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    if (!drag && !reduced) yaw += dt * 0.12;
    const dist = W < 500 ? 14 : 12.5;
    camera.position.set(Math.cos(yaw) * dist, 6.2 + Math.sin(t * 0.2) * 0.3, Math.sin(yaw) * dist); camera.lookAt(0, 1.6, 0);
    towers.forEach((tw, i) => { tw.spr.material.opacity = 0.75 + 0.25 * Math.sin(t * 1.6 + i); });
    renderer.render(scene, camera);
    // the names follow their towers (transform only); nearest first, a name that would overlap a nearer one waits (no pile of labels)
    const placed = [], order = towers.map((tw, i) => { tmp.set(tw.g.position.x, tw.h + 0.5, tw.g.position.z).project(camera); return { i, x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, z: tmp.z }; })
      .sort((a, b) => a.z - b.z);
    order.forEach((p) => {
      const a = links[p.i], wd = (a.textContent.length * 8 + 26), x0 = p.x - wd / 2, y0 = p.y - 46;
      let vis = p.z < 1 && x0 > 4 && x0 + wd < W - 4 && y0 > 4 && placed.length < 4 && !placed.some((r) => x0 < r[2] + 6 && x0 + wd > r[0] - 6 && y0 < r[3] + 4 && y0 + 44 > r[1] - 4);
      if (vis) placed.push([x0, y0, x0 + wd, y0 + 44]);
      a.style.display = vis ? '' : 'none';
      if (vis) a.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    });
    if (first) { first = false; canvas.style.opacity = '1'; const sky = stage.querySelector('svg.sky'); if (sky) sky.style.opacity = '0'; onState('live'); }
  }
  function kick() { if (!raf && on && !document.hidden) raf = requestAnimationFrame(frame); }
  kick();
  onState('starting');
  return { stop() { on = false; if (raf) cancelAnimationFrame(raf); }, towers: towers.length };
}
