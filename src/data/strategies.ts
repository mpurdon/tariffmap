import type {TariffAction} from './types';

/**
 * How each economy has answered the tariffs aimed at it, classified from the dataset by
 * explicit rules (shown on the page next to every label). Retaliation means a measure the
 * responder formally labelled a countermeasure; anti-dumping or safeguard duties that look
 * retaliatory are listed as context but never counted.
 */

export type StrategyLabel = 'tit-for-tat' | 'retaliates' | 'holds-fire' | 'settles' | 'absorbs';

export interface Response {
  /** The economy deciding how to respond. */
  responder: string;
  /** The economy whose tariffs it is responding to. */
  instigator: string;
  label: StrategyLabel;
  /** Distinct dates the instigator started a measure hitting the responder. */
  hits: TariffAction[];
  /** Countermeasures the responder aimed back at the instigator. */
  counters: TariffAction[];
  /** Negotiated caps the instigator granted the responder. */
  deals: TariffAction[];
  /** Other measures the responder aimed at the instigator (anti-dumping, safeguards…), shown as context. */
  context: TariffAction[];
  /** Days from the latest hit before each counter to that counter; the median is shown. */
  lagDays: number[];
  /** A countermeasure was later suspended, revoked or cut. */
  eased: boolean;
  /** Highest rate any countermeasure reached. */
  peakCounterRate: number | null;
}

export const STRATEGIES: Record<StrategyLabel, {name: string; rule: string; summary: string}> = {
  'tit-for-tat': {
    name: 'Tit-for-tat',
    rule: 'Answered with formal countermeasures, and later eased at least one of them.',
    summary: 'Hits back, round for round, and steps down when the other side does.'
  },
  retaliates: {
    name: 'Retaliates',
    rule: 'Answered with formal countermeasures and has not eased any of them.',
    summary: 'Hits back and keeps the counter-tariffs on.'
  },
  'holds-fire': {
    name: 'Holds fire',
    rule: 'Adopted countermeasures but suspended every one before it took effect.',
    summary: 'Makes retaliation credible, then trades it for a deal.'
  },
  settles: {
    name: 'Settles',
    rule: 'No countermeasures; negotiated a deal that capped the tariffs.',
    summary: 'Absorbs the hit and negotiates instead of retaliating.'
  },
  absorbs: {
    name: 'Absorbs',
    rule: 'No countermeasures and no deal recorded.',
    summary: 'Takes the hit without retaliating.'
  }
};

const targets = (a: TariffAction, iso: string) => a.targets.includes(iso);
const byDate = (x: TariffAction, y: TariffAction) => x.effective.localeCompare(y.effective);
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const isEased = (a: TariffAction) =>
  a.status === 'suspended' || a.status === 'revoked' || !!a.rateHistory?.some((h, i, all) => i > 0 && h.rate < all[i - 1].rate);

/** Every response to one instigator, from the expanded dataset (targets "ALL" already resolved). */
export function responsesTo(actions: TariffAction[], instigator: string): Response[] {
  const hitsOn = new Map<string, TariffAction[]>();
  for (const a of actions) {
    if (a.imposer !== instigator || a.legalBasis === 'deal') continue;
    for (const t of a.targets) hitsOn.set(t, [...(hitsOn.get(t) ?? []), a]);
  }
  const out: Response[] = [];
  for (const [responder, hits] of hitsOn) {
    const mine = actions.filter(a => a.imposer === responder && targets(a, instigator)).sort(byDate);
    const counters = mine.filter(a => a.legalBasis === 'countermeasure');
    const context = mine.filter(a => a.legalBasis !== 'countermeasure');
    const deals = actions.filter(a => a.imposer === instigator && a.legalBasis === 'deal' && targets(a, responder)).sort(byDate);
    hits.sort(byDate);
    const lagDays = counters.flatMap(c => {
      const prior = hits.filter(h => h.effective <= c.effective).at(-1);
      return prior ? [days(prior.effective, c.effective)] : [];
    });
    const neverInForce = counters.length > 0 && counters.every(c => c.status === 'suspended');
    const label: StrategyLabel = !counters.length
      ? deals.length ? 'settles' : 'absorbs'
      : neverInForce ? 'holds-fire' : counters.some(isEased) ? 'tit-for-tat' : 'retaliates';
    const rates = counters.flatMap(c => [c.rate ?? 0, ...(c.rateHistory ?? []).map(h => h.rate)]);
    out.push({
      responder, instigator, label, hits, counters, deals, context, lagDays,
      eased: counters.some(isEased),
      peakCounterRate: rates.length ? Math.max(...rates) : null
    });
  }
  // Retaliators first, then by how hard they were hit.
  const order: StrategyLabel[] = ['tit-for-tat', 'retaliates', 'holds-fire', 'settles', 'absorbs'];
  return out.sort((x, y) => order.indexOf(x.label) - order.indexOf(y.label) || y.hits.length - x.hits.length);
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
