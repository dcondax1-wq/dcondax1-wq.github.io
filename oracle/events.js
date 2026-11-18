// ORACLE event log: the Brain's narration (World.log) cut into the few moments that matter, as a ribbon of chips in the
// bottom sheet, newest first (so a new moment never needs a scroll, never a layout read): sweeps, 5m CISDs, the armed limit,
// the entry and the exit, each with its ET time. An entry (or an exit)
// links to Odeon's film of that trade (../odeon/#trade=<day>_<HHMM>_<side>). Text only through textContent.
import { etParts } from './time.js';

const KEEP = { sweep: 'SWEEP', cisd: 'CISD', armed: 'LIMIT', entry: 'ENTRY', exit: 'EXIT' };
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The ribbon's rows from the log: {hm, k, tag, text, good, side, film}. A sweep LIT cannot use (✗ too shallow) is kept dim. */
export function ribbonOf(log, dayT) {
  const p = dayT ? etParts(dayT) : null;
  const day = p ? `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '';
  const out = [];
  let side = null;
  for (const r of log || []) {
    const k = r.kind;
    if (!KEEP[k]) continue;
    const tx = String(r.text || '');
    let text = tx, good = true;
    if (k === 'sweep') {
      const m = tx.match(/^Swept (.+?) \(/);
      text = m ? m[1].replace(/ \d[\d,]*(\.\d+)?/g, '').replace(/ and /g, ' · ') : tx;
      good = /✓/.test(tx);
    } else if (k === 'cisd') {
      const m = tx.match(/5m CISD (up|down) closed at ([\d,.]+)/);
      text = m ? `5m ${m[1] === 'up' ? '↑' : '↓'} ${m[2]}` : tx;
    } else if (k === 'armed') {
      const m = tx.match(/(LONG|SHORT) limit ([\d,.]+)/);
      text = m ? `${m[1]} limit ${m[2]}` : tx;
    } else if (k === 'entry') {
      const m = tx.match(/(LONG|SHORT)[^@]*@ ([\d,.]+)/);
      side = m ? m[1].toLowerCase() : side;
      text = m ? `${m[1]} @ ${m[2]}` : tx;
    } else if (k === 'exit') {
      const m = tx.match(/EXIT (\w+).*?([+−-][\d.]+R)/);
      text = m ? `${m[1].toLowerCase()} ${m[2]}` : tx;
    }
    const row = { hm: r.hm, k, tag: KEEP[k], text: short(text.replace(/\s+/g, ' ').trim(), 44), good, side: null, film: null };
    if ((k === 'entry' || k === 'exit') && side && day) {
      const entry = k === 'entry' ? r.hm : [...out].reverse().find((x) => x.k === 'entry')?.hm;
      if (entry) { row.side = side; row.film = filmLink(day, entry, side); }
    }
    out.push(row);
  }
  return out;
}

/** Odeon's address for a trade: the reel whose id ends with <day>_<HHMM>_<side> (any source: replay, paper, real). */
export function filmLink(day, hm, side) {
  return `../odeon/#trade=${day}_${String(hm).replace(':', '')}_${String(side).toLowerCase()}`;
}

/** The ribbon in the bottom sheet: one chip per moment, the newest first (at the left). */
export class Ribbon {
  constructor(list, empty) {
    this.list = list;
    this.empty = empty;
    this.key = '';
  }

  render(rows) {
    const key = rows.map((r) => r.hm + r.k + r.text).join('|');
    if (key === this.key) return;
    this.key = key;
    this.empty.hidden = rows.length > 0;
    this.list.replaceChildren(...rows.slice().reverse().map((r) => {
      const li = document.createElement('li');
      li.className = `ev k-${r.k}${r.good ? '' : ' dim'}`;
      const box = r.film ? document.createElement('a') : li;
      if (r.film) { box.href = r.film; box.title = 'Watch this trade in Odeon'; box.className = 'film'; li.append(box); }
      const t = document.createElement('time');
      t.textContent = r.hm;
      const b = document.createElement('b');
      b.textContent = r.tag;
      const s = document.createElement('span');
      s.textContent = r.text + (r.film ? ' ▸' : '');
      box.append(t, b, s);
      return li;
    }));
  }
}
