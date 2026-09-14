import type {Dataset} from '../data/load';
import {entityName} from '../data/load';
import {hsLabelOf, type TariffAction} from '../data/types';
import {flag} from './flag';
import {fmtDate, fmtRate, moneyHtml} from './format';
import {involves, type SortKey, type ViewState} from '../data/filter';
import {endDate, rateOn} from '../data/rate';
import type {Upcoming} from '../data/timeline';

export interface FeedCallbacks {
  onHover: (id: string | null) => void;
  onFocus: (iso3: string | null) => void;
  onSort: (key: SortKey) => void;
  onJump: (date: string) => void;
}

const SORTS: {key: SortKey; label: string; title: string}[] = [
  {key: 'date', label: 'Newest', title: 'Most recently in force first'},
  {key: 'rate', label: 'Rate', title: 'Highest ad valorem rate first'},
  {key: 'value', label: 'Value', title: 'Most trade affected first'}
];

const FOOTER = `<footer class="site-footer">
  <p><a href="https://tariffmap.org">tariffmap.org</a> · © ${new Date().getUTCFullYear()} <a href="https://matthewpurdon.me" rel="author">Matthew Purdon</a></p>
  <p>Tariff measures are curated from primary sources and linked on every entry. Trade values are annual goods imports from <a href="https://comtradeplus.un.org" rel="noopener" target="_blank">UN Comtrade</a>; duty figures are ceilings, not revenue. Not trade or legal advice.</p>
</footer>`;

/** How the measure's lifecycle reads from the viewed date's point of view. */
function lifecycle(a: TariffAction, date: string): string {
  const end = endDate(a);
  if (end && end > date) return ` · until ${fmtDate(end)}`;
  if (a.status !== 'active') return ` · <em>${a.status}</em>`;
  return '';
}

export function renderFeed(el: HTMLElement, ds: Dataset, actions: TariffAction[], view: ViewState, upcoming: Upcoming[], cb: FeedCallbacks) {
  const {focus, date, sort} = view;
  const name = (iso: string) => entityName(ds, iso);
  const targetsLabel = (a: TariffAction) =>
    a.targets.length > 4
      ? `<span class="flag-stack">${a.targets.slice(0, 4).map(t => flag(ds, t, {size: 'sm'})).join('')}</span> ${a.targets.length} countries`
      : a.targets.map(t => `${flag(ds, t, {size: 'sm'})} ${name(t)}`).join(', ');

  const hasValue = actions.some(a => a.tradeUsd);
  const sortBar = `<div class="sort" role="group" aria-label="Sort">${SORTS.map(
    s => `<button data-sort="${s.key}" class="${s.key === sort ? 'on' : ''}" title="${s.title}"${s.key === 'value' && !hasValue ? ' disabled' : ''}>${s.label}</button>`
  ).join('')}</div>`;
  const head = focus
    ? `<div class="feed-head"><button class="back" data-back>←</button>${flag(ds, focus, {size: 'lg'})}<h2>${name(focus)}</h2><span class="count">${actions.length} in force</span>${sortBar}</div>`
    : `<div class="feed-head"><h2>Tariffs in force</h2><span class="count">${actions.length}</span>${sortBar}</div>`;

  const future = upcoming.filter(u => u.date > date && involves(ds.actionsById.get(u.id)!, focus));
  const upcomingHtml = future.length
    ? `<details class="upcoming"><summary>Scheduled <span class="count">${future.length}</span></summary><ul>${future
        .map(u => `<li class="up ${u.kind}"><button data-jump="${u.date}" title="View the map on this date"><time>${fmtDate(u.date)}</time><span class="up-kind">${u.kind === 'start' ? 'starts' : u.kind === 'end' ? 'ends' : `${u.rate}%`}</span><span class="up-title">${u.title}</span></button></li>`)
        .join('')}</ul></details>`
    : '';

  const items = actions
    .map(
      a => `<li class="item" data-id="${a.id}">
        <div class="item-top">
          <span class="pair">${flag(ds, a.imposer, {ring: true})} <b>${name(a.imposer)}</b> <span class="arrow">→</span> ${targetsLabel(a)}</span>
          <span class="rate">${fmtRate(rateOn(a, date), a.rateNote)}${a.tradeUsd ? `<small>${moneyHtml(a.tradeUsd, undefined).replace(/ of imports covered/, '')}</small>` : ''}</span>
        </div>
        <div class="item-title">${a.title}</div>
        <div class="item-meta">${a.legalBasis} · ${hsLabelOf(a)} · since ${fmtDate(a.effective)}${lifecycle(a, date)}</div>
        <details class="item-more"><summary>details</summary>
          ${a.tradeUsd ? `<p class="money">${moneyHtml(a.tradeUsd, a.dutyUsd, a.rate)} (${a.tradeYear})<span class="dim"> — UN Comtrade; a ceiling before exemptions and trade diversion</span></p>` : ''}
          ${a.rateNote ? `<p>${a.rateNote}</p>` : ''}
          ${a.rateHistory?.length ? `<p class="history">${a.rateHistory.map(h => `<span><b>${h.rate}%</b> from ${fmtDate(h.from)}${h.note ? ` <i>${h.note}</i>` : ''}</span>`).join('')}</p>` : ''}
          ${a.exemptions ? `<p><b>Exemptions:</b> ${a.exemptions}</p>` : ''}
          ${a.notes ? `<p>${a.notes}</p>` : ''}
          <p class="sources">${a.sources.map((s, i) => `<a href="${s}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')} · verified ${fmtDate(a.lastVerified)}</p>
        </details>
      </li>`
    )
    .join('');

  el.innerHTML = `${head}${upcomingHtml}<ul class="feed-list">${items || '<li class="empty">Nothing in force on this date.</li>'}</ul>${FOOTER}`;
  el.querySelector('[data-back]')?.addEventListener('click', () => cb.onFocus(null));
  el.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(b => b.addEventListener('click', () => cb.onSort(b.dataset.sort as SortKey)));
  el.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach(b => b.addEventListener('click', () => cb.onJump(b.dataset.jump!)));
  el.querySelectorAll<HTMLLIElement>('.item').forEach(li => {
    li.addEventListener('mouseenter', () => cb.onHover(li.dataset.id!));
    li.addEventListener('mouseleave', () => cb.onHover(null));
  });
}
