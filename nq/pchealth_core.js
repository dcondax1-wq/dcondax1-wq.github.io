// PC HEALTH core (night-nq-home 2026-11-27, owner: "what I open when something feels wrong"). Pure: no DOM, no fetch.
// Input: the PC's merged public status post (window.PC_FEED.fetchLatest: lite). Output: one check per part of the PC with a
// state (green / amber / red / grey = the PC does not send it) and ONE plain sentence, worst first, plus the overall state.
// Real fields only (tools/pc_report.full + engine/pc_checklist "ck", engine/self_heal "sh", engine/readiness "rd", tickrec "tr",
// the remote-control "rc"). Account ids are masked (last 4 at most). Browser: window.PCHEALTH; node tests: module.exports.
(function (root) {
  'use strict';
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
  const FRESH_S = 35 * 60, LATE_S = 3 * 3600;
  const RANK = { red: 3, amber: 2, green: 1, grey: 0 };

  function ageText(s) {
    if (s == null) return 'never';
    s = Math.max(0, Math.round(s));
    return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? (s / 3600).toFixed(1) + ' h' : Math.round(s / 86400) + ' days';
  }
  // privacy: an account id like MFFUSFBLDR…6018 / MFFUEVBLDR12346016 -> "…6018"
  function mask(t) {
    return String(t == null ? '' : t).replace(/\b[A-Z]{3,}[A-Z0-9_-]*?(?:…|\.\.\.)?(\d{4})\b/g, '…$1');
  }

  // QA #1 (lead 2026-11-27): the PC cuts rd text at 200 bytes: never show it cut mid-word ("(Claud"): drop an unclosed bracket,
  // else end at the last whole word + "…". And when rd says an account is not armed but the PC's live state says it IS armed, say so.
  function tidyCut(t) {
    t = String(t == null ? '' : t).trim();
    if (!t) return t;
    const open = t.lastIndexOf('('), close = t.lastIndexOf(')');
    if (open > close) return t.slice(0, open).trim().replace(/[,;:]$/, '') + (/[.!?]$/.test(t.slice(0, open).trim()) ? '' : '.');
    if (/[.!?)"]$/.test(t)) return t;
    return t.length >= 60 ? t.replace(/\s+\S*$/, '') + '…' : t;
  }
  function rdDisagrees(L, rd) {   // rd blames "<account> is not armed" while ck.acc / ar say that account is armed
    const m = rd && /^(.+?) is not armed/i.exec(String(rd.b || ''));
    if (!m) return null;
    const who = m[1].trim(), low = who.toLowerCase();
    const acc = isObj(L.ck) && Array.isArray(L.ck.acc) ? L.ck.acc.find((r) => Array.isArray(r) && String(r[0]).toLowerCase() === low) : null;
    const key = /atlas/i.test(who) ? 'atlas' : /rapid/i.test(who) ? 'rapid' : /#2/.test(who) ? 'b25k_2' : /zlarior|lit/i.test(who) ? 'lit' : null;
    const ar = isObj(L.ar) && key && Array.isArray(L.ar[key]) ? L.ar[key] : null;
    return (acc && acc[1]) || (ar && ar[0]) ? who : null;
  }
  function postT(L) { return num(L.ext_t) || num(isObj(L.reporter) ? L.reporter.t : null) || num(L.t); }
  const SH_WORDS = { update_blocked: 'the update is blocked', server: 'the bot server is down', disk: 'the disk is nearly full',
    pip: 'a package will not install', clock: 'the PC clock is off', git_lock: 'a git lock is stuck', oif_stuck: 'an old order file is stuck',
    pid: 'a pid file is stuck', nt: 'NinjaTrader is closed', backup: 'the weekly encrypted backup needs you', site: 'the site copy needs you',
    roll: 'the contract roll needs you' };

  function checks(lite, o) {
    o = o || {};
    const now = num(o.now) != null ? +o.now : Date.now() / 1000;
    const L = isObj(lite) ? lite : null;
    const out = [];
    const add = (id, title, state, say, fix) => out.push({ id, title, state, say: mask(say), fix: fix ? mask(fix) : null });
    if (!L) {
      add('report', 'PC report', 'red', 'No report from the PC at all.', 'On the PC: double-click TRADE_HOME, press 1 (Status).');
      return finish(out, null);
    }
    const t = postT(L), age = t != null ? now - t : null;
    const ck = isObj(L.ck) ? L.ck : {}, sh = isObj(L.sh) ? L.sh : null, rd = isObj(L.rd) ? L.rd : null, tr = isObj(L.tr) ? L.tr : null;
    const rep = isObj(L.reporter) ? L.reporter : {}, pv = isObj(L.pc_verdict) ? L.pc_verdict : null;
    // 1 the report itself
    add('report', 'PC report', age == null ? 'red' : age <= FRESH_S ? 'green' : age <= LATE_S ? 'amber' : 'red',
      age == null ? 'The report has no time on it.' : 'The PC reported ' + ageText(age) + ' ago' + (age <= FRESH_S ? ' (it reports every 15 minutes).' : ': that is late, it should report every 15 minutes.'),
      age != null && age > FRESH_S ? 'Is the PC on and awake? On the PC: TRADE_HOME, press 1 (Status).' : null);
    const stale = age == null || age > LATE_S;
    // 2 the bot server + its own verdict
    const srv = ck.srv != null ? !!ck.srv : rep.server != null ? !!rep.server : null;
    const lv = pv ? String(pv.level || '') : '';
    add('server', 'Bot', srv === false || lv === 'bad' ? 'red' : srv == null && !pv ? 'grey' : lv === 'warn' ? 'amber' : 'green',
      (srv === false ? 'The bot server is not answering. ' : '') + (pv ? (pv.label || pv.code || '') + (pv.reason ? ': ' + pv.reason : '') : srv ? 'The bot server answers.' : 'The PC did not say.'),
      srv === false || lv === 'bad' ? 'On the PC: TRADE_HOME, press 2 (Start bot).' : null);
    // 3 NinjaTrader: running, connected, connect on startup
    const nt = Array.isArray(ck.nt) ? ck.nt : null;
    if (!nt) add('nt', 'NinjaTrader', rep.nt === false ? 'red' : rep.nt ? 'green' : 'grey', rep.nt === false ? 'NinjaTrader is not running.' : rep.nt ? 'NinjaTrader is running.' : 'The PC did not say.', rep.nt === false ? 'Open NinjaTrader and log in.' : null);
    else {
      const [run, conn, auto] = nt;
      const armedN = Array.isArray(ck.acc) ? ck.acc.filter((r) => Array.isArray(r) && r[1]).length : 0;
      // lead 2026-11-27: connect-on-startup OFF = after a restart (Windows Update, power cut) nothing trades until someone logs in:
      // red while accounts are armed (money waits on it), amber otherwise. Menu wording from docs/ONE_TIME_SETUP.md + docs/HANDS_FREE.md.
      add('nt', auto === 0 && run !== 0 && conn !== 0 ? 'NinjaTrader connect-on-startup OFF' : 'NinjaTrader',
        run === 0 || conn === 0 ? 'red' : auto === 0 ? (armedN ? 'red' : 'amber') : 'green',
        run === 0 ? 'NinjaTrader is closed.' : conn === 0 ? 'NinjaTrader runs but is not connected.' :
          'Running and connected now, but after a restart (Windows Update, power cut) nothing trades until you log in by hand' +
            (auto === 0 ? (armedN ? ': ' + armedN + ' armed account(s) would sit idle.' : '.') : '') ,
        run === 0 ? 'Open NinjaTrader and log in.' : conn === 0 ? 'NinjaTrader: Connections, connect your account.' :
          auto === 0 ? 'Once, 3 clicks: NinjaTrader Control Center > Connections > Configure > your MFFU connection > tick "Connect on startup" > OK.' : null);
      if (auto !== 0 && run !== 0 && conn !== 0) out[out.length - 1].say = 'Running and connected; it logs in by itself after a restart.';
    }
    // 4 code version + the hourly auto-update
    const up = isObj(ck.up) ? ck.up : {};
    const blk = Array.isArray(up.b) ? up.b.filter(Boolean) : [];
    const shBlk = sh && Array.isArray(sh.need) && sh.need.indexOf('update_blocked') >= 0;
    add('version', 'Code version', blk.length || shBlk ? 'red' : up.p ? 'amber' : up.v ? 'green' : 'grey',
      (up.v ? 'Running version ' + String(up.v).slice(0, 7) + '. ' : 'The PC did not send its version. ') +
        (blk.length || shBlk ? 'The update is HELD BACK' + (blk.length ? ' by ' + blk.slice(0, 2).join(', ') : '') + '.' :
          up.p ? 'A newer version (' + String(up.p).slice(0, 7) + ') is waiting: the PC updates itself within the hour when flat, outside 01:50-16:00 ET.' :
            up.v ? 'Up to date: it updates itself hourly when flat, outside 01:50-16:00 ET.' : ''),
      blk.length || shBlk ? 'Send /update force in Telegram (it parks the blocking file; nothing is lost), or on the PC: UPDATE.bat.' : null);
    // 5 every account armed (the PC's own list: label, armed, auto-resume, keep-alive)
    const acc = Array.isArray(ck.acc) ? ck.acc.filter((r) => Array.isArray(r) && r[0]) : [];
    if (acc.length) {
      const off = acc.filter((r) => !r[1]);
      add('armed', 'Accounts armed', off.length ? 'red' : 'green',
        off.length ? off.map((r) => r[0]).join(', ') + ' NOT armed (' + (acc.length - off.length) + ' of ' + acc.length + ' armed).' : 'All ' + acc.length + ' armed: ' + acc.map((r) => r[0]).join(', ') + '.',
        off.length ? 'On the PC: TRADE_HOME, press 2 (Start bot) and type your arm phrase yourself.' : null);
      const nores = acc.filter((r) => r[1] && !r[2]);
      add('resume', 'Comes back after a restart', nores.length ? 'amber' : 'green',
        nores.length ? nores.map((r) => r[0]).join(', ') + ': auto-resume is off (after a PC restart it stays disarmed).' : 'Every armed account re-arms by itself after a restart.',
        nores.length ? 'On the PC: TRADE_HOME, press 2 once more; it asks to keep it armed after restarts.' : null);
    } else add('armed', 'Accounts armed', 'grey', 'The PC did not send its account list.', null);
    // 6 the pre-window ready check (engine/readiness)
    if (rd && (rd.s === 'ok' || rd.s === 'warn' || rd.s === 'no')) {
      const dis = rd.s === 'no' ? rdDisagrees(L, rd) : null;
      add('ready', 'Ready check', dis ? 'amber' : rd.s === 'ok' ? 'green' : rd.s === 'warn' ? 'amber' : 'red',
        (dis ? 'The ready check says ' + dis + ' is not armed, but the PC\'s live state says it is armed: the two disagree, being checked.' :
          (rd.s === 'ok' ? 'READY' : rd.s === 'warn' ? 'READY, 1 to watch' : 'NOT READY') + (rd.w ? ' for ' + rd.w + ' ET' : '') + (rd.b ? ': ' + tidyCut(rd.b).replace(/\.$/, '') + '.' : '.')) +
          (age != null ? ' Checked with the report ' + ageText(age) + ' ago.' : ''),
        dis ? 'Look at the bot window on the PC: if ' + dis + ' shows ARMED, nothing to do.' : rd.s === 'no' ? tidyCut(rd.f || 'On the PC: double-click HEALTH_CHECK.bat.') : null);
    }
    // 7 keep-alive (MFFU closes an account after 7 idle days)
    const ka = Array.isArray(ck.ka) ? ck.ka : null;
    if (ka) add('keepalive', 'Keep-alive', ka[0] >= ka[1] ? 'green' : 'amber', ka[0] + ' of ' + ka[1] + ' armed accounts have keep-alive on (MFFU closes an account after 7 idle days).',
      ka[0] >= ka[1] ? null : 'On the PC: TRADE_HOME, press 3, type KEEP ALIVE ON yourself.');
    // 8 clock
    const clk = Array.isArray(ck.clk) ? ck.clk : null;
    add('clock', 'PC clock', !clk ? 'grey' : clk[0] ? 'green' : 'red',
      !clk ? 'The PC did not send its clock check.' : clk[0] ? 'On time (' + (Math.abs(num(clk[1]) || 0) < 1 ? 'less than 1 s off' : num(clk[1]) + ' s off') + ').' : 'The clock is ' + num(clk[1]) + ' s off: trades could fire at the wrong minute.',
      clk && !clk[0] ? 'On the PC: right-click FIX_CLOCK.bat > Run as administrator.' : null);
    // 9 self-heal + disk + backup (engine/self_heal hourly)
    if (sh) {
      const need = (Array.isArray(sh.need) ? sh.need : []).filter((k) => k !== 'update_blocked' && k !== 'backup');
      add('selfheal', 'Self-heal', need.length ? 'amber' : 'green',
        (need.length ? 'Needs you: ' + need.map((k) => SH_WORDS[k] || k).join(', ') + '. ' : 'Nothing stuck. ') + 'It fixed ' + (num(sh.fixed) || 0) + ' thing(s) by itself this week.',
        need.length ? 'On the PC: double-click PC_CARE.bat.' : null);
      const free = num(sh.free);
      add('disk', 'Disk space', free == null ? 'grey' : free < 8 ? 'red' : free < 15 ? 'amber' : 'green',
        free == null ? 'The PC did not send its free space.' : free + ' GB free' + (num(sh.bot) != null ? ', bot folder ' + num(sh.bot) + ' GB' : '') + '.',
        free != null && free < 15 ? 'On the PC: double-click CLEAN_STORAGE.bat.' : null);
      const bk = Array.isArray(sh.need) && sh.need.indexOf('backup') >= 0;
      add('backup', 'Weekly backup', bk ? 'amber' : 'green', bk ? 'The weekly encrypted backup did not run (failed or not set up yet).' : 'No backup problem reported this week.',
        bk ? 'On the PC: double-click BACKUP_SETUP.bat once.' : null);
      const st = num(sh.t);
      if (st != null && now - st > 3 * 3600) add('selfheal_age', 'Self-heal ran', 'amber', 'Its last run was ' + ageText(now - st) + ' ago (it runs hourly).', null);
    } else add('selfheal', 'Self-heal', 'grey', 'The PC did not send the self-heal line (it may be an older version).', null);
    // 10 order flow (tick recorder)
    if (tr) add('ticks', 'Order flow recorder', tr.on ? (num(tr.e) ? 'amber' : 'green') : 'amber',
      (tr.on ? 'Recording. ' : 'OFF. ') + (num(tr.d) != null ? num(tr.d) + ' tick days' + (tr.o ? ' since ' + tr.o : '') : '') +
        (tr.bf ? ', backfill ' + tr.bf : '') + (num(tr.h) ? ', ' + num(tr.h) + ' gap day(s)' : '') + (num(tr.e) ? ', ' + num(tr.e) + ' fetch error(s)' : '') + '.',
      tr.on ? null : 'python -X utf8 -m engine.tickrec enable');
    // 11 remote control (Telegram / phone commands)
    const rc = isObj(L.rc) ? L.rc : null;
    if (rc) add('remote', 'Phone commands', rc.on ? (rc.st === 'refused' || rc.st === 'error' ? 'amber' : 'green') : 'amber',
      rc.on ? 'On. ' + (rc.last ? 'Last: ' + String(rc.last).replace(/^remote:\s*/i, '').replace(/^last\s+(cmd\s+)?/i, '') + '.' : '') : 'Off: Telegram / phone commands are not read.',
      rc.on && (rc.st === 'refused' || rc.st === 'error') ? 'Nothing to do if you meant it: a refused command changes nothing (wrong time or phrase). Send it again if needed.' : null);
    // 12 not in the public post yet (honest): Telegram alerts, OneDrive, last update time
    const al = isObj(L.al) ? L.al : null;
    if (al && al.tg != null) add('alerts', 'Telegram alerts', al.tg ? 'green' : 'amber', al.tg ? 'Set up: alerts reach your Telegram.' : 'Not set up: alerts only reach the Olympus app.',
      al.tg ? null : 'On the PC: TRADE_HOME, press 5 (Phone alerts).');
    else add('alerts', 'Telegram alerts', 'grey', 'The PC does not send this yet. Send /status in Telegram: an answer means it works.', null);
    if (al && al.od != null) add('onedrive', 'OneDrive', al.od ? 'amber' : 'green', al.od ? 'The bot folder is inside OneDrive: syncing can lock files.' : 'The bot folder is not inside OneDrive.', null);
    else add('onedrive', 'OneDrive', 'grey', 'The PC does not send this yet.', null);
    if (al && num(al.ut) != null) add('updated', 'Last update', now - num(al.ut) > 3 * 86400 ? 'amber' : 'green', 'Last update installed ' + ageText(now - num(al.ut)) + ' ago.', null);
    if (stale) for (const c of out) if (c.id !== 'report' && c.state === 'green') { c.state = 'grey'; c.say = 'Old report: ' + c.say; }
    return finish(out, age);
  }
  function finish(list, age) {
    const worst = list.reduce((m, c) => (RANK[c.state] > RANK[m] ? c.state : m), 'grey');
    const overall = list.length ? (worst === 'grey' ? 'grey' : worst) : 'grey';
    const P = ['report', 'ready', 'armed', 'server', 'version', 'nt', 'clock'], pi = (c) => (P.indexOf(c.id) < 0 ? 99 : P.indexOf(c.id));
    const order = list.map((c, i) => [c, i]).sort((a, b) => RANK[b[0].state] - RANK[a[0].state] || pi(a[0]) - pi(b[0]) || a[1] - b[1]).map((x) => x[0]);
    const bad = order.filter((c) => c.state === 'red' || c.state === 'amber');
    const say = overall === 'green' ? 'All good: nothing needs you.' : overall === 'grey' ? 'Not enough from the PC to tell.' :
      (bad.length === 1 ? '1 thing needs you: ' : bad.length + ' things need you, first: ') + bad[0].title + '.';
    return { overall, say, age, checks: order, counts: { red: bad.filter((c) => c.state === 'red').length, amber: bad.filter((c) => c.state === 'amber').length,
      green: list.filter((c) => c.state === 'green').length, grey: list.filter((c) => c.state === 'grey').length } };
  }
  const API = { checks, mask, tidyCut, ageText, FRESH_S, LATE_S };
  root.PCHEALTH = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
