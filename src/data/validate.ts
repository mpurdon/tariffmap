import {ALL, targetsEveryone, type Endpoint, type TariffAction} from './types';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RATE_RANGE: [number, number] = [0, 250];

const plausibleRate = (r: number) => r >= RATE_RANGE[0] && r <= RATE_RANGE[1];

/** Every problem with the curated actions; an empty list means the dataset is valid. */
export function validateActions(actions: TariffAction[], entities: Endpoint[]): string[] {
  const known = new Set(entities.map(e => e.iso3));
  const ids = new Set<string>();
  const errors: string[] = [];
  const err = (a: TariffAction, msg: string) => errors.push(`${a.id}: ${msg}`);

  for (const a of actions) {
    if (ids.has(a.id)) err(a, 'duplicate id');
    ids.add(a.id);
    if (!known.has(a.imposer)) err(a, `unknown imposer ${a.imposer}`);
    for (const t of a.targets) if (t !== ALL && !known.has(t)) err(a, `unknown target ${t}`);
    for (const x of a.except ?? []) if (!known.has(x)) err(a, `unknown except ${x}`);
    if (a.except && !targetsEveryone(a)) err(a, 'except only applies with targets ALL');
    if (!a.sources?.length) err(a, 'no sources');
    if (a.rate !== null && !plausibleRate(a.rate)) err(a, `implausible rate ${a.rate}`);
    if (!ISO_DATE.test(a.effective)) err(a, 'bad effective date');
    if (!ISO_DATE.test(a.lastVerified)) err(a, 'bad lastVerified date');
    if (a.status === 'revoked' && !a.expires) err(a, 'revoked without expires date');
    if (a.coveredTradeUsd !== undefined && !(a.coveredTradeUsd > 0)) err(a, 'coveredTradeUsd must be positive');
    if (a.rateHistory?.length) {
      for (const h of a.rateHistory) if (!ISO_DATE.test(h.from) || !plausibleRate(h.rate)) err(a, 'bad rateHistory entry');
      if (a.rateHistory[0].from !== a.effective) err(a, 'first rateHistory.from must equal effective');
      const last = a.rateHistory.at(-1)!;
      if (a.rate !== null && last.rate !== a.rate) err(a, `rate ${a.rate} disagrees with last rateHistory ${last.rate}`);
    }
  }
  for (const a of actions) for (const s of a.stacksWith ?? []) if (!ids.has(s)) err(a, `stacksWith unknown ${s}`);
  return errors;
}
