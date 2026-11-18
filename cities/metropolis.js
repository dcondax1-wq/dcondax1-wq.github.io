// Civic scenery surrounds the measured city. These towers and roads are scenery,
// never additional trades, data rows or financial results. Three batched draws.
import * as THREE from '../jarvis/three.module.min.js';
import { hash32, rng, rgb } from './util.js';

export const METROPOLIS_CAPS = { ultra: 2000, high: 1400, low: 240, off: 0 };

// A six-sided, three-setback shell reads like a real tower at a distance while
// remaining cheap enough to instance across an entire capital. The shader uses
// each tower's seed to taper and step the rings into different silhouettes.
function architecturalGeometry() {
  const sides = 6, levels = [0, .55, .82, 1], positions = [], normals = [], index = [];
  for (let level = 0; level < levels.length; level++) {
    for (let side = 0; side < sides; side++) {
      const a = side / sides * Math.PI * 2 + Math.PI / 6;
      positions.push(Math.cos(a) * .5, levels[level], Math.sin(a) * .5);
      normals.push(Math.cos(a), 0, Math.sin(a));
    }
  }
  for (let level = 0; level < levels.length - 1; level++) for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides, a = level * sides + side, b = level * sides + next;
    const c = (level + 1) * sides + next, d = (level + 1) * sides + side;
    index.push(a, b, c, a, c, d);
  }
  const top = positions.length / 3;
  positions.push(0, 1, 0); normals.push(0, 1, 0);
  for (let side = 0; side < sides; side++) index.push(top, (levels.length - 1) * sides + side, (levels.length - 1) * sides + (side + 1) % sides);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

