// Jarvis's morning briefing (2026-11-04): one card, read out loud, at 7 AM ET and on the first open of each day.
//   bots status · drawdown left on the real MFFU account(s) · today's plan and trading windows · the Kalshi summary · the Planner
//   to-dos that are due · ONE thing to do. After it, "Save to Obsidian" files it as OLYMPUS/Notes/Daily brief.md (a dated section
//   per day) through the memory's own yes / no question (memory.js confirmWrite): nothing is written before "yes".
// One ES module, no imports. The pure part (buildBrief, the quiet hours, when it is due) runs in node (tests/test_jarvis_home.py);
// the page part mounts itself when the shell is up, like backdrop.js. Read-only: it never trades, arms or sends anything.
//
//   buildBrief(D, opt) -> { day, title, lines: [{ k, label, text, say }], one: { text, say, action? }, speak, note }
//     D    = the brain's digest (brain.js digest(): accounts, window, market, kalshi, plan, todos, reminders, priorities, live ...)
//     opt  = { now (ms), facts (data.js getFacts(): system view), one (an item from modes.think), hide (hide balances),
//              day (team X2 2026-11-14: [{ k, label, text, speak }] from ../olympus/day.js briefLine: your work shift over the bot's windows,
//              the weather (api.weather.gov) and NQ / Fed / CPI headlines, all fetched by the PC: tools/calendar_sync.py + tools/day_feeds.py) }
//   alertsCfg(storage) / saveAlerts(storage, cfg) / inQuiet(cfg, min) / mayTalk(cfg, min)     'jarvis.alerts.v1'
//   briefPlan(state, nowMs, cfg) -> { card, speak, day }      what to do right now (once per ET day each)
//
// Shell hooks (index.html): window.__jarvis.digest() / think() / speakOn() / busy() / hidden(), window.__jarvisMemory.setBrief() /
// confirmWrite(); window.__jarvisBrief = this page's controls (run, state, build, saveSettings); window.__jarvisAlerts = { get, mayTalk }.
// iPhone Safari 16: plain ES2020, no regex lookbehind, no optional chaining.

