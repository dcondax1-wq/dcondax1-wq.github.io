// Deterministic, scenery-only neighborhood ring around the real research city.
// The plan never adds rows to the model or changes any data-backed building.
export const SATELLITE_TOWNS = 48;

function nearestDistrictEdge(x, z, districts) {
  let best = null;
  for (const d of districts) {
    const edgeX = Math.max(d.cx - d.half, Math.min(d.cx + d.half, x));
    const edgeZ = Math.max(d.cz - d.half, Math.min(d.cz + d.half, z));
    const distance = Math.hypot(edgeX - x, edgeZ - z);
    if (!best || distance < best.distance) best = { x: edgeX, z: edgeZ, distance, key: d.key };
  }
  return best;
}

/** Make a connected ring of small residential towns outside the data districts. */
export function satellitePlan(districts, plazaR = 34) {
  const core = districts.filter((d) => d.kind !== 'harbor');
  const extent = Math.max(plazaR, ...core.map((d) => Math.hypot(Math.abs(d.cx) + d.half, Math.abs(d.cz) + d.half)));
  // Leave a clean belt before the broader, existing outskirts. A minimum ring keeps tiny demo maps legible.
  const radius = Math.max(130, extent + 10);
  const towns = [], links = [], streets = [];
  for (let i = 0; i < SATELLITE_TOWNS; i++) {
    const angle = (i / SATELLITE_TOWNS) * Math.PI * 2 - 0.74 + Math.sin(i * 2.17) * 0.018;
    const r = radius + Math.sin(i * 1.71) * 4.5;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const edge = nearestDistrictEdge(x, z, core);
    const town = { id: i, x, z, angle, radius: r, accent: i >= 40 && i <= 44 };
    towns.push(town);
    if (edge) links.push({ from: [x, z], to: [edge.x, edge.z], kind: 'district', district: edge.key });
    // Roads are visual-only. The generated streets feed the city's existing instanced road shader / traffic lights.
    if (edge) streets.push([x, z, edge.x, edge.z]);
  }
  towns.forEach((town, i) => {
    const next = towns[(i + 1) % SATELLITE_TOWNS];
    links.push({ from: [town.x, town.z], to: [next.x, next.z], kind: 'ring' });
    streets.push([town.x, town.z, next.x, next.z]);
  });
  return { towns, links, streets, radius, worldRadius: radius + 8 };
}
