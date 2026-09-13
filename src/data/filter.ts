import type {Dataset} from './load';
import type {Arc, TariffAction} from './types';
import {headlineRate, isActiveOn} from './rate';

/** An arc with its state resolved for a given date + focus. */
export interface LiveArc extends Arc {
  rate: number;
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
}

export type SortKey = 'date' | 'rate' | 'value';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve every arc's headline rate on the given date; drop arcs with nothing in force. */
export function liveArcs(ds: Dataset, view: ViewState): LiveArc[] {
  const out: LiveArc[] = [];
  for (const arc of ds.arcs) {
    if (view.hidden.has(arc.imposer)) continue;
    if (view.focus && arc.imposer !== view.focus && arc.target !== view.focus) continue;
    const active = arc.actionIds.map(id => ds.actionsById.get(id)!).filter(a => isActiveOn(a, view.date));
    if (!active.length) continue;
    const rate = headlineRate(active);
    if (rate <= 0) continue;
    out.push({...arc, rate, active});
  }
  return out;
}

/** Actions in force on the date, optionally restricted to a focused country, ordered by view.sort. */
export function liveActions(ds: Dataset, view: ViewState): TariffAction[] {
  const byDate = (a: TariffAction, b: TariffAction) => (a.effective < b.effective ? 1 : a.effective > b.effective ? -1 : 0);
  const byRate = (a: TariffAction, b: TariffAction) => (b.rate ?? -1) - (a.rate ?? -1) || byDate(a, b);
  const byValue = (a: TariffAction, b: TariffAction) => (b.tradeUsd ?? -1) - (a.tradeUsd ?? -1) || byRate(a, b);
  const cmp = view.sort === 'rate' ? byRate : view.sort === 'value' ? byValue : byDate;
  return ds.actions
    .filter(a => isActiveOn(a, view.date) && !view.hidden.has(a.imposer))
    .filter(a => !view.focus || a.imposer === view.focus || a.targets.includes(view.focus))
    .sort(cmp);
}
