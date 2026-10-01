import type {Meta} from '../data/types';
import {isStale} from '../data/schedule';
import {fmtDate} from './format';

export function renderFreshness(el: HTMLElement, meta: Meta) {
  // Older builds have no check record; the newest verification is the best they can say.
  const checked = meta.lastCheck?.checkedAt ?? meta.actionsVerifiedThrough;
  const stale = isStale(checked);
  el.innerHTML = `<span class="pulse${stale ? ' stale' : ''}"></span>Sources checked ${fmtDate(checked)}${stale ? ' <span class="overdue">· check overdue</span>' : ''} · <a class="how" href="/how-it-works">how it's updated</a>`;
  el.title = [
    'Every tariff on this map links to a primary source.',
    `Checked: the last time the weekly curation run compared the dataset against those sources (${fmtDate(checked)}${meta.lastCheck?.outcome === 'changes-proposed' ? ', changes awaiting review' : ''}).`,
    `Most recent entry change or re-verification: ${fmtDate(meta.actionsVerifiedThrough)}.`,
    `${meta.counts.actions} measures · site built ${fmtDate(meta.builtAt.slice(0, 10))}.`
  ].join('\n');
}
