// HELLAS entry: adds the "Enter Hellas" buttons to Cities and opens the world on demand (nothing heavy loads until then).
// #hellas or ?hellas=1 opens it directly; ?demo=1 shows example data only; ?q=low is LITE. Read-only scenery: no order, no trade.
let session = null;
const O = () => window.OLYMPUS || null;
const V = '?v=h1';

export async function openHellas() {
  if (session) return session;
  const [{ HellasUI }, D, P] = await Promise.all([import('./hellas-ui.js'), import('./hellas-data.js'), import('./hellas-plan.js')]);
  if (!document.querySelector('link[data-hellas-css]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./hellas.css' + V, import.meta.url).href; l.dataset.hellasCss = '1'; document.head.append(l);
    await new Promise((r) => { l.onload = l.onerror = r; setTimeout(r, 1500); });
  }
  const q = new URLSearchParams(location.search), lite = !!(O() && O().lite && O().lite()), tier = q.get('q') === 'low' || lite ? 'low' : q.get('q') === 'ultra' ? 'ultra' : 'high';
  const reduced = !!(O() && O().reduced && O().reduced()) || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ui = new HellasUI({ onClose: closeHellas, reduced }).mount();
  const S = session = { ui, scene: null, raf: 0, last: 0, closed: false, world: null };
  document.documentElement.classList.add('hellas-open'); if (O() && O().covered) O().covered(true);
  window.__hellas = { ui, tier, world: null, scene: null, ready: false, calls: () => (S.scene ? S.scene.calls : 0), tris: () => (S.scene ? S.scene.trisDrawn : 0) };
  // the data first (the header counter is honest from the first frame), then the scene
  const people = import('./people-talk.js').then((m) => m.loadKit()).catch(() => null);   // the shared People kit, optional (docs/PERSONA_API.md)
  let loaded; try { loaded = await D.loadSources(import.meta.url, { demo: q.get('demo') === '1', onStep: (t) => ui.step(t) }); } catch (e) { loaded = { inp: {}, fixture: {} }; }
  if (S.closed) return S;
  const world = D.buildPoleis(loaded.inp, loaded.fixture); Object.assign(world, P.layoutWorld(world.poleis, 'hellas', world.builders)); S.world = world; window.__hellas.world = world;
  try {
    if (q.get('gl') === '0') throw new Error('3D switched off');
    await people;   // at most 1.5 s: their own look and chat when the kit is there, ours when it is not
    const { Hellas } = await import('./hellas.js'); if (S.closed) return S;
    const scene = new Hellas(ui.canvas, world, { tier, reduced }); S.scene = scene; ui.attach(scene); window.__hellas.scene = scene;
    addEventListener('resize', onResize);
    const loop = (now) => {
      if (S.closed) return; S.raf = requestAnimationFrame(loop);
      const under = document.documentElement.classList.contains('athens-open'); if (S.under && !under && O() && O().covered) O().covered(true); S.under = under;
      if (document.hidden || under) return;
      const gap = Math.max(O() && O().frameGap ? O().frameGap() : 0, tier === 'low' ? 33 : 0);
      if (now - S.last < gap) return;
      const dt = Math.min(.1, (now - (S.last || now)) / 1000); S.last = now;
      scene.frame(dt, now / 1000); ui.frame();
    };
    S.raf = requestAnimationFrame(loop);
  } catch (err) {
    window.__hellasError = String((err && err.stack) || err); ui.setWorld(world); ui.noGL('This device cannot draw the 3D world. The map, the search and every card still work.'); window.__hellas.ready = true; return S;
  }
  ui.setWorld(world); window.__hellas.ready = true;
  return S;
}
function onResize() { if (session && session.scene) { session.scene.resize(); session.ui.drawMap(); } }
export function closeHellas() {
  if (!session) return; const S = session; S.closed = true; cancelAnimationFrame(S.raf); removeEventListener('resize', onResize);
  try { S.scene && S.scene.dispose(); } catch (e) { /* already gone */ }
  S.ui.unmount(); document.documentElement.classList.remove('hellas-open'); if (O() && O().covered) O().covered(false);
  session = null; delete window.__hellas; if (location.hash === '#hellas') history.replaceState(null, '', location.pathname + location.search);
}

function addButtons() {
  const mk = (cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = 'Enter Hellas'; b.setAttribute('aria-label', 'Enter Hellas, the world of hundreds of cities'); b.onclick = () => openHellas(); return b; };
  const actions = document.querySelector('.atlas-actions');
  if (actions && !actions.querySelector('.hellas-enter')) actions.append(mk('hellas-enter'));
  if (!document.querySelector('.hellas-fab')) document.body.append(mk('hellas-fab'));
}
function boot() {
  if (!document.querySelector('link[data-hellas-btn]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./hellas-btn.css' + V, import.meta.url).href; l.dataset.hellasBtn = '1'; document.head.append(l); }
  addButtons();
  if (location.hash === '#hellas' || new URLSearchParams(location.search).get('hellas') === '1') openHellas();
}
window.openHellas = openHellas; window.closeHellas = closeHellas;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
