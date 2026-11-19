// Independent, GPU-free recovery if a cached 3D/controller module cannot load.
import { mountWorld } from './world.js?v=w2';
import { openDistrictWorld } from './district-world.js?v=d3';
import { loadDataset } from './datasets.js?v=atlas2';
export async function recoverAtlas() {
  const get = async path => { const response = await fetch(path); if (!response.ok) throw Error('City files unavailable'); return response.json(); };
  const [catalogue, fixture] = await Promise.all([get('./cities.json'), get('./fixture.json')]), cache = new Map();
  const env = { fixture, get: () => Promise.reject(Error('Recovery sample')) };
  const resolveCity = async id => { const spec = catalogue.cities.find(s => s.id === id); return spec ? { spec, dataset: await loadDataset(spec.dataset, env, cache) } : null; };
  mountWorld(catalogue.cities, { fallback: true, onExplore: async id => { const got = await resolveCity(id); if (got) openDistrictWorld({ ...got, cities: catalogue.cities, resolveCity }); } });
  document.querySelector('#loading')?.remove();
  const quality = document.querySelector('#qB'); if (quality) { quality.textContent = 'ATLAS'; quality.disabled = true; }
  const photo = document.querySelector('#photoB'); if (photo) photo.hidden = true;
  const night = document.querySelector('#nightB'); if (night) night.hidden = true;
  document.body.dataset.ready = 'fallback'; window.OLYMPUS?.ready?.();
}
