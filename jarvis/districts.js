// The five districts of OLYMPUS (2026-11-10): the same names, order, colours and app lists as the Atlas map (atlas/atlas.js `zones`), so the
// orb's ring menu, the Jarvis home and the 3D courtyard all speak the same way. Plain data + pure functions: no DOM, no imports.
//
//   DISTRICTS                 [{ id, title, colour, tint, ids }] in Atlas order: Market, Research, Money, Command, Life
//   districtOf(app)           the district id for an app ({id, group?}): the Atlas list first, else its group (trading = market, money = money,
//                             life = life), else command
//   byDistrict(apps)          [{ ...district, apps: [...] }] with every app in exactly one district (empty districts are kept, in order)
//   searchApps(apps, q)       apps whose name / id / sub / purpose contains every word of q (case-insensitive); an empty q returns all
// The Atlas page keeps its own copy of the lists (its tests pin them); tests.test_jarvis_home_agora checks the two stay equal
// (Atlas calls the Money district 'risk').
export const DISTRICTS = [
  { id: 'market', title: 'Market', colour: '#c8a24a', tint: '#d9b25a', ids: ['zenith', 'oracle', 'ares', 'forum', 'chronos', 'cities', 'odeon', 'pantheon', 'delphi', 'kronos'] },
  { id: 'research', title: 'Research', colour: '#4b7a99', tint: '#7fa3b8', ids: ['datacity', 'observatory', 'tree', 'prometheus', 'hephaestus', 'nemesis', 'clio', 'fates', 'moirai'] },
  { id: 'money', title: 'Money', colour: '#7f8a52', tint: '#a3ad6a', ids: ['ledger', 'hera', 'plutus', 'pnyx', 'demeter', 'labyrinth', 'kalshi', 'kalshicity', 'tyche', 'dionysus', 'hermes', 'mint', 'mintcity', 'mercury', 'chrysos', 'sibyl', 'oikos', 'arbiter', 'aegis'] },
  { id: 'command', title: 'Command', colour: '#c96a4a', tint: '#c98a6a', ids: ['hestia', 'inbox', 'argus', 'bridge', 'settings', 'atlas', 'stoa', 'kratos', 'argo'] },
  { id: 'life', title: 'Life', colour: '#9c6b3c', tint: '#e0b060', ids: ['planner', 'mind', 'arena', 'journal', 'athena', 'apollo', 'lyceum', 'nike', 'epilogue', 'gallery'] },
];
const BY_GROUP = { trading: 'market', money: 'money', life: 'life' };
export function districtOf(app) {
  const id = app && typeof app.id === 'string' ? app.id : '';
  for (const d of DISTRICTS) if (d.ids.indexOf(id) >= 0) return d.id;
  const g = app && typeof app.group === 'string' ? app.group : '';
  return BY_GROUP[g] || 'command';
}
export function byDistrict(apps) {
  const list = Array.isArray(apps) ? apps.filter((a) => a && typeof a.id === 'string') : [];
  return DISTRICTS.map((d) => ({ id: d.id, title: d.title, colour: d.colour, tint: d.tint, ids: d.ids, apps: list.filter((a) => districtOf(a) === d.id) }));
}
export function searchApps(apps, q) {
  const words = String(q == null ? '' : q).toLowerCase().split(/\s+/).filter(Boolean);
  const list = Array.isArray(apps) ? apps : [];
  if (!words.length) return list.slice();
  return list.filter((a) => { const hay = [a && a.name, a && a.id, a && a.sub, a && a.purpose].join(' ').toLowerCase(); return words.every((w) => hay.indexOf(w) >= 0); });
}
