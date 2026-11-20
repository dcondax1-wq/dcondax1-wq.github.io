/* WEBSITE BUSINESS HQ (agency/index.html top, 2026-11-20 day-web-hub; owner: "an aspect in Olympus needs to be an expert on marketing 3D
 * websites"). The page's top half: today's next step, the pipeline (leads -> called -> proposal -> paid), the care-plan MRR goal line, the 7
 * sections as big tiles, and this week's plan for a solo owner with a day job. The cold-call CRM below it (agency.js) is untouched.
 *
 * Reads (all optional, graceful when absent):
 *   localStorage 'agency.crm.v1'            the CRM's own state (stages, calls, call-back days, prices) -> called / proposal / paid / MRR
 *   window.AGENCY.S.data                    the lead list the CRM (agency.js) loaded (my_leads.json else leads.json; leads.json if it never loads)
 *   localStorage 'agency.<slice>.summary'   each section's summary, else ./<slice>/summary.json when sections.json says so:
 *       {n, label, next, t, pipe: {leads, called, proposal, paid}, mrr}   (slice = expert | leads | audit | demos | showcase | offers)
 *   ./sections.json                         which sections are live ({sections: {slice: {live, summary_file}}}; "Being built" when not)
 * Writes only 'agency.hq.week.v1' (this week's ticks, this phone). Sends nothing. Text only through textContent.
 * Classic script: window.AGENCY_HQ (module.exports in node: the pure part, tests/test_web_hub.py). */
