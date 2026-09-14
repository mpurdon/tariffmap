import type {PickingInfo} from '@deck.gl/core';
import type {Feature} from 'geojson';
import type {LiveArc, LiveRegionalArc} from '../data/filter';
import type {NodeDatum} from '../layers/labels';
import {entityName, type Dataset} from '../data/load';
import {flag} from './flag';
import {fmtDate, fmtRate, fmtUsd, moneyHtml} from './format';
import {rateOn} from '../data/rate';

const el = document.getElementById('tooltip')!;
let shown: unknown = null;

export function hideTooltip() {
  el.hidden = true;
  shown = null;
}

const MAX_ROWS = 6;
/** Measures sorted by rate, capped so the tooltip stays on screen. */
function measureRows(active: LiveArc['active'], date: string, detail: (x: LiveArc['active'][number]) => string): string {
  const sorted = active.slice().sort((x, y) => (rateOn(y, date) ?? 0) - (rateOn(x, date) ?? 0));
  const rows = sorted.slice(0, MAX_ROWS).map(x => `<li><b>${fmtRate(rateOn(x, date), x.rateNote)}</b> ${x.title}${detail(x)}</li>`);
  if (sorted.length > MAX_ROWS) rows.push(`<li class="dim">+ ${sorted.length - MAX_ROWS} more — see the panel</li>`);
  return rows.join('');
}

const isArc = (o: unknown): o is LiveArc => typeof o === 'object' && o !== null && 'active' in o && !('region' in o);
const isRegional = (o: unknown): o is LiveRegionalArc => typeof o === 'object' && o !== null && 'region' in o && 'active' in o;
const isNode = (o: unknown): o is NodeDatum => typeof o === 'object' && o !== null && 'weight' in o;

function html(info: PickingInfo, ds: Dataset, date: string): string {
  const o = info.object;
  if (isArc(o)) {
    const rows = measureRows(o.active, date, x => `<span class="dim"> · ${x.legalBasis} · since ${fmtDate(x.effective)}</span>`);
    return `<div class="tt-head">${flag(ds, o.imposer, {ring: true})} ${entityName(ds, o.imposer)} <span class="arrow">→</span> ${flag(ds, o.target)} ${entityName(ds, o.target)}</div>
      <div class="tt-rate">${o.rate}%<span class="dim"> ${o.productOnly ? 'on targeted products' : 'on all goods'}${o.peak > o.rate ? ` · up to ${o.peak}% on some products` : ''}</span></div>
      ${o.tradeUsd !== undefined ? `<div class="tt-money">${moneyHtml(o.tradeUsd, o.dutyUsd)}<span class="dim"> · ${o.trade?.year} imports, UN Comtrade</span></div>` : ''}
      <ul class="tt-list">${rows}</ul>`;
  }
  if (isRegional(o)) {
    const reg = ds.regionById.get(o.region)!;
    const rows = measureRows(o.active, date, () => '');
    return `<div class="tt-head">${flag(ds, o.imposer, {ring: true})} ${entityName(ds, o.imposer)} <span class="arrow">→</span> ${flag(ds, o.target)} ${reg.name}</div>
      <div class="tt-money"><b>${fmtUsd(o.tradeUsd)}</b> of ${reg.name}'s exports to ${entityName(ds, o.imposer)} hit${o.dutyUsd ? ` · <b>${fmtUsd(o.dutyUsd)}</b> est. duty/yr` : ''}<span class="dim"> · ${o.source === 'statcan' ? `StatCan, ${o.period}` : `Census, ${o.period}`}</span></div>
      <ul class="tt-list">${rows}</ul>`;
  }
  if (isNode(o)) return `<div class="tt-head">${flag(ds, o.iso3)} ${o.name}<span class="dim"> · ${o.capital}</span></div><div class="dim">Click to focus</div>`;
  if (o && 'properties' in (o as Feature)) {
    const f = o as Feature;
    const ent = ds.entityByNum.get(String(f.id));
    return `<div class="tt-head">${ent ? flag(ds, ent.iso3) + ' ' : ''}${ent?.name ?? (f.properties as {name: string}).name}</div><div class="dim">${ent ? 'Click to focus' : 'No tracked tariffs'}</div>`;
  }
  return '';
}

export function showTooltip(info: PickingInfo, ds: Dataset, date: string) {
  if (!info.object) return hideTooltip();
  if (info.object !== shown) {
    const content = html(info, ds, date);
    if (!content) return hideTooltip();
    el.innerHTML = content;
    el.hidden = false;
    shown = info.object;
  }
  const pad = 14;
  const w = el.offsetWidth, h = el.offsetHeight;
  const x = Math.min(info.x + pad, window.innerWidth - w - pad);
  const below = info.y + pad, above = info.y - h - pad;
  const y = below + h <= window.innerHeight ? below : Math.max(8, above);
  el.style.transform = `translate(${x}px, ${y}px)`;
}
