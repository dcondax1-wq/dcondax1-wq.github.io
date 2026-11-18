// A city -> districts -> source rows. No fetches, DOM, randomness, or inferred research results.
import { parseExpr, evalExpr } from './generator.js';
import { fmtField, hash32 } from './util.js';
const finite = v => typeof v === 'number' && Number.isFinite(v);
export function fieldText(fd, value, item) {
  const out = fmtField(fd, value);
  if (fd?.fmt !== 'r') return out;
  const dollars = finite(item?.f?.usd) ? fmtField({ fmt: 'usd' }, item.f.usd) : '$ unavailable';
  // A best/worst R excursion is not the cash exit. Name the recorded result rather
  // than implying that the dollar outcome is a conversion of every R field.
  return out + (fd?.key === 'r' ? ' / ' : ' · row result ') + dollars;
}
export function cityDistricts(spec, ds) {
  const items = ds?.items || [], fields = Object.fromEntries((ds?.fields || []).map(f => [f.key, f]));
  const groupField = parseExpr(spec.district_by)?.field, metric = parseExpr(spec.height_by)?.field;
  const sizes = items.length ? evalExpr(spec.height_by, items) : [];
  const groups = new Map();
  items.forEach((item, index) => {
    const raw = item.f?.[groupField], key = raw == null ? 'unassigned' : typeof raw + ':' + String(raw);
    if (!groups.has(key)) groups.set(key, { key, label: raw == null ? 'Unassigned' : fmtField(fields[groupField], raw), rows: [] });
    const value = item.f?.[metric], height = finite(sizes[index]) ? Math.abs(sizes[index]) : 0;
    groups.get(key).rows.push({ item, index, value, height, name: String(ds.label ? ds.label(item) : item.label || item.id || 'Record ' + (index + 1)) });
  });
  const districts = [...groups.values()].sort((a,b) => b.rows.length-a.rows.length || a.label.localeCompare(b.label));
  districts.forEach((d, index) => {
    const money = d.rows.map(r=>r.item.f?.usd).filter(finite);
    d.count = d.rows.length; d.usd = money.length === d.count ? money.reduce((a,b)=>a+b,0) : null;
    d.color = spec.palette.districts[index % spec.palette.districts.length];
    d.rows.sort((a,b)=>b.height-a.height || a.index-b.index);
    d.seed = hash32(spec.id + ':' + d.key);
  });
  return { spec, ds, districts, count:items.length, metric:fields[metric] || {key:metric,label:metric||'Value'}, group:fields[groupField] || {label:groupField||'District'}, demo:ds?.demo !== false, source:ds?.source || 'Published dataset' };
}
export function towerRows(rows, cap = 36) {
  // The largest first; a labelled cap makes it clear that each visible tower is ONE source row.
  const chosen=rows.slice(0,Math.max(0,Math.floor(cap))), max=Math.max(1,...chosen.map(r=>r.height));
  return chosen.map((r,i)=>({...r,towerHeight:12+78*Math.sqrt(r.height/max),x:i%6,z:Math.floor(i/6)}));
}
export function recordFields(model, row) {
  const preferred=[model.metric.key,...(model.spec.card || []),'usd','r'];
  const keys=[...new Set(preferred.concat((model.ds.fields||[]).map(f=>f.key)))];
  return keys.map(key=>(model.ds.fields||[]).find(f=>f.key===key)).filter(fd=>fd && row.item.f?.[fd.key]!=null)
    .map(fd=>({key:fd.key,label:fd.label,value:fieldText(fd,row.item.f[fd.key],row.item)}));
}