(function (root) {
  'use strict';
  var SLICES = ['expert', 'leads', 'audit', 'demos', 'showcase', 'offers'];
  var GOAL_MRR = 3000;                         // retainers a month: 10 clients at about $300 (research 2026-11-20: the 'call engine' $500 + $299/mo is offer #1)
  var WEEK = [                                 // a solo owner with a day job, about 4 hours a week (research 2026-11-20 'first 5 clients')
    { d: 1, slice: 'leads', what: 'Find 10 leads: good reviews, no or slow website', mins: 20 },
    { d: 2, slice: 'audit', what: 'Free accessibility + speed check on 3 of their sites', mins: 20 },
    { d: 3, slice: 'demos', what: 'Build a demo of ONE lead\u2019s own business', mins: 60 },
    { d: 4, slice: 'calls', what: 'Lunch break: call 5 leads (by hand, business numbers)', mins: 30 },
    { d: 5, slice: 'offers', what: 'Send 2 proposals: call engine $500 + $299/mo', mins: 30 },
    { d: 6, slice: 'showcase', what: 'Walk in to 1 business with its demo', mins: 60 }
  ];
  var CALLED = { contacted: 1, callback: 1, won: 1, lost: 1 };

  function num(x) { var n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : 0; }
  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function usd(n) { return '$' + Math.round(num(n)).toLocaleString('en-US'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /** the summary of one section, tolerant of junk: {n, label, next, t, pipe, mrr} or null */
  function normSummary(s) {
    s = obj(s); if (!Object.keys(s).length) return null;
    var p = obj(s.pipe), out = { n: num(s.n), label: String(s.label || '').slice(0, 60), next: String(s.next || '').slice(0, 140), t: num(s.t), pipe: {}, mrr: Math.max(0, num(s.mrr)) };
    ['leads', 'called', 'proposal', 'paid'].forEach(function (k) { if (p[k] != null) out.pipe[k] = Math.max(0, Math.round(num(p[k]))); });
    return out;
  }

  /** everything the HQ shows, from plain data. in = {crm, leads: [{id, name}], sums: {slice: summary}, exists: {slice: bool}, today: 'YYYY-MM-DD'} */
  function compute(inp) {
    inp = obj(inp);
    var crm = obj(obj(inp.crm).leads), leads = Array.isArray(inp.leads) ? inp.leads : [], sums = obj(inp.sums), today = String(inp.today || '');
    var names = {}; leads.forEach(function (l) { if (l && l.id) names[l.id] = l.name || l.id; });
    var called = 0, proposal = 0, won = 0, mrr = 0, due = [];
    Object.keys(crm).forEach(function (id) {
      var e = obj(crm[id]), st = String(e.stage || '');
      if (CALLED[st] || num(e.calls) > 0) called++;
      if (st === 'won') { won++; mrr += Math.max(0, num(e.monthly)); }
      else if (st !== 'lost' && st !== 'dnc' && num(e.price) > 0) proposal++;
      if (e.callback && today && String(e.callback) <= today && st !== 'won' && st !== 'lost' && st !== 'dnc') due.push(names[id] || 'a lead');
    });
    var S = {}; SLICES.forEach(function (k) { var s = normSummary(sums[k]); if (s) S[k] = s; });
    var pick = function (k, mine) { var best = mine; SLICES.forEach(function (sl) { if (S[sl] && S[sl].pipe[k] != null) best = Math.max(best, S[sl].pipe[k]); }); return best; };
    var pipe = { leads: pick('leads', Math.max(leads.length, S.leads ? S.leads.n : 0)), called: pick('called', called), proposal: pick('proposal', proposal), paid: pick('paid', won) };
    var mrrAll = Math.max(mrr, S.offers ? S.offers.mrr : 0);
    var next;
    if (due.length) next = { text: 'Call back ' + due[0] + (due.length > 1 ? ' (+' + (due.length - 1) + ' more due)' : ''), why: 'You promised a call-back for today.', to: '#today', label: 'Open Call today' };
    else if (S.offers && S.offers.next) next = { text: S.offers.next, why: 'From Offers: a proposal or a client is waiting.', to: 'offers/', label: 'Open Offers' };
    else if (pipe.proposal > 0) next = { text: 'Follow up your ' + plural(pipe.proposal, 'open proposal'), why: 'A short follow-up 2-3 days after a proposal wins most deals.', to: inp.exists && inp.exists.offers ? 'offers/' : '#list', label: 'Open the proposals' };
    else if (!pipe.leads) next = { text: 'Find your first 20 leads', why: 'Good reviews but no website or a slow one (17% of US small businesses have none): about 15 minutes.', to: 'leads/', label: 'Open Leads' };
    else if (pipe.called < 10) next = { text: 'Call 5 leads at lunch', why: plural(pipe.leads - pipe.called > 0 ? pipe.leads - pipe.called : 0, 'lead') + ' not called yet. The opener is ready on each lead.', to: '#today', label: 'Open Call today' };
    else if (!(S.audit && S.audit.n)) next = { text: 'Audit 3 prospects’ websites', why: 'A free audit opens the door: it shows them what they lose.', to: 'audit/', label: 'Open Audit' };
    else next = { text: 'Build one 3D demo for your best lead', why: 'A demo of THEIR business (their name, their photos) is the pitch.', to: 'demos/', label: 'Open Demos' };
    return { pipe: pipe, mrr: mrrAll, goal: GOAL_MRR, pct: Math.min(100, Math.round(100 * mrrAll / GOAL_MRR)), next: next, sums: S, due: due.length };
  }

  function isoWeek(d) {   // 'YYYY-Www' of a Date, local time
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()), day = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - day + 3); var y = t.getFullYear(), first = new Date(y, 0, 4);
    var w = 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
    return y + '-W' + (w < 10 ? '0' : '') + w;
  }

  var API = { SLICES: SLICES, WEEK: WEEK, GOAL_MRR: GOAL_MRR, compute: compute, normSummary: normSummary, isoWeek: isoWeek, usd: usd };
  root.AGENCY_HQ = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------------------------------------------ the page
  var d = document, WKEY = 'agency.hq.week.v1';
  var $ = function (id) { return d.getElementById(id); };
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function lsGet(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function getJSON(u) {
    try { return fetch(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(null, function () { return null; }); }
    catch (e) { return Promise.resolve(null); }
  }
  function localDay() { var t = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()); }

  function draw(R, ex) {
    $('hqNextText').textContent = R.next.text;
    $('hqNextWhy').textContent = R.next.why;
    var go = $('hqNextGo'); go.href = R.next.to; go.textContent = R.next.label;
    [['leads', 'hqPLeads'], ['called', 'hqPCalled'], ['proposal', 'hqPProp'], ['paid', 'hqPPaid']].forEach(function (p) { $(p[1]).textContent = String(R.pipe[p[0]]); });
    $('hqMrr').textContent = usd(R.mrr) + ' a month';
    $('hqGoal').textContent = 'Goal ' + usd(R.goal) + ' a month: 10 clients at about $300 (call engine $500 + $299/mo). An estimate, not a promise.';
    var bar = $('hqBar'); bar.style.setProperty('--p', R.pct + '%'); bar.setAttribute('aria-label', 'Monthly retainers ' + usd(R.mrr) + ' of ' + usd(R.goal) + ' a month: ' + R.pct + '%');
    SLICES.forEach(function (k) {
      var t = d.querySelector('.hq-tile[data-slice="' + k + '"]'); if (!t) return;
      var line = t.querySelector('.hq-live'), s = R.sums[k];
      if (ex[k] === false) { t.classList.add('soon'); line.textContent = 'Being built'; t.setAttribute('aria-disabled', 'true'); return; }
      t.classList.remove('soon'); t.removeAttribute('aria-disabled');
      if (s && s.label) line.textContent = s.label;
    });
    var c = d.querySelector('.hq-tile[data-slice="calls"] .hq-live');
    if (c) c.textContent = R.due ? plural(R.due, 'call-back') + ' due' : plural(Math.max(0, R.pipe.leads - R.pipe.called), 'lead') + ' to call';
  }

  function drawWeek() {
    var wk = isoWeek(new Date()), st = obj(lsGet(WKEY)), ticks = st.w === wk ? obj(st.done) : {}, dow = new Date().getDay();
    var rows = d.querySelectorAll('#hqWeek li[data-day]');
    for (var i = 0; i < rows.length; i++) {
      (function (li) {
        var day = +li.getAttribute('data-day'), box = li.querySelector('input');
        li.classList.toggle('today', day === dow || (dow === 0 && day === 6));
        box.checked = !!ticks[day]; li.classList.toggle('done', box.checked);
        box.onchange = function () { ticks[day] = box.checked ? 1 : 0; li.classList.toggle('done', box.checked); lsSet(WKEY, { w: wk, done: ticks }); count(); };
      })(rows[i]);
    }
    function count() { var n = 0; for (var k in ticks) if (ticks[k]) n++; $('hqWeekCount').textContent = n + ' of ' + rows.length + ' done this week'; }
    count();
  }

  function boot() {
    if (!$('hq')) return;
    drawWeek();
    var sums = {}, ex = {};
    SLICES.forEach(function (k) { var s = lsGet('agency.' + k + '.summary'); if (s) sums[k] = s; });
    // the lead list: the one agency.js (the CRM below) already loaded (window.AGENCY.S.data), so nothing is fetched twice; leads.json after 8 s
    var leadsP = new Promise(function (ok) {
      var t0 = Date.now();
      (function wait() {
        var A = root.AGENCY;
        if (A && A.ready && A.ready() && A.S && A.S.data) return ok(A.S.data);
        if (Date.now() - t0 > 8000) return ok(getJSON('./leads.json'));
        setTimeout(wait, 120);
      })();
    });
    // which sections are live: ./sections.json (the lead sets it at landing; no probing = no 404 in the console). Missing file = all live
    var exP = getJSON('./sections.json').then(function (reg) {
      var secs = obj(obj(reg).sections), jobs = [];
      SLICES.forEach(function (k) {
        var s = obj(secs[k]); ex[k] = s.live !== false;
        if (ex[k] && s.summary_file && !sums[k]) jobs.push(getJSON('./' + k + '/summary.json').then(function (j) { if (j) sums[k] = j; }));
      });
      return Promise.all(jobs);
    });
    Promise.all([leadsP, exP]).then(function (r) {
      var data = r[0] || {}, R = compute({ crm: lsGet('agency.crm.v1'), leads: data.leads || [], sums: sums, exists: ex, today: localDay() });
      draw(R, ex);
      API.ready = true; API.last = R;
    });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
}(typeof window !== 'undefined' ? window : globalThis));
