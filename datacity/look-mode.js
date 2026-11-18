// The two looks of the Data City (owner 2026-11-18: "our Data City we had that looked techy ... bring it back").
//   'neon'   the night metropolis of 2026-11-07 (deep navy, cyan / violet / gold data light, Orbitron + Rajdhani): the DEFAULT again
//   'agora'  the marble-and-bronze restyle of 2026-11-09 (commits 157ed041, a431c444, 1a39b543, e2188a20, 88824c85): an option
// Picked once per load: ?look=neon|agora (remembered), else localStorage 'datacity.look', else neon. The scene's materials and shaders
// are built with the look's colours, so a change reloads the page (setLook). index.html reads the same key before the first paint
// (html[data-dc-look], the AGORA sheet switched off under neon). Every switch in the code is `NEON ? <neon> : <agora>`.
export const KEY = 'datacity.look';
export const LOOKS = Object.freeze(['neon', 'agora']);

export function readLook(search, store) {
  let q = null;
  try { q = new URLSearchParams(search ?? location.search).get('look'); } catch (e) { /* no location (node test) */ }
  if (LOOKS.includes(q)) { try { (store ?? localStorage).setItem(KEY, q); } catch (e) { /* private mode */ } return q; }
  let s = null;
  try { s = (store ?? localStorage).getItem(KEY); } catch (e) { /* storage blocked */ }
  return LOOKS.includes(s) ? s : 'neon';
}

export const LOOK = readLook();
export const NEON = LOOK === 'neon';

/** switch the look (remembered on this phone) and rebuild the city */
export function setLook(v) {
  if (!LOOKS.includes(v)) return false;
  try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: this load only */ }
  try { const u = new URL(location.href); u.searchParams.set('look', v); location.replace(u.toString()); } catch (e) { location.reload(); }
  return true;
}
