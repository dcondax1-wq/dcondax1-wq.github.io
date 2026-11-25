// PC CONTROL page logic (day-zerotouch2 2026-11-24). Pure: no DOM, no fetch. The page (pc.js) and node tests (tests/test_pc_page.py) use it.
// Input: the PC's merged status post (window.PC_FEED.fetchLatest: lite), its "ck" block from engine/pc_checklist.py.
// Output: the checklist rows, the ONE thing that needs the owner at the PC, and the exact command JSON + GitHub new-file link
// (control/inbox/<id>.json on the `control` branch of the backup repo: engine/remote_ctl.read_inbox runs it within ~60 s).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PCCORE = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PC_FRESH_S = 35 * 60;          // the report posts every 15 min; 2 missed posts + slack = silent
  const REPO_OK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/olympus$/i;   // <account>/olympus: the backup repo, nothing else (= main.js RC_REPO_OK)
  // the EXISTING safe remote commands (engine/remote_ctl.COMMANDS); arming real money is never one of them
  const BUTTONS = [
    { id: 'status', label: 'Status', sub: 'Fresh report + a phone notice', cmd: 'status' },
    { id: 'update', label: 'Update now', sub: 'Newest version (self-tests, rolls back on failure). Flat, outside 01:50-16:00 ET', cmd: 'update', gated: true },
    { id: 'restart', label: 'Restart', sub: 'Restart the bot server; armed accounts come back by auto-resume', cmd: 'restart', gated: true },
    { id: 'pause', label: 'Pause entries today', sub: 'No new entries until tomorrow; open trades keep stop + target', cmd: 'pause', until: 'tomorrow' },
    { id: 'resume', label: 'Resume', sub: 'Lift the pause: new entries allowed again', cmd: 'resume_entries' },
  ];
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);

  function postT(lite) { const l = lite || {}; return num(l.ext_t) || num((l.reporter || {}).t) || num(l.t); }
  function pcState(lite, nowS) {
    const t = num(((lite || {}).reporter || {}).t) || num((lite || {}).t);
    if (!t) return { ok: false, age: null, text: 'No report from the PC yet' };
    const age = Math.max(0, nowS - t);
    return { ok: age <= PC_FRESH_S, age, text: age <= PC_FRESH_S ? `PC on · reported ${Math.round(age / 60)} min ago` : `PC silent for ${Math.round(age / 60)} min` };
  }
  const tri = (v) => (v === 1 ? 'ok' : v === 0 ? 'bad' : 'unk');

  /** -> { rows: [{k, label, st: ok|bad|warn|unk, text}], need: {k, t} | null, pillars: [{p, st, text}], version } */
  function model(lite, nowS) {
    const now = num(nowS) || Date.now() / 1000;
    const ck = (lite && lite.ck) || null, pc = pcState(lite, now), rows = [];
    rows.push({ k: 'pc', label: 'PC on', st: pc.ok ? 'ok' : 'bad', text: pc.text });
    if (!ck) {
      rows.push({ k: 'old', label: 'Checklist', st: 'unk', text: lite ? 'The PC runs an older version (no checklist yet): tap Update now' : 'Waiting for the PC\'s report' });
      return { rows, need: pc.ok ? null : { k: 'pc', t: 'The PC is silent: check it is on and Windows is signed in' }, pillars: [], version: null, ck: null };
    }
    const nt = ck.nt || [];
    rows.push({ k: 'nt', label: 'NinjaTrader connected', st: nt[0] === 0 ? 'bad' : tri(nt[1]),
      text: nt[0] === 0 ? 'closed' : nt[1] === 1 ? 'connected' + (nt[2] === 1 ? ' · connects by itself' : '') : nt[1] === 0 ? 'NOT connected' : 'not known' });
    for (const a of ck.acc || []) {
      rows.push({ k: 'acc', label: a[0], st: a[1] && a[2] ? 'ok' : a[1] ? 'warn' : 'bad',
        text: (a[1] ? 'armed' : 'NOT armed') + (a[2] ? ' · comes back by itself' : ' · auto-resume OFF') });
    }
    if (!(ck.acc || []).length) rows.push({ k: 'acc', label: 'Accounts', st: 'warn', text: 'no armed real account' });
    const ka = ck.ka || null;
    rows.push({ k: 'ka', label: 'Keep-alive (7-day rule)', st: !ka ? 'unk' : ka[1] && ka[0] === ka[1] ? 'ok' : 'warn',
      text: !ka ? 'not known' : `ON for ${ka[0]} of ${ka[1]}` });
    const up = ck.up || {};
    rows.push({ k: 'up', label: 'Update', st: (up.b || []).length ? 'bad' : up.p ? 'warn' : up.v ? 'ok' : 'unk',
      text: (up.b || []).length ? `held back by ${up.b.slice(0, 2).join(', ')}` : up.p ? `${up.p} waiting (on ${up.v || '?'}); installs by itself outside trading hours`
        : up.v ? `installed: ${up.v}` : 'not known' });
    if (up.k && up.k.t) rows.push({ k: 'park', label: 'Auto-park', st: 'ok', text: `parked a local edit (${(up.k.f || []).join(', ')}) so the update could install; nothing lost` });
    const tr = ck.tr || null;
    rows.push({ k: 'tr', label: 'Tick recorder', st: !tr ? 'unk' : tr[2] ? 'ok' : 'warn', text: !tr ? 'not set up' : `${tr[0]} of ${tr[1]} days${tr[2] ? ' · recording' : ' · off'}` });
    rows.push({ k: 'bz', label: 'BLITZ', st: 'ok', text: ck.bz === 'off' ? 'off (paper only, hidden)' : ck.bz === 'paper' ? 'on (paper)' : 'on' });
    const clk = ck.clk || null;
    rows.push({ k: 'clk', label: 'Clock', st: !clk ? 'unk' : clk[0] ? 'ok' : 'bad', text: !clk ? 'not known' : clk[0] ? `OK (${clk[1]} s)` : `off by ${clk[1]} s` });
    const pillars = (ck.pl || []).map((p) => ({ p: { OF: 'Order Flow' }[p[0]] || p[0], st: p[1], text: p[2] }));
    const need = !pc.ok ? { k: 'pc', t: 'The PC is silent: check it is on and Windows is signed in' } : ck.need || null;
    return { rows, need, pillars, version: up.v || null, ck };
  }

  function repoOk(r) { return REPO_OK.test(String(r || '').trim()); }
  /** the command exactly as engine/remote_ctl.screen wants it: fresh id (once) + ts (15 min) */
  function build(btnId, nowS, rnd) {
    const b = BUTTONS.find((x) => x.id === btnId);
    if (!b) return null;
    const ts = Math.floor(num(nowS) || Date.now() / 1000), r = String(rnd || Math.random().toString(36).slice(2, 6)).replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'x';
    const o = { id: `${b.cmd}-${ts}-${r}`, ts, cmd: b.cmd };
    if (b.until) o.until = b.until;
    return o;
  }
  // day-zerotouch2 #5/#6: add an account (held, never armed) and queue a switch for the next START's phrase
  const PLANS = [['builder50k', 'MFFU Builder 50K'], ['builder25k', 'MFFU Builder 25K'], ['rapideod', 'MFFU Rapid EOD 50K'],
    ['rapideod25', 'MFFU Rapid EOD 25K'], ['lucidpro50k', 'LucidPro 50K']];
  const SWITCHES = [['combo_on', "ATLAS on Zlarior's 50K (the combo)"], ['blitz_on', 'BLITZ armed on its own 25K']];
  const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,59}$/;   // = engine/remote_ctl.ADD_NAME_RE
  function stamp(cmd, nowS, rnd) {
    const ts = Math.floor(num(nowS) || Date.now() / 1000), r = String(rnd || Math.random().toString(36).slice(2, 6)).replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'x';
    return { id: `${cmd}-${ts}-${r}`, ts, cmd };
  }
  /** -> the command, or {error} (checked here AND again on the PC) */
  function buildAdd(plan, name, funded, nowS, rnd) {
    const n = String(name || '').trim();
    if (!PLANS.some((p) => p[0] === plan)) return { error: 'Pick the plan' };
    if (!NAME_OK.test(n)) return { error: 'Type the account Name exactly as NinjaTrader shows it' };
    return { ...stamp('add_account', nowS, rnd), plan, name: n, funded: !!funded };
  }
  function buildSwitch(key, nowS, rnd) {
    if (!/^(combo_on|blitz_on|lane:[a-z][a-z0-9_]{1,30})$/.test(String(key || ''))) return { error: 'Unknown switch' };
    return { ...stamp('switch', nowS, rnd), key };
  }
  /** GitHub's new-file page with the file name and the command filled in: the owner taps Commit (one tap) */
  function newFileUrl(repo, cmd) {
    if (!repoOk(repo) || !cmd) return '';
    const json = JSON.stringify(cmd, null, 1);
    return `https://github.com/${String(repo).trim()}/new/control?filename=${encodeURIComponent('control/inbox/' + cmd.id + '.json')}&value=${encodeURIComponent(json)}`;
  }
  return { PC_FRESH_S, BUTTONS, PLANS, SWITCHES, model, build, buildAdd, buildSwitch, newFileUrl, repoOk, pcState, postT };
}));
