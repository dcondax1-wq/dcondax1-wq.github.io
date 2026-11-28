// PC CONTROL page (day-zerotouch2 2026-11-24): the live checklist from the PC's post + five safe buttons. Logic: pccore.js.
(function () {
  'use strict';
  const C = window.PCCORE, $ = (id) => document.getElementById(id);
  const S = { lite: null };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // the same phone-only setting as the app's Remote page (main.js store 'rcRepo': localStorage 'le.rcRepo', JSON)
  const getRepo = () => { try { const v = JSON.parse(localStorage.getItem('le.rcRepo') || '""'); return C.repoOk(v) ? v : ''; } catch (_) { return ''; } };
  const setRepo = (v) => { try { localStorage.setItem('le.rcRepo', JSON.stringify(v)); } catch (_) { /* private mode */ } };
  function toast(t, ms) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms || 2600); }

  function render() {
    const now = Date.now() / 1000, m = C.model(S.lite, now), pc = C.pcState(S.lite, now);
    $('pill').textContent = pc.ok ? 'PC: on' : 'PC: silent'; $('pill').className = 'pill ' + (pc.ok ? 'ok' : 'bad');
    $('sub').textContent = pc.text + (m.version ? ` · version ${m.version}` : '');
    const nd = $('need');
    nd.className = 'card need ' + (m.need ? 'bad' : S.lite ? 'ok' : '');
    $('needText').textContent = m.need ? m.need.t : S.lite ? 'Nothing. Everything runs by itself.' : 'checking…';
    $('rows').innerHTML = m.rows.map((r) => `<li><span class="dot ${esc(r.st)}"></span><b>${esc(r.label)}</b><span class="t">${esc(r.text)}</span></li>`).join('');
    $('pillars').innerHTML = (m.pillars.length ? m.pillars : [{ p: 'LIT', st: 'wait', text: 'waiting' }, { p: 'ATLAS', st: 'wait', text: 'waiting' }, { p: 'BLITZ', st: 'wait', text: 'waiting' }, { p: 'POSEIDON', st: 'wait', text: 'waiting' }])
      .map((p) => `<div class="pl ${esc(p.st)}"><b>${esc(p.p)}</b><span>${esc(p.text)}</span></div>`).join('');
    const rc = (S.lite && S.lite.rc) || null;
    $('last').textContent = rc && rc.last ? `Last command: ${rc.last}` : 'No phone command yet.';
  }

  function renderButtons() {
    $('btns').innerHTML = C.BUTTONS.map((b) => `<button type="button" class="btn" data-b="${esc(b.id)}"><b>${esc(b.label)}</b><span>${esc(b.sub)}</span></button>`).join('');
    $('btns').onclick = (e) => {
      const el = e.target.closest('[data-b]');
      if (!el) return;
      const cmd = C.build(el.dataset.b, Date.now() / 1000), repo = getRepo(), json = JSON.stringify(cmd, null, 1);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).catch(() => null);   // fallback: paste it
      if (!repo) { toast('First type your backup repo below (account/olympus), then tap again', 4500); const i = $('repoIn'); if (i) i.focus(); return; }
      window.open(C.newFileUrl(repo, cmd), '_blank', 'noopener');   // in the same tap (a popup after an await is blocked on iOS)
      toast('GitHub opens: tap Commit changes. The PC acts within about a minute.', 4000);
    };
    const repo = getRepo();
    $('repoBox').innerHTML = repo
      ? `<p class="note">Commands go to the <b>control</b> branch of your backup repo (saved on this phone). <button type="button" id="repoEdit">Change repo</button></p>`
      : `<label class="note" for="repoIn"><b>Once: your backup repo</b> (your second GitHub account, a slash, olympus; saved on this phone only)</label>
         <input id="repoIn" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="account/olympus"><button type="button" id="repoSave">Save repo</button>`;
    const sv = $('repoSave');
    if (sv) sv.onclick = () => {
      const v = String($('repoIn').value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/+$/g, '');
      if (!C.repoOk(v)) { toast('Write it as account/olympus', 3500); return; }
      setRepo(v); toast('Saved on this phone'); renderButtons();
    };
    const ed = $('repoEdit');
    if (ed) ed.onclick = () => { setRepo(''); renderButtons(); };
  }

  function send(cmd) {
    if (!cmd || cmd.error) { toast((cmd && cmd.error) || 'Not sent', 3500); return; }
    const repo = getRepo();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(JSON.stringify(cmd, null, 1)).catch(() => null);
    if (!repo) { toast('First type your backup repo above (account/olympus), then tap again', 4500); return; }
    window.open(C.newFileUrl(repo, cmd), '_blank', 'noopener');
    toast('GitHub opens: tap Commit changes. The PC answers on your phone within about a minute.', 4000);
  }
  function renderExtra() {
    $('addPlan').innerHTML = C.PLANS.map((p) => `<option value="${esc(p[0])}">${esc(p[1])}</option>`).join('');
    $('addGo').onclick = () => send(C.buildAdd($('addPlan').value, $('addName').value, $('addFunded').checked, Date.now() / 1000));
    $('sws').innerHTML = C.SWITCHES.map((x) => `<button type="button" class="btn" data-sw="${esc(x[0])}"><b>${esc(x[1])}</b><span>Turns on at your next START</span></button>`).join('');
    $('sws').onclick = (e) => { const b = e.target.closest('[data-sw]'); if (b) send(C.buildSwitch(b.dataset.sw, Date.now() / 1000)); };
  }

  async function load() {
    try {
      const F = window.PC_FEED;
      if (F && F.fetchLatest) {
        const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', location.href).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
        if (lite) S.lite = lite;
      }
    } catch (_) { /* keep the last one */ }
    render();
    document.documentElement.dataset.ready = '1';
  }
  renderButtons();
  renderExtra();
  render();
  load();
  setInterval(load, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  window.__pc = { model: () => C.model(S.lite, Date.now() / 1000), set: (l) => { S.lite = l; render(); } };
}());