export function metropolisPlan(city, spec, cap = METROPOLIS_CAPS.ultra) {
  const random = rng(hash32('civic:' + spec.id)), b = city.bounds, r = Math.max(40, b.r), out = [];
  // Fill unused blocks near the measured centre first. A spatial index keeps
  // the decorative low rises clear of every data tower, even in a 40k-row city.
  const cell = Math.max(6.5, city.pitch * .68), bucketSize = Math.max(18, cell * 3);
  const buckets = new Map(), key = (ix, iz) => `${ix}:${iz}`;
  for (let k = 0; k < city.n; k++) {
    const ix = Math.floor(city.x[k] / bucketSize), iz = Math.floor(city.z[k] / bucketSize), id = key(ix, iz);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(k);
  }
  const clear = (x, z, w, d) => {
    const ix = Math.floor(x / bucketSize), iz = Math.floor(z / bucketSize);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const k of buckets.get(key(ix + dx, iz + dz)) || []) {
        if (Math.abs(x - city.x[k]) < (w + city.w[k]) / 2 + 1.5 &&
            Math.abs(z - city.z[k]) < (d + city.d[k]) / 2 + 1.5) return false;
      }
    }
    return true;
  };
  const pad = city.pitch * 3 + 30;
  const sceneryBlocked = (x, z) => (spec.scenery === 'river' && x > b.maxx + pad - 8) ||
    (spec.scenery === 'harbor' && z < b.minz - pad + 12) ||
    (spec.scenery === 'rail' && Math.abs(z - (b.minz - pad - 12)) < 12);
  // One gold civic anchor makes the capital legible. It is deliberately
  // outside the measured footprint and remains scenery, never a new record.
  const towardSite=city.site?.x<b.minx?[b.minx-pad*.46,city.site.z||0]:city.site?.x>b.maxx?[b.maxx+pad*.46,city.site.z||0]:city.site?.z<b.minz?[city.site.x||0,b.minz-pad*.46]:[city.site?.x||0,b.maxz+pad*.46];
  const hqCandidates = [towardSite,[0,b.minz-pad*.78],[b.maxx+pad*.8,0],[b.minx-pad*.8,0],[0,b.maxz+pad*.78]];
  for (const [x,z] of hqCandidates) {
    const w=Math.max(10,Math.min(16,cell*1.65)),d=w;
    if (!sceneryBlocked(x,z) && clear(x,z,w,d)) {
      out.push({x,z,w,d,h:Math.max(74,Math.min(160,city.maxH*1.28+30)),seed:.973,hq:true});
      break;
    }
  }
  const infillTarget = Math.round(cap * .62);
  const addBlock = (ix, iz) => {
    if (out.length >= infillTarget) return;
    const x = (ix + (random() - .5) * .16) * cell, z = (iz + (random() - .5) * .16) * cell;
    if (x < b.minx - 9 * cell || x > b.maxx + 9 * cell || z < b.minz - 9 * cell || z > b.maxz + 9 * cell || sceneryBlocked(x, z)) return;
    const baseW=cell*(.34+random()*.15),baseD=cell*(.34+random()*.15),seed=random(),courtyard=random()>.82;
    const w=baseW*(courtyard?1.55:1),d=baseD*(courtyard?.82:1);
    if (!clear(x, z, w, d)) return;
    if (out[0]?.hq && Math.abs(x-out[0].x)<(w+out[0].w)/2+3 && Math.abs(z-out[0].z)<(d+out[0].d)/2+3) return;
    out.push({ x, z, w, d, h: 3 + Math.pow(random(),1.7)*13 + (random() > .92 ? 12 : 0), seed, infill: true });
  };
  const maxRing = Math.ceil((Math.max(Math.abs(b.minx),Math.abs(b.maxx),Math.abs(b.minz),Math.abs(b.maxz)) + 9 * cell) / cell);
  for (let ring = 0; ring <= maxRing && out.length < infillTarget; ring++) {
    if (!ring) { addBlock(0, 0); continue; }
    for (let i = -ring; i <= ring; i++) { addBlock(i, -ring); addBlock(i, ring); }
    for (let i = -ring + 1; i < ring; i++) { addBlock(-ring, i); addBlock(ring, i); }
  }
  // Ten uneven neighborhoods replace a uniform ring. Local golden-angle
  // scatter makes each cluster organic; radial avenues connect them to HQ.
  const clusterCount=10;
  for (let i = 0; out.length < cap && i < cap * 6; i++) {
    const district=i%clusterCount, member=Math.floor(i/clusterCount), districtAngle=district/clusterCount*Math.PI*2+(district%2?.08:-.05);
    const centerDistance=r*(1.12+(district%3)*.12)+42, spread=10+Math.sqrt(member+1)*(3.6+(district%4)*.35);
    const a=member*2.399963+districtAngle+random()*.3;
    const x=Math.cos(districtAngle)*centerDistance+Math.cos(a)*spread*(district%2?1.35:.88);
    const z=Math.sin(districtAngle)*centerDistance+Math.sin(a)*spread*(district%2?.82:1.28);
    if (x > b.minx - 18 && x < b.maxx + 18 && z > b.minz - 18 && z < b.maxz + 18) continue;
    if (sceneryBlocked(x, z)) continue;
    const seed=random(), core=Math.exp(-member/28), landmark=random()>.9;
    const form=Math.floor(seed*5), base=2.8+random()*5.8;
    const w=base*(form===1?1.75:form===3?.72:1), d=base*(form===2?1.65:form===4?.68:1);
    if(!clear(x,z,w,d))continue;
    const h=5+Math.pow(random(),1.8)*28+core*(12+city.maxH*.38)+(landmark?26+random()*34:0);
    out.push({x,z,w,d,h,seed,cluster:district});
  }
  return out;
}

