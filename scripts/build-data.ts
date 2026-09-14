/**
 * Build pipeline: curated actions + geo + UN Comtrade → public/data/*.json
 *   actions.json       normalized measures with targets expanded and trade figures attached
 *   arcs-country.json  one arc per imposer→target pair with the imposer's imports by HS code
 *   meta.json          build provenance
 * `--offline` uses only the committed Comtrade cache.
 */
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import "dotenv/config";
import {resolve} from 'node:path';
import {ALL, EU, targetsEveryone, tradeIso, type TariffAction, type Endpoint, type Arc, type Meta} from '../src/data/types';
import {validateActions} from '../src/data/validate';
import {coveredValue} from '../src/data/coverage';
import {importTable} from './sources/comtrade';
import {provinceExports, napcsFor, STATCAN_PARTNER} from './sources/statcan';
import {stateExports, CENSUS_COUNTRY} from './sources/census';
import type {Region, RegionalArc} from '../src/data/types';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/data');
const OFFLINE = process.argv.includes('--offline');
const TRADE_YEARS = [2025, 2024, 2023];

const curated = JSON.parse(readFileSync(resolve(ROOT, 'data/curated/tariff-actions.json'), 'utf8'));
const geo = JSON.parse(readFileSync(resolve(ROOT, 'public/geo/capitals.json'), 'utf8'));
const entities: Endpoint[] = geo.entities;
const byIso = new Map(entities.map(e => [e.iso3, e]));
const actions: TariffAction[] = curated.actions;