export const BRIEF_KEY = 'jarvis.brief.v1';          // { day, shown, spoken } (this phone only)
export const ALERTS_KEY = 'jarvis.alerts.v1';        // { speak, brief, quiet, from, to }
export const BRIEF_HOUR = 7;                         // ET

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 300);
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + 's'}`;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ------------------------------------------------------------------------------------------------ the New York clock
export function etNow(ms) {
  const t = ms == null ? Date.now() : ms;
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(t))) p[x.type] = x.value;
    const h = +p.hour % 24, m = +p.minute;
    return { ymd: `${p.year}-${p.month}-${p.day}`, y: +p.year, mo: +p.month, d: +p.day, h, m, min: h * 60 + m, wd: WD.indexOf(p.weekday) };
  } catch (_) { const d = new Date(t); return { ymd: d.toISOString().slice(0, 10), y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay() }; }
}
const hhmm = (s, dflt) => { const m = /^(\d{1,2}):(\d\d)$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : dflt; };

// ------------------------------------------------------------------------------------------------ speak alerts + quiet hours
export function alertsCfg(storage) {
  let c = {};
  try { c = JSON.parse((storage && storage.getItem(ALERTS_KEY)) || '{}') || {}; } catch (_) { c = {}; }
  const pad = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  return { speak: c.speak !== false, brief: c.brief !== false, quiet: c.quiet !== false, from: pad(hhmm(c.from, 22 * 60)), to: pad(hhmm(c.to, 7 * 60)) };
}
export function saveAlerts(storage, cfg) {
  const c = Object.assign(alertsCfg(storage), isObj(cfg) ? cfg : {});
  const out = { speak: !!c.speak, brief: !!c.brief, quiet: !!c.quiet, from: hhmm(c.from, 22 * 60) >= 0 ? String(c.from) : '22:00', to: String(c.to) };
  try { if (storage) storage.setItem(ALERTS_KEY, JSON.stringify(out)); } catch (_) { /* not kept */ }
  return alertsCfg(storage);
}
// the minute of the ET day is inside the quiet window (it may wrap midnight: 22:00 to 07:00)
export function inQuiet(cfg, min) {
  if (!cfg || !cfg.quiet) return false;
  const a = hhmm(cfg.from, 22 * 60), b = hhmm(cfg.to, 7 * 60);
  if (a === b) return false;
  return a < b ? min >= a && min < b : min >= a || min < b;
}
export const mayTalk = (cfg, min) => !!cfg && cfg.speak && !inQuiet(cfg, min);

// ------------------------------------------------------------------------------------------------ when it is due
// state: { day, shown, spoken } of the last run. A card on the first open of each ET day; the voice from 7:00 ET (and outside the
// quiet hours) once per day: opened at 5 AM in the quiet hours = the card only, the voice at the next tick after 7:00.
export function briefPlan(state, nowMs, cfg) {
  const e = etNow(nowMs), st = isObj(state) && state.day === e.ymd ? state : { day: e.ymd, shown: false, spoken: false };
  const c = cfg || alertsCfg(null);
  if (c.brief === false) return { card: false, speak: false, day: e.ymd };
  const card = !st.shown;                                                    // any hour: the first open of the day shows it
  const speak = !st.spoken && e.min >= BRIEF_HOUR * 60 && mayTalk(c, e.min);   // the voice from 7:00 ET, outside the quiet hours
  return { card, speak, day: e.ymd };
}

// ------------------------------------------------------------------------------------------------ the briefing itself
const usd = (v, hide) => { const n = num(v); if (n == null) return 'unknown'; if (hide) return 'hidden'; return (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); };
const sgn = (v, hide) => { const n = num(v); if (n == null) return 'unknown'; if (hide) return 'hidden'; return (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); };
// spoken: dollars as words, no symbols
const said = (s) => String(s || '').replace(/([+-]?)\$([\d,]+)/g, (m0, sg, n) => (sg === '-' ? 'minus ' : sg === '+' ? 'plus ' : '') + n.replace(/,/g, '') + ' dollars')
  .replace(/(\d)%/g, '$1 percent').replace(/\bMNQ\b/g, 'micro').replace(/\bNQ\b/g, 'N Q').replace(/\bMFFU\b/g, 'M F F U').replace(/[·•|→]/g, ',').replace(/[*_#`[\]<>]/g, '').replace(/\s+/g, ' ').trim();
const hm12 = (min) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const joinWords = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '');

