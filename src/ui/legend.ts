import {IMPOSER_COLORS, OTHER_COLOR} from '../data/palette';

const NAMES: Record<string, string> = {USA: 'United States', CHN: 'China', CAN: 'Canada', EUN: 'European Union', MEX: 'Mexico', IND: 'India'};

export function renderLegend(el: HTMLElement, present: Set<string>) {
  const rows = Object.entries(IMPOSER_COLORS)
    .filter(([iso]) => present.has(iso))
    .map(([iso, c]) => `<div class="lg-row"><span class="swatch" style="background:rgb(${c.join(' ')})"></span>${NAMES[iso]}</div>`);
  if ([...present].some(p => !(p in IMPOSER_COLORS))) {
    rows.push(`<div class="lg-row"><span class="swatch" style="background:rgb(${OTHER_COLOR.join(' ')})"></span>Other</div>`);
  }
  el.innerHTML = `<div class="lg-title">Imposed by</div>${rows.join('')}<div class="lg-note">Arc flows from the country setting the tariff to the country it hits. Thicker = higher headline rate.</div>`;
}
