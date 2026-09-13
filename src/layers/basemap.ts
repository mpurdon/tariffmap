import {GeoJsonLayer, SolidPolygonLayer} from '@deck.gl/layers';
import type {Feature} from 'geojson';
import type {Dataset} from '../data/load';

export const COLORS = {
  ocean: [9, 13, 26, 255] as [number, number, number, number],
  land: [26, 33, 52, 255] as [number, number, number, number],
  landInvolved: [36, 46, 72, 255] as [number, number, number, number],
  landFocus: [58, 74, 112, 255] as [number, number, number, number],
  border: [58, 70, 100, 255] as [number, number, number, number]
};

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

export function countriesLayer(ds: Dataset, opts: {involved: Set<string>; focus: string | null; globe: boolean; onClick: (iso3: string | null) => void}) {
  const isoOf = (f: Feature) => ds.entityByNum.get(String(f.id))?.iso3 ?? null;
  const focusNum = opts.focus ? ds.entityByIso.get(opts.focus)?.num : null;
  const euFocus = opts.focus === 'EUN';
  return new GeoJsonLayer({
    id: 'countries',
    data: ds.countries,
    stroked: true,
    filled: true,
    wrapLongitude: !opts.globe,
    lineWidthUnits: 'pixels',
    getLineWidth: 0.6,
    getLineColor: COLORS.border,
    getFillColor: (f: Feature) => {
      const ent = ds.entityByNum.get(String(f.id));
      if (ent && (String(f.id) === focusNum || (euFocus && ent.eu))) return COLORS.landFocus;
      const iso = ent?.eu ? 'EUN' : ent?.iso3;
      return iso && opts.involved.has(iso) ? COLORS.landInvolved : COLORS.land;
    },
    pickable: true,
    onClick: info => {
      const iso = info.object ? isoOf(info.object as Feature) : null;
      const ent = iso ? ds.entityByIso.get(iso) : null;
      opts.onClick(ent?.eu ? 'EUN' : iso);
    },
    updateTriggers: {getFillColor: [opts.focus, [...opts.involved].join(',')]}
  });
}