export function buildBrief(D, opt) {
  const o = isObj(opt) ? opt : {}, d = isObj(D) ? D : {}, hide = !!o.hide;
  const e = etNow(o.now), f = isObj(o.facts) ? o.facts : {};
  const word = e.h < 12 ? 'Good morning' : e.h < 18 ? 'Good afternoon' : 'Good evening';
  const lines = [], say = [];
  const add = (k, label, text, speakText) => { lines.push({ k, label, text, say: speakText == null ? said(text) : speakText }); say.push(speakText == null ? said(text) : speakText); };

  // 1. the bots
  const sys = isObj(f.system) ? f.system : null, live = isObj(d.live) ? d.live : {};
  const rows = sys ? arr(sys.rows).filter(isObj) : [], bad = rows.filter((r) => r.level === 'bad'), warn = rows.filter((r) => r.level === 'warn');
  let bots;
  if (live.missing && !rows.length) bots = 'No feed from the PC yet, so I cannot see the bots.';
  else if (bad.length) bots = `${plural(bad.length, 'system')} need you: ${joinWords(bad.slice(0, 3).map((r) => str(r.name, 20)))}.${str(sys && sys.todo, 160) ? ' ' + str(sys.todo, 160) + '.' : ''}`;
  else if (warn.length) bots = `Running, with ${joinWords(warn.slice(0, 3).map((r) => str(r.name, 20)))} to watch.`;
  else if (live.stale) bots = `The last PC update is old${live.ago ? ' (' + live.ago + ')' : ''}.`;
  else bots = rows.length ? 'All systems look good.' : 'The bots look fine from here.';
  add('bots', 'Bots', bots);

  // 2. drawdown left, the real MFFU accounts (the 50K first)
  const accts = arr(d.accounts).filter((a) => isObj(a) && num(a.room) != null);
  if (accts.length) {
    const order = (a) => (a.key === 'lit' ? 0 : a.key === 'atlas' ? 1 : 2);
    const list = accts.slice().sort((a, b) => order(a) - order(b));
    const txt = list.map((a) => `${str(a.name, 20)} ${usd(a.room, hide)} drawdown left${num(a.room_frac) != null ? ` (${Math.round(a.room_frac * 100)}% of the room)` : ''}${num(a.to_target) != null && a.status === 'eval' ? `, ${usd(a.to_target, hide)} to the target` : ''}`);
    const low = list.find((a) => num(a.room_frac) != null && a.room_frac < 0.4);
    add('drawdown', 'Drawdown left', txt.join('. ') + '.', said(txt.slice(0, 2).join('. ') + '.') + (low ? ` ${str(low.name, 20)} is getting low: size down.` : ''));
  } else add('drawdown', 'Drawdown left', 'No eval numbers in the feed yet.', 'I have no eval numbers yet.');

  // 3. today: the market, the next trading window, the Planner's events
  const plan = isObj(d.plan) ? d.plan : null, evs = plan ? arr(plan.ev).filter(isObj) : [];
  const win = isObj(d.window) ? str(d.window.text, 200) : '';
  const evTxt = evs.slice(0, 3).map((x) => `${x.allDay || x.min == null ? 'all day' : hm12(x.min)} ${str(x.title, 40)}`);
  const todayTxt = [win ? win.replace(/\.$/, '') : '', evTxt.length ? `Planner: ${evTxt.join('; ')}${evs.length > 3 ? '…' : ''}` : plan ? 'Nothing in your Planner today' : ''].filter(Boolean).join('. ') + '.';
  add('today', "Today's plan", todayTxt, said([win.replace(/\.$/, ''), evTxt.length ? `You have ${plural(evs.length, 'event')}, first ${evTxt[0]}` : plan ? 'Nothing in your Planner today' : ''].filter(Boolean).join('. ') + '.'));

  // 3b. your day from the PC (only when the PC's own link serves ../day/day.json): the work shift, the weather, the headlines
  for (const l of arr(o.day).filter((x) => isObj(x) && str(x.text, 300)).slice(0, 3)) add(str(l.k, 12) || 'work', str(l.label, 20) || 'Work', str(l.text, 300), said(str(l.speak, 300) || str(l.text, 300)));

  // 4. Kalshi
  const k = isObj(d.kalshi) ? d.kalshi : { state: 'missing' };
  if (k.state === 'ok') {
    const strat = arr(k.strategies).filter((s) => isObj(s) && num(s.pnl) != null).sort((a, b) => b.pnl - a.pnl);
    const best = strat[0], worst = strat.length > 1 ? strat[strat.length - 1] : null;
    const kt = `${str(k.run, 40) ? str(k.run, 40) + '. ' : ''}Today ${sgn(k.today_pnl, hide)}, this week ${sgn(k.week_pnl, hide)}.${best ? ` Best ${str(best.name, 24)} ${sgn(best.pnl, hide)}${worst && worst.pnl < 0 ? `, worst ${str(worst.name, 24)} ${sgn(worst.pnl, hide)}` : ''}.` : ''}`;
    add('kalshi', 'Kalshi', kt);
  } else add('kalshi', 'Kalshi', k.state === 'waiting' ? 'Not connected yet.' : k.state === 'error' ? 'I cannot reach its feed right now.' : 'No Kalshi numbers yet.');

  // 5. to-dos that are due: the Planner's open tasks (overdue first) and Jarvis's own list and reminders for today
  const tasks = plan ? arr(plan.tasks).filter(isObj) : [], over = tasks.filter((t) => t.overdue), mine = arr(d.todos).filter(isObj);
  const rems = arr(d.reminders).filter((r) => isObj(r) && num(r.at) != null && etNow(r.at).ymd === e.ymd && r.at >= (o.now || Date.now()) - 60e3);
  const due = [];
  for (const t of over.slice(0, 2)) due.push(`${str(t.title, 50)} (overdue)`);
  for (const t of tasks.filter((x) => !x.overdue).slice(0, 2)) due.push(str(t.title, 50));
  for (const r of rems.slice(0, 2)) due.push(`${str(r.text, 50)} at ${hm12(etNow(r.at).min)}`);
  const total = tasks.length + mine.length + rems.length;
  add('todos', 'To-dos due', total ? `${plural(total, 'thing')}${over.length ? ` (${over.length} overdue)` : ''}: ${due.concat(mine.slice(0, Math.max(0, 3 - due.length)).map((m) => str(m.text, 50))).slice(0, 4).join('; ')}.` : 'Nothing due. Clear.',
    total ? `${plural(total, 'to-do')} due${over.length ? `, ${over.length} overdue` : ''}. First: ${said(due[0] || str(mine[0] && mine[0].text, 50))}.` : 'No to-dos due.');

  // 6. the one thing to do
  const top = isObj(o.one) && str(o.one.text, 300) ? o.one : arr(d.priorities)[0] ? { text: d.priorities[0].text, say: d.priorities[0].speak, action: d.priorities[0].app ? { type: 'open', value: d.priorities[0].app } : null } : null;
  const one = top ? { text: str(top.text, 300), say: str(top.say, 300) || said(top.text), action: top.action || null }
    : { text: 'Nothing urgent. Keep the rules: stop beyond the sweep, size follows the stop, one target.', say: 'Nothing urgent. Keep the rules.', action: null };

  const title = `${word} · ${WD[e.wd] || ''} ${MON[e.mo - 1] || ''} ${e.d}`;
  const speak = `${word}. ${say.join(' ')} One thing to do: ${one.say}`.replace(/\s+/g, ' ').trim();
  const note = [`### ${title} · ${hhmmText(e)} ET`, ...lines.map((l) => `- **${l.label}:** ${l.text}`), `- **One thing:** ${one.text}`].join('\n');
  return { day: e.ymd, title, lines, one, speak: speak.length > 900 ? speak.slice(0, 897).replace(/\s+\S*$/, '') + '.' : speak, note };
}
const hhmmText = (e) => `${((e.h + 11) % 12) + 1}:${String(e.m).padStart(2, '0')} ${e.h < 12 ? 'AM' : 'PM'}`;

