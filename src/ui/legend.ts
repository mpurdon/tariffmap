import {IMPOSER_COLORS, OTHER_COLOR} from '../data/palette';

function row(iso: string, name: string, c: [number, number, number], off: boolean) {
  return `<button class="lg-row${off ? ' off' : ''}" data-iso="${iso}" aria-pressed="${!off}"><span class="swatch" style="background:rgb(${c.join(' ')})"></span>${name}</button>`;
}

const NAMES: Record<string, string> = {USA: 'United States', CHN: 'China', CAN: 'Canada', EUN: 'European Union', MEX: 'Mexico', IND: 'India'};

export function renderLegend(el: HTMLElement, present: Set<string>, hidden: Set<string>, onToggle: (iso: string) => void) {
  const rows = Object.entries(IMPOSER_COLORS)
    .filter(([iso]) => present.has(iso))
    .map(([iso, c]) => row(iso, NAMES[iso], c, hidden.has(iso)));
  const others = [...present].filter(p => !(p in IMPOSER_COLORS));
  for (const iso of others) rows.push(row(iso, iso, OTHER_COLOR, hidden.has(iso)));
  el.innerHTML = `<div class="lg-title">Imposed by <span class="lg-hint">click to hide</span></div>${rows.join('')}<div class="lg-note">Arc flows from the country setting the tariff to the country it hits. Thicker = higher headline rate.</div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-iso]').forEach(b => b.addEventListener('click', () => onToggle(b.dataset.iso!)));
}
