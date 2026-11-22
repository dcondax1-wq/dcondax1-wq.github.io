// MONEY PIPELINE page (day-a11y 2026-11-22). The rules live in pipelinecore.js. Draws with textContent only; it sends nothing.
import * as C from './pipelinecore.js?v=1';
const $ = (id) => document.getElementById(id);
const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode: works for this visit */ } };
async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
let G = C.loadGoal(read(C.KEY)), web = 0, trading = 0;

function drawGoal() {
  const g = C.goal(G, web, trading);
  $('gName').textContent = G.name; $('gHave').textContent = C.usd(g.have); $('gTarget').textContent = C.usd(g.target);
  $('gFill').style.width = g.pct + '%'; $('gBar').setAttribute('aria-valuenow', String(g.pct)); $('gBar').setAttribute('aria-valuetext', g.pct + '% (' + C.usd(g.have) + ' of ' + C.usd(g.target) + ')');
  $('gLine').textContent = g.left ? g.pct + '% there · ' + C.usd(g.left) + ' to go' : 'Goal reached.';
  const ul = $('gParts'); ul.textContent = '';
  for (const [l, v] of [['Website money (cleared)', g.website], ['Trading payouts to you', g.trading], ['Added by you', g.mine]]) {
    const li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('b');
    s.textContent = l; b.textContent = C.usd(v); li.append(s, b); ul.append(li);
  }
}
function drawFunnel(c) {
  const ol = $('funnel'); ol.textContent = '';
  const top = Math.max(1, c.dials || 0);
  for (const s of C.funnel(c)) {
    const li = document.createElement('li'), l = document.createElement('span'), b = document.createElement('b'), sm = document.createElement('small'), fb = document.createElement('span'), i = document.createElement('i');
    l.textContent = s.label; b.textContent = s.v == null ? '-' : String(s.v);
    sm.textContent = s.v == null ? 'on the PC card' : s.rate == null ? '' : s.rate + '% of the step before';
    fb.className = 'fb'; i.style.width = (s.v ? Math.max(2, Math.min(100, (s.v / top) * 100)) : 0) + '%'; fb.append(i);
    li.append(l, b, fb); if (sm.textContent) li.append(sm); ol.append(li);
  }
}
async function main() {
  drawGoal();
  const [lite, home] = await Promise.all([window.PC_FEED ? window.PC_FEED.fetchLatest({ feedUrl: '../status_feed.json' }).catch(() => null) : null, getJSON('../home.json')]);
  trading = C.tradingPayouts(home);
  const card = C.fromCard(lite && lite.ap);
  let c, src;
  if (card) { c = card; web = card.cleared; src = 'From the PC' + (card.t ? ' · ' + new Date(card.t * 1000).toLocaleString() : '') + '. Trading payouts from Home.'; }
  else {
    let st = null; try { st = JSON.parse(read('agency.portal.v1') || 'null'); } catch (e) { st = null; }
    c = C.fromLog(st && st.log); web = 0;
    src = 'The PC has not sent the pipeline yet: calls from this phone\'s caller log; website $ shows once the PC reports (or add it below).';
  }
  $('src').textContent = src;
  drawFunnel(c); drawGoal();
  $('tSetup').textContent = c.setup == null ? '-' : C.usd(c.setup); $('tMrr').textContent = c.mrr == null ? '-' : C.usd(c.mrr) + '/mo';
  $('tCleared').textContent = c.cleared == null ? '-' : C.usd(c.cleared);
}
$('gEdit').addEventListener('click', () => {
  const f = $('gForm'), open = f.hidden; f.hidden = !open; $('gEdit').setAttribute('aria-expanded', String(open));
  if (open) { $('gTargetIn').value = String(G.target); $('gNameIn').value = G.name; $('gTargetIn').focus(); }
});
$('gForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const t = Math.round(Number(String($('gTargetIn').value).replace(/[$,\s]/g, '')));
  if (!(t >= 1000 && t <= 10000000)) { $('gMsg').textContent = 'The goal must be $1,000 or more.'; return; }
  G.target = t; G.name = $('gNameIn').value.trim().slice(0, 40) || 'Corvette fund';
  const a = String($('gAmt').value).replace(/[$,\s]/g, '');
  if (a) { const r = C.addManual(G, a, $('gSrc').value, Date.now()); if (r.error) { $('gMsg').textContent = r.error; return; } $('gAmt').value = ''; }
  store(C.KEY, JSON.stringify(G)); $('gMsg').textContent = 'Saved on this phone.'; drawGoal();
});
main();
