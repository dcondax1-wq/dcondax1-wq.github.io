(function(){
'use strict';
const ORDER=['ema_lon_vix','macd_sweep','sr_nyreclaim'];
const DEMO=[
 {key:ORDER[0],short:'EMA',label:'London EMA trend pullback',stage:'waiting',text:'The published account state will appear here.',hours:'03:00–09:30 ET',window:{text:'Demo only'}},
 {key:ORDER[1],short:'MACD',label:'MACD divergence at a sweep',stage:'waiting',text:'The published account state will appear here.',hours:'02:00–05:00 and 09:30–11:00 ET',window:{text:'Demo only'}},
 {key:ORDER[2],short:'S/R',label:'NY sweep-and-reclaim',stage:'waiting',text:'The published account state will appear here.',hours:'09:30–12:00 ET',window:{text:'Demo only'}}
];
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const low=q.get('q')==='low'||q.get('q')==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
if(low){document.documentElement.dataset.lite='true';$('quality').textContent='LITE CITY';}
let members=DEMO, selected=ORDER[0], snapshotOld=true, camera={yaw:-22,pan:0,zoom:0}, pointer=null;
const money=n=>typeof n==='number'&&Number.isFinite(n)?'$'+Math.round(n).toLocaleString('en-US'):'—';
const ageOf=home=>{
 // The page build may be recent while the underlying account snapshot is old.
 const raw=home&&home.board&&home.board.data_t;
 const t=typeof raw==='number' ? (raw>1e12?raw:raw*1000) : typeof raw==='string'&&raw.trim() ? Date.parse(raw) : NaN;
 const age=Date.now()-t;
 return Number.isFinite(age)&&age>=-5*60000?Math.max(0,age):Infinity;
};
const clean=(v,n=240)=>String(v==null?'':v).slice(0,n);
function updateCamera(){
 $('city').style.setProperty('--yaw',camera.yaw+'deg');
 $('city').style.setProperty('--pan',camera.pan+'px');
 $('city').style.setProperty('--zoom',camera.zoom+'px');
}
function select(key){
 if(!ORDER.includes(key))return;
 selected=key;
 const m=members.find(x=>x.key===key)||DEMO[ORDER.indexOf(key)];
 $('number').textContent=String(ORDER.indexOf(key)+1).padStart(2,'0')+' / 03';
 $('title').textContent=clean(m.label,90);
 $('status').textContent=snapshotOld?'Published state is old or unavailable. '+clean(m.text,300):clean(m.text,300)||'No current setup note was published.';
 $('hours').textContent=clean(m.hours,90)||'Not published';
 $('window').textContent=clean(m.window&&m.window.text,110)||'Not published';
 const stage=clean(m.stage,30).toLowerCase();
 $('state').textContent=snapshotOld?'Snapshot old':stage==='off'?'Outside hours':stage==='armed'?'Setup forming':stage||'No state';
 $('state').className='state '+(snapshotOld||stage==='off'?'warn':'active');
 document.querySelectorAll('[data-key]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.key===key)));
}
function buildOutposts(rows){
 const box=$('outposts');box.replaceChildren();
 if(!rows.length){box.append(Object.assign(document.createElement('p'),{textContent:'No paper setup summaries were published.'}));return;}
 rows.forEach(row=>{
  const card=document.createElement('article');card.className='outpost';
  const name=document.createElement('b');name.textContent=clean(row.label||row.key,100);
  const badge=document.createElement('span');badge.textContent='PAPER ONLY';badge.className='paper-badge';
  const sample=document.createElement('p');
  const paper=row.paper&&typeof row.paper==='object'?row.paper:null;
  const n=paper?Number(paper.n):NaN;
  sample.textContent=Number.isFinite(n)&&n>=0?Math.round(n)+' paper trades · '+money(paper.usd)+' recorded paper net':'No paper sample published';
  const note=document.createElement('small');note.textContent='Research outpost. This setup is not routed by this city.';
  card.append(name,badge,sample,note);box.append(card);
 });
}
function apply(home){
 const atlas=home&&home.board&&home.board.atlas;
 const list=Array.isArray(atlas&&atlas.members)?atlas.members:[];
 members=ORDER.map(key=>list.find(x=>x&&x.key===key)||DEMO[ORDER.indexOf(key)]);
 const age=ageOf(home);
 snapshotOld=age>90*60000||!atlas;
 const label=!Number.isFinite(age)?'Source time unknown':age<60000?'Source just updated':Math.round(age/60000)+' min since source';
 $('freshness').textContent=snapshotOld?'Old · '+label:label;
 // Account figures have no value as current KPIs without a fresh source timestamp.
 $('room').textContent=!snapshotOld&&typeof atlas.room==='number'&&Number.isFinite(atlas.room)?money(atlas.room)+' / '+money(atlas.mll):'—';
 $('target').textContent=!snapshotOld&&typeof atlas.to_target==='number'&&Number.isFinite(atlas.to_target)?money(atlas.to_target):'—';
 const active=members.filter(x=>x.stage==='armed').map(x=>x.short);
 $('answer').textContent=snapshotOld?'The published ATLAS snapshot is old or unavailable. The three districts remain a read-only guide.':
  active.length?active.join(' and ')+' setup'+(active.length===1?' is':'s are')+' forming in the latest published snapshot. Tap a tower for details.':
  'No ATLAS setup is marked as forming in the latest published snapshot. Tap a tower for details.';
 buildOutposts(Array.isArray(home&&home.second&&home.second.strategies)?home.second.strategies.filter(s=>s&&s.route===false):[]);
 select(selected);
}
document.querySelectorAll('[data-key]').forEach(el=>el.addEventListener('click',()=>select(el.dataset.key)));
$('left').addEventListener('click',()=>{camera.yaw-=18;updateCamera();});
$('right').addEventListener('click',()=>{camera.yaw+=18;updateCamera();});
$('home').addEventListener('click',()=>{camera={yaw:-22,pan:0,zoom:0};updateCamera();});
$('scene').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;pointer={x:e.clientX,y:e.clientY,yaw:camera.yaw,pan:camera.pan};$('scene').setPointerCapture(e.pointerId);$('city').classList.add('drag');});
$('scene').addEventListener('pointermove',e=>{if(!pointer)return;camera.yaw=pointer.yaw+(e.clientX-pointer.x)*.33;camera.pan=Math.max(-85,Math.min(85,pointer.pan+(e.clientY-pointer.y)*.3));updateCamera();});
const release=()=>{pointer=null;$('city').classList.remove('drag');};   // after a drag the camera glides again (the buttons and keys ease)
$('scene').addEventListener('pointerup',release);
$('scene').addEventListener('pointercancel',release);
$('scene').addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A'){camera.yaw-=12;e.preventDefault();}
 else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D'){camera.yaw+=12;e.preventDefault();}
 else if(e.key==='w'||e.key==='W'){camera.zoom=Math.max(-100,camera.zoom-20);e.preventDefault();}
 else if(e.key==='s'||e.key==='S'){camera.zoom=Math.min(100,camera.zoom+20);e.preventDefault();}
 updateCamera();
});
async function refresh(){
 try{const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
  const response=await fetch('../home.json?atlas_city='+Math.floor(Date.now()/300000),{cache:'no-store',signal:ac.signal});clearTimeout(t);
  if(!response.ok)throw new Error('HTTP '+response.status);
  apply(await response.json());
 }catch(_){apply(null);}
}
function decorateCity(){
 const box=$('city-lights');if(!box)return;
 const hubs=[[130,160,76],[430,155,76],[285,410,76],[278,275,88]];
 const palette=['#c8a24a','#9c6b3c','#b99a68','#8d8472','#7f8a52'];
 for(let row=0;row<14;row++)for(let col=0;col<14;col++){
  const seed=col*73+row*131;
  const x=22+col*39+((seed*17)%13)-6,y=23+row*39+((seed*29)%15)-7;
  if(hubs.some(([hx,hy,r])=>Math.hypot(x-hx,y-hy)<r))continue;
  // Broad avenues and smaller cross-streets keep the skyline clustered instead of gridded.
  if((col===6||col===7)&&row>2&&row<11||row===7&&col>1&&col<12)continue;
  const edge=Math.hypot(x-280,y-280)/395;
  const h=15+((seed*19)%42)+Math.max(0,Math.round((1-edge)*30));
  const w=11+((seed*7)%16),d=9+((seed*11)%16);
  const el=document.createElement('span');el.className='city-light form-'+(seed%4);el.style.left=x+'px';el.style.top=y+'px';
  el.style.setProperty('--h',h+'px');el.style.setProperty('--w',w+'px');el.style.setProperty('--d',d+'px');
  el.style.setProperty('--alpha',String(Math.max(.48,1-edge*.45)));
  el.style.setProperty('--c',palette[(seed+row)%palette.length]);
  el.setAttribute('aria-hidden','true');el.innerHTML='<i class="front"></i><i class="side"></i><i class="roof"></i>';
  box.append(el);
 }
}
decorateCity();
apply(null);refresh();setInterval(()=>{if(!document.hidden)refresh();},300000);
window.ATLAS_CITY={state:()=>({selected,snapshotOld,camera:{...camera},districts:members.map(x=>({key:x.key,stage:x.stage}))})};
}());

