// NQ Accounts page (day-accounts 2026-11-23). The rules live in acctcore.js (pure, node-tested); this file fetches and draws.
// Reads ../home.json, ../business/accounts.json, ../business/payday.json and the PC's public status post (../pc_feed.js fetchLatest).
// Text only through textContent / createElement. Sends nothing, stores nothing. ?at=<ISO time> pins the clock (tests and screenshots only).
import * as D from './nqdesk.js?v=8';
import * as K7 from './clock7.js?v=2';
import * as A from './acctcore.js?v=1';

const $ = (id) => document.getElementById(id);
const S = { home: null, lite: null, biz: null, payday: null, ready: false, model: null };
const AT = (() => { try { const v = new URLSearchParams(location.search).get('at'); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t / 1000 : null; } catch (_) { return null; } })();
const T0 = Date.now() / 1000;
const nowS = () => (AT ? AT + (Date.now() / 1000 - T0) : Date.now() / 1000);

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 8000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
async function getPost() {
  const F = window.PC_FEED;
  if (!F || !F.fetchLatest) return null;
  try { return await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { return null; }
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function etNow(t) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
  } catch (_) { return { date: null, min: null }; }
}

export function model(t) {
  const home = S.home || {}, F = window.PC_FEED;
  const h = S.lite && F && F.homeOver ? F.homeOver(home, S.lite, t, window.PAYOUT_COACH || null) : home;
  const accts = D.accounts(h, S.biz, t);
  const k7 = K7.rows(S.lite, t), et = etNow(t);
  return A.build(accts, k7, { lite: S.lite, biz: S.biz, payday: S.payday, nowS: t, today: K7.tradingDay(t), minuteET: et.min, etDate: et.date });
}

function bar(cls, label, value, frac) {
  const w = el('div', 'ac-bar ' + cls), lab = el('div', 'lab');
  lab.append(el('span', null, label), el('b', null, value));
  const tr = el('div', 'tr'), fl = el('div', 'fl');
  fl.style.width = frac == null ? '0%' : `${Math.round(frac * 100)}%`;
  tr.appendChild(fl); w.append(lab, tr); return w;
}
function drawCard(c) {
  const box = el('article', 'ac-card'); box.id = 'acct-' + c.key; box.dataset.key = c.key;
  box.dataset.k7 = c.clock ? c.clock.lvl : 'none'; box.dataset.stale = c.fresh ? '0' : '1';
  const head = el('div', 'ac-head'), nm = el('div', 'ac-name');
  nm.append(el('h2', null, c.name), el('p', null, [c.plan, c.l4 ? `··${c.l4}` : ''].filter(Boolean).join(' · ') || ' '));
  const right = el('div');
  right.append(el('span', 'ac-stage' + (c.stage === 'Funded' ? ' funded' : ''), c.stage === 'Funded' ? 'FUNDED' : 'EVAL'));
  const age = el('span', 'ac-age ' + (c.dot === 'live' ? '' : c.dot === 'stale' ? 'warn' : 'bad'), c.ageText); right.appendChild(age);
  head.append(nm, right); box.appendChild(head);

  const nums = el('div', 'ac-nums');
  const n1 = el('div', 'ac-num'); n1.append(el('span', null, 'Balance'), el('b', null, c.balance)); if (c.balanceNote) n1.appendChild(el('small', null, c.balanceNote));
  const n2 = el('div', 'ac-num'); n2.append(el('span', null, "Today"), el('b', c.todayLvl, c.today));
  nums.append(n1, n2); box.appendChild(nums);
  box.appendChild(bar(c.roomLvl === 'none' ? '' : c.roomLvl, 'Room to max loss', c.roomOf ? `${c.room} of ${c.roomOf}` : c.room, c.roomFrac));
  box.appendChild(bar('goal', `${c.goal.label} (${c.goal.sub})`, c.goal.text, c.goal.frac));
  if (c.eta) { const p = el('p', 'ac-eta', c.eta + ' '); p.appendChild(el('small', null, c.etaNote)); box.appendChild(p); }

  const ul = el('ul', 'ac-bots'); ul.setAttribute('aria-label', 'Bots on this account');
  for (const b of c.bots) { const li = el('li', b.state, `${b.name} · ${A.BOT_WORD[b.state] || b.state}`); ul.appendChild(li); }
  box.appendChild(ul);

  const k = c.clock;
  if (k) {
    const w = el('div', 'ac-k7 ' + k.lvl); w.setAttribute('aria-label', '7-day clock');
    const big = el('div', 'big', k.left < 0 ? '!' : String(k.left)); big.appendChild(el('small', null, k.left === 1 ? 'day left' : k.left < 0 ? 'past' : 'days left'));
    w.append(big, el('div', 't', `${k.lastText} · ${k.hardText}`), el('div', 't dim', k.leftText + (k.ses != null && k.left >= 0 ? ` (${k.ses} session${k.ses === 1 ? '' : 's'})` : '')));
    const ka = el('div', 't'); ka.appendChild(el('span', 'ka ' + (k.on === true ? 'on' : k.on === false ? 'off' : 'unk'), k.kaText));
    if (k.actText) ka.appendChild(document.createTextNode(' · ' + k.actText));
    w.appendChild(ka); box.appendChild(w);
  } else {
    box.appendChild(el('div', 'ac-k7 none', c.planned ? '7-day clock starts once the PC reports this account.' : '7-day clock: the PC has not reported this account yet.'));
  }
  return box;
}

function render() {
  const t = nowS(), M = model(t); S.model = M;
  const pc = $('pc'); pc.textContent = M.pc.text; pc.dataset.level = M.pc.level;
  const bn = $('banner');
  if (M.banner) { bn.hidden = false; bn.dataset.level = M.banner.level; $('bannerTitle').textContent = M.banner.title; $('bannerText').textContent = M.banner.text; } else bn.hidden = true;
  const c = M.counts;
  $('sum').textContent = `${c.all} account${c.all === 1 ? '' : 's'} · ${c.live} live from the PC` + (c.risk ? ` · ${c.risk} at risk (7-day)` : c.warn ? ` · ${c.warn} getting close (7-day)` : ' · every 7-day clock OK');
  const box = $('cards'); box.textContent = '';
  for (const card of M.cards) box.appendChild(drawCard(card));
  S.ready = true;
}

async function load(first) {
  const [home, biz, payday] = await Promise.all([getJSON('../home.json'), first || !S.biz ? getJSON('../business/accounts.json') : S.biz, first || !S.payday ? getJSON('../business/payday.json') : S.payday]);
  S.home = home; S.biz = biz; S.payday = payday;
  if (first) render();                 // the plan rows at once; the PC's numbers a moment later
  const lite = await getPost();
  if (lite) S.lite = lite;
  render();
}

window.NQ_ACCOUNTS = { S, model, ready: () => S.ready && S.loaded === true };
load(true).then(() => { S.loaded = true; }).catch(() => { S.loaded = true; try { render(); } catch (_) { /* nothing */ } });
setInterval(() => { try { render(); } catch (_) { /* keeps the last screen */ } }, 60000);           // ages and day counts move on
setInterval(() => { load(false).catch(() => {}); }, 5 * 60000);                                        // the PC posts every 15 min
