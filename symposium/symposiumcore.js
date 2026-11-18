// SYMPOSIUM core (pure, node-tested): the hall where you meet everyone. No DOM, no storage, no network.
//   seats(n)                 where each couch seat is around the table (a ring, two to a couch), facing the krater
//   order(people)            who sits next to whom (colleagues together)
//   front(seats, yaw, k)     the k seats nearest the camera (they get a tappable portrait)
//   scopeIds / pairs / newFaces / blockedSummary / groupRequests / requestsJson / jarvisCard
//   LOOKS / cycle / randomLook: the choices of "Make my character"
export const KIND_ORDER = ['bot', 'scanner', 'mind', 'builder', 'keeper', 'champion'];
export const KIND_NAME = { bot: 'Bots', scanner: 'Money scanners', mind: 'Thinkers and jobs', builder: 'Build agents', keeper: 'Keepers', champion: 'Champions and rejected ideas', villager: 'Villagers' };
export const SCOPES = [['all', 'Everyone'], ['bot', 'Bots'], ['scanner', 'Scanners'], ['mind', 'Thinkers'], ['builder', 'Builders'], ['keeper', 'Keepers'], ['champion', 'Champions']];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
export function clean(t, n) { const s = String(t == null ? '' : t).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

/** colleagues sit together: bots, scanners, thinkers, builders, keepers, champions */
export function order(people) {
  const P = arr(people).filter(isObj);
  return P.slice().sort((a, b) => { const x = KIND_ORDER.indexOf(a.kind), y = KIND_ORDER.indexOf(b.kind); return (x < 0 ? 9 : x) - (y < 0 ? 9 : y) || P.indexOf(a) - P.indexOf(b); });
}
export function groups(people) {
  const out = [];
  for (const k of KIND_ORDER.concat(['villager'])) { const g = arr(people).filter((p) => p.kind === k); if (g.length) out.push({ kind: k, name: KIND_NAME[k], people: g }); }
  return out;
}
/** n seats on a ring around the table. Each: { x, z, ry (faces the centre), couch (index), side (0 | 1) }. radius grows with n so nobody overlaps. */
export function seats(n) {
  const N = Math.max(1, Math.floor(n) || 1), gap = 0.74, r = Math.max(2.3, (N * gap) / (2 * Math.PI)), out = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r; out.push({ x, z, ry: Math.atan2(-x, -z), a, couch: Math.floor(i / 2), side: i % 2 }); }
  return { r, seats: out, couches: Math.ceil(N / 2) };
}
/** the couch between two seats: its centre and heading */
export function couchAt(layout, c) {
  const a = layout.seats[c * 2], b = layout.seats[c * 2 + 1] || a, x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, wide = b !== a;
  return { x, z, ry: Math.atan2(-x, -z), wide };
}
/** the camera circles the hall at angle yaw (it stands at sin(yaw), cos(yaw)); the k seats closest to it, nearest first */
export function front(layout, yaw, k) {
  const S = layout.seats.map((s, i) => { let d = Math.abs(((s.a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return { i, d }; });
  S.sort((a, b) => a.d - b.d);
  return S.slice(0, Math.max(0, k)).map((s) => s.i);
}
/** the yaw that brings seat i to the front */
export function yawFor(layout, i) { const s = layout.seats[i]; return s ? s.a : 0; }
/** the shortest way from yaw a to yaw b */
export function turn(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

export function scopeIds(people, scope) { return arr(people).filter((p) => scope === 'all' || !scope || p.kind === scope).map((p) => p.id); }

/** the ready-made duels: two scanners, two champions, a bot against a rejected idea, a builder against the scribe */
export function pairs(people) {
  const P = arr(people), by = (k) => P.filter((p) => p.kind === k), out = [];
  const sc = by('scanner'), ch = by('champion').filter((p) => !p.fallen), fallen = by('champion').filter((p) => p.fallen), bots = by('bot'), mind = by('mind'), bl = by('builder');
  if (sc.length >= 2) out.push({ a: sc[0].id, b: sc[1].id, label: sc[0].name + ' and ' + sc[1].name, topic: 'Who found more for the owner?' });
  if (ch.length >= 2) out.push({ a: ch[0].id, b: ch[1].id, label: ch[0].name + ' and ' + ch[1].name, topic: 'Who makes more money?' });
  if (bots.length && fallen.length) out.push({ a: bots[0].id, b: fallen[0].id, label: bots[0].name + ' and ' + fallen[0].name + ' (a rejected idea)', topic: 'What could go wrong?' });
  if (ch.length && fallen.length) out.push({ a: ch[0].id, b: fallen[0].id, label: ch[0].name + ' and ' + fallen[0].name + ' (a rejected idea)', topic: 'How did the earlier years go?' });
  if (bots.length >= 2) out.push({ a: bots[0].id, b: bots[1].id, label: bots[0].name + ' and ' + bots[1].name, topic: 'How did today go?' });
  if (bl.length && mind.length) out.push({ a: bl[0].id, b: mind[mind.length - 1].id, label: bl[0].name + ' and ' + mind[mind.length - 1].name, topic: 'What are you doing?' });
  return out.slice(0, 6);
}
/** ready-made groups of two or three who talk to each other (Round table, "Let them talk") */
export function trios(people) {
  const P = arr(people), by = (k) => P.filter((p) => p.kind === k), out = [], names = (g) => g.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const bots = by('bot'), sc = by('scanner'), mind = by('mind'), ch = by('champion').filter((p) => !p.fallen), fallen = by('champion').filter((p) => p.fallen), bl = by('builder');
  const add = (g, topic, what) => { if (g.length >= 2) out.push({ ids: g.map((p) => p.id), label: names(g), topic, what }); };
  add(bots.slice(0, 3), 'How did today go?', 'the bots');
  add(sc.slice(0, 3), 'What did you find?', 'the money scanners');
  add(mind.slice(0, 3), 'What did you learn?', 'the thinkers');
  add(ch.slice(0, 1).concat(fallen.slice(0, 1), bots.slice(0, 1)), 'How did the earlier years go?', 'a champion, a rejected idea and a bot');
  add(bl.slice(0, 2).concat(mind.slice(0, 1)), 'What are you doing?', 'the builders');
  return out.slice(0, 5);
}
/** who has something from the last 36 hours (real data only): "new or active today" */
export function newFaces(rows, now, limit) {
  const H36 = 36 * 3600000, out = [];
  for (const r of arr(rows)) {
    const f = r.facts; if (!isObj(f) || f.sample) continue;
    const t = f.asof ? Date.parse(f.asof) : NaN;
    if (isFinite(t) && now - t <= H36 && now - t > -3600000) out.push({ id: r.person.id, name: r.person.name, t, why: f.status === 'working' ? 'working now' : 'updated today' });
  }
  out.sort((a, b) => b.t - a.t);
  return out.slice(0, limit || 12);
}
export function headline(rows) {
  const R = arr(rows), n = R.length, blocked = R.filter((r) => r.facts && r.facts.blocked).length, sample = R.filter((r) => r.facts && r.facts.sample).length, working = R.filter((r) => r.facts && r.facts.status === 'working').length;
  const text = n + ' people in the hall. ' + working + ' working, ' + blocked + ' blocked' + (sample ? ', ' + sample + ' showing sample data (not real)' : '') + '.';
  return { n, blocked, sample, working, text, demo: n > 0 && sample === n };
}

/** the notes the owner left, grouped per person, newest person first */
export function groupRequests(reqs, nameOf) {
  const by = new Map();
  for (const r of arr(reqs)) { if (!isObj(r) || !r.id || !r.text) continue; if (!by.has(r.id)) by.set(r.id, []); by.get(r.id).push(r); }
  const out = [];
  for (const [id, rows] of by) { rows.sort((a, b) => String(a.time).localeCompare(String(b.time))); out.push({ id, name: (nameOf && nameOf(id)) || rows[0].name || id, rows, last: rows[rows.length - 1].time }); }
  out.sort((a, b) => String(b.last).localeCompare(String(a.last)));
  return out;
}
export function requestsJson(reqs, nameOf, when) {
  return JSON.stringify({ v: 1, what: 'OLYMPUS request box: notes the owner left for his workers. Nothing here was sent anywhere.', exported: when || '', requests: arr(reqs).filter((r) => isObj(r) && r.id && r.text).map((r) => ({ id: r.id, name: (nameOf && nameOf(r.id)) || r.name || '', text: clean(r.text, 600), time: String(r.time || '') })) }, null, 1);
}
export function whenText(iso) { const s = String(iso || ''); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 10) + ' ' + s.slice(11, 16) + ' UTC' : ''; }

/** the status card Jarvis shows for this app */
export function jarvisCard(head, reqN, t) {
  const h = head || { n: 0, blocked: 0, working: 0, sample: 0, demo: true };
  return { v: 1, name: 'Symposium', status: { level: h.demo ? 'off' : h.blocked ? 'warn' : 'ok', label: h.demo ? 'Demo data' : h.blocked ? h.blocked + ' blocked' : 'Everyone is fine' },
    kpis: [{ label: 'People', value: String(h.n) }, { label: 'Working', value: String(h.working) }, { label: 'Requests', value: String(reqN || 0) }],
    lines: [clean(h.text || 'Meet everyone who works for you.', 120), 'Tap anyone to talk. They only say what their own files say.'], t: Math.floor(t || 0), open: '#', theme: '#14110e', stale_after: 604800 };
}

// ------------------------------------------------------------------------------------------------ make my character
export const LOOKS = [
  { key: 'skin', label: 'Skin', type: 'colour', from: 'SKINS' }, { key: 'hair', label: 'Hair colour', type: 'colour', from: 'HAIRS' }, { key: 'hairStyle', label: 'Hair', type: 'word', from: 'HAIR_STYLES' },
  { key: 'outfit', label: 'Chiton', type: 'colour', from: 'OUTFITS' }, { key: 'accent', label: 'Trim', type: 'colour', from: 'OUTFITS' }, { key: 'build', label: 'Build', type: 'word', from: 'BUILDS' },
  { key: 'face.eyes', label: 'Eyes', type: 'word', from: 'EYES' }, { key: 'face.brows', label: 'Brows', type: 'word', from: 'BROWS' }, { key: 'face.mouth', label: 'Mouth', type: 'word', from: 'MOUTHS' },
  { key: 'face.beard', label: 'Beard', type: 'word', from: 'BEARD_SET' }, { key: 'accessory', label: 'Carries', type: 'word', from: 'CARRY' },
];
export const BEARD_SET = ['none', 'short', 'full', 'moustache'];
export const CARRY = ['none', 'laurel', 'scroll', 'hammer', 'pouch', 'key', 'torch', 'owl', 'helmet'];
export const WORD = { none: 'None', short: 'Short', curly: 'Curly', bun: 'Bun', long: 'Long', bob: 'Bob', wavy: 'Wavy', topknot: 'Top knot', bald: 'Bald', slim: 'Slim', round: 'Round', broad: 'Broad', dot: 'Dots', oval: 'Ovals', wide: 'Wide', smile: 'Smiling',
  flat: 'Flat', arched: 'Arched', slant: 'Stern', thick: 'Thick', grin: 'Grin', small: 'Small', full: 'Full', moustache: 'Moustache', laurel: 'Laurel', scroll: 'Scroll', hammer: 'Hammer', pouch: 'Coin pouch', key: 'Key', torch: 'Torch', owl: 'Owl', helmet: 'Helmet' };
export const COLOUR_NAME = { '#f1cfa9': 'Light', '#e8b98d': 'Fair', '#d9a273': 'Tan', '#c48a5c': 'Bronze', '#a36d45': 'Brown', '#7d5233': 'Deep brown', '#2a2019': 'Black', '#4a3323': 'Dark brown', '#6f4a2c': 'Chestnut', '#8a4b2a': 'Auburn', '#b98a4a': 'Sand',
  '#d9c08a': 'Blond', '#8c867c': 'Grey', '#e6e0d2': 'White', '#c8a24a': 'Gold', '#7f8a52': 'Olive', '#c96a4a': 'Terracotta', '#4b7a99': 'Aegean blue', '#e9dfc9': 'Ivory', '#9c6b3c': 'Bronze', '#a9764c': 'Clay', '#8fa07a': 'Sage', '#d9b25a': 'Sun gold', '#b5563c': 'Brick' };
export function getLook(spec, key) { return key.indexOf('face.') === 0 ? (spec.face || {})[key.slice(5)] : spec[key]; }
/** a new look object with one choice changed (the stored form: flat keys + face{}) */
export function setLook(look, key, value) {
  const L = { ...(isObj(look) ? look : {}), face: { ...((isObj(look) && isObj(look.face)) ? look.face : {}) } };
  if (key.indexOf('face.') === 0) L.face[key.slice(5)] = value; else L[key] = value;
  return L;
}
/** every choice from a spec, as the stored look */
export function lookOf(spec) { return { skin: spec.skin, hair: spec.hair, hairStyle: spec.hairStyle, outfit: spec.outfit, accent: spec.accent, build: spec.build, accessory: spec.accessory, height: spec.height, face: { eyes: spec.face.eyes, brows: spec.face.brows, mouth: spec.face.mouth, beard: spec.face.beard, glasses: !!spec.face.glasses, freckles: !!spec.face.freckles } }; }
/** a random look from a number in [0, 1) generator (the page passes Math.random; tests pass a seeded one). lists = the option arrays of people-core */
export function randomLook(rand, lists) {
  const pick = (a) => a[Math.min(a.length - 1, Math.floor(rand() * a.length))], L = lists;
  const outfit = pick(L.OUTFITS); let accent = pick(L.OUTFITS); if (accent === outfit) accent = L.OUTFITS[(L.OUTFITS.indexOf(outfit) + 3) % L.OUTFITS.length];
  return { skin: pick(L.SKINS), hair: pick(L.HAIRS), hairStyle: pick(L.HAIR_STYLES), outfit, accent, build: pick(L.BUILDS), accessory: pick(CARRY), height: Math.round((0.9 + rand() * 0.2) * 100) / 100,
    face: { eyes: pick(L.EYES), brows: pick(L.BROWS), mouth: pick(L.MOUTHS), beard: pick(BEARD_SET.concat(['none', 'none'])), glasses: rand() < 0.2, freckles: rand() < 0.2 } };
}
