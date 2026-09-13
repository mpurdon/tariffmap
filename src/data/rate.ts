import type {TariffAction} from './types';

/** Is the action in force on the given ISO date? */
export function isActiveOn(a: TariffAction, date: string): boolean {
  if (a.status === 'announced') return false;
  if (a.effective > date) return false;
  if (a.expires && a.expires <= date) return false;
  if (a.status === 'revoked' && !a.expires) return false;
  return true;
}

/**
 * Headline rate for a set of actions that all apply to one imposer→target pair.
 * Each action is considered together with the active actions it explicitly stacks on;
 * the headline is the largest such stack. Returns 0 when nothing applies.
 */
export function headlineRate(actions: TariffAction[]): number {
  const byId = new Map(actions.map(a => [a.id, a]));
  let best = 0;
  for (const a of actions) {
    let total = a.rate ?? 0;
    for (const sid of a.stacksWith ?? []) {
      const s = byId.get(sid);
      if (s) total += s.rate ?? 0;
    }
    if (total > best) best = total;
  }
  return best;
}
