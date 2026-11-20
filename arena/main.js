// ARENA, Olympian Ranks (OLYMPUS, 2026-11-03): the page. Rules: rules.json + rules.js; sources: sources.js; progress on this
// phone: ledger.js; the colosseum: scene.js; the HUD: hud.js. window.ARENA is the test hook (state, export, refresh).
import { score, pickQuests, verifyQuest, questEvents, etDay, etHour } from './rules.js';
import { loadRules, loadSite, gather } from './sources.js';
import { openLedger } from './ledger.js';
import * as HUD from './hud.js';
import { evaluateWeek, history as bossHistory, bossEvents, bossStats, weekStart, featured } from './bosses.js';
import { trophies as makeTrophies } from './trophies.js';
import * as X from './extras.js';
import { desk } from './rhythm.js';
import { illustratedColosseum } from './illustration.js?v=c2';

const O = window.OLYMPUS || null;
const JARVIS_ORIGIN = (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io');   // Jarvis is on the same origin as the app; the old address only when opened from a file
const REFRESH_MS = 60000;
(function () {   // static local artwork only (no event/user data), parsed as SVG and added as a DOM node (never as an HTML string); a parse error = no artwork
  const host = document.getElementById('arena-illustration');
  const doc = new DOMParser().parseFromString(illustratedColosseum(), 'image/svg+xml');
  if (host && doc.documentElement && doc.documentElement.nodeName === 'svg') host.appendChild(document.importNode(doc.documentElement, true));
})();
// the demo's phone: what a linked Planner, vault and Kalshi feed would show on Friday 2026-10-30 at 17:00 ET
const DEMO_FACTS = { planner: true, habits: true, vault: true, kalshi: true, tasksToday: 4, doneToday: 3, habitToday: true, noteToday: false,
  tomorrowTasks: 2, kalshiToday: true, beatToday: true, hour: 17 };

const S = { R: null, site: null, demo: true, ledger: null, sc: null, quests: [], results: [], bosses: null, trophies: [], facts: {}, linked: {}, today: '', levelups: 0, ready: false, scene: null, error: null };

function reducedMotion() { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

// ------------------------------------------------------------------------------------------------ theme (olympus.js, if it has one)
export function applyTheme(t) {
  if (!t || typeof t !== 'object') return;
  const root = document.documentElement.style;
  const map = { accent: '--a-gold', bg: '--a-bg', text: '--oly-text', dim: '--oly-dim', glass: '--oly-glass', line: '--oly-line' };
  for (const [k, v] of Object.entries(map)) if (typeof t[k] === 'string' && /^#[0-9a-f]{3,8}$|^rgba?\(/i.test(t[k])) root.setProperty(v, t[k]);
}
function hookTheme() {
  try {
    const th = O && (typeof O.theme === 'function' ? O.theme() : O.theme);
    if (th) applyTheme(th.tokens || th);
    if (O && typeof O.onTheme === 'function') O.onTheme((x) => applyTheme((x && x.tokens) || x));
  } catch (_) { /* the kit has no themes yet */ }
}

// ------------------------------------------------------------------------------------------------ the score
function sourcesInfo() {
  const L = S.linked, d = S.demo;
  return {
    site: { ok: !!S.site && !S.site.missing, text: d ? 'Demo data (no site events published yet)' : `events.json, ${S.site.doc.events.length} events, built ${new Date(S.site.doc.t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` },
    planner: { ok: d || L.planner, text: d ? 'Demo' : L.planner ? 'Planner data on this phone' : 'Not linked: open the Planner once on this phone' },
    obsidian: { ok: d || L.vault, text: d ? 'Demo' : L.vault ? 'Vault cached on this phone (daily notes)' : 'Not connected: Jarvis, Obsidian' },
    kalshi: { ok: d || L.kalshi, text: d ? 'Demo' : L.kalshi ? 'The Kalshi bot\'s own feed' : 'Not linked yet' },
    quest: { ok: true, text: 'Checked on this phone against each quest\'s source' },
  };
}

function compute() {
  const { R, ledger } = S;
  const now = new Date();
  S.today = S.demo ? S.site.doc.today : etDay(now);
  const evs = ledger.events();
  const f = { ...S.facts, day: S.today, hour: S.demo ? DEMO_FACTS.hour : etHour(now),
    botDayToday: evs.some((e) => e.day === S.today && e.kind === 'bot_day'),
    brokenToday: evs.some((e) => e.day === S.today && e.kind === 'rule_broken') };
  S.quests = pickQuests(S.today, f, R);
  S.results = S.quests.map((q) => verifyQuest(q, f));
  ledger.add(questEvents(S.today, S.quests, S.results));
  // the weekly bosses: this week's fight and the last six finished weeks; a boss slain becomes one 'boss' event (once, by id)
  const linked = S.demo ? { planner: true, vault: true } : S.linked;
  const mon = weekStart(S.today), base = ledger.events();
  const cur = evaluateWeek(base, mon, S.today, f.hour, linked, R), past = bossHistory(base, S.today, f.hour, linked, 6, R);
  ledger.add(bossEvents(cur, mon));
  past.forEach((w) => ledger.add(bossEvents(w.bosses, w.mon)));
  S.bosses = { mon, featured: featured(mon), cur, past: past.slice(0, 4) };
  S.sc = score(ledger.events(), R, S.today);
  S.bossStats = bossStats(ledger.events());
  S.trophies = makeTrophies(S.sc, S.bossStats);
}

function render() {
  const sc = S.sc;
  HUD.renderRank(sc);
  HUD.renderStreaks(sc);
  more(() => renderPace());
  HUD.renderQuests(S.quests, S.results, S.R);           // keeps the tab's count fresh
  HUD.renderLabours(sc, openLabour);
  HUD.renderBosses(S.bosses, S.R, openBoss);
  HUD.renderTrophies(S.trophies, openTrophy);
  const done = S.results.filter((x) => x.done).length;
  document.getElementById('campaignState').textContent = `${done} / ${S.quests.length} quests complete`;
  document.getElementById('campaignDetail').textContent = `${sc.earned} of 12 labours · ${S.trophies.filter((t) => t.earned).length} of ${S.trophies.length} trophies earned`;
  if (HUD.sheetTab()) HUD.openSheet(HUD.sheetTab(), build);
  if (S.scene) {
    const fb = S.bosses.cur.find((b) => b.id === S.bosses.featured) || S.bosses.cur[0];
    S.scene.setState({ progress: HUD.rankProgress(sc), color: sc.rank.color, labours: sc.labours, ranks: S.R.ranks, rankIndex: sc.rank.i,
      trophies: S.trophies, boss: { id: fb.id, name: fb.name, color: fb.color, state: fb.state, hits: fb.hits, max: fb.max } });
  }
  postCard();
}

/** This week at a glance (AGORA): one dot per weekday (a clean trade, a bot day, a broken rule, still to come), the plan pace against the 2-4 trades a week
 *  and the labour that is closest to being earned. Reads the ledger only; no money is ever turned into XP. */
function renderPace() {
  const box = document.getElementById('pace'); if (!box) return;
  const evs = S.ledger.events(), mon = weekStart(S.today), days = [];
  for (let i = 0; i < 5; i++) days.push(new Date(Date.parse(mon + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10));
  const kinds = (d) => new Set(evs.filter((e) => e.day === d).map((e) => e.kind));
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const st = days.map((d, i) => { const k = kinds(d); return { d, n: names[i], s: d > S.today ? 'future' : k.has('rule_broken') ? 'broken' : k.has('clean_trade') ? 'trade' : k.has('bot_day') ? 'bot' : d === S.today ? 'today' : 'quiet' }; });
  const trades = days.reduce((a, d) => a + evs.filter((e) => e.day === d && e.kind === 'clean_trade').length, 0);
  const botDays = st.filter((x) => x.s === 'bot' || x.s === 'trade').length, broken = st.filter((x) => x.s === 'broken').length, past = st.filter((x) => x.d <= S.today).length;
  const lab = S.sc.labours.filter((l) => !l.earned).sort((a, b) => b.value / b.goal - a.value / a.goal)[0];
  const word = { trade: 'a clean trade', bot: 'the bot ran, no trade', broken: 'a rule was broken', today: 'today', quiet: 'no record', future: 'still to come' };
  const plan = trades > 4 ? `${trades} trades, above the 2 to 4 plan` : `${trades} of the 2 to 4 trades planned`;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const ol = el('ol', 'dots'); ol.setAttribute('aria-label', 'This week by weekday');
  st.forEach((x) => { const li = el('li', x.s); li.setAttribute('aria-label', `${x.n}: ${word[x.s]}`); li.append(el('i'), el('span', '', x.n)); ol.append(li); });
  const pl = el('p', 'pl'); pl.append(el('b', '', 'This week: '), `${plan} · bot ran `, el('b', '', String(botDays)), ` of ${Math.max(1, past)} days`);
  if (broken) pl.append(' · ', el('em', '', `${broken} rule broken`)); else pl.append(' · no rule broken');
  box.replaceChildren(ol, pl);
  if (lab) { const nx = el('p', 'nx'); nx.append('Closest labour: ', el('b', '', lab.name), `, ${lab.value} of ${lab.goal}`); box.append(nx); }
}

// the record: sections that read the ledger (extras.js), appended under each sheet's own content; a failure there never hides the sheet
function more(fn) { try { return fn(); } catch (_) { return null; } }
const flat = (...a) => a.flat(3).filter(Boolean);
function build(tab) {
  if (tab === 'quests') return flat(HUD.renderQuests(S.quests, S.results, S.R), more(() => X.weekBoard(S.bosses, S.R)));
  if (tab === 'labours') return HUD.renderLabours(S.sc, openLabour);
  if (tab === 'bosses') return flat(HUD.renderBosses(S.bosses, S.R, openBoss), more(() => desk(S.ledger.events(), S.R, S.today)));
  if (tab === 'trophies') return flat(more(() => X.shelf(S.trophies)), HUD.renderTrophies(S.trophies, openTrophy));
  if (tab === 'ranks') return HUD.renderLadder(S.sc, S.R);
  const ev = S.ledger.events();
  return flat(HUD.renderLog(S.sc, { sources: sourcesInfo() }, S.R, exportFile), more(() => X.xpHistory(ev, S.R, S.today)), more(() => X.calendar(ev, S.R, S.today)), more(() => X.versusYou(ev, S.R, S.today)));
}
function openLabour(id) { const l = S.sc.labours.find((x) => x.id === id); if (l) HUD.showLabour(l, S.R); }
function openTrophy(id) { const t = S.trophies.find((x) => x.id === id); if (t) HUD.showTrophy(t); }
function openBoss() { HUD.hideLabour(); HUD.openSheet('bosses', build); history.replaceState(null, '', '#bosses'); }
function picked(id) {
  if (!id) return HUD.hideLabour();
  if (id.startsWith('trophy:')) return openTrophy(id.slice(7));
  if (id.startsWith('boss:')) return openBoss();
  openLabour(id);
}

/** A level gained since the last visit plays the level-up once (a rank gained: the rank-up). The first visit only marks. */
function checkLevelUp() {
  const sc = S.sc, seen = S.ledger.seen();
  const mark = { xp: sc.xp, level: sc.level, rank_i: sc.rank.i, earned: sc.labours.filter((l) => l.earned).map((l) => l.id) };
  if (seen && sc.level > (+seen.level || 0)) {
    const rankUp = sc.rank.i > (+seen.rank_i || 0);
    S.levelups++;
    document.documentElement.dataset.levelup = String(S.levelups);
    if (S.scene) S.scene.levelUp({ rank: rankUp });
    HUD.celebrate({ level: sc.level, rank: rankUp ? sc.rank.name : null, reduced: reducedMotion(), ranks: S.R.ranks, rankIndex: sc.rank.i });
    S.banner = rankUp ? `Rank up ${sc.rank.name} Level ${sc.level}` : `Level up Level ${sc.level}`;
    const fresh = mark.earned.filter((id) => !(seen.earned || []).includes(id));
    if (O && O.sfx && (rankUp || fresh.length)) O.sfx('rankup');   // olympus/olympus.js: the rank-up / Labour sound, guarded
    if (fresh.length) setTimeout(() => openLabour(fresh[0]), reducedMotion() ? 600 : 2400);
  }
  if (!seen || sc.xp !== seen.xp || sc.level !== seen.level) S.ledger.setSeen(mark);
}

// ------------------------------------------------------------------------------------------------ Jarvis card + export
function card() {
  const sc = S.sc;
  return { v: 1, name: 'ARENA', status: { level: S.demo ? 'off' : 'ok', label: S.demo ? 'Demo data' : `${sc.rank.name} - level ${sc.level}` },
    kpis: [{ label: 'Rank', value: sc.rank.name }, { label: 'XP', value: sc.xp.toLocaleString('en-US'), ...(sc.next ? { delta: `${sc.next.need.toLocaleString('en-US')} to go` } : {}) },
      { label: 'Labours', value: `${sc.earned} of 12` }],
    lines: [('Today: ' + S.quests.map((q, i) => `${q.title} (${S.results[i].done ? 'done' : 'open'})`).join(', ')).slice(0, 120),
      `Streaks: uptime ${sc.streaks.uptime.cur}, hands off ${sc.streaks.discipline.cur}, daily goal ${sc.streaks.planner.cur}`.slice(0, 120),
      (S.bosses ? `Boss: ${S.bosses.cur.filter((b) => b.state === 'slain').length} of 4 slain this week, ${S.trophies.filter((t) => t.earned).length} trophies` : '').slice(0, 120)].filter(Boolean),
    t: Math.floor(Date.now() / 1000), open: '#quests', theme: '#0e0c09', stale_after: 86400 };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, JARVIS_ORIGIN); } catch (_) { /* not inside Jarvis */ }
}
function exportText() {
  const sc = S.sc;
  return JSON.stringify(S.ledger.exportDoc({ today: S.today, rules_v: S.R.v, score: { xp: sc.xp, level: sc.level, rank: sc.rank.name, earned: sc.earned,
    streaks: Object.fromEntries(Object.values(sc.streaks).map((s) => [s.id, { cur: s.cur, best: s.best }])), bySrc: sc.bySrc } }), null, 1);
}
function exportFile() {
  const blob = new Blob([exportText()], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `arena-progress-${S.today}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  S.exported = (S.exported || 0) + 1;
}

// ------------------------------------------------------------------------------------------------ start
async function refreshPhone() {
  if (S.demo) return;
  const g = await gather(etDay());
  S.facts = g.facts; S.linked = g.linked;
  S.ledger.add(g.events);
}

async function startScene() {
  const off = /[?&]q=off(?:&|$)/.test(location.search) || (!/[?&]q=(?:ultra|high|low)(?:&|$)/.test(location.search) && O && O.fx() === 'off');
  if (off) {
    document.documentElement.dataset.noscene = '1';
    document.getElementById('worldMode').textContent = 'Illustrated arena · effects off';
    if (O) O.ready();
    return;
  }
  try {
    const { createScene } = await import('./scene.js?v=a6');
    S.scene = createScene(document.getElementById('scene'), { O });
    S.scene.onPick(picked);
    HUD.setTags({ demo: S.demo, lite: S.scene.lite() });
    S.scene.onQuality(() => HUD.setTags({ demo: S.demo, lite: S.scene.lite() }));
    document.getElementById('worldMode').textContent = 'Drag to explore · tap a monument';
  } catch (e) {                                              // no WebGL: the HUD still works
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    document.getElementById('worldMode').textContent = 'Illustrated arena';
    if (O) O.ready();
  }
}

function wire() {
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
    HUD.hideLabour();
    if (HUD.sheetTab() === b.dataset.tab) { HUD.closeSheet(); history.replaceState(null, '', location.pathname + location.search); }
    else { HUD.openSheet(b.dataset.tab, build); history.replaceState(null, '', '#' + b.dataset.tab); }
  }));
  const rk = document.getElementById('rank');
  const openLadder = () => { HUD.hideLabour(); HUD.openSheet('ranks', build); history.replaceState(null, '', '#ranks'); };
  rk.addEventListener('click', openLadder);
  rk.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLadder(); } });
  document.getElementById('close').addEventListener('click', () => { HUD.closeSheet(); history.replaceState(null, '', location.pathname + location.search); });
  document.getElementById('popClose').addEventListener('click', HUD.hideLabour);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { HUD.hideLabour(); HUD.closeSheet(); } });
  const route = () => { const t = location.hash.slice(1); if (['quests', 'bosses', 'labours', 'trophies', 'ranks', 'log'].includes(t)) HUD.openSheet(t, build); };
  addEventListener('hashchange', route);
  route();
}

async function main() {
  hookTheme();
  const [R, site] = await Promise.all([loadRules(), loadSite()]);
  if (!R) { if (O) O.fail('rules.json is missing'); return; }
  S.R = R; S.site = site; S.demo = site.demo;
  S.ledger = openLedger({ demo: S.demo });
  S.ledger.add(site.doc.events);
  if (S.demo) S.facts = { ...DEMO_FACTS };
  const scene = startScene();
  await refreshPhone();
  compute();
  await scene;
  HUD.setTags({ demo: S.demo, lite: S.scene ? S.scene.lite() : false });
  render();
  wire();
  S.ready = true;
  setTimeout(checkLevelUp, reducedMotion() ? 50 : 700);      // after the first frames, so the burst is seen
  if (!S.demo) setInterval(async () => {
    if (O && O.hidden()) return;
    await refreshPhone(); compute(); render(); checkLevelUp();
  }, REFRESH_MS);
}

window.ARENA = {
  state: () => ({ ready: S.ready, demo: S.demo, today: S.today, xp: S.sc && S.sc.xp, level: S.sc && S.sc.level, rank: S.sc && S.sc.rank.name,
    earned: S.sc && S.sc.earned, bosses: S.bosses && S.bosses.cur.map((b) => ({ id: b.id, state: b.state, hits: b.hits, max: b.max })), featured: S.bosses && S.bosses.featured,
    trophies: S.trophies.filter((t) => t.earned).length, trophyTotal: S.trophies.length, bossesSlain: S.bossStats && S.bossStats.slain, quests: S.quests.map((q, i) => ({ id: q.id, done: !!(S.results[i] && S.results[i].done) })),
    streaks: S.sc && Object.fromEntries(Object.values(S.sc.streaks).map((s) => [s.id, s.cur])), levelups: S.levelups,
    scene: S.scene ? S.scene.stats() : null, linked: S.linked, error: S.error, exported: S.exported || 0, banner: S.banner || '', bySrc: S.sc && S.sc.bySrc }),
  exportText: () => exportText(),
  /** the boss fight timeline (strikes, flash, shake, the crowd up), as played when a boss is settled */
  bossFight: () => { if (S.scene) S.scene.bossFight(); },
  card: () => card(),
  /** the rank-up frozen at its peak (lightning + burst + banner) for screenshots; hold(false) ends it */
  hold: (on = true) => {
    if (!on) { if (S.scene) S.scene.endHold(); document.getElementById('banner').hidden = true; return; }
    HUD.hideLabour();
    if (S.scene) S.scene.levelUp({ rank: true, hold: true });
    HUD.celebrate({ level: S.sc.level, rank: S.sc.rank.name, reduced: true, hold: true, ranks: S.R.ranks, rankIndex: S.sc.rank.i });
  },
  refresh: async () => { await refreshPhone(); compute(); render(); checkLevelUp(); return window.ARENA.state(); },
};

main().catch((e) => { S.error = String((e && e.message) || e); if (O) O.fail(S.error); });

