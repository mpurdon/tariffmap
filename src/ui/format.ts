const utcDate = (iso: string) => new Date(iso + 'T00:00:00Z');
const enUS = (iso: string, opts: Intl.DateTimeFormatOptions) => utcDate(iso).toLocaleDateString('en-US', {...opts, timeZone: 'UTC'});

export const fmtDate = (iso: string) => enUS(iso, {month: 'short', day: 'numeric', year: 'numeric'});
export const fmtMonth = (iso: string) => enUS(iso, {month: 'long', year: 'numeric'});

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

/** "$X of imports covered · $Y est. duty/yr" with an optional rate qualifier. */
export function moneyHtml(tradeUsd: number | undefined, dutyUsd: number | undefined, rate?: number | null): string {
  if (!tradeUsd) return '';
  const duty = dutyUsd ? ` · <b>${fmtUsd(dutyUsd)}</b> est. duty/yr${rate != null ? ` at ${rate}%` : ''}` : '';
  return `<b>${fmtUsd(tradeUsd)}</b> of imports covered${duty}`;
}
