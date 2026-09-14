/**
 * One-off: Natural Earth 50m admin-1 → TopoJSON of US states and Canadian provinces.
 * Run: npx tsx scripts/geo/build-admin1.ts   (writes public/geo/admin1-na.topo.json)
 */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {topology} from 'topojson-server';
import {presimplify, simplify, quantile} from 'topojson-simplify';
import type {FeatureCollection} from 'geojson';

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lakes.geojson';
const OUT = resolve(import.meta.dirname, '../../public/geo/admin1-na.topo.json');

const geo = (await (await fetch(SRC)).json()) as FeatureCollection;
const features = geo.features
  .filter(f => ['USA', 'CAN'].includes(f.properties!.adm0_a3))
  .map(f => ({type: 'Feature' as const, id: f.properties!.iso_3166_2 as string, properties: {name: f.properties!.name as string, country: f.properties!.adm0_a3 as string}, geometry: f.geometry}));

// The one-off script tolerates loose typing between the geojson and topojson type packages.
/* eslint-disable @typescript-eslint/no-explicit-any */
let topo: any = topology({admin1: {type: 'FeatureCollection', features} as any}, 1e4);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.3));
writeFileSync(OUT, JSON.stringify(topo));
console.log(`${features.length} regions → ${OUT} (${(JSON.stringify(topo).length / 1024).toFixed(0)} KB)`);
