export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
}
export function fmtRate(rate: number | null, note?: string): string {
  if (rate === null) return note ? 'non-ad valorem' : '—';
  return `${rate}%`;
}
export function fmtUsd(n?: number): string {
  if (!n) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
