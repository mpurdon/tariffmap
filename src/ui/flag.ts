import type {Dataset} from '../data/load';
import {imposerCss} from '../data/palette';
import {esc} from './html';

/**
 * Inline flag markup (flag-icons). `ring` draws a thin border in the imposer's
 * arc colour so the flag still reads as "the blue arcs" etc.
 */
export function flag(ds: Dataset, iso3: string, opts: {ring?: boolean; size?: 'sm' | 'md' | 'lg'} = {}): string {
  const ent = ds.entityByIso.get(iso3);
  if (!ent) return `<span class="flag flag-none ${opts.size ?? 'md'}"></span>`;
  const style = opts.ring ? ` style="box-shadow:0 0 0 1.5px ${imposerCss(iso3)}"` : '';
  return `<span class="fi fi-${esc(ent.iso2)} flag ${opts.size ?? 'md'}" title="${esc(ent.name)}"${style}></span>`;
}
