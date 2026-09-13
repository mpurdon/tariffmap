import {IMPOSER_COLORS, OTHER_COLOR} from '../data/palette';
import {flag} from './flag';
import type {Dataset} from '../data/load';

function row(ds: Dataset, iso: string, name: string, c: [number, number, number], off: boolean) {
  return `<button class="lg-row${off ? ' off' : ''}" data-iso="${iso}" aria-pressed="${!off}">${flag(ds, iso, {ring: true})}<span class="lg-name">${name}</span><span class="swatch" style="background:rgb(${c.join(' ')})"></span></button>`;
}


export function renderLegend(el: HTMLElement, ds: Dataset, present: Set<string>, hidden: Set<string>, onToggle: (iso: string) => void) {
  const rows = Object.entries(IMPOSER_COLORS)
    .filter(([iso]) => present.has(iso))
    .map(([iso, c]) => row(ds, iso, ds.entityByIso.get(iso)?.name ?? iso, c, hidden.has(iso)));
  const others = [...present].filter(p => !(p in IMPOSER_COLORS));
  for (const iso of others) rows.push(row(ds, iso, ds.entityByIso.get(iso)?.name ?? iso, OTHER_COLOR, hidden.has(iso)));
  el.innerHTML = `<div class="lg-title">Imposed by <span class="lg-hint">click to hide</span></div>${rows.join('')}<div class="lg-note">Arc flows from the country setting the tariff to the country it hits. Thicker = higher headline rate.</div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-iso]').forEach(b => b.addEventListener('click', () => onToggle(b.dataset.iso!)));
}
