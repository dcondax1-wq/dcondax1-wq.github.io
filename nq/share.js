// NQ SHARE page (day-sharecard 2026-11-27): an Instagram card of the day's P&L (sharecard.js draws it). Today = the PC's post through the
// same pipeline as the live screen (livecore.js); ?day=YYYY-MM-DD = that day's replay file (the bots' BACKTEST twins: the card says so).
// Sends nothing (navigator.share only opens the phone's own share sheet with the PNG), stores nothing. ?at=<ISO> pins the clock (tests).
import * as D from './nqdesk.js?v=15';
import * as K7 from './clock7.js?v=4';
import * as A from './acctcore.js?v=3';
import * as B from './nqbars.js?v=b2';
import * as L from './livecore.js?v=2';
import { cardModel, draw, textOf, SIZES } from './sharecard.js?v=1';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const AT = (() => { const v = Q.get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; })();
const nowS = () => (AT || Date.now() / 1000);
const S = { src: null, M: null, opts: { size: 'post', style: 'neon', hideBalances: false, hideUsd: false }, ready: false, blob: null, why: '' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(tm); }
}
async function getText(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.text() : null; } catch (_) { return null; } }
async function getPost() {
  const F = window.NQ_FEED;
  if (F && F.latest) { try { const l = await F.latest(); if (l) return l; } catch (_) { /* below */ } }
  const P = window.PC_FEED;
  if (!P || !P.fetchLatest) return null;
  try { return await Promise.race([P.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { return null; }
}
async function getBars() {
  const feed = await getJSON('../status_feed.json');
  for (const u of B.feedUrls(feed)) {
    const t = await getText(u);
    if (t == null) continue;
    try { const p = await B.parseVerified(t, feed, nowS()); if (p) return p; } catch (_) { /* next */ }
  }
  return null;
}

/** the card's clock (day-sharefix): "today" = the New York calendar day. From 18:00 ET the CME trading day is already tomorrow's (empty),
 *  so the evening card reads the day as of 17:59 ET = the session that just ended (the owner posts in the evening). Before 18:00: now. */
export function cardNow(t) {
  const e = L.et(t); if (!e || !e.hm) return t;
  const m = +e.hm.slice(0, 2) * 60 + +e.hm.slice(3);
  return m >= 18 * 60 ? t - (m - (17 * 60 + 59)) * 60 - (t % 60) : t;
}
/** today from the PC's post (the live screen's own model): accounts' $ today, closed trades, streak, week, the day's 5m bars */
export async function todaySource() {
  const [home, biz, payday, lite, bars] = await Promise.all([getJSON('../home.json'), getJSON('../business/accounts.json'), getJSON('../business/payday.json'), getPost(), getBars()]);
  if (!lite) return { why: 'No report from your PC yet: the card fills in once it posts.' };
  const t = cardNow(nowS()), F = window.PC_FEED;
  const h = F && F.homeOver ? F.homeOver(home || {}, lite, t, window.PAYOUT_COACH || null) : (home || {});
  let cards = [];
  try {
    const et = L.et(t);
    cards = A.build(D.accounts(h, biz, t), K7.rows(lite, t), { lite, biz, payday, nowS: t, today: K7.tradingDay(t), minuteET: et ? +et.hm.slice(0, 2) * 60 + +et.hm.slice(3) : null, etDate: et && et.day }).cards;
  } catch (_) { cards = []; }
  const b2 = bars ? { ...bars } : null;
  const u = b2 ? B.unpack(b2) : [];
  const M = L.build({ lite, bars: b2, cards, nowS: t });
  const s0 = L.sessionStart(t);
  const closed = M.today.filter((x) => !x.open && typeof x.usd === 'number');
  const acc = M.accounts.map((a) => ({ name: a.name, usd: typeof a.today === 'number' ? a.today : closed.filter((x) => x.name === a.name).reduce((s, x) => s + x.usd, 0),
    balance: typeof a.balance === 'number' ? a.balance : null }));
  const week = M.accounts.reduce((s, a) => s + (typeof a.week === 'number' ? a.week : 0), 0);
  return { day: M.day, total: closed.length ? M.todayUsd : acc.reduce((s, a) => s + (a.usd || 0), 0), accounts: acc, source: 'live',
    trades: closed.map((x) => ({ name: x.name, side: x.side, usd: x.usd, r: x.r, t: x.t, xt: x.xt, entry: x.entry, exit: x.exit })),
    streak: M.streak && M.streak.kind ? { kind: M.streak.kind, n: M.streak.n } : null, week: week || null,
    bars: s0 ? u.filter((r) => r[0] >= s0 && r[0] <= t) : u, postT: +lite.t || null };
}

/** a past day from replay/<day>.json (the bots' backtest twins on the PC's bars): stamped BACKTEST */
export function replaySource(R) {
  if (!R || !Array.isArray(R.bars)) return { why: 'No replay for that day.' };
  const ent = {}, trades = [];
  for (const e of R.events || []) {
    if (e.kind === 'entry') ent[e.id] = e;
    if (e.kind === 'exit' && ent[e.id]) {
      const x = ent[e.id];
      trades.push({ name: x.bot === 'LIT' ? 'Zlarior (LIT)' : x.bot === 'ATLAS' ? 'ATLAS' : String(x.bot || ''), side: x.side, usd: e.usd, r: e.r, t: x.t, xt: e.t, entry: x.px, exit: e.px ?? null });
    }
  }
  const T = R.totals || {};
  const accounts = [{ name: 'Zlarior (LIT)', usd: T.lit_usd }, { name: 'ATLAS', usd: T.atlas_usd }].filter((a) => typeof a.usd === 'number');
  const rth = R.bars.filter((b) => Array.isArray(b));
  return { day: R.day, total: (T.lit_usd || 0) + (T.atlas_usd || 0), accounts, trades, source: 'backtest', bars: rth, week: null, streak: null };
}

function render() {
  if (!S.src) return;
  S.M = cardModel(S.src);
  const cv = $('card');
  draw(cv, S.M, S.opts);
  cv.dataset.w = String(cv.width); cv.dataset.h = String(cv.height);
  cv.setAttribute('aria-label', textOf(S.M, S.opts).join(' · '));
  $('sum').textContent = S.M.source === 'backtest' ? `Backtest twin of ${S.M.date}: not a live result.` : `${S.M.date}: ${S.M.n} trade${S.M.n === 1 ? '' : 's'}.`;
  $('redNote').hidden = S.M.green;
  S.blob = null;
}
function setSeg(id, key, val) { for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === val)); S.opts[key] = val; render(); }

async function blob() {
  if (S.blob) return S.blob;
  S.blob = await new Promise((res) => $('card').toBlob((b) => res(b), 'image/png'));
  return S.blob;
}
function fileName() { return `olympus-nq-${S.M ? S.M.day : 'day'}-${S.opts.size}.png`; }
async function download() {
  const b = await blob(); if (!b) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  $('msg').textContent = 'Saved. Post it from your photos.';
}
async function share() {
  const b = await blob(); if (!b) return;
  const f = new File([b], fileName(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] }) && navigator.share) {
    try { await navigator.share({ files: [f], title: 'OLYMPUS · NQ' }); $('msg').textContent = 'Shared.'; return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  await download();
}

async function boot() {
  const day = Q.get('day');
  const idx = await getJSON('replay/index.json');
  const sel = $('day');
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
  sel.replaceChildren(opt('', 'Today (live)'));
  for (const d of (idx && Array.isArray(idx.days) ? idx.days : []).slice(0, 30)) sel.append(opt(d.day, `${d.day} · backtest${d.trades ? ` · ${d.trades} trade${d.trades > 1 ? 's' : ''}` : ''}`));
  sel.value = day && [...sel.options].some((o) => o.value === day) ? day : '';
  await loadDay(sel.value);
  sel.addEventListener('change', () => loadDay(sel.value));
  for (const [id, key] of [['size', 'size'], ['style', 'style']]) for (const b of $(id).querySelectorAll('button')) b.addEventListener('click', () => setSeg(id, key, b.dataset.v));
  $('hideBal').addEventListener('change', (e) => { S.opts.hideBalances = e.target.checked; render(); });
  $('hideUsd').addEventListener('change', (e) => { S.opts.hideUsd = e.target.checked; render(); });
  $('dl').addEventListener('click', () => download());
  $('share').addEventListener('click', () => share());
  S.ready = true;
}
async function loadDay(day) {
  $('msg').textContent = 'Loading the day…';
  const src = day ? replaySource(await getJSON(`replay/${day}.json`)) : await todaySource();
  $('msg').textContent = src.why || '';
  if (src.why) { $('app').dataset.state = 'empty'; return; }
  $('app').dataset.state = 'ok';
  S.src = src; render();
}

if (typeof document !== 'undefined' && $('app')) {
  window.NQ_SHARE = { S, ready: () => S.ready, render, SIZES, cardNow };
  boot().catch(() => { S.ready = true; $('msg').textContent = 'Could not build the card.'; });
}
