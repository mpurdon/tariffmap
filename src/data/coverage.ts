import {ALL, coversAllGoods, type TariffAction} from './types';

/**
 * Dollar value of imports covered by a set of HS codes, given imports by code.
 * A heading nested under a listed chapter is not double-counted.
 */
export function coveredValue(byCode: Record<string, number>, hs: string[]): number {
  if (hs.includes(ALL)) return byCode.TOTAL ?? 0;
  const chapters = hs.filter(c => c.length === 2);
  let sum = 0;
  for (const c of hs) {
    if (c.length > 2 && chapters.includes(c.slice(0, 2))) continue;
    sum += byCode[c] ?? 0;
  }
  return sum;
}

/** The keys a measure covers in a regional arc's byCode: HS codes (Census) or n## NAPCS sections (StatCan). */
export function regionalCodes(a: TariffAction, source: 'census' | 'statcan'): string[] {
  if (source === 'census' || coversAllGoods(a)) return a.hs;
  return (a.napcs ?? []).map(n => `n${String(n).padStart(2, '0')}`);
}

/** Union of HS codes across actions, collapsed so a chapter absorbs its headings. */
export function unionCodes(actions: TariffAction[], codesOf: (a: TariffAction) => string[] = a => a.hs): string[] {
  if (actions.some(coversAllGoods)) return [ALL];
  const set = new Set(actions.flatMap(codesOf));
  const chapters = [...set].filter(c => c.length === 2);
  return [...set].filter(c => c.length === 2 || !chapters.includes(c.slice(0, 2)));
}
