import type {TariffAction} from './types';

/**
 * Dollar value of imports covered by a set of HS codes, given imports by code.
 * A heading nested under a listed chapter is not double-counted.
 */
export function coveredValue(byCode: Record<string, number>, hs: string[]): number {
  if (hs.includes('ALL')) return byCode.TOTAL ?? 0;
  const chapters = hs.filter(c => c.length === 2);
  let sum = 0;
  for (const c of hs) {
    if (c.length > 2 && chapters.includes(c.slice(0, 2))) continue;
    sum += byCode[c] ?? 0;
  }
  return sum;
}

/** Union of HS codes across actions, collapsed so a chapter absorbs its headings. */
export function unionCodes(actions: TariffAction[]): string[] {
  if (actions.some(a => a.hs.includes('ALL'))) return ['ALL'];
  const set = new Set(actions.flatMap(a => a.hs));
  const chapters = [...set].filter(c => c.length === 2);
  return [...set].filter(c => c.length === 2 || !chapters.includes(c.slice(0, 2)));
}
