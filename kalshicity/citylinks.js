// Static analysis sightlines between published places. These are not live bot traffic.
export const LINK_SEGMENTS = 12;

export function cityLinks(L, highlights = {}) {
  const districts = Array.isArray(L?.districts) ? L.districts : [];
  const labs = Array.isArray(L?.labs) ? L.labs : [];
  const buildings = Array.isArray(L?.buildings) ? L.buildings : [];
  const core = districts.find((d) => d.key === 'Downtown') || districts[0];
  if (!core) return [];
  const origin = { x: core.cx, y: 11, z: core.cz };
  const routes = [];
  const add = (kind, target, color) => {
    if (!target || ![target.x, target.y, target.z].every(Number.isFinite)) return;
    const points = Array.from({ length: LINK_SEGMENTS + 1 }, (_, i) => {
      const t = i / LINK_SEGMENTS;
      return { x: origin.x + (target.x - origin.x) * t,
        y: origin.y + (target.y - origin.y) * t + Math.sin(Math.PI * t) * 18,
        z: origin.z + (target.z - origin.z) * t };
    });
    routes.push({ kind, color, points });
  };
  const tower = (id) => buildings.find((b) => b.id === id && !b.lab);
  const best = tower(highlights.bestId), worst = tower(highlights.worstId);
  if (best) add('edge', { x: best.x, y: Math.min(34, best.fullH || 0) + 5, z: best.z }, '#d9a26b');
  if (worst && worst.id !== best?.id) add('leak', { x: worst.x, y: Math.min(34, worst.fullH || 0) + 5, z: worst.z }, '#cc7f64');
  if (labs.length) add('research', { x: labs[0].cx, y: 9, z: labs[0].cz }, '#9cbad2');
  districts.filter((d) => d !== core).slice(0, 10).forEach((d) => add('city', { x: d.cx, y: 8, z: d.cz }, d.color || '#80a7c5'));
  labs.slice(1, 11).forEach((d) => add('research', { x: d.cx, y: 9, z: d.cz }, '#9cbad2'));
  return routes.slice(0, 23);
}
