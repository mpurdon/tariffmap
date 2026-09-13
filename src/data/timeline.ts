import {endDate} from './rate';
import type {TariffAction} from './types';

/** Discrete positions for the timeline scrubber. */
export interface Step {
  /** ISO date the map shows at this step (state as of end of period). */
  date: string;
  label: string;
  kind: 'year' | 'month' | 'now' | 'future';
  /** For future steps: what changes on that date. */
  events?: Upcoming[];
}

/** A scheduled change to a measure after today. */
export interface Upcoming {
  date: string;
  kind: 'start' | 'end' | 'rate';
  id: string;
  title: string;
  /** For `rate` changes: the new rate. */
  rate?: number;
}

export const nowIndex = (steps: Step[]) => steps.findIndex(s => s.kind === 'now');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastDay(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Yearly steps from the first year with data up to two years ago, then monthly
 * steps from January of last year through the current month, then "Now".
 */
export function buildSteps(earliest: string, today: string, future: Upcoming[] = []): Step[] {
  const y0 = Number(earliest.slice(0, 4));
  const yNow = Number(today.slice(0, 4));
  const mNow = Number(today.slice(5, 7)) - 1;
  const steps: Step[] = [];
  for (let y = y0; y <= yNow - 2; y++) steps.push({date: lastDay(y, 11), label: String(y), kind: 'year'});
  for (let y = Math.max(y0, yNow - 1); y <= yNow; y++) {
    const mEnd = y === yNow ? mNow : 11;
    for (let m = 0; m <= mEnd; m++) {
      if (y === yNow && m === mNow) break;
      steps.push({date: lastDay(y, m), label: m === 0 ? String(y) : MONTHS[m], kind: 'month'});
    }
  }
  steps.push({date: today, label: 'Now', kind: 'now'});
  // Scheduled changes after today, one step per distinct date.
  const byDate = new Map<string, Upcoming[]>();
  for (const f of future) {
    if (f.date <= today) continue;
    byDate.set(f.date, [...(byDate.get(f.date) ?? []), f]);
  }
  for (const [date, events] of [...byDate.entries()].sort()) {
    const d = new Date(date + 'T00:00:00Z');
    const label = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${d.getUTCFullYear() !== Number(today.slice(0, 4)) ? ` '${String(d.getUTCFullYear()).slice(2)}` : ''}`;
    steps.push({date, label, kind: 'future', events});
  }
  return steps;
}

/** Every dated change a measure has scheduled after today: start, end, and future rate steps. */
export function scheduledChanges(actions: TariffAction[], today: string): Upcoming[] {
  const out: Upcoming[] = [];
  for (const a of actions) {
    const {id, title} = a;
    if (a.effective > today) out.push({date: a.effective, kind: 'start', id, title});
    const end = endDate(a);
    if (end && end > today) out.push({date: end, kind: 'end', id, title});
    for (const h of a.rateHistory ?? []) if (h.from > today) out.push({date: h.from, kind: 'rate', id, title, rate: h.rate});
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
