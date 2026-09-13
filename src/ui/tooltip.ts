import type {PickingInfo} from '@deck.gl/core';
import type {LiveArc} from '../data/filter';
import type {NodeDatum} from '../layers/labels';
import type {Dataset} from '../data/load';
import {flag} from './flag';
import {fmtDate, fmtRate} from './format';
import {rateOn} from '../data/rate';

const el = document.getElementById('tooltip')!;

export function hideTooltip() {
  el.hidden = true;
}

export function showTooltip(info: PickingInfo, ds: Dataset, date: string) {
  if (!info.object) return hideTooltip();
  let html = '';
  if (info.layer?.id === 'flow-arcs' || info.layer?.id === 'base-arcs') {
    const a = info.object as LiveArc;
    const from = ds.entityByIso.get(a.imposer)!;
    const to = ds.entityByIso.get(a.target)!;
    const rows = a.active
      .slice()
      .sort((x, y) => (rateOn(y, date) ?? 0) - (rateOn(x, date) ?? 0))
      .map(
        x => `<li><b>${fmtRate(rateOn(x, date), x.rateNote)}</b> ${x.title}<span class="dim"> · ${x.legalBasis} · since ${fmtDate(x.effective)}</span></li>`
      )
      .join('');
    html = `<div class="tt-head">${flag(ds, a.imposer, {ring: true})} ${from.name} <span class="arrow">→</span> ${flag(ds, a.target)} ${to.name}</div>
      <div class="tt-rate">${a.rate}%<span class="dim"> headline</span></div>
      <ul class="tt-list">${rows}</ul>`;
  } else if (info.layer?.id === 'node-core') {
    const n = info.object as NodeDatum;
    html = `<div class="tt-head">${flag(ds, n.iso3)} ${n.name}<span class="dim"> · ${n.capital}</span></div><div class="dim">Click to focus</div>`;
  } else if (info.layer?.id === 'countries') {
    const ent = ds.entityByNum.get(String((info.object as {id: string}).id));
    html = `<div class="tt-head">${ent ? flag(ds, ent.iso3) + ' ' : ''}${ent?.name ?? (info.object as {properties: {name: string}}).properties.name}</div><div class="dim">${ent ? 'Click to focus' : 'No tracked tariffs'}</div>`;
  }
  if (!html) return hideTooltip();
  el.innerHTML = html;
  el.hidden = false;
  const pad = 14;
  const w = el.offsetWidth, h = el.offsetHeight;
  const x = Math.min(info.x + pad, window.innerWidth - w - pad);
  const y = info.y + pad + h > window.innerHeight ? info.y - h - pad : info.y + pad;
  el.style.transform = `translate(${x}px, ${y}px)`;
}
