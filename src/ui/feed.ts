import type {Dataset} from '../data/load';
import type {TariffAction} from '../data/types';
import {flag} from './flag';
import {fmtDate, fmtRate} from './format';

export interface FeedCallbacks {
  onHover: (id: string | null) => void;
  onFocus: (iso3: string | null) => void;
}

export function renderFeed(el: HTMLElement, ds: Dataset, actions: TariffAction[], focus: string | null, date: string, cb: FeedCallbacks) {
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

  const head = focus
    ? `<div class="feed-head"><button class="back" data-back>←</button>${flag(ds, focus, {size: 'lg'})}<h2>${name(focus)}</h2><span class="count">${actions.length} in force</span></div>`
    : `<div class="feed-head"><h2>Tariffs in force</h2><span class="count">${actions.length}</span></div>`;

  const items = actions
    .map(
      a => `<li class="item" data-id="${a.id}">
        <div class="item-top">
          <span class="pair">${flag(ds, a.imposer, {ring: true})} <b>${name(a.imposer)}</b> <span class="arrow">→</span> ${targetsLabel(a)}</span>
          <span class="rate">${fmtRate(a.rate, a.rateNote)}</span>
        </div>
        <div class="item-title">${a.title}</div>
        <div class="item-meta">${a.legalBasis} · ${a.hsLabel ?? (a.hs.includes('ALL') ? 'all goods' : 'HS ' + a.hs.join(', '))} · since ${fmtDate(a.effective)}${lifecycle(a)}</div>
        <details class="item-more"><summary>details</summary>
          ${a.rateNote ? `<p>${a.rateNote}</p>` : ''}
          ${a.exemptions ? `<p><b>Exemptions:</b> ${a.exemptions}</p>` : ''}
          ${a.notes ? `<p>${a.notes}</p>` : ''}
          <p class="sources">${a.sources.map((s, i) => `<a href="${s}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')} · verified ${fmtDate(a.lastVerified)}</p>
        </details>
      </li>`
    )
    .join('');

  el.innerHTML = `${head}<ul class="feed-list">${items || '<li class="empty">Nothing in force on this date.</li>'}</ul>`;

  el.querySelector('[data-back]')?.addEventListener('click', () => cb.onFocus(null));
  el.querySelectorAll<HTMLLIElement>('.item').forEach(li => {
    li.addEventListener('mouseenter', () => cb.onHover(li.dataset.id!));
    li.addEventListener('mouseleave', () => cb.onHover(null));
  });
}
