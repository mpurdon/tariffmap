import type {Meta} from '../data/types';
import {fmtDate} from './format';

export function renderFreshness(el: HTMLElement, meta: Meta) {
  el.innerHTML = `<span class="pulse"></span>Actions verified ${fmtDate(meta.actionsVerifiedThrough)} · ${meta.counts.actions} measures · built ${fmtDate(meta.builtAt.slice(0, 10))}`;
  el.title = 'Every tariff on this map links to a primary source. The verified date is the last time a human checked the entries against those sources.';
}
