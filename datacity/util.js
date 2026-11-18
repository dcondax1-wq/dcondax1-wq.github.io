// Small shared helpers of the Data City page: DOM, number formats, colours, per-viewer settings.

import { NEON } from './look-mode.js';   // the two looks of the Data City (look-mode.js): neon night (default) or AGORA marble
export const $ = (s) => document.querySelector(s);

export const COLORS = { gold: (NEON ? 0xffc94a : 0xd39556), green: (NEON ? 0x39e59a : 0x9bab62), amber: (NEON ? 0xff9f43 : 0xd1904e), grey: (NEON ? 0x5d6480 : 0x8a7f6e), thin: (NEON ? 0x3a3f55 : 0x5a5044), strat: (NEON ? 0xa68bff : 0xcdbf9f),
                        monument: (NEON ? 0xbff6dc : 0xddae7d), lit: (NEON ? 0x3fd8ff : 0xd39556), win: (NEON ? 0x39e59a : 0x9bab62), loss: (NEON ? 0xff5d73 : 0xc96a4a) };
export const CLASS_TEXT = { gold: 'holds everywhere', green: 'both periods', amber: 'one period', grey: 'noise', thin: 'thin' };
const CLASS_RANK = { gold: 0, green: 1, amber: 2, grey: 3, thin: 4 };

export const clsRank = (c) => CLASS_RANK[c] ?? 5;
export const cssColor = (cls) => '#' + (COLORS[cls] ?? COLORS.grey).toString(16).padStart(6, '0');

/** An element with a class and plain text (never HTML: every string from the data goes in as text). */
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

const missing = (v) => v === null || v === undefined || !Number.isFinite(+v);
export const money = (v, d = 0) => missing(v) ? '–'
  : (v < 0 ? '-' : '+') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (v) => missing(v) ? '–' : `${(+v).toFixed(0)}%`;
export const num = (v, d = 1) => missing(v) ? '–' : (+v).toFixed(d);
export const signed = (v, d = 2) => missing(v) ? '–' : `${v >= 0 ? '+' : ''}${(+v).toFixed(d)}`;

/** localStorage that never throws (private mode, blocked storage): per-viewer conveniences only. */
export const settings = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* not kept: fine */ } },
};
