import type {Dataset} from './load';
import type {Arc, RegionalArc, TariffAction} from './types';
import {headlineRate, isActiveOn, rateOn} from './rate';
import {coveredValue, regionalCodes, unionCodes} from './coverage';
import {coversAllGoods} from './types';

/** An arc with its state resolved for a given date + focus. */
export interface LiveArc extends Arc {
  /** Headline: the economy-wide rate if one applies, else the highest product-specific rate. */
  rate: number;
  /** Highest rate on any covered product. */
  peak: number;
  /** True when the headline comes from product-specific measures only. */
  productOnly: boolean;
  /** Annual imports covered by the active measures, USD (undefined when no trade data). */
  tradeUsd?: number;
  /** Σ rate × covered imports across active measures — an annual duty ceiling, USD. */
  dutyUsd?: number;
  active: TariffAction[];
}

export interface ViewState {
  /** ISO date the map is showing. */
  date: string;
  /** ISO3 of a focused country, or null. */
  focus: string | null;
  /** Hovered/selected action id, or null. */
  highlight: string | null;
  /** Imposers toggled off in the legend. */
  hidden: Set<string>;
  /** Feed ordering. */
  sort: SortKey;
  /** With a focused country: measures it faces (in), imposes (out), or both. */
  direction: Direction;
}

export type SortKey = 'date' | 'rate' | 'value';
export type Direction = 'in' | 'both' | 'out';

/** A regional arc resolved for the viewed date. */
export interface LiveRegionalArc extends RegionalArc {
  rate: number;
  tradeUsd: number;
  dutyUsd: number;
  active: TariffAction[];
}

/** Ignore regions where the exposed trade is negligible, so the fan stays readable. */
const MIN_REGIONAL_USD = 25e6;

export function liveRegionalArcs(ds: Dataset, view: ViewState): LiveRegionalArc[] {
  const out: LiveRegionalArc[] = [];
  for (const arc of ds.regional) {
    if (view.hidden.has(arc.imposer)) continue;
    if (!involves({imposer: arc.imposer, targets: [arc.target]}, view.focus, view.direction)) continue;
    const active = arc.actionIds.map(id => ds.actionsById.get(id)!).filter(a => isActiveOn(a, view.date));
    if (!active.length) continue;
    const codesOf = (a: TariffAction) => regionalCodes(a, arc.source);
    const tradeUsd = coveredValue(arc.byCode, unionCodes(active, codesOf));
    if (tradeUsd < MIN_REGIONAL_USD) continue;
    const dutyUsd = active.reduce((sum, a) => sum + coveredValue(arc.byCode, codesOf(a)) * (rateOn(a, view.date) ?? 0) / 100, 0);
    out.push({...arc, rate: headlineRate(active, view.date), tradeUsd, dutyUsd, active});
  }
  return out;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Does the focused country impose or receive this measure? (No focus = everything.) */
export const involves = (a: Pick<TariffAction, 'imposer' | 'targets'>, focus: string | null, direction: Direction = 'both') => {
  if (!focus) return true;
  const out = a.imposer === focus;
  const inbound = a.targets.includes(focus);
  return direction === 'out' ? out : direction === 'in' ? inbound : out || inbound;
};

/** Resolve every arc's headline rate on the given date; drop arcs with nothing in force. */
export function liveArcs(ds: Dataset, view: ViewState): LiveArc[] {
  const out: LiveArc[] = [];
  for (const arc of ds.arcs) {
    if (view.hidden.has(arc.imposer)) continue;
    if (!involves({imposer: arc.imposer, targets: [arc.target]}, view.focus, view.direction)) continue;
    const active = arc.actionIds.map(id => ds.actionsById.get(id)!).filter(a => isActiveOn(a, view.date));
    if (!active.length) continue;
    const broad = active.filter(coversAllGoods);
    const peak = headlineRate(active, view.date);
    if (peak <= 0) continue;
    const rate = (broad.length && headlineRate(broad, view.date)) || peak;
    let tradeUsd: number | undefined;
    let dutyUsd: number | undefined;
    if (arc.trade) {
      tradeUsd = coveredValue(arc.trade.byCode, unionCodes(active));
      dutyUsd = active.reduce((sum, a) => sum + coveredValue(arc.trade!.byCode, a.hs) * (rateOn(a, view.date) ?? 0) / 100, 0);
    }
    out.push({...arc, rate, peak, productOnly: !broad.length, tradeUsd, dutyUsd, active});
  }
  return out;
}

/** Actions in force on the date, optionally restricted to a focused country, ordered by view.sort. */
export function liveActions(ds: Dataset, view: ViewState): TariffAction[] {
  const byDate = (a: TariffAction, b: TariffAction) => b.effective.localeCompare(a.effective);
  const byRate = (a: TariffAction, b: TariffAction) => (rateOn(b, view.date) ?? -1) - (rateOn(a, view.date) ?? -1) || byDate(a, b);
  const byValue = (a: TariffAction, b: TariffAction) => (b.tradeUsd ?? -1) - (a.tradeUsd ?? -1) || byRate(a, b);
  const cmp = view.sort === 'rate' ? byRate : view.sort === 'value' ? byValue : byDate;
  return ds.actions
    .filter(a => isActiveOn(a, view.date) && !view.hidden.has(a.imposer) && involves(a, view.focus, view.direction))
    .sort(cmp);
}
