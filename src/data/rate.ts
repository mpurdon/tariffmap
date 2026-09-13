import type {TariffAction} from './types';

/** The date a measure stops applying, or null while it is open-ended. */
export function endDate(a: TariffAction): string | null {
  return a.expires ?? null;
}

/** Is the action in force on the given ISO date? */
export function isActiveOn(a: TariffAction, date: string): boolean {
  if (a.status === 'suspended') return false;
  if (a.effective > date) return false;
  const end = endDate(a);
  return !end || end > date;
}

/** The rate in force on a date, following rateHistory when present. */
export function rateOn(a: TariffAction, date: string): number | null {
  if (!a.rateHistory?.length) return a.rate;
  let r: number | null = a.rateHistory[0].rate;
  for (const h of a.rateHistory) if (h.from <= date) r = h.rate;
  return r;
}

/**
 * Headline rate for a set of actions that all apply to one imposer→target pair.
 * Each action is considered together with the active actions it explicitly stacks on;
 * the headline is the largest such stack. Returns 0 when nothing applies.
 */
export function headlineRate(actions: TariffAction[], date: string): number {
  const byId = new Map(actions.map(a => [a.id, a]));
  let best = 0;
  for (const a of actions) {
    let total = rateOn(a, date) ?? 0;
    for (const sid of a.stacksWith ?? []) {
      const s = byId.get(sid);
      if (s) total += rateOn(s, date) ?? 0;
    }
    if (total > best) best = total;
  }
  return best;
}
