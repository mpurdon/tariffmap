import {imposerCss} from '../data/palette';
import {flag} from './flag';
import {entityName, type Dataset} from '../data/load';

/** One row per imposer in the dataset (fixed palette order first, then others); click toggles visibility. */
export function renderLegend(el: HTMLElement, ds: Dataset, hidden: Set<string>, onToggle: (iso: string) => void) {
  const imposers = [...new Set(ds.arcs.map(a => a.imposer))];
  const rows = imposers.map(iso => {
    const off = hidden.has(iso);
    return `<button class="lg-row${off ? ' off' : ''}" data-iso="${iso}" aria-pressed="${!off}">${flag(ds, iso, {ring: true})}<span class="lg-name">${entityName(ds, iso)}</span><span class="swatch" style="background:${imposerCss(iso)}"></span></button>`;
  });
  el.innerHTML = `<div class="lg-title">Imposed by <span class="lg-hint">click to hide</span></div>${rows.join('')}<div class="lg-note">Arc flows from the country setting the tariff to the country it hits. Thicker = more dollars of imports covered; more comets = higher rate.</div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-iso]').forEach(b => b.addEventListener('click', () => onToggle(b.dataset.iso!)));
}
