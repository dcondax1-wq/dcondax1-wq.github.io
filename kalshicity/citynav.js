// City navigation helpers: labels and camera framing only, never market logic.
export function districtTitle(district) {
  return district && district.key === 'Downtown' ? 'Market HQ' : String(district?.name || district?.key || 'Market district');
}

export function districtOptionLabel(district, demo = false) {
  const count = Number.isFinite(district?.count) ? district.count : 0;
  const source = demo ? 'demo' : 'published';
  return `${districtTitle(district)} · ${count} ${source} ${count === 1 ? 'edge' : 'edges'}`;
}

/** Frame a real market district as a neighborhood-sized view inside the shared city. */
export function districtCamera(district) {
  const half = Number.isFinite(district?.half) ? Math.max(4, district.half) : 8;
  return {
    x: Number.isFinite(district?.cx) ? district.cx : 0,
    y: Math.max(4, Math.min(12, half * 0.34)),
    z: Number.isFinite(district?.cz) ? district.cz : 0,
    radius: Math.max(30, Math.min(170, half * 2.35)),
    phi: 0.94,
  };
}
