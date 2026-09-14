import * as topojson from 'topojson-client';
import type {Topology, GeometryCollection} from 'topojson-specification';
import type {FeatureCollection} from 'geojson';
import type {TariffAction, Arc, Endpoint, Meta, Region, RegionalArc} from './types';

export interface Dataset {
  actions: TariffAction[];
  actionsById: Map<string, TariffAction>;
  arcs: Arc[];
  entities: Endpoint[];
  entityByIso: Map<string, Endpoint>;
  entityByNum: Map<string, Endpoint>;
  countries: FeatureCollection;
  /** US states + Canadian provinces. */
  admin1: FeatureCollection;
  regions: Region[];
  regionById: Map<string, Region>;
  regional: RegionalArc[];
  meta: Meta;
}

export const entityName = (ds: Dataset, iso3: string) => ds.entityByIso.get(iso3)?.name ?? iso3;

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export async function loadDataset(): Promise<Dataset> {
  const [actions, arcs, geo, topo, meta, regional, regionsGeo, admin1Topo] = await Promise.all([
    json<TariffAction[]>('/data/actions.json'),
    json<Arc[]>('/data/arcs-country.json'),
    json<{entities: Endpoint[]}>('/geo/capitals.json'),
    json<Topology>('/geo/countries-50m.topo.json'),
    json<Meta>('/data/meta.json'),
    json<RegionalArc[]>('/data/arcs-regional.json'),
    json<{regions: Region[]}>('/geo/regions.json'),
    json<Topology>('/geo/admin1-na.topo.json')
  ]);
  const countries = topojson.feature(topo, topo.objects.countries as GeometryCollection) as FeatureCollection;
  const admin1 = topojson.feature(admin1Topo, admin1Topo.objects.admin1 as GeometryCollection) as FeatureCollection;
  // Antarctica clamps to the Mercator edge and draws a stray line across the map.
  countries.features = countries.features.filter(f => String(f.id) !== '010');
  const entities = geo.entities;
  return {
    actions,
    actionsById: new Map(actions.map(a => [a.id, a])),
    arcs,
    entities,
    entityByIso: new Map(entities.map(e => [e.iso3, e])),
    entityByNum: new Map(entities.filter(e => e.num).map(e => [e.num!, e])),
    countries,
    admin1,
    regions: regionsGeo.regions,
    regionById: new Map(regionsGeo.regions.map(r => [r.id, r])),
    regional,
    meta
  };
}
