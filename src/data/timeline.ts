/** Discrete positions for the timeline scrubber. */
export interface Step {
  /** ISO date the map shows at this step (state as of end of period). */
  date: string;
  label: string;
  kind: 'year' | 'month' | 'now';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastDay(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Yearly steps from the first year with data up to two years ago, then monthly
 * steps from January of last year through the current month, then "Now".
 */
export function buildSteps(earliest: string, today: string): Step[] {
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
  return steps;
}
