// TYCHE formats and colours, shared by the HUD and the scene. Pure: no DOM, no three.js.
// Money is real: always to the cent. The minus is the typographic one (U+2212), like the Kalshi page.

export const MINUS = '−';

const sign = (x, signed) => (x < 0 ? MINUS : signed && x > 0 ? '+' : '');

/** 1234.5 -> "$1,234.50"; signed: "+$18.50" / "−$3.10"; null -> "—". */
export function usd(v, signed = false) {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = +Math.abs(v).toFixed(2);
  return (r === 0 ? '' : sign(v, signed)) + '$' + r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 0.6421 -> "64.2%"; signed: "+8.3%"; null -> "—". */
export function pct(x, signed = false, digits = 1) {
  if (x == null || !Number.isFinite(x)) return '—';
  const r = +Math.abs(x * 100).toFixed(digits);
  return (r === 0 ? '' : sign(x, signed)) + r.toFixed(digits) + '%';
}

/** A price 0-1 in cents: 0.42 -> "42¢", 0.968 -> "96.8¢". */
export function cents(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const c = x * 100;
  return (Math.abs(c - Math.round(c)) < 0.05 ? String(Math.round(c)) : c.toFixed(1)) + '¢';
}

/** An edge 0-1 in signed cents: 0.05 -> "+5.0¢". */
export function edgeC(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  return sign(x, true) + Math.abs(x * 100).toFixed(1) + '¢';
}

/** Seconds to settlement -> "4m 12s", "2h 05m", "3d 4h"; past -> "settling". */
export function countdown(s) {
  if (s == null || !Number.isFinite(s)) return '—';
  if (s <= 0) return 'settling';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(x).padStart(2, '0')}s`;
}

/** "updated N min ago". */
export function ago(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, sec);
  return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
}

// Category colours: glowing, told apart on a near-black ground. Gold and mint lead (Tyche's own colours).
export const PALETTE = ['#c8a24a', '#6f9bb8', '#c96a4a', '#9bab63', '#e0a060', '#b0866a', '#8a9a7a', '#4b7a99', '#d9c58a', '#cfc4b2'];
export const OTHER_COLOR = '#988d81';

/** {category name -> colour}: the biggest categories (by stake, then count) get the first colours; "Other" stays grey. */
export function categoryColors(names) {
  const out = new Map();
  let i = 0;
  names.forEach((n) => {
    if (out.has(n)) return;
    out.set(n, n === 'Other' ? OTHER_COLOR : PALETTE[i++ % PALETTE.length]);
  });
  return out;
}
