// Pure, deterministic skyline composition for the scenery-only outer metropolis.
// None of these forms represent research rows or trading state; they only stop
// the decorative outskirts from reading as an even field of random boxes.

/** Return the proportions for one decorative outskirts tower.
 *  angle: polar angle around the research city
 *  depth: 0 at the inner edge, 1 at the fog edge
 *  seed: deterministic 0..1 variation supplied by the caller
 */
export function skylineForm(angle, depth, seed) {
  // Fourteen recognizable small-city crowns repeat around the outer ring.
  const cluster = Math.pow(0.5 + 0.5 * Math.cos(angle * 14 + 0.62), 8);
  const shoulder = Math.pow(0.5 + 0.5 * Math.cos(angle * 7 - 0.9), 4) * 0.42;
  const ridge = Math.exp(-Math.pow((depth - 0.34) / 0.3, 2));
  const crown = seed > 0.955 || (cluster > 0.88 && seed > 0.78);
  const height = 4.5 + (12 + 54 * cluster + 20 * shoulder + (crown ? 34 : 0)) * ridge + seed * 10;
  return {
    cluster,
    crown,
    height: height * (1 - depth * 0.25),
    width: 1.35 + seed * 1.35 + cluster * 1.35,
  };
}

/** Plan a segmented orbital boulevard, omitting sections that cross protected scenery. */
export function boulevardPlan(radius, blocked = () => false, segments = 192) {
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    const mid = (a + b) / 2;
    const x = Math.cos(mid) * radius, z = Math.sin(mid) * radius;
    if (blocked(x, z)) continue;
    out.push({
      x,
      z,
      angle: -mid - Math.PI / 2,
      length: 2 * radius * Math.sin((b - a) / 2) + 0.12,
      a,
      b,
    });
  }
  return out;
}
