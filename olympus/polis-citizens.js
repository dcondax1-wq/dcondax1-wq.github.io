// POLIS citizens (QA round 6, 2026-11-11): a few citizens of the rolls walk the Acropolis streets of the painted Polis skyline: photos of their rigged 3D
// selves (olympus/people-studio.js atlas with views, the KayKit cast dressed as our people), drawn by polis-skyline.js setCitizens(). Phone-high only:
// LITE, reduced motion, ?rig=0 or no WebGL = the painted city as before. Loaded as its own module after the page is up; never blocks the first paint.
const W = window;
const lite = () => { try { return !!(W.OLYMPUS && W.OLYMPUS.lite && W.OLYMPUS.lite()); } catch (e) { return false; } };
const reduced = () => { try { return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
function go(tries) {
  const P = W.POLIS, S = P && P.state, city = S && S.city;
  if (!P || !P.ready || !P.ready() || !city) { if (tries < 120) setTimeout(() => go(tries + 1), 500); return; }
  if (lite() || reduced() || !city.setCitizens) return;
  const R = S.model && S.model.rolls;
  let list = (R && R.list ? R.list : []).filter((c) => c && c.id).slice(0, 9);
  if (list.length < 3) list = ['citizen:a', 'citizen:b', 'citizen:c', 'citizen:d', 'citizen:e', 'citizen:f'].map((id) => ({ id }));
  Promise.all([import('./people3d.js'), import('./people-studio.js')]).then(([P3, ST]) => {
    const specs = list.map((c) => { try { return P3.spec(c.id); } catch (e) { return P3.spec('someone'); } });
    return ST.atlas(specs, { views: true, cell: [72, 90] });
  }).then((A) => { if (A && S.city === city) { city.setCitizens(A, list); S.citizens = list.length; } }).catch(() => { /* the painted city stays */ });
}
setTimeout(() => go(0), 900);
