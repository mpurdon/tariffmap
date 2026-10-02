import type {Meta} from '../data/types';
import {isStale} from '../data/schedule';
import {fmtDate} from './format';

/**
 * The header's "How it's updated" link doubles as the freshness indicator: a status dot
 * (amber once a check is overdue) and the date of the last check. The detail is in the tooltip.
 */
export function renderFreshness(el: HTMLElement, meta: Meta) {
  // Older builds have no check record; the newest verification is the best they can say.
  const checked = meta.lastCheck?.checkedAt ?? meta.actionsVerifiedThrough;
  const stale = isStale(checked);
  const short = new Date(checked + 'T00:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
  el.classList.toggle('stale', stale);
  el.innerHTML = `<span class="pulse${stale ? ' stale' : ''}"></span>How it's updated <span class="when">· ${stale ? 'overdue' : short}</span>`;
  el.title = [
    `Sources last checked ${fmtDate(checked)}${stale ? ' (check overdue)' : ''}: the weekly curation run compares every measure against its primary source.`,
    `Most recent entry change: ${fmtDate(meta.actionsVerifiedThrough)}${meta.lastCheck?.outcome === 'changes-proposed' ? ' · changes awaiting review' : ''}.`,
    `${meta.counts.actions} measures · site built ${fmtDate(meta.builtAt.slice(0, 10))}.`
  ].join('\n');
}
