// the one-page proposal (2026-11-22): reads what the portal stored on this phone, draws it with textContent only
import * as P from './portalcore.js?v=4';

const $ = (id) => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
let d = null;
try { d = JSON.parse(localStorage.getItem('agency.portal.proposal') || 'null'); } catch (e) { d = null; }
$('print').addEventListener('click', () => window.print());
if (d && d.lead && d.price) {
  const x = P.proposalFor(d.lead, d.caller, d.conf || {}, d.price, d.t || Date.now());
  document.title = 'Website proposal · ' + x.name;
  $('biz').textContent = x.name;
  $('meta').textContent = 'Prepared by ' + x.who + ' · ' + new Date(d.t || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' · prices hold until ' + x.valid;
  for (const [h, lines] of x.sections) {
    const s = el('section'); s.appendChild(el('h2', '', h));
    const ul = el('ul'); for (const l of lines) ul.appendChild(el('li', '', l)); s.appendChild(ul);
    $('secs').appendChild(s);
  }
  const c = d.conf || {};
  $('foot').textContent = [x.who, c.postal, c.agency_email, c.agency_number ? 'Call ' + c.agency_number + ': our AI assistant answers.' : ''].filter(Boolean).join(' · ');
}
