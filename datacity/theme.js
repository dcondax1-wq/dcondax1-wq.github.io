// Themes of the Data City. ONE entry point: applyTheme(tokens) sets the page's CSS tokens and the scene's accent (plaza
// glow, water, tower tint, the sky's city glow). When the OLYMPUS kit has themes (Olympus.theme() / Olympus.onTheme(cb)),
// watchTheme() follows them; until then the city keeps its own night palette and the kit's per-app accent.
//   tokens: { accent: '#78a1c1', bg: '#05060f', panel: 'rgba(..)', text: '#f4f4f6', sub: '#aeb3c6', line: 'rgba(..)' }
const CSS = { accent: '--accent', bg: '--bg', panel: '--panel', text: '--text', sub: '--sub', line: '--line' };
const SAFE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;

export function applyTheme(tokens, city) {
  if (!tokens || typeof tokens !== 'object') return;
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(CSS)) if (typeof tokens[k] === 'string' && SAFE.test(tokens[k].trim())) root.setProperty(v, tokens[k].trim());
  if (city && typeof tokens.accent === 'string' && /^#[0-9a-f]{6}$/i.test(tokens.accent)) city.setAccent(tokens.accent);
  if (typeof tokens.bg === 'string' && /^#[0-9a-f]{6}$/i.test(tokens.bg)) document.body.style.background = tokens.bg;
}

/** Follow the OLYMPUS kit's theme when it has one; returns true when it does. */
export function watchTheme(cb) {
  const O = window.OLYMPUS || window.Olympus;
  let on = false;
  try { if (O && typeof O.theme === 'function') { const t = O.theme(); if (t) cb(t); on = true; } } catch (e) { /* the kit's theme is optional */ }
  try { if (O && typeof O.onTheme === 'function') { O.onTheme(cb); on = true; } } catch (e) { /* the kit's theme is optional */ }
  return on;
}
