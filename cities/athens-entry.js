// ATHENS entry: adds the "Enter Athens" buttons to Cities and opens the metropolis on demand (nothing heavy loads until then).
// #athens or ?athens=1 opens it directly. Read-only scenery: no order, no trade.
let session = null;
const O = () => window.OLYMPUS || null;

export async function openAthens() {
  if (session) return session;
  const [{ AthensUI }, { Athens }, { loadLive }] = await Promise.all([import('./athens-ui.js?v=q6d'), import('./athens.js?v=q6d'), import('./athens-data.js?v=t3')]);
  import('./people-talk.js').then((m) => m.loadKit()).catch(() => null);   // the shared People kit, optional: villagers talk through it when it is there
  const [{ Nest }, { buildWorld }, { loadFiles }] = await Promise.all([import('./athens-nest.js?v=q6d'), import('./athens-world.js'), import('./athens-villages.js')]);
  if (!document.querySelector('link[data-athens-css]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./athens.css?v=t2', import.meta.url).href; l.dataset.athensCss = '1'; document.head.append(l);
    await new Promise((r) => { l.onload = l.onerror = r; setTimeout(r, 1500); });
  }
  if (!document.querySelector('link[data-athens-nest]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./athens-nest.css?v=n2', import.meta.url).href; l.dataset.athensNest = '1'; document.head.append(l); }
  const q = new URLSearchParams(location.search), lite = !!(O() && O().lite && O().lite()), tier = q.get('q') === 'low' || lite ? 'low' : q.get('q') === 'ultra' ? 'ultra' : 'high';
  const reduced0 = !!(O() && O().reduced && O().reduced()), ui = new AthensUI(undefined, { onClose: closeAthens, reduced: reduced0, first: q.get('first') === '0' ? false : q.get('first') === '1' ? true : undefined }).mount();
  session = { ui, scene: null, raf: 0, last: 0, closed: false };
  document.documentElement.classList.add('athens-open'); if (O() && O().covered) O().covered(true);
  await new Promise((r) => setTimeout(r, 40));
  try {
    const reduced = !!(O() && O().reduced && O().reduced());
    const scene = new Athens(ui.canvas, { tier, reduced }); scene.resize(); ui.attach(scene); session.scene = scene; ui.nest = new Nest(ui);
    if (q.get('light') === 'day' || q.get('light') === 'dusk') { ui.light = q.get('light'); ui.applyLight(); }
    loadLive().then((live) => { if (!session || session.closed) return; ui.setLive(live); ui.firstVisit(); window.__athens && (window.__athens.live = live); }).catch(() => { ui.firstVisit(); });
    // the villages: read the published files in the background (example files when a live one is missing), then redraw the houses with their data
    loadFiles(import.meta.url).then((files) => { if (!session || session.closed) return; const world = buildWorld(scene.plan, files); scene.setWorld(world); ui.nest.setWorld(world); window.__athens && (window.__athens.world = world); }).catch((e) => { window.__athensWorldError = String((e && e.stack) || e); /* the plain city stays */ });
    window.__athens = { scene, ui, nest: ui.nest, calls: () => scene.calls, tris: () => scene.trisDrawn, houses: scene.houseCount, tier };
    addEventListener('resize', onResize);
    const loop = (now) => {
      if (session.closed) return; session.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const gap = Math.max(O() && O().frameGap ? O().frameGap() : 0, tier === 'low' ? 33 : 0);
      if (now - session.last < gap) return;
      const dt = Math.min(.1, (now - (session.last || now)) / 1000); session.last = now;
      scene.frame(dt, now / 1000); ui.frame();
    };
    session.raf = requestAnimationFrame(loop);
  } catch (err) {
    // no WebGL: the map and the jump list still work
    ui.root.classList.add('nogl', 'bigmap'); ui.root.querySelector('#athLoad')?.remove(); ui.drawStatic(); ui.drawMini();
    const note = document.createElement('div'); note.className = 'ath-fallback'; note.textContent = 'This device cannot draw the 3D city. The map and the list still work.'; ui.root.append(note);
    ui.scene = null; window.__athensError = String(err);
  }
  return session;
}
function onResize() { if (session && session.scene) { session.scene.resize(); session.ui.drawStatic(); } }
export function closeAthens() {
  if (!session) return; session.closed = true; cancelAnimationFrame(session.raf); removeEventListener('resize', onResize);
  try { session.scene && session.scene.dispose(); } catch (e) { /* already gone */ }
  try { session.ui.nest && session.ui.nest.dispose(); } catch (e) { /* gone */ }
  session.ui.root.remove(); document.documentElement.classList.remove('athens-open'); if (O() && O().covered) O().covered(false);
  session = null; delete window.__athens; if (location.hash === '#athens') history.replaceState(null, '', location.pathname + location.search);
}

function addButtons() {
  const mk = (cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = 'Enter Athens'; b.setAttribute('aria-label', 'Enter Athens, the giant Greek metropolis'); b.onclick = () => openAthens(); return b; };
  const actions = document.querySelector('.atlas-actions');
  if (actions && !actions.querySelector('.athens-enter')) actions.append(mk('athens-enter'));
  if (!document.querySelector('.athens-fab')) document.body.append(mk('athens-fab'));
}
function boot() {
  if (!document.querySelector('link[data-athens-btn]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./athens-btn.css?v=t3', import.meta.url).href; l.dataset.athensBtn = '1'; document.head.append(l); }
  addButtons();
  if (location.hash === '#athens' || new URLSearchParams(location.search).get('athens') === '1') openAthens();
}
window.openAthens = openAthens; window.closeAthens = closeAthens;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
