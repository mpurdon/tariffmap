import type {Dataset} from '../data/load';
import type {TariffAction} from '../data/types';
import {flag} from './flag';
import {fmtDate, fmtRate, fmtUsd} from './format';
import type {SortKey} from '../data/filter';
import {rateOn} from '../data/rate';

export interface FeedCallbacks {
  onHover: (id: string | null) => void;
  onFocus: (iso3: string | null) => void;
  onSort: (key: SortKey) => void;
  onJump: (date: string) => void;
}

export interface Upcoming {
  date: string;
  label: string;
  id: string;
  kind: 'start' | 'end' | 'rate';
}

const SORTS: {key: SortKey; label: string; title: string}[] = [
  {key: 'date', label: 'Newest', title: 'Most recently in force first'},
  {key: 'rate', label: 'Rate', title: 'Highest ad valorem rate first'},
  {key: 'value', label: 'Value', title: 'Most trade affected first (needs trade data)'}
];

export function renderFeed(el: HTMLElement, ds: Dataset, actions: TariffAction[], focus: string | null, date: string, sort: SortKey, upcoming: Upcoming[], cb: FeedCallbacks) {
  const name = (iso: string) => ds.entityByIso.get(iso)?.name ?? iso;
  const targetsLabel = (a: TariffAction) =>
    a.targets.length > 4
      ? `<span class="flag-stack">${a.targets.slice(0, 4).map(t => flag(ds, t, {size: 'sm'})).join('')}</span> ${a.targets.length} countries`
      : a.targets.map(t => `${flag(ds, t, {size: 'sm'})} ${name(t)}`).join(', ');
  // How the measure's lifecycle reads from the viewed date's point of view.
  const lifecycle = (a: TariffAction) => {
    if (a.expires && a.expires > date) return ` · until ${fmtDate(a.expires)}`;
    if (a.status !== 'active') return ` · <em>${a.status}</em>`;
    return '';
  };

  const hasValue = actions.some(a => a.tradeUsd);
  const sortBar = `<div class="sort" role="group" aria-label="Sort">${SORTS.map(
    s => `<button data-sort="${s.key}" class="${s.key === sort ? 'on' : ''}" title="${s.title}"${s.key === 'value' && !hasValue ? ' disabled' : ''}>${s.label}</button>`
  ).join('')}</div>`;
  const head = focus
    ? `<div class="feed-head"><button class="back" data-back>←</button>${flag(ds, focus, {size: 'lg'})}<h2>${name(focus)}</h2><span class="count">${actions.length} in force</span>${sortBar}</div>`
    : `<div class="feed-head"><h2>Tariffs in force</h2><span class="count">${actions.length}</span>${sortBar}</div>`;

  // Scheduled changes after the viewed date (only when looking at today or later).
  const today = new Date().toISOString().slice(0, 10);
  const future = date >= today ? upcoming.filter(u => u.date > date && (!focus || ds.actionsById.get(u.id)?.imposer === focus || ds.actionsById.get(u.id)?.targets.includes(focus))) : [];
  const upcomingHtml = future.length
    ? `<details class="upcoming" open><summary>Scheduled <span class="count">${future.length}</span></summary><ul>${future
        .map(u => `<li class="up ${u.kind}"><button data-jump="${u.date}" title="View the map on this date"><time>${fmtDate(u.date)}</time><span class="up-kind">${u.kind === 'start' ? 'starts' : u.kind === 'end' ? 'ends' : 'rate'}</span><span class="up-title">${u.label.replace(/^(Starts|Ends|[\d.]+%): /, '')}</span></button></li>`)
        .join('')}</ul></details>`
    : '';

  const money = (a: TariffAction) => {
    if (!a.tradeUsd) return '';
    const duty = a.dutyUsd ? ` · <b>${fmtUsd(a.dutyUsd)}</b> est. duty/yr at ${a.rate}%` : '';
    return `<p class="money"><b>${fmtUsd(a.tradeUsd)}</b> of imports covered (${a.tradeYear})${duty}<span class="dim"> — UN Comtrade; a ceiling before exemptions and trade diversion</span></p>`;
  };

  const items = actions
    .map(
      a => `<li class="item" data-id="${a.id}">
        <div class="item-top">
          <span class="pair">${flag(ds, a.imposer, {ring: true})} <b>${name(a.imposer)}</b> <span class="arrow">→</span> ${targetsLabel(a)}</span>
          <span class="rate">${fmtRate(rateOn(a, date), a.rateNote)}${a.tradeUsd ? `<small>${fmtUsd(a.tradeUsd)}</small>` : ''}</span>
        </div>
        <div class="item-title">${a.title}</div>
        <div class="item-meta">${a.legalBasis} · ${a.hsLabel ?? (a.hs.includes('ALL') ? 'all goods' : 'HS ' + a.hs.join(', '))} · since ${fmtDate(a.effective)}${lifecycle(a)}</div>
        <details class="item-more"><summary>details</summary>
          ${money(a)}
          ${a.rateNote ? `<p>${a.rateNote}</p>` : ''}
          ${a.rateHistory?.length ? `<p class="history">${a.rateHistory.map(h => `<span><b>${h.rate}%</b> from ${fmtDate(h.from)}${h.note ? ` <i>${h.note}</i>` : ''}</span>`).join('')}</p>` : ''}
          ${a.exemptions ? `<p><b>Exemptions:</b> ${a.exemptions}</p>` : ''}
          ${a.notes ? `<p>${a.notes}</p>` : ''}
          <p class="sources">${a.sources.map((s, i) => `<a href="${s}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')} · verified ${fmtDate(a.lastVerified)}</p>
        </details>
      </li>`
    )
    .join('');

  el.innerHTML = `${head}${upcomingHtml}<ul class="feed-list">${items || '<li class="empty">Nothing in force on this date.</li>'}</ul>`;
  el.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach(b => b.addEventListener('click', () => cb.onJump(b.dataset.jump!)));

  el.querySelector('[data-back]')?.addEventListener('click', () => cb.onFocus(null));
  el.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(b => b.addEventListener('click', () => cb.onSort(b.dataset.sort as SortKey)));
  el.querySelectorAll<HTMLLIElement>('.item').forEach(li => {
    li.addEventListener('mouseenter', () => cb.onHover(li.dataset.id!));
    li.addEventListener('mouseleave', () => cb.onHover(null));
  });
}
