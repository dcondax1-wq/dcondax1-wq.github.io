// ARENA, Olympian Ranks (OLYMPUS, 2026-11-03): the page. Rules: rules.json + rules.js; sources: sources.js; progress on this
// phone: ledger.js; the colosseum: scene.js; the HUD: hud.js. window.ARENA is the test hook (state, export, refresh).
import { score, pickQuests, verifyQuest, questEvents, etDay, etHour } from './rules.js';
import { loadRules, loadSite, gather } from './sources.js';
import { openLedger } from './ledger.js';
import * as HUD from './hud.js';

const O = window.OLYMPUS || null;
const JARVIS_ORIGIN = (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io');   // Jarvis is on the same origin as the app; the old address only when opened from a file
const REFRESH_MS = 60000;
// the demo's phone: what a linked Planner, vault and Kalshi feed would show on Friday 2026-10-30 at 17:00 ET
const DEMO_FACTS = { planner: true, habits: true, vault: true, kalshi: true, tasksToday: 4, doneToday: 3, habitToday: true, noteToday: false,
  tomorrowTasks: 2, kalshiToday: true, beatToday: true, hour: 17 };

const S = { R: null, site: null, demo: true, ledger: null, sc: null, quests: [], results: [], facts: {}, linked: {}, today: '', levelups: 0, ready: false, scene: null, error: null };

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
  S.sc = score(ledger.events(), R, S.today);
}

function render() {
  const sc = S.sc;
  HUD.renderRank(sc);
  HUD.renderStreaks(sc);
  HUD.renderQuests(S.quests, S.results, S.R);           // keeps the tab's count fresh
  HUD.renderLabours(sc, openLabour);
  if (HUD.sheetTab()) HUD.openSheet(HUD.sheetTab(), build);
  if (S.scene) S.scene.setState({ progress: HUD.rankProgress(sc), color: sc.rank.color, labours: sc.labours });
  postCard();
}

function build(tab) {
  if (tab === 'quests') return HUD.renderQuests(S.quests, S.results, S.R);
  if (tab === 'labours') return HUD.renderLabours(S.sc, openLabour);
  return HUD.renderLog(S.sc, { sources: sourcesInfo() }, S.R, exportFile);
}
function openLabour(id) { const l = S.sc.labours.find((x) => x.id === id); if (l) HUD.showLabour(l, S.R); }

/** A level gained since the last visit plays the level-up once (a rank gained: the rank-up). The first visit only marks. */
function checkLevelUp() {
  const sc = S.sc, seen = S.ledger.seen();
  const mark = { xp: sc.xp, level: sc.level, rank_i: sc.rank.i, earned: sc.labours.filter((l) => l.earned).map((l) => l.id) };
  if (seen && sc.level > (+seen.level || 0)) {
    const rankUp = sc.rank.i > (+seen.rank_i || 0);
    S.levelups++;
    document.documentElement.dataset.levelup = String(S.levelups);
    if (S.scene) S.scene.levelUp({ rank: rankUp });
    HUD.celebrate({ level: sc.level, rank: rankUp ? sc.rank.name : null, reduced: reducedMotion() });
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
      `Streaks: uptime ${sc.streaks.uptime.cur}, hands off ${sc.streaks.discipline.cur}, daily goal ${sc.streaks.planner.cur}`.slice(0, 120)],
    t: Math.floor(Date.now() / 1000), open: '#quests', theme: '#0a0710', stale_after: 86400 };
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
  try {
    const { createScene } = await import('./scene.js');
    S.scene = createScene(document.getElementById('scene'), { O });
    S.scene.onPick((id) => (id ? openLabour(id) : HUD.hideLabour()));
    HUD.setTags({ demo: S.demo, lite: S.scene.lite() });
    if (O && O.onFx) O.onFx(() => { S.scene.setLite(O.lite()); HUD.setTags({ demo: S.demo, lite: S.scene.lite() }); });
  } catch (e) {                                              // no WebGL: the HUD still works
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}

function wire() {
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
    HUD.hideLabour();
    if (HUD.sheetTab() === b.dataset.tab) { HUD.closeSheet(); history.replaceState(null, '', location.pathname + location.search); }
    else { HUD.openSheet(b.dataset.tab, build); history.replaceState(null, '', '#' + b.dataset.tab); }
  }));
  document.getElementById('close').addEventListener('click', () => { HUD.closeSheet(); history.replaceState(null, '', location.pathname + location.search); });
  document.getElementById('popClose').addEventListener('click', HUD.hideLabour);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { HUD.hideLabour(); HUD.closeSheet(); } });
  const route = () => { const t = location.hash.slice(1); if (['quests', 'labours', 'log'].includes(t)) HUD.openSheet(t, build); };
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
    earned: S.sc && S.sc.earned, quests: S.quests.map((q, i) => ({ id: q.id, done: !!(S.results[i] && S.results[i].done) })),
    streaks: S.sc && Object.fromEntries(Object.values(S.sc.streaks).map((s) => [s.id, s.cur])), levelups: S.levelups,
    scene: S.scene ? S.scene.stats() : null, linked: S.linked, error: S.error, exported: S.exported || 0, banner: S.banner || '', bySrc: S.sc && S.sc.bySrc }),
  exportText: () => exportText(),
  card: () => card(),
  /** the rank-up frozen at its peak (lightning + burst + banner) for screenshots; hold(false) ends it */
  hold: (on = true) => {
    if (!on) { if (S.scene) S.scene.endHold(); document.getElementById('banner').hidden = true; return; }
    HUD.hideLabour();
    if (S.scene) S.scene.levelUp({ rank: true, hold: true });
    HUD.celebrate({ level: S.sc.level, rank: S.sc.rank.name, reduced: true, hold: true });
  },
  refresh: async () => { await refreshPhone(); compute(); render(); checkLevelUp(); return window.ARENA.state(); },
};

main().catch((e) => { S.error = String((e && e.message) || e); if (O) O.fail(S.error); });
