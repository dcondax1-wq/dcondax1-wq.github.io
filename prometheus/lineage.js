// THE FORGE: the lineage graph (an SVG, no WebGL). Generations run left to right, each generation fittest at the top.
// Every creature is a dot coloured by its heat; the champion's whole ancestry (both parents, back to generation 1) is
// drawn as gold edges, its main line thick and glowing; a selected creature's ancestry is drawn in ice; the slider's
// generation is a lit column. Taps pick the nearest dot (within 16 px): pickAt(svg, F, x, y) -> creature id.
export const PAD = { l: 18, r: 10, t: 12, b: 22 };

export function heatRgb(h) {             // the arena's ramp: ember -> red -> fire -> gold -> white
  const stops = [[0, [122, 18, 6]], [0.3, [255, 61, 46]], [0.6, [255, 122, 26]], [0.85, [255, 194, 74]], [1, [255, 244, 214]]];
  let i = 0;
  while (i < stops.length - 2 && h > stops[i + 1][0]) i++;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1], t = Math.max(0, Math.min(1, (h - a) / (b - a)));
  return `rgb(${ca.map((x, j) => Math.round(x + (cb[j] - x) * t)).join(',')})`;
}

function geo(F, w, h) {
  const G = F.nGens, P = Math.max(...F.d.gens.map((g) => g.length));
  return {
    x: (g) => PAD.l + (G > 1 ? g / (G - 1) : 0.5) * (w - PAD.l - PAD.r),
    y: (r) => PAD.t + (P > 1 ? r / (P - 1) : 0.5) * (h - PAD.t - PAD.b),
  };
}

/** the graph's markup; gen = the slider's generation, sel = a selected creature id (or null) */
export function lineageSvg(F, { gen = 0, sel = null, w = 320, h = 250 } = {}) {
  const X = geo(F, w, h), champ = F.d.champion, anc = new Set(champ.ancestors || []), main = new Set(champ.line);
  anc.add(champ.id);
  const selA = sel != null && sel !== 'live' ? F.ancestry(sel) : new Set();
  const pt = (id) => { const c = F.creature(id); return [X.x(c.gen), X.y(F.rank(id))]; };
  const path = (pairs, cls) => pairs.length ? `<path class="${cls}" d="${pairs.map(([a, b]) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b), mx = (x1 + x2) / 2;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}C${mx.toFixed(1)} ${y1.toFixed(1)} ${mx.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }).join('')}"/>` : '';
  const mainPairs = F.edges(main).filter(([a, b]) => main.has(a) && main.has(b));
  let dots = '';
  F.d.gens.forEach((G, g) => G.forEach((c, r) => {
    const cls = c.id === champ.id ? 'champ' : main.has(c.id) ? 'main' : anc.has(c.id) ? 'anc' : selA.has(c.id) ? 'sel' : '';
    const rad = cls === 'champ' ? 5 : cls === 'main' ? 3.6 : cls ? 2.8 : 2;
    dots += `<circle cx="${X.x(g).toFixed(1)}" cy="${X.y(r).toFixed(1)}" r="${rad}" data-id="${c.id}"${cls ? ` class="${cls}"` : ''} fill="${heatRgb(F.heat(c.f))}"/>`;
  }));
  const gx = X.x(gen);
  const ticks = F.d.gens.map((_, g) => (g % 5 === 4 || g === 0 ? `<text x="${X.x(g).toFixed(1)}" y="${h - 6}">${g + 1}</text>` : '')).join('');
  return `<svg class="lineage" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Lineage: generations left to right, fittest at the top">
    <rect class="col" x="${(gx - 6).toFixed(1)}" y="${PAD.t - 8}" width="12" height="${h - PAD.t - PAD.b + 16}" rx="6"/>
    ${path(F.edges(anc), 'e-anc')}${path(F.edges(selA), 'e-sel')}${path(mainPairs, 'e-main')}
    <g class="dots">${dots}</g><g class="ticks">${ticks}<text x="${PAD.l - 4}" y="${PAD.t + 3}" class="lab">fit</text></g></svg>`;
}

/** the creature under a tap (client px), the nearest dot within 16 px, or null */
export function pickAt(svg, F, cx, cy) {
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  if (!r.width || !vb || !vb.width) return null;
  const s = r.width / vb.width, X = geo(F, vb.width, vb.height);
  let best = null, bd = 16 * 16;
  F.d.gens.forEach((G, g) => G.forEach((c, k) => {
    const dx = r.left + X.x(g) * s - cx, dy = r.top + X.y(k) * s - cy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = c.id; }
  }));
  return best;
}