export function buildMetropolis(city, spec, box, material, tier = 'high', still = false) {
  const cap = METROPOLIS_CAPS[tier] ?? METROPOLIS_CAPS.high, group = new THREE.Group(); group.name = 'Decorative civic skyline';
  if (!cap) { material.dispose(); return { group, count: 0, calls: 0, triangles: 0, update() {}, dispose() {} }; }
  // Generate one canonical order. Changing tier only takes a shorter prefix.
  const plan = metropolisPlan(city, spec), rows = plan.slice(0, cap), n = rows.length;
  const shell = architecturalGeometry(), geometry = new THREE.InstancedBufferGeometry(); geometry.index = shell.index;
  geometry.setAttribute('position', shell.getAttribute('position')); geometry.setAttribute('normal', shell.getAttribute('normal')); geometry.instanceCount = n;
  const ps = new Float32Array(n * 4), hy = new Float32Array(n * 4), color = new Float32Array(n * 3), seed = new Float32Array(n);
  const accent = rgb(spec.palette.accent), amber = rgb('#f89938');
  rows.forEach((b, i) => { ps.set([b.x, b.z, b.w, b.d], i * 4);
    const flick=b.seed*17-Math.floor(b.seed*17),lit=.2+(b.seed*43-Math.floor(b.seed*43))*.62;
    hy.set([b.h, 0, b.hq?1:b.infill?.12+.18*flick:.08+.28*flick, b.hq?.92:lit], i * 4);
    const base=b.hq?rgb('#ffd36b'):b.infill?amber:accent;
    color.set(base.map((c,j)=>c*(.72+.18*flick)+(b.infill?accent[j]:.08)*.18),i*3);seed[i]=b.seed; });
  const attribute = (name, a, size) => geometry.setAttribute(name, new THREE.InstancedBufferAttribute(a, size));
  attribute('aPosSize', ps, 4); attribute('aHY', hy, 4); attribute('aColor', color, 3); attribute('aSeed', seed, 1);
  attribute('aState', new Float32Array(n * 2), 2); attribute('aBob', new Float32Array(n), 1);
  const towers = new THREE.Mesh(geometry, material); towers.frustumCulled = false; group.add(towers);
  const positions = [], roadColors = [], radius = Math.max(50, city.bounds.r), y = .22;
  // Luminous avenues stay beneath the measured buildings; they encode no values.
  const step = Math.max(16, city.pitch * 3), extent = Math.min(radius * 1.25, step * 24);
  for (let p = -extent, lane = 0; p <= extent; p += step, lane++) {
    positions.push(-extent, y, p, extent, y, p, p, y, -extent, p, y, extent);
    const major = lane % 4 === 0, c = major ? [1, .42, .08] : [accent[0], accent[1], accent[2]];
    for (let k = 0; k < 4; k++) roadColors.push(...c);
  }
  for(let district=0;district<10;district++){
    const a=district/10*Math.PI*2+(district%2?.08:-.05),distance=radius*(1.25+(district%3)*.12)+42;
    positions.push(0,y,0,Math.cos(a)*distance,y,Math.sin(a)*distance);
    roadColors.push(1,.34,.06,1,.68,.24);
  }
  const roadsGeometry = new THREE.BufferGeometry(); roadsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
  const roadsMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .3, depthWrite: false });
  group.add(new THREE.LineSegments(roadsGeometry, roadsMaterial));

  // Antenna needles break the repeated roof line without introducing more
  // buildings or data. Warm intersection lamps make the road scale legible.
  const spirePositions = [], spireColors = [];
  rows.forEach((b, i) => {
    if (!b.hq && (b.h < 28 || (i + Math.floor(b.seed * 17)) % 7)) return;
    const extra = 5 + b.h * (.08 + b.seed * .08);
    spirePositions.push(b.x, b.h, b.z, b.x, b.h + extra, b.z);
    spireColors.push(accent[0], accent[1], accent[2], 1, .72, .34);
    if(b.hq){
      const rings=[{y:b.h*.78,r:b.w*.42},{y:b.h*.9,r:b.w*.31},{y:b.h+1,r:b.w*.2}];
      for(const ring of rings)for(let s=0;s<18;s++){
        const a=s/18*Math.PI*2,n=(s+1)/18*Math.PI*2;
        spirePositions.push(b.x+Math.cos(a)*ring.r,ring.y,b.z+Math.sin(a)*ring.r,b.x+Math.cos(n)*ring.r,ring.y,b.z+Math.sin(n)*ring.r);
        spireColors.push(1,.67,.2,1,.92,.48);
      }
    }
  });
  const spireGeometry = new THREE.BufferGeometry();
  spireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spirePositions, 3));
  spireGeometry.setAttribute('color', new THREE.Float32BufferAttribute(spireColors, 3));
  const spireMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending });
  group.add(new THREE.LineSegments(spireGeometry, spireMaterial));
  const lampPositions = [];
  const lampSkip = tier === 'low' ? 3 : 2;
  for (let x = -extent, xi = 0; x <= extent; x += step, xi++) for (let z = -extent, zi = 0; z <= extent; z += step, zi++) {
    if (xi % lampSkip || zi % lampSkip) continue;
    lampPositions.push(x, .65, z);
  }
  const lampGeometry = new THREE.BufferGeometry();
  lampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lampPositions, 3));
  const lampMaterial = new THREE.PointsMaterial({ color: 0xffb35c, size: tier === 'low' ? 1.1 : 1.45, sizeAttenuation: true, transparent: true, opacity: .86, depthWrite: false, blending: THREE.AdditiveBlending });
  group.add(new THREE.Points(lampGeometry, lampMaterial));
  const flights = !still && ['high', 'ultra'].includes(tier), flightCount = flights ? (tier === 'ultra' ? 96 : 64) : 0;
  const flightGeometry = new THREE.BufferGeometry(), orbit = new Float32Array(flightCount * 4), phase = new Float32Array(flightCount * 3);
  for (let i = 0; i < flightCount; i++) {
    if (i % 3 === 0) orbit.set([radius * (1.15 + i % 4 * .12), i * 2.399963, (i % 2 ? 1 : -1) * (.018 + i % 5 * .003), Math.max(35, city.maxH * .9) + i % 3 * 13], i * 4);
    else orbit.set([extent, Math.round((i % 9 - 4) * Math.min(extent / 5, step) / step) * step, (i % 2 ? 1 : -1) * (12 + i % 5 * 3), i % 2 ? -1 : -2], i * 4);
    phase[i * 3] = i * 37.7;
  }
  flightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(phase, 3));
  flightGeometry.setAttribute('aOrbit', new THREE.Float32BufferAttribute(orbit, 4));
  const clock = { value: 0 }, flightMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: clock }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aOrbit; uniform float uTime; varying float vRoad; void main(){float a=aOrbit.y+uTime*aOrbit.z;vRoad=step(aOrbit.w,0.);vec3 p=vec3(cos(a)*aOrbit.x,aOrbit.w+sin(a*3.)*3.,sin(a)*aOrbit.x);if(vRoad>.5){float travel=mod(uTime*aOrbit.z+position.x,aOrbit.x*2.)-aOrbit.x;p=aOrbit.w<-1.5?vec3(travel,.7,aOrbit.y):vec3(aOrbit.y,.7,travel);}vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(950./max(1.,-mv.z),2.,5.);}`,
    fragmentShader: `varying float vRoad; void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(mix(vec3(.68,.89,1.),vec3(1.,.78,.4),vRoad),(1.-smoothstep(.1,.5,d))*.85);}`,
  });
  const aircraft = new THREE.Points(flightGeometry, flightMaterial); aircraft.visible = flights; aircraft.frustumCulled = false; group.add(aircraft);
  const towerTriangles = shell.index.count / 3;
  return { group, count: n, calls: flights ? 5 : 4, triangles: n * towerTriangles, aircraft,
    update(t) { if (flights) clock.value = t; },
    dispose() { for (const resource of [shell, geometry, material, roadsGeometry, roadsMaterial, spireGeometry, spireMaterial, lampGeometry, lampMaterial, flightGeometry, flightMaterial]) resource.dispose(); },
  };
}

