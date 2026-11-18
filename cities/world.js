// Cities' front door remains useful before a GPU, a live feed or a camera is ready.
// These skylines are illustrations. Counts and details always come from the catalogue / dataset.
const NS = 'http://www.w3.org/2000/svg';
import { cityRoutes } from './routes.js?v=r3';
import { planCityNetwork } from './network-layout.js?v=n1';
const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svgNode = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
export const WORLDS = [
  ['trading', 'Trading', '#8b7259', 325, 215], ['research', 'Research', '#c9a06a', 325, 78],
  ['money', 'Money', '#ffd781', 443, 145], ['kalshi', 'Kalshi', '#7f8a52', 443, 285],
  ['life', 'Life', '#9aeda7', 207, 285], ['obsidian', 'Obsidian', '#c9a06a', 207, 145],
];
export function skyline(seed = 0, color = '#c9a06a', compact = false) {
  const svg = svgNode('svg', { viewBox: '0 0 180 110', 'aria-hidden': 'true', focusable: 'false' });
  svg.classList.add('atlas-skyline');
  svg.append(svgNode('ellipse', { cx: 90, cy: 94, rx: 78, ry: 10, fill: color, opacity: '.12' }));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const k = (seed * 17 + r * 31 + c * 23) % 71, x = 32 + c * 22 - r * 8, y = 67 + r * 9 + c * 2, h = 12 + k * .63;
    svg.append(svgNode('path', { d: `M${x},${y}v-${h}l12,-5 9,5v${h}l-9,5z`, fill: '#29221a', stroke: color, 'stroke-opacity': '.52', 'stroke-width': '.65' }));
    svg.append(svgNode('path', { d: `M${x},${y-h}l12,-5 9,5 -9,5z`, fill: color, opacity: '.5' }));
    svg.append(svgNode('path', { d: `M${x+12},${y-h+5}v${h}`, stroke: color, opacity: '.45' }));
    if (!compact) for (let w = 7; w < h - 2; w += 9) svg.append(svgNode('path', { d: `M${x+3},${y-w}h5m7,-2h3`, stroke: color, 'stroke-width': '1.7', opacity: (k+w)%3 ? '.85' : '.2' }));
  }
  svg.append(svgNode('path', { d: 'M12 94L156 66M24 104L165 76M40 64L140 103', stroke: color, 'stroke-width': '1', opacity: '.5', 'stroke-dasharray': '3 5' }));
  return svg;
}
function worldMap(specs) {
  const map = svgNode('svg', { viewBox: '0 0 650 430', role: 'img',
    'aria-label': `${specs.length} real catalogue cities inside one connected night metropolis. Olympus HQ anchors six districts; routes and lights are decorative navigation scenery.` });
  map.classList.add('atlas-map');
  const groups = Object.fromEntries(WORLDS.map(([key, name, color]) => [key, [name, color]]));
  const layout = planCityNetwork(specs, groups);
  const routes = cityRoutes(layout.islands.map(({ i, cont, hq, capital, x, z }) => ({ i, cont, hq, capital, x, z })), layout.districts);
  const point = (city) => ({ x: 325 + city.x * 0.74, y: 274 + city.z * 0.32 });
  const points = layout.islands.map(point);

  const defs = svgNode('defs', {});
  const sky = svgNode('linearGradient', { id: 'city-sky', x1: '0', y1: '0', x2: '0', y2: '1' });
  sky.append(svgNode('stop', { offset: '0%', 'stop-color': '#050711' }), svgNode('stop', { offset: '100%', 'stop-color': '#2b241c' }));
  const floor = svgNode('linearGradient', { id: 'city-floor', x1: '0', y1: '0', x2: '0', y2: '1' });
  floor.append(svgNode('stop', { offset: '0%', 'stop-color': '#241e17' }), svgNode('stop', { offset: '42%', 'stop-color': '#241e17' }), svgNode('stop', { offset: '100%', 'stop-color': '#030812' }));
  defs.append(sky, floor); map.append(defs);
  map.append(svgNode('rect', { width: '650', height: '430', fill: 'url(#city-sky)' }));
  for (let i = 0; i < 34; i++) map.append(svgNode('circle', {
    cx: 18 + (i * 113) % 615, cy: 15 + (i * 59) % 160, r: i % 4 ? '.7' : '1.4',
    fill: '#d7e4ff', opacity: i % 3 ? '.38' : '.7',
  }));
  map.append(svgNode('path', { d: 'M0 177 Q325 137 650 177 V430 H0Z', fill: 'url(#city-floor)' }));
  map.append(svgNode('path', { d: 'M0 177 Q325 137 650 177', fill: 'none', stroke: '#76614c', 'stroke-width': '1.4', opacity: '.8' }));

  // One unbroken perspective street grid and a deterministic carpet of tiny 3D blocks.
  const grid = [];
  for (let row = 0; row < 16; row++) {
    const depth = (row + 1) / 16, y = 177 + Math.pow(depth, 1.55) * 249, span = 80 + depth * 680;
    grid.push(`M${(650 - span) / 2},${y.toFixed(1)}H${((650 + span) / 2).toFixed(1)}`);
  }
  for (let col = 0; col <= 32; col++) grid.push(`M325,170L${(6 + col * 20).toFixed(1)},430`);
  map.append(svgNode('path', { d: grid.join(' '), fill: 'none', stroke: '#5c7298', 'stroke-width': '.8', opacity: '.23' }));
  const front = [], side = [], amber = [], mint = [], cyan = [];
  const columns = 32, rows = 21;
  for (let row = 0; row < rows; row++) {
    const depth = (row + 1) / rows, baseY = 184 + Math.pow(depth, 1.63) * 238, span = 105 + depth * 590, cell = span / columns;
    for (let col = 0; col < columns; col++) {
      const seed = (row * 1013 + col * 7919 + 41) >>> 0;
      if (seed % 11 === 0) continue;
      const x = 325 - span / 2 + col * cell + cell * .22, w = cell * (.40 + ((seed >>> 4) % 5) * .035);
      const h = 2 + depth * (4 + ((seed >>> 9) % 19)), dx = w * .27, dy = -dx * .42;
      const groupGreen = Math.hypot(x + w / 2 - 325, baseY - 300) < 54 || seed % 29 === 0;
      const roof = groupGreen ? mint : seed % 17 === 0 ? cyan : amber;
      front.push(`M${x.toFixed(1)},${baseY.toFixed(1)}L${x.toFixed(1)},${(baseY-h).toFixed(1)}L${(x+dx).toFixed(1)},${(baseY-h+dy).toFixed(1)}L${(x+dx).toFixed(1)},${(baseY+dy).toFixed(1)}Z`);
      side.push(`M${(x+dx).toFixed(1)},${(baseY-h+dy).toFixed(1)}L${(x+dx).toFixed(1)},${(baseY+dy).toFixed(1)}L${(x+w).toFixed(1)},${baseY.toFixed(1)}L${(x+w).toFixed(1)},${(baseY-h).toFixed(1)}Z`);
      roof.push(`M${x.toFixed(1)},${(baseY-h).toFixed(1)}L${(x+dx).toFixed(1)},${(baseY-h+dy).toFixed(1)}L${(x+w).toFixed(1)},${(baseY-h).toFixed(1)}Z`);
    }
  }
  map.append(svgNode('path', { d: front.join(' '), fill: '#442314', opacity: '.78' }));
  map.append(svgNode('path', { d: side.join(' '), fill: '#2e261e', opacity: '.93' }));
  map.append(svgNode('path', { d: amber.join(' '), fill: '#ff8b2d', opacity: '.9' }));
  map.append(svgNode('path', { d: mint.join(' '), fill: '#7f8a52', opacity: '.96' }));
  map.append(svgNode('path', { d: cyan.join(' '), fill: '#8b7259', opacity: '.9' }));

  const bridgeSet = new Set(routes.bridges.map(([a, b]) => `${a}:${b}`));
  const localPaths = new Map(WORLDS.map(([key]) => [key, []])), localSeen = new Map(), trunkPaths = [];
  const districtSize = new Map(layout.districts.map(({ key, count }) => [key, count]));
  for (const [a, b] of routes.links) {
    const from = points[a], to = points[b];
    if (!from || !to) continue;
    const bridge = bridgeSet.has(`${a}:${b}`);
    const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2 - (bridge ? 28 : 5);
    const d = `M${from.x.toFixed(1)},${from.y.toFixed(1)}Q${midX.toFixed(1)},${midY.toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
    const group = bridge ? layout.islands[b].cont : layout.islands[a].cont;
    const color = WORLDS.find(([key]) => key === group)?.[2] || '#c9a06a';
    if (bridge) trunkPaths.push({ d, color });
    else {
      const seen = localSeen.get(group) || 0; localSeen.set(group, seen + 1);
      const stride = Math.max(2, Math.ceil((districtSize.get(group) || 6) / 6));
      if (seen % stride === 0) localPaths.get(group)?.push(d);
    }
  }
  for (const [key, name, color] of WORLDS) {
    const paths = localPaths.get(key);
    if (paths?.length) map.append(svgNode('path', { d: paths.join(' '), fill: 'none', stroke: color, 'stroke-width': '.9', opacity: '.23' }));
  }
  for (const { d, color } of trunkPaths) {
    const route = svgNode('path', { d, fill: 'none', stroke: color, 'stroke-width': '2.3', opacity: '.78', 'stroke-linecap': 'round' });
    map.append(route);
    const flight = svgNode('path', { d, fill: 'none', stroke: '#dff8ff', 'stroke-width': '2.4', opacity: '.9', 'stroke-dasharray': '3 84', 'stroke-linecap': 'round' });
    flight.classList.add('atlas-flight'); map.append(flight);
  }
  for (const city of layout.islands) {
    const p = points[city.i], color = WORLDS.find(([key]) => key === city.cont)?.[2] || '#ffae52';
    map.append(svgNode('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: city.hq ? '4.4' : city.capital ? '3' : '1.45',
      fill: color, stroke: '#fff5dc', 'stroke-width': city.hq ? '1.25' : '.55', opacity: city.hq ? '1' : '.86' }));
  }

  const hq = points[layout.hqIndex] || { x: 325, y: 274 };
  map.append(svgNode('circle', { cx: hq.x, cy: hq.y, r: '18', fill: 'none', stroke: '#ffd878', 'stroke-width': '1.8', opacity: '.82' }));
  map.append(svgNode('circle', { cx: hq.x, cy: hq.y, r: '8', fill: '#ffd878', opacity: '.24' }));
  const hqLabel = svgNode('text', { x: hq.x, y: hq.y - 22, 'text-anchor': 'middle', fill: '#ffe2a2', class: 'network-label hq-label',
    'font-weight': '900', stroke: '#120e0b', 'stroke-width': '3', 'paint-order': 'stroke' });
  hqLabel.textContent = 'OLYMPUS HQ'; map.append(hqLabel);

  const labelOffsets = { research: [-38, -18], money: [45, -16], kalshi: [52, 20], life: [-48, 21], obsidian: [-52, -17] };
  for (const district of layout.districts.filter((entry) => !entry.hq)) {
    const city = layout.islands.find((entry) => entry.spec.id === district.capitalId);
    if (!city) continue;
    const p = points[city.i], [dx, dy] = labelOffsets[district.key] || [24, -18], x = Math.max(36, Math.min(614, p.x + dx)), y = Math.max(186, Math.min(408, p.y + dy));
    map.append(svgNode('path', { d: `M${p.x.toFixed(1)},${p.y.toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}`, fill: 'none', stroke: district.color, 'stroke-width': '1.2', opacity: '.8' }));
    const label = svgNode('text', { x, y, 'text-anchor': 'middle', fill: district.color, class: 'network-label', 'font-weight': '850',
      stroke: '#120e0b', 'stroke-width': '3', 'paint-order': 'stroke' });
    label.textContent = `${district.name.toUpperCase()} · ${district.count}`; map.append(label);
  }
  return map;
}
export function mountWorld(specs, { fallback = false, onCity, onDistrict, onExplore, describe } = {}) {
  document.querySelector('.world-lobby')?.remove();
  const box=node('section', 'world-lobby'+(fallback?' fallback':'')); box.setAttribute('aria-label',fallback?'Explore the city atlas':'Featured cities');
  const hero=node('div','atlas-hero'), eyebrow=node('p','atlas-kicker','OLYMPUS / THE LIVING ATLAS');
  hero.append(eyebrow,node('h2',null,'One city. Six districts.'),node('p','atlas-lead',fallback?'Olympus HQ links every district in one night network. Search the full catalogue below; routes and lights are navigation scenery, not data flow.':'Choose a district to see its connected cities. All lights and routes are navigation scenery, not extra data.'));
  const stats=node('p','atlas-stats'); stats.append(node('b',null,String(specs.length)),document.createTextNode(' cities  /  '),node('b',null,'6'),document.createTextNode(' districts'));hero.append(stats); box.append(hero);
  if(!fallback){const districts=node('div','atlas-districts');districts.setAttribute('role','group');districts.setAttribute('aria-label','Fly to a district');WORLDS.forEach(([id,name,color])=>{const b=node('button',null,name);b.type='button';b.style.setProperty('--district',color);b.onclick=()=>onDistrict?.(id);districts.append(b);});hero.append(districts);}
  if(fallback) box.append(worldMap(specs));
  const featured=node('div','atlas-featured');
  const picked=['trading','research','money'].map(g=>specs.find(s=>s.group===g)).filter(Boolean);
  picked.forEach((s,i)=>{
    const b=node('button','atlas-portal'); b.type='button';b.style.setProperty('--district',WORLDS.find(w=>w[0]===s.group)?.[2]||'#c9a06a');
    b.append(skyline(i+2,WORLDS.find(w=>w[0]===s.group)?.[2]),node('small',null,'START EXPLORING'),node('strong',null,s.name),node('span',null,s.motto),node('em',null,fallback?'Open the numbers ↗':'Land in this city ↗'));
    b.addEventListener('click',()=>open(s));featured.append(b);
  });box.append(featured);
  const detail=node('section','atlas-detail');detail.hidden=true;detail.setAttribute('aria-live','polite');box.append(detail);
  function open(s){
    if(!fallback){onCity?.(s.id);return;}
    if(onExplore){onExplore(s.id);return;}
    const d=describe?.(s);
    detail.hidden=false;detail.replaceChildren(node('p','atlas-kicker','CITY RECORD / '+(d?.demo===false?'PUBLISHED DATA':'SAMPLE DATA')),node('h3',null,s.name),node('p',null,s.motto));
    if(d) {detail.append(node('p','atlas-record',d.line));if(d.note)detail.append(node('p','atlas-source',d.note));}
    detail.append(node('p','atlas-source','Landmark: '+s.landmark.label+'. The skyline is an illustration; the record above is the dataset.'));
    const close=node('button','atlas-close','Close city record');close.type='button';close.onclick=()=>{detail.hidden=true;};detail.append(close);detail.scrollIntoView({block:'nearest',behavior:'auto'});
  }
  if(fallback){
    const catalog=node('section','atlas-catalog');catalog.append(node('h3',null,'Find your next city'));
    const search=node('input');search.type='search';search.placeholder='Search cities or data';search.setAttribute('aria-label','Search the city atlas');catalog.append(search);
    const filters=node('div','atlas-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Filter by district');let group='';
    const list=node('div','atlas-city-list'), empty=node('p','atlas-empty','No city matches. Try a different name or district.');empty.hidden=true;
    const rows=specs.map(s=>{const b=node('button','atlas-city');b.type='button';const groupName=WORLDS.find(w=>w[0]===s.group)?.[1]||s.group;b.setAttribute('aria-label',`${s.name}. ${groupName} district. ${s.motto}`);b.setAttribute('data-city-id',s.id);const color=WORLDS.find(w=>w[0]===s.group)?.[2]||'#c9a06a';b.style.setProperty('--district',color);b.append(node('strong',null,s.name),node('span',null,s.motto),node('small',null,(WORLDS.find(w=>w[0]===s.group)?.[1]||s.group)+' / '+s.region));b.onclick=()=>open(s);list.append(b);return{s,b};});
    const filter=()=>{const term=search.value.trim().toLowerCase();let n=0;rows.forEach(({s,b})=>{b.hidden=!!((group&&group!==s.group)||(term&&!`${s.name} ${s.motto} ${s.dataset} ${s.region}`.toLowerCase().includes(term)));if(!b.hidden)n++;});empty.hidden=n>0;};
    [['','All districts'],...WORLDS.map(w=>[w[0],w[1]])].forEach(([id,name])=>{const b=node('button','atlas-filter',name);b.type='button';b.setAttribute('aria-pressed',String(!id));b.onclick=()=>{group=id;[...filters.children].forEach(e=>e.setAttribute('aria-pressed',String(e===b)));filter();};filters.append(b);});
    search.addEventListener('input',filter);catalog.append(filters,list,empty);box.append(catalog);
  }
  document.body.append(box);return box;
}
