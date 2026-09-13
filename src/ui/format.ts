export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
}
export function fmtRate(rate: number | null, note?: string): string {
  if (rate === null) return note && /ban/i.test(note) ? 'BAN' : note ? 'n/a' : '—';
  return `${rate}%`;
}
export function fmtUsd(n?: number): string {
  if (!n) return '';
  const f = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  if (n >= 1e12) return `$${f(n / 1e12)}T`;
  if (n >= 1e9) return `$${f(n / 1e9)}B`;
  if (n >= 1e6) return `$${f(n / 1e6)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}