// ------------------------------------------------------------------------------------------------ the page
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function briefHTML(b) {
  return `<p class="bf-h"><b>${esc(b.title)}</b><small>MORNING BRIEFING</small></p>`
    + b.lines.map((l) => `<div class="bf-r bf-${esc(l.k)}"><span>${esc(l.label)}</span><p>${esc(l.text)}</p></div>`).join('')
    + `<div class="bf-one"><span>ONE THING</span><p>${esc(b.one.text)}</p></div>`
    + '<div class="bf-b"><button type="button" data-bf="read">Read it</button><button type="button" data-bf="save">Save to Obsidian</button><button type="button" data-bf="x" class="ghost">Done</button></div>';
}

function mount() {
  const W = window, root = document.documentElement;
  const ls = (() => { try { return W.localStorage; } catch (_) { return null; } })();
  const J = () => W.__jarvis || null;
  const readState = () => { try { return JSON.parse(ls.getItem(BRIEF_KEY) || 'null'); } catch (_) { return null; } };
  const writeState = (s) => { try { ls.setItem(BRIEF_KEY, JSON.stringify(s)); } catch (_) { /* not kept */ } };
  const cfg = () => alertsCfg(ls);
  const ctl = (W.__jarvisBrief = { state: 'idle', runs: 0, last: null, error: '' });
  W.__jarvisAlerts = { get: cfg, mayTalk: () => mayTalk(cfg(), etNow().min) };

  async function build() {
    const j = J();
    const D = j && typeof j.digest === 'function' ? j.digest() : null;
    let one = null;
    try { const t = j && typeof j.think === 'function' ? await j.think() : null; one = t && arr(t.items)[0] ? t.items[0] : null; } catch (_) { one = null; }
    const facts = j && typeof j.facts === 'function' ? (() => { try { return j.facts(); } catch (_) { return null; } })() : null;
    let day = null;                                    // your day (the PC's own link only; on the public site the file is missing and nothing changes)
    try {
      const cpw = W.__jarvisCopilot, S = cpw && typeof cpw.sources === 'function' ? await cpw.sources() : null;   // copilot-card.js's read of the published files
      if (S && S.day) { const m = await import('../olympus/day.js'); day = m.briefLine(S.day, Date.now()); }
    } catch (_) { day = null; }
    return buildBrief(D, { now: Date.now(), facts, day, one: one ? { text: one.text, say: one.say, action: one.action } : null, hide: !!(j && typeof j.hidden === 'function' && j.hidden()) });
  }
  function cardEl(b, scroll) {
    const talk = document.getElementById('talk');
    if (!talk) return null;
    for (const old of document.querySelectorAll('.jbrief')) old.remove();                  // one card at a time, above the chat (not a chat message)
    const m = document.createElement('div'); m.className = 'jbrief'; m.innerHTML = briefHTML(b);
    talk.parentNode.insertBefore(m, talk);
    const says = document.getElementById('says'); if (says) says.textContent = b.title + (scroll ? '' : ': your briefing is below');
    const calm = root.dataset.fx === 'off' || root.dataset.fx === 'low';
    // asked for ("brief me", Read it): it comes into view. On its own (7 AM, the first open) the home stays where it is
    if (scroll) requestAnimationFrame(() => { try { m.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' }); } catch (_) { /* old browser */ } });
    m.addEventListener('click', (ev) => {
      const bt = ev.target.closest('[data-bf]'); if (!bt) return;
      if (bt.dataset.bf === 'read') speakIt(b, true);
      else if (bt.dataset.bf === 'x') m.remove();
      else if (bt.dataset.bf === 'save') saveIt(b, m);
    });
    return m;
  }
  function speakIt(b, force) {
    const j = J();
    if (!j || typeof j.talk !== 'function') return false;
    if (!force && (!j.speakOn() || j.busy())) return false;
    j.talk(b.speak);
    return true;
  }
  // "Save to Obsidian": the memory asks yes or no (naming the file); the yes / no buttons answer it through the brain
  async function saveIt(b, host) {
    const mem = W.__jarvisMemory;
    const box = document.createElement('div'); box.className = 'bf-q';
    host.appendChild(box);
    if (!mem || typeof mem.confirmWrite !== 'function') { box.textContent = 'Obsidian is not set up on this phone yet (⋯ → Obsidian).'; return; }
    try { mem.setBrief(b.note); } catch (_) { /* optional */ }
    box.textContent = 'Preparing the note…';
    let r = null;
    try { r = await mem.confirmWrite({ kind: 'create', title: 'Daily brief', text: b.note }); } catch (_) { r = null; }
    if (!r) { box.textContent = 'Could not prepare the note.'; return; }
    box.innerHTML = `<p>${esc(String(r.text).split('\n')[0])}</p><div class="bf-b"><button type="button" data-yn="yes">Yes, save</button><button type="button" data-yn="no" class="ghost">No</button></div>`;
    box.addEventListener('click', (ev) => {
      const yn = ev.target.closest('[data-yn]'); if (!yn) return;
      const j = J(); box.remove();
      if (j && typeof j.ask === 'function') j.ask(yn.dataset.yn);
    });
  }
  async function run(opts) {
    const o = isObj(opts) ? opts : {};
    if (ctl.state === 'running') return null;
    ctl.state = 'running';
    try {
      const b = await build();
      ctl.last = b; ctl.runs++;
      try { if (W.__jarvisMemory && W.__jarvisMemory.setBrief) W.__jarvisMemory.setBrief(b.note); } catch (_) { /* optional */ }
      cardEl(b, !!o.scroll);
      if (o.speak) speakIt(b, !!o.force);
      return b;
    } catch (e) { ctl.error = String((e && e.message) || e); return null; }
    finally { ctl.state = 'idle'; }
  }
  ctl.run = run; ctl.build = build; ctl.plan = () => briefPlan(readState(), Date.now(), cfg());

  // the clock: a card on the first open each day, the voice from 7:00 ET (outside quiet hours), once each
  async function tick() {
    if (document.hidden || !root.dataset.ready) return;
    const j = J(); if (!j || j.active() !== 'home') return;
    const now = Date.now(), p = briefPlan(readState(), now, cfg());
    if (!p.card && !p.speak) return;
    const st0 = readState(), st = st0 && st0.day === p.day ? st0 : { day: p.day, shown: false, spoken: false };
    if (j.busy()) return;                                           // she is talking or listening: try again at the next tick
    if (p.card) {
      st.shown = true;
      const speakNow = p.speak && j.speakOn();
      if (speakNow) st.spoken = true;
      writeState(st);
      await run({ speak: speakNow });
    } else if (p.speak && j.speakOn() && ctl.last) {                // the card was shown in the quiet hours: now the voice, no second card
      st.spoken = true; writeState(st);
      speakIt(ctl.last, false);
    } else if (p.speak && j.speakOn()) {
      st.spoken = true; writeState(st); await run({ speak: true });
    }
  }
  ctl.tick = tick;

  // Settings → Jarvis: the speak-alerts / briefing / quiet-hours rows (plain inputs in the sheet; saved with its Save button)
  const $ = (id) => document.getElementById(id);
  function loadSettings() {
    const c = cfg();
    if ($('setSpeakAlerts')) $('setSpeakAlerts').checked = c.speak;
    if ($('setBriefOn')) $('setBriefOn').checked = c.brief;
    if ($('setQuiet')) $('setQuiet').checked = c.quiet;
    if ($('setQuietFrom')) $('setQuietFrom').value = c.from;
    if ($('setQuietTo')) $('setQuietTo').value = c.to;
    quietRow();
  }
  function quietRow() { const r = $('setQuietRow'); if (r && $('setQuiet')) r.hidden = !$('setQuiet').checked; }
  function saveSettings() {
    if (!$('setSpeakAlerts')) return;
    saveAlerts(ls, { speak: $('setSpeakAlerts').checked, brief: $('setBriefOn').checked, quiet: $('setQuiet').checked, from: $('setQuietFrom').value || '22:00', to: $('setQuietTo').value || '07:00' });
  }
  ctl.saveSettings = saveSettings; ctl.loadSettings = loadSettings;
  const sheet = $('settings');
  if (sheet) {
    new MutationObserver(() => { if (!sheet.hidden) loadSettings(); }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
    const form = $('setF'); if (form) form.addEventListener('submit', saveSettings);
    const q = $('setQuiet'); if (q) q.addEventListener('change', quietRow);
  }
  // "brief me" / "good morning" typed or spoken reach the old briefing; the card is the same words plus the drawdown line
  setInterval(() => { tick().catch(() => {}); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => tick().catch(() => {}), 1500); });
  setTimeout(() => tick().catch(() => {}), 5200);
  ctl.state = 'ready';
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let waited = 0;
  const go = () => {
    if (window.__jarvis && document.documentElement.dataset.ready) { try { mount(); } catch (e) { window.__jarvisBrief = { state: 'off', error: String((e && e.message) || e) }; } return; }
    if ((waited += 300) < 30000) setTimeout(go, 300);
  };
  go();
}
