// Visual navigation routes only. They do not encode correlation, flow, or a trade signal.
// Local streets reach every city; one capital trunk connects each district to Olympus HQ.
function localTree(members) {
  const cities = members.slice().sort((a, b) => a.i - b.i);
  if (cities.length < 2) return [];
  const root = cities.find((city) => city.capital) || cities[0];
  const connected = [root];
  const remaining = new Set(cities.filter((city) => city !== root));
  const links = [];

  // A deterministic Prim tree keeps decorative streets near the region-sorted city layout.
  while (remaining.size) {
    let best = null;
    let bestDistance = Infinity;
    for (const from of connected) {
      for (const to of remaining) {
        const dx = from.x - to.x;
        const dz = from.z - to.z;
        const distance = dx * dx + dz * dz;
        const tied = best && Math.abs(distance - bestDistance) <= 1e-9;
        const winsTie = tied && (to.i < best.to.i || (to.i === best.to.i && from.i < best.from.i));
        if (!best || distance < bestDistance - 1e-9 || winsTie) {
          best = { from, to };
          bestDistance = distance;
        }
      }
    }
    if (!best) break;
    links.push([best.from.i, best.to.i]);
    connected.push(best.to);
    remaining.delete(best.to);
  }
  return links;
}

export function cityRoutes(islands, worlds) {
  const groups = new Map(worlds.map((world) => [world.key, []]));
  for (const island of islands) {
    if (!groups.has(island.cont)) groups.set(island.cont, []);
    groups.get(island.cont).push(island);
  }
  const links = [], bridges = [], anchors = [];
  for (const members of groups.values()) {
    if (!members.length) continue;
    const capital = members.find((island) => island.capital) || members[0];
    anchors.push(capital.i);
    links.push(...localTree(members));
  }
  const hq = islands.find((island) => island.hq)?.i ?? anchors[0];
  for (const anchor of anchors) {
    if (anchor === hq) continue;
    bridges.push([hq, anchor]);
  }
  return { links: [...links, ...bridges], bridges, hq, anchors };
}
