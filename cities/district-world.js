// A navigable city inside the atlas. Every tower and value comes from an already-loaded normalized dataset.
import { cityDistricts, towerRows, recordFields, fieldText } from './district-data.js';
import { fmtField, el } from './util.js';
const NS='http://www.w3.org/2000/svg';
const svg=(tag,a={})=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);return n;};
const button=(text,cls,fn)=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
const cash=n=>fmtField({fmt:'usd'},n);
const rich=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches&&!['low','off'].includes(document.documentElement.dataset.fx);
function blocks(rows,color,metric,onPick){
  const s=svg('svg',{viewBox:'0 0 560 340',role:'group','aria-label':'Source records as a city. Select a tower or a record card below.'});s.classList.add('dw-skyline');
  s.append(svg('path',{d:'M30 210L285 90 540 220 280 337Z',fill:'#0a1724',stroke:color,'stroke-opacity':'.35'}));
  for(let i=0;i<8;i++)s.append(svg('path',{d:`M${40+i*32},${216+i*15}l250,-120M${40+i*32},${210-i*15}l250,128`,stroke:color,'stroke-width':'.8',opacity:'.15'}));
  const towers=towerRows(rows);
  towers.forEach(r=>{
    const x=100+r.x*44+r.z*19,y=178+r.z*22-r.x*12,h=r.towerHeight,c=typeof r.value==='number'&&r.value<0?'#ff879b':color;
    const g=svg('g',{tabindex:'0',role:'button','aria-label':r.name+' · '+fieldText(metric,r.value,r.item)});g.classList.add('dw-tower');
    g.append(svg('path',{d:`M${x} ${y}v-${h}l20,-9 15,9v${h}l-15,9z`,fill:'#112238',stroke:c,'stroke-opacity':'.8'}));
    g.append(svg('path',{d:`M${x} ${y-h}l20,-9 15,9 -15,9z`,fill:c,opacity:'.7'}));
    g.append(svg('path',{d:`M${x+20} ${y-h+9}v${h}`,stroke:c,'stroke-width':'1',opacity:'.7'}));
    for(let k=9;k<h-4;k+=11)g.append(svg('path',{d:`M${x+4} ${y-k}h10m13,-1h4`,stroke:c,'stroke-width':'2',opacity:'.7'}));
    const title=svg('title');title.textContent=r.name+' · '+fieldText(metric,r.value,r.item);g.append(title);
    g.onclick=()=>onPick(r);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(r);}};s.append(g);
  });return s;
}
export function openDistrictWorld({spec,dataset,cities=[],resolveCity,onExit}={}){
  if(!spec||!dataset)return null;
  let dialog=document.querySelector('.district-world');if(dialog)dialog.remove();
  const link=document.querySelector('link[data-city-district-style]');if(!link){const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./district-world.css?v=d2',import.meta.url).href;l.dataset.cityDistrictStyle='1';document.head.append(l);}
  dialog=el('dialog','district-world');dialog.setAttribute('aria-label','Explore cities inside cities');
  const scroller=el('div','dw-scroll'),bar=el('header','dw-bar'),crumbs=el('nav','dw-crumbs');crumbs.setAttribute('aria-label','City breadcrumbs');
  const back=button('← Atlas','dw-back',exit);bar.append(back,el('span','dw-brand','OLYMPUS / CITIES INSIDE CITIES'));dialog.append(bar,scroller);document.body.append(dialog);
  let model=cityDistricts(spec,dataset),district=null,record=null,token=0,closed=false,transitionTimer;const journey=[];
  function exit(){closed=true;token++;clearTimeout(transitionTimer);dialog.close();dialog.remove();onExit?.();}
  function transition(){clearTimeout(transitionTimer);dialog.classList.toggle('dw-arriving',rich());transitionTimer=setTimeout(()=>dialog.classList.remove('dw-arriving'),650);}
  function setCrumbs(){
    crumbs.replaceChildren(button('World map','',exit),el('span',null,'/'),button(model.spec.name,'',()=>{district=null;record=null;render();}));
    if(district)crumbs.append(el('span',null,'/'),button(district.label,'',()=>{record=null;render();}));
    if(record)crumbs.append(el('span',null,'/'),el('span','dw-current','Record'));
    back.textContent=record?'← District':district?'← City':journey.length?'← Previous city':'← Atlas';back.onclick=()=>{if(record){record=null;render();}else if(district){district=null;render();}else if(journey.length){const previous=journey.pop();model=previous.model;district=previous.district;record=previous.record;render();}else exit();};
  }
  function recordView(){
    const section=el('section','dw-record'),head=el('div','dw-record-head');head.append(el('p','dw-kicker','BUILDING / SOURCE RECORD'),el('h2',null,record.name));
    const value=el('p','dw-value',fieldText(model.metric,record.value,record.item));head.append(value,el('p','dw-muted',model.metric.label));section.append(head);
    const grid=el('dl','dw-fields');recordFields(model,record).forEach(f=>{const cell=el('div');cell.append(el('dt',null,f.label),el('dd',null,f.value));grid.append(cell);});
    section.append(grid,el('p','dw-source',`Source record ${record.item.id || record.index+1} · ${model.source}. Values are from this ${model.demo?'sample':'published'} dataset; the building shape is a visual encoding.`));scroller.append(section);
  }
  function districtView(){
    const rows=district.rows,color=district.color;
    const stage=el('section','dw-stage');stage.append(blocks(rows,color,model.metric,r=>{record=r;render();}));
    stage.append(el('p','dw-legend',`${Math.min(rows.length,36)} of ${rows.length} records shown as towers, largest first. Height encodes ${model.metric.label.toLowerCase()}; red marks a negative value.`));scroller.append(stage);
    const heading=el('div','dw-section-title');heading.append(el('h2',null,'Every building has a story'),el('p','dw-muted','Select a record to inspect its actual fields.'));scroller.append(heading);
    const list=el('div','dw-records');let shown=0;
    function more(){const stop=Math.min(rows.length,shown+36);for(;shown<stop;shown++){const r=rows[shown],b=button('','dw-record-card',()=>{record=r;render();});b.append(el('span','dw-record-no',String(r.index+1).padStart(3,'0')),el('strong',null,r.name),el('span','dw-record-number',fieldText(model.metric,r.value,r.item)));list.append(b);}next.hidden=shown>=rows.length;}
    const next=button('Show more records','dw-more',more);more();scroller.append(list,next);
  }
  function cityView(){
    const featured=model.districts.slice(0,6),stage=el('section','dw-stage dw-city-stage');
    featured.forEach(d=>{const b=button('','dw-neighbourhood',()=>{district=d;render();});b.style.setProperty('--district',d.color);const preview=blocks(d.rows.slice(0,12),d.color,model.metric,()=>{district=d;render();});preview.setAttribute('aria-hidden','true');preview.querySelectorAll('[tabindex]').forEach(e=>{e.removeAttribute('tabindex');e.removeAttribute('role');});b.append(preview,el('strong',null,d.label),el('span',null,`${d.count} records${d.usd!=null?' / '+cash(d.usd):''}`));stage.append(b);});scroller.append(stage);
    if(!model.count)scroller.append(el('p','dw-empty','This city has no records yet. Choose another city below.'));
    const title=el('div','dw-section-title');title.append(el('h2',null,'Choose a district'),el('p','dw-muted',`Grouped by ${model.group.label.toLowerCase()}. Each district opens its source records.`));scroller.append(title);
    const list=el('div','dw-districts');model.districts.forEach(d=>{const b=button('','dw-district-card',()=>{district=d;render();});b.style.setProperty('--district',d.color);b.append(el('span','dw-district-dot','◈'),el('strong',null,d.label),el('span',null,`${d.count} records`));if(d.usd!=null)b.append(el('b',null,cash(d.usd)));list.append(b);});scroller.append(list);
  }
  function portals(){
    const related=cities.filter(s=>s.id!==model.spec.id&&s.dataset===model.spec.dataset).slice(0,6);if(!related.length||!resolveCity)return;
    const section=el('section','dw-portals');section.append(el('p','dw-kicker','PORTALS / SAME DATA, ANOTHER VIEW'),el('h2',null,'There is a city inside this city.'));
    related.forEach(s=>{const b=button('','dw-portal',async()=>{const current=++token;b.disabled=true;try{const got=await resolveCity(s.id);if(closed||current!==token)return;if(!got?.dataset)throw Error('Unavailable');journey.push({model,district,record});model=cityDistricts(got.spec||s,got.dataset);district=null;record=null;render();}catch(_){b.disabled=false;b.append(el('small',null,'This city is not available yet. Try another portal.'));}});b.append(el('span','dw-portal-ring','◉'),el('strong',null,s.name),el('span',null,s.motto),el('em',null,'Open portal ↗'));section.append(b);});scroller.append(section);
  }
  function render(){
    setCrumbs();scroller.replaceChildren(crumbs);dialog.style.setProperty('--district',district?.color||model.spec.palette.accent);transition();
    const intro=el('section','dw-intro');intro.append(el('p','dw-kicker',`${model.demo?'SAMPLE DATA':'PUBLISHED DATA'} / ${record?'SOURCE RECORD':district?'DISTRICT':'CITY'}`),el('h1',null,record?'Inside the building':district?district.label:model.spec.name),el('p','dw-muted',district?`${district.count} actual records in ${model.spec.name}.`:model.spec.motto));
    const facts=el('div','dw-facts');facts.append(el('span',null,`${model.count.toLocaleString()} records`),el('span',null,`${model.districts.length} districts`),el('span',null,model.ds.title||model.source));intro.append(facts);scroller.append(intro);
    if(record)recordView();else if(district)districtView();else cityView();
    portals();scroller.append(el('p','dw-footnote',`${model.demo?'Sample data stands in for a missing feed. ':''}Read-only exploration. No trading settings or orders are changed.`));scroller.scrollTop=0;back.focus({preventScroll:true});
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();back.click();});
  render();dialog.showModal();return{close:exit,element:dialog};
}