const errors = validateActions(actions, entities);
if (errors.length) {
  console.error('Validation failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}

// ---- expand targets: "ALL" → every entity except the imposer and carve-outs; EU members collapse to EUN.
const expanded: TariffAction[] = actions.map(a => {
  if (!targetsEveryone(a)) return {...a, targets: [...new Set(a.targets.map(t => tradeIso(byIso.get(t)!)))]};
  const skip = new Set([a.imposer, ...(a.except ?? [])]);
  return {...a, targets: entities.filter(e => !e.eu && !skip.has(e.iso3)).map(e => e.iso3)};
});

// ---- country arcs
const pairs = new Map<string, Arc>();
for (const a of expanded) {
  const from = byIso.get(a.imposer)!;
  for (const t of a.targets) {
    const to = byIso.get(t)!;
    const key = `${a.imposer}>${t}`;
    const arc = pairs.get(key) ?? {id: key, imposer: a.imposer, target: t, from: [from.lon, from.lat] as [number, number], to: [to.lon, to.lat] as [number, number], actionIds: []};
    arc.actionIds.push(a.id);
    pairs.set(key, arc);
  }
}
const arcs = [...pairs.values()];
const actionById = new Map(expanded.map(a => [a.id, a]));

// ---- trade values: one Comtrade query per imposer covering all of its partners and codes
const euMembers = entities.filter(e => e.eu).map(e => e.m49);
const partnersOf = (iso: string) => (iso === EU ? euMembers : [byIso.get(iso)!.m49]);
let missing = 0;
for (const imposer of new Set(arcs.map(a => a.imposer))) {
  const mine = arcs.filter(a => a.imposer === imposer);
  const partners = [...new Set(mine.flatMap(a => partnersOf(a.target)))];
  const codes = ['TOTAL', ...new Set(mine.flatMap(a => a.actionIds.flatMap(id => actionById.get(id)!.hs)).filter(c => c !== ALL))];
  const res = await importTable(byIso.get(imposer)!.m49, partners, codes, TRADE_YEARS, OFFLINE);
  if (!res) { missing += mine.length; continue; }
  for (const arc of mine) {
    const byCode: Record<string, number> = {};
    for (const p of partnersOf(arc.target)) for (const [code, usd] of Object.entries(res.table[p] ?? {})) byCode[code] = (byCode[code] ?? 0) + usd;
    if (byCode.TOTAL) arc.trade = {year: res.year, byCode};
    else missing++;
  }
}
for (const a of expanded) {
  let computed = 0;
  const years = new Set<number>();
  for (const t of a.targets) {
    const arc = pairs.get(`${a.imposer}>${t}`);
    if (!arc?.trade) continue;
    computed += coveredValue(arc.trade.byCode, a.hs);
    years.add(arc.trade.year);
  }
  if (!years.size) continue;
  a.tradeUsd = a.coveredTradeUsd ?? computed;
  if (a.rate !== null) a.dutyUsd = a.tradeUsd * a.rate / 100;
  const ys = [...years].sort();
  a.tradeYear = a.coveredTradeUsd ? 'official estimate' : ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys.at(-1)}`;
}
const withTrade = arcs.filter(a => a.trade).length;

// ---- regional arcs: where in the target country the targeted goods come from
// Canadian provinces: StatCan trailing-12-month domestic exports by NAPCS section (C$ → US$).
// US states: Census annual exports by HS code (needs CENSUS_API_KEY).
const CAD_USD = 0.73; // approximate 2025–26 average; provincial figures are indicative
const regions: Region[] = JSON.parse(readFileSync(resolve(ROOT, 'public/geo/regions.json'), 'utf8')).regions;
for (const a of expanded) a.napcs = napcsFor(a.hs);
const regional: RegionalArc[] = [];
const regionalByPair = new Map<string, RegionalArc[]>();
for (const imposer of new Set(arcs.map(a => a.imposer))) {
  const from = byIso.get(imposer)!;
  const actsFor = (target: string) => expanded.filter(a => a.imposer === imposer && a.targets.includes(target));

  // → Canadian provinces
  const toCan = actsFor('CAN');
  if (toCan.length && STATCAN_PARTNER[imposer]) {
    const data = await provinceExports(STATCAN_PARTNER[imposer], OFFLINE);
    if (data) {
      for (const reg of regions.filter(x => x.iso3 === 'CAN')) {
        const sections = data.cad[reg.statcan!] ?? {};
        const byCode: Record<string, number> = {};
        for (const [sec, cad] of Object.entries(sections)) byCode[`n${sec.padStart(2, '0')}`] = cad * CAD_USD;
        byCode.TOTAL = Object.values(sections).reduce((s, v) => s + v, 0) * CAD_USD;
        if (!byCode.TOTAL) continue;
        regional.push({id: `${imposer}>${reg.id}`, imposer, target: 'CAN', region: reg.id, from: [from.lon, from.lat], to: [reg.lon, reg.lat], source: 'statcan', period: data.period, byCode, actionIds: toCan.map(x => x.id)});
      }
    }
  }
  // → US states
  const toUsa = actsFor('USA');
  if (toUsa.length && CENSUS_COUNTRY[imposer]) {
    const headings = [...new Set(toUsa.flatMap(x => x.hs).filter(c => c.length === 4))];
    const data = await stateExports(imposer, headings, TRADE_YEARS, OFFLINE);
    if (data) {
      for (const reg of regions.filter(x => x.iso3 === 'USA')) {
        const codes = data.usd[reg.census!];
        if (!codes) continue;
        const byCode = {...codes, TOTAL: Object.entries(codes).filter(([c]) => c.length === 2).reduce((s, [, v]) => s + v, 0)};
        if (!byCode.TOTAL) continue;
        regional.push({id: `${imposer}>${reg.id}`, imposer, target: 'USA', region: reg.id, from: [from.lon, from.lat], to: [reg.lon, reg.lat], source: 'census', period: String(data.year), byCode, actionIds: toUsa.map(x => x.id)});
      }
    }
  }
}
for (const ra of regional) (regionalByPair.get(`${ra.imposer}>${ra.target}`) ?? regionalByPair.set(`${ra.imposer}>${ra.target}`, []).get(`${ra.imposer}>${ra.target}`)!).push(ra);

// ---- write
mkdirSync(OUT, {recursive: true});
const meta: Meta = {
  builtAt: new Date().toISOString(),
  actionsVerifiedThrough: actions.map(a => a.lastVerified).sort().at(-1)!,
  sources: {curated: 'data/curated/tariff-actions.json', trade: 'UN Comtrade (annual imports, reporter-side, USD)'},
  counts: {actions: actions.length, arcs: arcs.length, arcsWithTrade: withTrade, regionalArcs: regional.length, regionalPairs: regionalByPair.size}
};
writeFileSync(resolve(OUT, 'actions.json'), JSON.stringify(expanded));
writeFileSync(resolve(OUT, 'arcs-country.json'), JSON.stringify(arcs));
writeFileSync(resolve(OUT, 'arcs-regional.json'), JSON.stringify(regional));
writeFileSync(resolve(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`actions: ${actions.length}  pairs: ${arcs.length}  with trade: ${withTrade} (${missing} missing)  regional: ${regional.length} arcs over ${[...regionalByPair.keys()].join(', ') || 'none'}  verified through: ${meta.actionsVerifiedThrough}`);
