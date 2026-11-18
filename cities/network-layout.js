// Deterministic city-network placement. Every published city stays a selectable
// island; the gold core is a real catalogue city, while the six districts are
// neighborhoods in one connected metropolis.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Keep selector DOM/render work bounded on phones while every match remains reachable.
export function cityResultPage(items, offset = 0, limit = 60) {
  const start = Math.max(0, Math.floor(offset));
  const size = Math.max(1, Math.floor(limit));
  return items.slice(start, start + size);
}

function hash32(value) {
  let h = 2166136261;
  for (const ch of String(value)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Arrange one real catalogue city at Olympus HQ, one real district capital at
 * each neighborhood center, and the rest as deterministic satellite cities.
 * This returns only 173 small map records; scene.js batches them into its
 * existing capped instanced draw, so adding catalog entries does not add draws.
 */
export function planCityNetwork(specs, groups, hqId = 'trades-city') {
  const by = new Map(Object.keys(groups).map((key) => [key, []]));
  specs.forEach((spec, index) => {
    if (!by.has(spec.group)) by.set(spec.group, []);
    by.get(spec.group).push(index);
  });
  const districts = [...by.entries()].filter(([, ids]) => ids.length);
  const requestedHq = specs.findIndex((spec) => spec.id === hqId);
  const hqIndex = requestedHq >= 0 ? requestedHq :
    (districts.find(([key]) => key === 'trading')?.[1][0] ?? 0);
  const hqGroup = specs[hqIndex]?.group;
  const others = districts.filter(([key]) => key !== hqGroup);
  const centerRadius = others.length ? 118 : 0;
  const positions = new Array(specs.length);
  const outDistricts = [];

  for (const [key, rawIds] of districts) {
    const ids = rawIds.slice().sort((a, b) => {
      const left = specs[a].region || '';
      const right = specs[b].region || '';
      return left.localeCompare(right) || a - b;
    });
    if (key === hqGroup) {
      ids.splice(ids.indexOf(hqIndex), 1);
      ids.unshift(hqIndex);
    }
    const ringIndex = key === hqGroup ? -1 : others.findIndex(([id]) => id === key);
    const angle = ringIndex < 0 ? 0 : -Math.PI / 2 + (ringIndex / Math.max(1, others.length)) * Math.PI * 2;
    const cx = ringIndex < 0 ? 0 : Math.cos(angle) * centerRadius;
    const cz = ringIndex < 0 ? 0 : Math.sin(angle) * centerRadius;
    let extent = 0;

    ids.forEach((cityIndex, order) => {
      const spec = specs[cityIndex];
      const central = cityIndex === hqIndex;
      const capital = central || order === 0;
      const seed = (hash32(spec.id) % 1000) / 1000;
      let x = cx;
      let z = cz;
      if (!capital) {
        const satelliteOrder = central ? order : order - 1;
        const localAngle = satelliteOrder * GOLDEN_ANGLE + angle * 0.16;
        const radius = 46 + 28 * Math.sqrt(satelliteOrder + 0.5);
        x += Math.cos(localAngle) * radius;
        z += Math.sin(localAngle) * radius;
      }
      const R = central ? 46 : capital ? 31 : 22 + seed * 4;
      positions[cityIndex] = {
        spec, i: cityIndex, cont: key, x, z,
        // A shared level gives the districts the feel of one connected city.
        y: central ? 0 : capital ? 0.15 : ((hash32(`${spec.id}:y`) % 5) - 2) * 0.12,
        R, seed, hq: central, capital,
        top: spec.palette.ground,
        rim: central ? '#ffd878' : spec.palette.accent,
      };
      extent = Math.max(extent, Math.hypot(x - cx, z - cz) + R);
    });

    const group = groups[key] || [key, '#c9a06a'];
    outDistricts.push({
      key, name: group[0], color: group[1], x: cx, z: cz,
      r: Math.max(48, extent), count: ids.length,
      regions: [...new Set(ids.map((index) => specs[index].region).filter(Boolean))],
      capitalId: specs[ids[0]]?.id || null,
      hq: key === hqGroup,
    });
  }

  const radius = positions.reduce((max, city) => Math.max(max, Math.hypot(city.x, city.z) + city.R), 1);
  return { islands: positions, districts: outDistricts, radius, hqIndex, hqGroup };
}
