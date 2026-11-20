// GPU-free city chart. Existing cards, Board, Risk, Lab and lessons stay usable.
import { STATUS_COLOR } from './cityfeed.js';
import { cityLinks } from './citylinks.js';
import { districtTitle } from './citynav.js?v=nav1';

export const edgeCountLabel = (n, prefix = '') => `${n} ${prefix}edge${n === 1 ? '' : 's'}`;

/** Copy for the 2D fallback must preserve whether its model is published or demo fixture data. */
export function atlasProvenance(demo = false) {
  return demo
    ? { badge: 'DEMO · INVENTED SAMPLE', edgeLabel: 'invented demo/sample edges', linkLabel: 'demo/sample analysis links (not published data)', countPrefix: 'demo sample ' }
    : { badge: 'PUBLISHED DATA', edgeLabel: 'published edges', linkLabel: 'published analysis links', countPrefix: 'published ' };
}

export function cityAtlas(oldCanvas, L, select, reason, highlights = {}, demo = false) {
  const copy = atlasProvenance(demo);
  const canvas = document.createElement('canvas'); canvas.id = 'city'; canvas.setAttribute('aria-label', `2D city atlas of ${copy.edgeLabel} Kalshi edges; use the district buttons or Board to open an edge`); oldCanvas.replaceWith(canvas);
  document.documentElement.dataset.noscene = 'atlas';
  const caption = document.createElement('div'); caption.className = 'kc-atlas-caption';
  const badge = document.createElement('strong'); badge.className = `kc-atlas-source${demo ? ' demo' : ''}`; badge.textContent = copy.badge; caption.append(badge);
  const message = document.createElement('p'); message.textContent = `${reason} · 2D city atlas. Inner towers are ${copy.edgeLabel}; outer skyline is scenery. Light arcs show ${copy.linkLabel}, not live orders.`; caption.append(message);
  const districts = document.createElement('nav'); districts.setAttribute('aria-label', 'City atlas districts');
  function openDistrict(d) {
    document.querySelector('.kc-atlas-district')?.remove();
    const titleText = districtTitle(d), dialog = document.createElement('dialog'); dialog.className = 'kc-atlas-district'; dialog.setAttribute('aria-label', `${titleText} district edges`);
    const head = document.createElement('header'), title = document.createElement('h2'); title.textContent = titleText;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close district'; close.onclick = () => { dialog.close(); dialog.remove(); };
    head.append(title, close);
    const note = document.createElement('p'); note.textContent = `${edgeCountLabel(d.list.length, copy.countPrefix)}${demo ? ' (invented fixture examples)' : ''}. Choose any tower to open its existing evidence card. Slices may overlap; their results are not added together.`;
    const input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Find an edge'; input.setAttribute('aria-label', `Search ${d.name} edges`);
    const list = document.createElement('div'); list.className = 'kc-atlas-edges';
    function render() {
      const q = input.value.trim().toLocaleLowerCase(), rows = d.list.filter(e => !q || `${e.label} ${e.status}`.toLocaleLowerCase().includes(q)); list.replaceChildren();
      for (const e of rows) {
        const b = document.createElement('button'); b.type = 'button';
        const name = document.createElement('strong'); name.textContent = e.label;
        const info = document.createElement('span'); info.textContent = `${e.n.toLocaleString()} bets · ${e.status}${e.small ? ' · Small sample' : ''}`;
        b.append(name, info); b.onclick = () => { dialog.close(); dialog.remove(); select(e.id); }; list.append(b);
      }
      if (!rows.length) { const empty = document.createElement('p'); empty.textContent = 'No edges match. Try another word or clear the search.'; list.append(empty); }
    }
    input.oninput = render; dialog.append(head, note, input, list); document.body.append(dialog); render(); dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove());
  }
  function buildDistricts() {
    districts.replaceChildren();
    for (const d of L.districts) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `${districtTitle(d)} · ${d.count}`; b.disabled = !d.list.length; b.onclick = () => openDistrict(d); districts.append(b);
    }
  }
  buildDistricts();
  caption.append(districts); document.body.append(caption);
  let targets = [];
  let focus = highlights;
  const draw = () => {
    const g = canvas.getContext('2d'); if (!g) return;
    const box = canvas.getBoundingClientRect(), w = box.width, h = box.height, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); g.scale(dpr, dpr); targets = [];
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#251e17'); sky.addColorStop(1, '#07191d'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const scale = Math.min(w / (L.extent * 3.2), h / (L.extent * 1.8 + 90)), cx = w / 2, cy = h * 0.53;
    const p = (x, z, y = 0) => [cx + (x - z) * scale, cy + (x + z) * 0.43 * scale - y * scale];
    const path = (pts, color, fill) => { g.beginPath(); pts.forEach((a, i) => i ? g.lineTo(...a) : g.moveTo(...a)); if (fill) g.closePath(); g[fill ? 'fillStyle' : 'strokeStyle'] = color; g[fill ? 'fill' : 'stroke'](); };
    // Two luminous civic rings and a distant silhouetted skyline are scenery.
    for (let ring = 0; ring < 2; ring++) {
      const r = L.extent * (0.85 + ring * 0.25), points = [];
      for (let i = 0; i <= 128; i++) points.push(p(Math.cos(i / 128 * Math.PI * 2) * r, Math.sin(i / 128 * Math.PI * 2) * r));
      path(points, ring ? '#635240' : '#3b7b82', false);
    }
    for (let i = 0; i < 90; i++) { const x = i / 90 * w, bh = (11 + (i * 31 % 64)) * scale; g.fillStyle = '#7c664f'; g.fillRect(x, h * 0.27 - bh, Math.max(2, 3 * scale), bh); }
    // Scenic city mass surrounds the measured districts without manufacturing edges.
    const decor = Array.from({ length: 650 }, (_, i) => {
      const a = i * 2.399963, r = L.extent * (0.91 + ((i * 37) % 100) / 280);
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, h: 8 + ((i * 23) % 51), w: 2.5 + i % 4 };
    }).sort((a, b) => a.x + a.z - b.x - b.z);
    for (const b of decor) {
      path([p(b.x, b.z), p(b.x + b.w, b.z), p(b.x + b.w, b.z, b.h), p(b.x, b.z, b.h)], '#7f6852', true);
      path([p(b.x + b.w, b.z), p(b.x + b.w, b.z + b.w), p(b.x + b.w, b.z + b.w, b.h), p(b.x + b.w, b.z, b.h)], '#79634d', true);
      const [x,y] = p(b.x, b.z, b.h); g.fillStyle = '#739faf'; g.fillRect(x, y, Math.max(1,b.w * scale), Math.max(1,scale));
      for (let row = 5; row < b.h - 3; row += 8) { const [wx, wy] = p(b.x + 1, b.z, row); g.fillStyle = '#705c47'; g.fillRect(wx, wy, Math.max(1,scale), Math.max(1,scale)); }
    }
    for (const d of [...L.districts, ...L.labs]) {
      const hh = d.half; path([p(d.cx - hh, d.cz - hh), p(d.cx + hh, d.cz - hh), p(d.cx + hh, d.cz + hh), p(d.cx - hh, d.cz + hh)], `${d.color}24`, true);
    }
    g.lineWidth = Math.max(1, 1.8 * scale);
    L.roads.forEach((r) => path([p(r.x0, r.z0), p(r.x1, r.z1)], '#4fa5b380', false));
    // Bounded, static arcs carry the same published analysis links as the 3D scene.
    g.save(); g.lineWidth = Math.max(1, 1.4 * scale);
    for (const route of cityLinks(L, focus)) {
      g.strokeStyle = route.color; g.shadowColor = route.color; g.shadowBlur = 10;
      g.beginPath(); route.points.forEach((v, i) => { const xy = p(v.x, v.z, v.y); if (i) g.lineTo(...xy); else g.moveTo(...xy); }); g.stroke();
    }
    g.restore();
    L.buildings.slice().sort((a, b) => a.x + a.z - b.x - b.z).forEach((b) => {
      const hw = b.w * 0.65, hh = Math.max(2, b.h), color = b.e.small ? '#889cb3' : STATUS_COLOR[b.e.status] || '#88acc8';
      path([p(b.x - hw, b.z), p(b.x, b.z + hw), p(b.x, b.z + hw, hh), p(b.x - hw, b.z, hh)], '#897058', true);
      path([p(b.x, b.z + hw), p(b.x + hw, b.z), p(b.x + hw, b.z, hh), p(b.x, b.z + hw, hh)], '#7d6650', true);
      path([p(b.x - hw, b.z, hh), p(b.x, b.z - hw, hh), p(b.x + hw, b.z, hh), p(b.x, b.z + hw, hh)], color, true);
      const [x, y] = p(b.x, b.z, hh); targets.push({ id: b.id, x, y });
    });
    // Composite names after all geometry so the far districts remain readable.
    g.font = '600 11px system-ui'; g.textAlign = 'center';
    const occupied = [];
    for (const d of L.districts) {
      const anchor = p(d.cx, d.cz + d.half + 10), text = d.name, tw = g.measureText(text).width;
      const candidates = [0, -24, 24, -48, 48, -72, 72, -96, 96].flatMap((dy) => [0, -60, 60, -120, 120].map((dx) => ({x:anchor[0]+dx,y:anchor[1]+dy,cost:Math.hypot(dx,dy)}))).sort((a,b)=>a.cost-b.cost);
      const choice = candidates.find((c) => c.x > tw / 2 + 9 && c.x < w - tw / 2 - 9 && c.y > 18 && c.y < h - 22 && !occupied.some((r) => Math.abs(r.x - c.x) < (r.w + tw) / 2 + 10 && Math.abs(r.y - c.y) < 22));
      const x = choice?.x ?? Math.max(tw / 2 + 9, Math.min(w - tw / 2 - 9, anchor[0])), y = choice?.y ?? Math.min(h - 22, Math.max(18, anchor[1]));
      if (Math.hypot(x-anchor[0], y-anchor[1]) > 5) { g.lineWidth = 1; path([anchor, [x, y - 10]], '#6c9eae', false); }
      occupied.push({ x, y, w: tw });
      g.fillStyle = '#06121bf5'; g.fillRect(x - tw / 2 - 6, y - 12, tw + 12, 19); g.fillStyle = '#b2c9db'; g.fillText(text, x, y + 1);
    }
  };
  canvas.addEventListener('click', (e) => { const box = canvas.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top; const near = targets.map((t) => ({ ...t, dist: Math.hypot(t.x - x, t.y - y) })).sort((a, b) => a.dist - b.dist)[0]; if (near && near.dist < 18) select(near.id); });
  window.addEventListener('resize', draw);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  if (ro) ro.observe(canvas);
  draw();
  /** destroy(): the 3D city takes over. Removes the atlas (caption, dialog, listeners) and puts back a fresh canvas (no 2D context on it) */
  function destroy() {
    window.removeEventListener('resize', draw); if (ro) ro.disconnect();
    document.querySelector('.kc-atlas-district')?.remove(); caption.remove();
    delete document.documentElement.dataset.noscene;
    const fresh = oldCanvas.cloneNode(false); canvas.replaceWith(fresh); return fresh;
  }
  return { draw, destroy, focusDistrict(key) { const d = L.districts.find((item) => item.key === key); if (!d) return false; openDistrict(d); return true; }, update(nextLayout, nextHighlights = focus) {
    L = nextLayout; focus = nextHighlights;
    document.querySelector('.kc-atlas-district')?.remove();
    buildDistricts(); draw();
  } };
}

