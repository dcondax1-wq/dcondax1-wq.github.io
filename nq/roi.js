// EVAL ECONOMICS page (day-evalroi 2026-11-27). Rules in roicore.js (pure, node-tested); this file fetches and draws.
// Reads ./roi.json (tools/roi_build.py) and the PC's public status post (../pc_feed.js) for the payouts paid so far. Text only through
// textContent. Sends nothing, stores nothing.
import * as C from './roicore.js?v=1';

const $ = (id) => document.getElementById(id);
const S = { roi: null, lite: null, ready: false };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };

async function getJSON(url) { try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }
async function getPost() {
  const F = window.NQ_FEED;
  if (F && F.cached) { const c = F.cached(); if (c) return c; }
  const P = window.PC_FEED;
  if (!P || !P.fetchLatest) return null;
  try { return await Promise.race([P.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]); } catch (_) { return null; }
}

function render() {
  const M = C.model(S.roi, S.lite);
  const best = $('best'); best.textContent = '';
  if (M.best) {
    best.append(el('p', 'rb-k', 'Best next money move'), el('p', 'rb-line', M.best.line));
    if (M.best.card) best.appendChild(el('p', 'rb-card', M.best.card));
  } else best.appendChild(el('p', 'rb-line', 'Every MFFU slot you can fund is in use: the next buy is a re-buy when an account fails.'));
  const so = $('sofar'); so.textContent = '';
  const cell = (k, v, cls) => { const d = el('div', 'sf-cell'); d.append(el('span', null, k), el('b', cls || null, v)); return d; };
  so.append(cell('Spent on today\'s 4 accounts', M.spent ? M.spent.text : 'not recorded'), cell('Paid to you so far', M.earnedText, M.earned.usd > 0 ? 'ok' : ''),
    cell('Net so far', M.net ? `${C.usd(M.net.lo, true)}${M.net.hi !== M.net.lo ? ' to ' + C.usd(M.net.hi, true) : ''}` : '-', M.net && M.net.hi > 0 ? 'ok' : 'bad'));
  const list = $('plans'); list.textContent = '';
  for (const r of M.rows) {
    const a = el('article', 'rp ' + r.lvl + (M.best && M.best.key === r.key ? ' best' : '')); a.id = 'roi-' + r.key;
    const h = el('div', 'rp-head'); h.append(el('h2', null, r.name), el('b', 'rp-price', r.priceText));
    a.appendChild(h);
    const big = el('div', 'rp-big');
    const b1 = el('div', 'rp-per good'); b1.append(el('b', null, r.goodPer === null ? '-' : `$${r.goodPer >= 10 ? Math.round(r.goodPer) : r.goodPer.toFixed(2)}`), el('span', null, 'per $1, 2026-like'));
    const b2 = el('div', 'rp-per badm'); b2.append(el('b', null, r.badPer === null ? '-' : `$${r.badPer.toFixed(2)}`), el('span', null, 'per $1, 2025-like'));
    big.append(b1, b2); a.appendChild(big);
    const ul = el('ul', 'rp-lines'); for (const l of r.lines) ul.appendChild(el('li', null, l)); a.appendChild(ul);
    a.append(el('p', 'rp-slot' + (r.free ? ' free' : ''), r.slot), el('p', 'rp-verdict', r.verdict));
    list.appendChild(a);
  }
  $('caveat').textContent = M.caveat;
  $('src').textContent = `From ${M.src}. Simulated ${M.made}. ${M.consfix}. Your real prices (CLUB), never list prices. Estimates, not a promise.`;
  S.ready = true;
}

async function load() {
  const [roi, lite] = await Promise.all([getJSON('./roi.json'), getPost()]);
  S.roi = roi; S.lite = lite;
  render();
}
window.NQ_ROI = { S, ready: () => S.ready };
load().catch(() => { try { render(); } catch (_) { /* nothing */ } });
