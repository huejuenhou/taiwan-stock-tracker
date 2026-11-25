// Number and date formatting, same output as the original page.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function num(v) {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}
export function fmt(n, dp = 0) {
  if (!Number.isFinite(n)) n = 0;
  return n.toLocaleString('en-US', {minimumFractionDigits: dp, maximumFractionDigits: dp});
}
export const nt = (n, dp) => 'NT$' + fmt(n, dp);
export const signed = (n, dp = 0) => (n > 0 ? '+' : n < 0 ? '−' : '') + 'NT$' + fmt(Math.abs(n), dp);
export const pctStr = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), 2) + '%';
export const plain = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
export const roundPl = n => (Math.abs(n) < 0.005 ? 0 : n);
// Taiwan convention: red is a gain, green is a loss.
export const tone = n => (n > 0 ? 'gain' : n < 0 ? 'loss' : 'flat');
export const toneColor = n =>
  n > 0 ? 'var(--color-text-red)' : n < 0 ? 'var(--color-text-green)' : 'var(--color-text-secondary)';

export const normDate = s => (s || '').replace(/\//g, '-');
export const pad = n => String(n).padStart(2, '0');
export function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function dateParts(d) {
  const p = d.split('-');
  return {y: +p[0], m: +p[1], d: +p[2], wd: new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()};
}
export function longDate(d) {
  const p = dateParts(d);
  return WEEKDAYS[p.wd] + ', ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y;
}
export function shortDate(d) {
  const p = dateParts(d);
  return MONTHS[p.m - 1] + ' ' + p.d;
}
export const slashDate = d => normDate(d).replace(/-/g, '/');
export const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
