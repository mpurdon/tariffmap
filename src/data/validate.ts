import {ALL, targetsEveryone, type Endpoint, type LastCheck, type TariffAction} from './types';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RATE_RANGE: [number, number] = [0, 250];

const plausibleRate = (r: number) => r >= RATE_RANGE[0] && r <= RATE_RANGE[1];

/** Sources must be plain https links (no javascript:, data:, or relative URLs). */
const HTTPS_URL = /^https:\/\/[^\s<>"']+$/i;
/**
 * Free text is rendered on the site; markup in it is either a mistake or an injection attempt.
 * Comparisons like ">800cc" or "<5%" are fine; a tag opening, a javascript: URL or an
 * inline event handler is not.
 */
const MARKUP = /<\s*[a-z!/?]|javascript:|\bon[a-z]+\s*=/i;
const TEXT_FIELDS = ['title', 'rateNote', 'hsLabel', 'exemptions', 'notes', 'coveredTradeNote'] as const;

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
    for (const s of a.sources ?? []) if (!HTTPS_URL.test(s)) err(a, `source is not an https URL: ${s}`);
    for (const f of TEXT_FIELDS) if (typeof a[f] === 'string' && MARKUP.test(a[f] as string)) err(a, `${f} contains markup`);
    for (const h of a.rateHistory ?? []) if (h.note && MARKUP.test(h.note)) err(a, 'rateHistory note contains markup');
    if (!/^[a-z0-9-]+$/.test(a.id)) err(a, 'id must be lowercase letters, digits and hyphens');
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

const OUTCOMES: LastCheck['outcome'][] = ['no-changes', 'changes-proposed', 'manual'];

/** Problems with data/curated/last-check.json. */
export function validateLastCheck(c: LastCheck): string[] {
  const errors: string[] = [];
  if (!ISO_DATE.test(c.checkedAt)) errors.push(`last-check: bad checkedAt ${c.checkedAt}`);
  if (!OUTCOMES.includes(c.outcome)) errors.push(`last-check: outcome must be one of ${OUTCOMES.join(', ')}`);
  if (c.outcome === 'changes-proposed' && !c.pullRequest) errors.push('last-check: changes-proposed needs a pullRequest URL');
  if (c.pullRequest && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(c.pullRequest)) errors.push('last-check: pullRequest must be a GitHub pull request URL');
  return errors;
}
