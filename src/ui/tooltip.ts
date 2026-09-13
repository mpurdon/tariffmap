import type {PickingInfo} from '@deck.gl/core';
import type {Feature} from 'geojson';
import type {LiveArc} from '../data/filter';
import type {NodeDatum} from '../layers/labels';
import {entityName, type Dataset} from '../data/load';
import {flag} from './flag';
import {fmtDate, fmtRate, moneyHtml} from './format';
import {rateOn} from '../data/rate';

const el = document.getElementById('tooltip')!;
let shown: unknown = null;

export function hideTooltip() {
  el.hidden = true;
  shown = null;
}

const isArc = (o: unknown): o is LiveArc => typeof o === 'object' && o !== null && 'active' in o;
const isNode = (o: unknown): o is NodeDatum => typeof o === 'object' && o !== null && 'weight' in o;

function html(info: PickingInfo, ds: Dataset, date: string): string {
  const o = info.object;
  if (isArc(o)) {
    const rows = o.active
      .slice()
      .sort((x, y) => (rateOn(y, date) ?? 0) - (rateOn(x, date) ?? 0))
      .map(x => `<li><b>${fmtRate(rateOn(x, date), x.rateNote)}</b> ${x.title}<span class="dim"> · ${x.legalBasis} · since ${fmtDate(x.effective)}</span></li>`)
      .join('');
    return `<div class="tt-head">${flag(ds, o.imposer, {ring: true})} ${entityName(ds, o.imposer)} <span class="arrow">→</span> ${flag(ds, o.target)} ${entityName(ds, o.target)}</div>
      <div class="tt-rate">${o.rate}%<span class="dim"> ${o.productOnly ? 'on targeted products' : 'on all goods'}${o.peak > o.rate ? ` · up to ${o.peak}% on some products` : ''}</span></div>
      ${o.tradeUsd !== undefined ? `<div class="tt-money">${moneyHtml(o.tradeUsd, o.dutyUsd)}<span class="dim"> · ${o.trade?.year} imports, UN Comtrade</span></div>` : ''}
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
  const y = info.y + pad + h > window.innerHeight ? info.y - h - pad : info.y + pad;
  el.style.transform = `translate(${x}px, ${y}px)`;
}
