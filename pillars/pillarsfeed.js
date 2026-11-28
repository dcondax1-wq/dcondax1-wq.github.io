// The Four Pillars model from the site's files + the PC post: the Accounts screen's cards (nq/acctcore.js), then pillarscore.build.
// Shared by the Pillars page (pillars.js) and the mini strip on the NQ page (strip.js). Pure apart from Intl (ET clock).
import * as D from '../nq/nqdesk.js?v=15';
import * as K7 from '../nq/clock7.js?v=4';
import * as A from '../nq/acctcore.js?v=3';
import * as P from './pillarscore.js?v=p6';

export function etNow(t) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
  } catch (_) { return { date: null, min: null }; }
}
/** src = { data, home, biz, payday, file, lite, nowS, feed (window.PC_FEED), coach } -> the four pillars */
/** the Accounts screen's cards (nq/acctcore.build) + the home the PC post was laid over: {cards, home} */
export function cardsFrom(src) {
  const s = src || {}, t = +s.nowS || Date.now() / 1000, home = s.home || {}, F = s.feed;
  const h = s.lite && F && F.homeOver ? F.homeOver(home, s.lite, t, s.coach || null) : home;
  let cards = [];
  try {
    const accts = D.accounts(h, s.biz, t), k7 = K7.rows(s.lite, t), et = etNow(t);
    cards = A.build(accts, k7, { lite: s.lite, biz: s.biz, payday: s.payday, nowS: t, today: K7.tradingDay(t), minuteET: et.min, etDate: et.date }).cards;
  } catch (_) { cards = []; }
  return { cards, home: h };
}
export function modelFrom(src) {
  const s = src || {}, t = +s.nowS || Date.now() / 1000, { cards, home: h } = cardsFrom(s);
  return P.build(s.data, { nowS: t, glance: P.glanceOf(s.lite, h), lite: s.lite, cards, file: s.file });
}
export const ago = A.ago, PC_FRESH_S = A.PC_FRESH_S;
