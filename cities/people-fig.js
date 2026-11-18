// PEOPLE figures: friendly toy-like characters (a big round head with two eyes, a rounded tunic, mitten hands, short legs), our own
// original design. A whole crowd is ONE instanced draw call: the vertex colour is a mask (red = outfit, green = hair, blue = skin,
// black = eyes and sandals) and every person brings three colours of its own, so no two look alike. Matte, warm, nothing glows.
// Local +z is the face: turn a figure with ry = atan2(dx, dz) to make it look at a point. About 1.3 units tall at scale 1.
import * as THREE from '../jarvis/three.module.min.js';
import { Batch, unit } from './athens-geo.js';

const proto = {};
function figureGeo(lite) {
  const key = lite ? 'lo' : 'hi'; if (proto[key]) return proto[key];
  const b = new Batch(), O = new THREE.Color(1, 0, 0), Od = new THREE.Color(.7, 0, 0), H = new THREE.Color(0, 1, 0), S = new THREE.Color(0, 0, 1), D = new THREE.Color(0, 0, 0);
  const put = (g, x, y, z, sx, sy, sz, c) => b.put(g, x, y, z, sx, sy, sz, c, 0, 0, 0, 0);
  put(unit.box(), -.1, 0, 0, .13, .26, .15, Od); put(unit.box(), .1, 0, 0, .13, .26, .15, Od);                 // legs
  put(unit.cyl(lite ? 6 : 9, .7), 0, .22, 0, .3, .5, .26, O);                                                   // the tunic, wider at the hem
  put(unit.box(), -.35, .4, 0, .11, .13, .11, S); put(unit.box(), .35, .4, 0, .11, .13, .11, S);                // mitten hands
  b.geo(new THREE.SphereGeometry(1, lite ? 7 : 10, lite ? 5 : 8).translate(0, 1, 0), 0, .68, 0, S, 0, .31, .3, .31, 0);   // the big round head
  put(unit.sphere(lite ? 7 : 10, lite ? 3 : 4), 0, 1.08, -.035, .33, .23, .33, H);                              // hair
  put(unit.box(), -.1, .97, .275, .04, .065, .04, D); put(unit.box(), .1, .97, .275, .04, .065, .04, D);          // eyes
  put(unit.box(), 0, .845, .285, .1, .018, .03, D);                                                              // a small calm mouth
  const g = b.geometry(); g.userData.tris = b.tris; return (proto[key] = g);
}
function patch(shader) {
  shader.vertexShader = 'attribute vec3 aHair;\nattribute vec3 aSkin;\n' + shader.vertexShader.replace('#include <color_vertex>',
    'vColor = color.r * instanceColor + color.g * aHair + color.b * aSkin + (1. - min(1., color.r + color.g + color.b)) * vec3(.13, .1, .08);');
}

/** looks: [{ skin, hair, outfit }] (people-talk.js lookOf). Returns the crowd: place(i, x, y, z, ry, scale, squash) then commit(). */
export function makeCrowd(looks, { lite = false } = {}) {
  const n = Math.max(1, looks.length), g = figureGeo(lite).clone(), c = new THREE.Color(), hair = new Float32Array(n * 3), skin = new Float32Array(n * 3);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }); mat.onBeforeCompile = patch; mat.customProgramCacheKey = () => 'cities-people-v1';
  const mesh = new THREE.InstancedMesh(g, mat, n); mesh.count = looks.length; mesh.frustumCulled = false;
  looks.forEach((L, i) => { mesh.setColorAt(i, c.set(L.outfit)); c.set(L.hair); hair.set([c.r, c.g, c.b], i * 3); c.set(L.skin); skin.set([c.r, c.g, c.b], i * 3); });
  if (!looks.length) mesh.setColorAt(0, c.set('#ffffff'));
  g.setAttribute('aHair', new THREE.InstancedBufferAttribute(hair, 3)); g.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3)); mesh.instanceColor.needsUpdate = true;
  const d = new THREE.Object3D();
  return { mesh, count: looks.length, tris: figureGeo(lite).userData.tris,
    /** lean = a bow forward (radians, about the figure's own feet): a sad keeper, a prayer at the temple; negative leans back (a cheer) */
    place(i, x, y, z, ry = 0, s = 1, squash = 1, lean = 0) { d.position.set(x, y, z); d.rotation.set(lean, ry, 0, 'YXZ'); d.scale.set(s, s * squash, s); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
    dispose() { g.dispose(); mat.dispose(); mesh.dispose(); } };
}
