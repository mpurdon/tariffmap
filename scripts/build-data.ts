/**
 * Build pipeline: curated actions + geo + UN Comtrade → public/data/*.json
 *   actions.json       normalized measures with targets expanded and trade figures attached
 *   arcs-country.json  one arc per imposer→target pair with the imposer's imports by HS code
 *   meta.json          build provenance
 * `--offline` uses only the committed Comtrade cache.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {ALL, EU, targetsEveryone, tradeIso, type TariffAction, type Endpoint, type Arc, type Meta} from '../src/data/types';
import {validateActions} from '../src/data/validate';
import {coveredValue} from '../src/data/coverage';
import {importTable} from './sources/comtrade';

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

// ---- write
mkdirSync(OUT, {recursive: true});
const meta: Meta = {
  builtAt: new Date().toISOString(),
  actionsVerifiedThrough: actions.map(a => a.lastVerified).sort().at(-1)!,
  sources: {curated: 'data/curated/tariff-actions.json', trade: 'UN Comtrade (annual imports, reporter-side, USD)'},
  counts: {actions: actions.length, arcs: arcs.length, arcsWithTrade: withTrade}
};
writeFileSync(resolve(OUT, 'actions.json'), JSON.stringify(expanded));
writeFileSync(resolve(OUT, 'arcs-country.json'), JSON.stringify(arcs));
writeFileSync(resolve(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`actions: ${actions.length}  pairs: ${arcs.length}  with trade: ${withTrade} (${missing} missing)  verified through: ${meta.actionsVerifiedThrough}`);
