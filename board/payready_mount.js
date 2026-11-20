// Board: the payout readiness card (nqdash3 round 2, ../nq/payready.js). Waits for board.js's data (event "board-data"); DEMO = the NQ page's example.
import * as PR from '../nq/payready.js?v=2';

const $ = (id) => document.getElementById(id);
const today = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };
function agesToDays(x) {      // the example keeps "lt_days_ago": a real date counted back from today
  const f = JSON.parse(JSON.stringify(x || {}));
  for (const r of (f.mf && f.mf.a) || []) if (typeof r.lt_days_ago === 'number') { const t = new Date(today() + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - r.lt_days_ago); r.lt = t.toISOString().slice(0, 10); delete r.lt_days_ago; }
  return f;
}
let fx = null;
async function run() {
  const box = $('payReady'), d = window.BOARD && window.BOARD.data;
  if (!box || !d) return;
  let lite = d.lite, plan = d.plan, src = "From your PC's 15-minute report (its funded tracker). MFFU's rules as the payout coach codes them.";
  if (d.demo || !lite) {
    if (d.demo && !fx) { try { const r = await fetch('../nq/fixture.json', { cache: 'no-cache' }); fx = r.ok ? await r.json() : null; } catch (e) { fx = null; } }
    if (d.demo) { lite = agesToDays(fx && fx.payready_lite); src = 'EXAMPLE numbers (DEMO).'; }
    else src = "Your PC's report has not arrived on this page yet: the tracker fills in from it.";
  }
  try { PR.draw(box, PR.model(lite, null, plan, window.PAYOUT_COACH || null, today())); } catch (e) { /* never the page */ }
  const s = $('payReadySrc'); if (s) s.textContent = src;
}
window.addEventListener('board-data', run);
run();
