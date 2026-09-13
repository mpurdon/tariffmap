import {GeoJsonLayer, SolidPolygonLayer} from '@deck.gl/layers';
import type {Feature} from 'geojson';
import type {Dataset} from '../data/load';
import {EU, tradeIso} from '../data/types';
import type {RGBA} from '../data/palette';

export const COLORS = {
  ocean: [9, 13, 26, 255],
  land: [26, 33, 52, 255],
  landInvolved: [36, 46, 72, 255],
  landFocus: [58, 74, 112, 255],
  border: [58, 70, 100, 255]
} satisfies Record<string, RGBA>;

/** Ocean fill; needed for GlobeView (MapView gets it from the canvas background). */
export function oceanLayer() {
  return new SolidPolygonLayer({
    id: 'ocean',
    data: [[[-180, 90], [0, 90], [180, 90], [180, -90], [0, -90], [-180, -90]]],
    getPolygon: (d: number[][]) => d as unknown as number[],
    getFillColor: COLORS.ocean,
    pickable: false
  });
}

export interface CountriesOpts {
  /** ISO3s (EU collapsed) that impose or receive something on the current view. */
  involved: Set<string>;
  focus: string | null;
  /** Split polygons at the antimeridian — needed on the flat map, harmful on the globe. */
  wrapLongitude: boolean;
  onClick: (iso3: string | null) => void;
}

export function countriesLayer(ds: Dataset, opts: CountriesOpts) {
  const isoOf = (f: Feature) => {
    const e = ds.entityByNum.get(String(f.id));
    return e ? tradeIso(e) : null;
  };
  const focusNum = opts.focus ? ds.entityByIso.get(opts.focus)?.num : null;
  const euFocus = opts.focus === EU;
  const involvedKey = [...opts.involved].sort().join(',');
  return new GeoJsonLayer({
    id: 'countries',
    data: ds.countries,
    stroked: true,
    filled: true,
    wrapLongitude: opts.wrapLongitude,
    lineWidthUnits: 'pixels',
    getLineWidth: 0.6,
    getLineColor: COLORS.border,
    getFillColor: (f: Feature) => {
      const ent = ds.entityByNum.get(String(f.id));
      if (ent && (String(f.id) === focusNum || (euFocus && ent.eu))) return COLORS.landFocus;
      const iso = isoOf(f);
      return iso && opts.involved.has(iso) ? COLORS.landInvolved : COLORS.land;
    },
    pickable: true,
    onClick: info => opts.onClick(info.object ? isoOf(info.object as Feature) : null),
    updateTriggers: {getFillColor: [opts.focus, involvedKey]}
  });
}
