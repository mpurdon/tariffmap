import type {Meta} from '../data/types';
import {today} from '../data/filter';
import {fmtDate} from './format';

/** The curation run is weekly; past this many days the check is overdue and the dot turns amber. */
const STALE_DAYS = 9;

const daysSince = (iso: string) => Math.floor((Date.parse(today()) - Date.parse(iso)) / 86_400_000);

export function renderFreshness(el: HTMLElement, meta: Meta) {
  // Older builds have no check record; the newest verification is the best they can say.
  const checked = meta.lastCheck?.checkedAt ?? meta.actionsVerifiedThrough;
  const stale = daysSince(checked) > STALE_DAYS;
  el.innerHTML = `<span class="pulse${stale ? ' stale' : ''}"></span>Sources checked ${fmtDate(checked)}${stale ? ' <span class="overdue">· check overdue</span>' : ''} · ${meta.counts.actions} measures · built ${fmtDate(meta.builtAt.slice(0, 10))}`;
  el.title = [
    'Every tariff on this map links to a primary source.',
    `Checked: the last time the weekly curation run compared the dataset against those sources (${fmtDate(checked)}${meta.lastCheck?.outcome === 'changes-proposed' ? ', changes awaiting review' : ''}).`,
    `Most recent entry change or re-verification: ${fmtDate(meta.actionsVerifiedThrough)}.`
  ].join('\n');
}
