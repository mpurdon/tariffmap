/**
 * Build pipeline: curated actions + geo → public/data/*.json
 * Phase 1: validate, expand "ALL" targets, emit actions + country arcs + meta.
 * Phase 3 adds WITS baseline tariffs and bilateral trade values.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import type {TariffAction, Endpoint, Arc, Meta} from '../src/data/types';
import {importsByCode} from './sources/comtrade';
import {coveredValue} from '../src/data/coverage';

const OFFLINE = process.argv.includes('--offline');
const TRADE_YEARS = [2025, 2024, 2023];

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/data');

const curated = JSON.parse(readFileSync(resolve(ROOT, 'data/curated/tariff-actions.json'), 'utf8'));
const geo = JSON.parse(readFileSync(resolve(ROOT, 'public/geo/capitals.json'), 'utf8'));
const entities: Endpoint[] = geo.entities;
const byIso = new Map(entities.map(e => [e.iso3, e]));
const actions: TariffAction[] = curated.actions;

// ---- validation -----------------------------------------------------------
const errors: string[] = [];
const ids = new Set<string>();
for (const a of actions) {
  if (ids.has(a.id)) errors.push(`${a.id}: duplicate id`);
  ids.add(a.id);
  if (!byIso.has(a.imposer)) errors.push(`${a.id}: unknown imposer ${a.imposer}`);
  for (const t of a.targets) if (t !== 'ALL' && !byIso.has(t)) errors.push(`${a.id}: unknown target ${t}`);
  if (!a.sources?.length) errors.push(`${a.id}: no sources`);
  if (a.rate !== null && (a.rate < 0 || a.rate > 250)) errors.push(`${a.id}: implausible rate ${a.rate}`);
  for (const x of a.except ?? []) if (!byIso.has(x)) errors.push(`${a.id}: unknown except ${x}`);
  if (a.except && !a.targets.includes('ALL')) errors.push(`${a.id}: except only applies with targets ALL`);
  if (a.rateHistory) {
    for (const h of a.rateHistory) if (!/^\d{4}-\d{2}-\d{2}$/.test(h.from) || h.rate < 0 || h.rate > 250) errors.push(`${a.id}: bad rateHistory entry`);
    const last = a.rateHistory.at(-1)!;
    if (a.rate !== null && last.rate !== a.rate) errors.push(`${a.id}: rate ${a.rate} disagrees with last rateHistory ${last.rate}`);
    if (a.rateHistory[0].from !== a.effective) errors.push(`${a.id}: first rateHistory.from must equal effective`);
  }
  if (a.status === 'revoked' && !a.expires) errors.push(`${a.id}: revoked without expires date`);
  if (a.coveredTradeUsd !== undefined && !(a.coveredTradeUsd > 0)) errors.push(`${a.id}: coveredTradeUsd must be positive`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.effective)) errors.push(`${a.id}: bad effective date`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.lastVerified)) errors.push(`${a.id}: bad lastVerified date`);
}
for (const a of actions) for (const s of a.stacksWith ?? []) if (!ids.has(s)) errors.push(`${a.id}: stacksWith unknown ${s}`);
if (errors.length) {
  console.error('Validation failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}

// ---- expand targets --------------------------------------------------------
// "ALL" → every entity except the imposer; EU member states collapse into EUN.
function expandTargets(a: TariffAction): string[] {
  if (a.targets.includes('ALL')) {
    const skip = new Set([a.imposer, ...(a.except ?? [])]);
    return entities.filter(e => !e.eu && !skip.has(e.iso3)).map(e => e.iso3);
  }
  return [...new Set(a.targets.map(t => (byIso.get(t)?.eu ? 'EUN' : t)))];
}
const expanded: TariffAction[] = actions.map(a => ({...a, targets: expandTargets(a)}));

// ---- country arcs ----------------------------------------------------------
const pairs = new Map<string, Arc>();
for (const a of expanded) {
  const from = byIso.get(a.imposer)!;
  for (const t of a.targets) {
    const to = byIso.get(t)!;
    const key = `${a.imposer}>${t}`;
    let arc = pairs.get(key);
    if (!arc) {
      arc = {id: key, imposer: a.imposer, target: t, from: [from.lon, from.lat], to: [to.lon, to.lat], rate: 0, actionIds: [], since: a.effective};
      pairs.set(key, arc);
    }
    arc.actionIds.push(a.id);
    if (a.effective < arc.since) arc.since = a.effective;
  }
}
const arcs = [...pairs.values()];

// ---- trade values (UN Comtrade) ---------------------------------------------
const euMembers = entities.filter(e => e.eu).map(e => e.m49);
const actionById = new Map(expanded.map(a => [a.id, a]));
let missing = 0;
for (const arc of arcs) {
  const acts = arc.actionIds.map(id => actionById.get(id)!);
  const codes = ['TOTAL', ...new Set(acts.flatMap(a => a.hs).filter(c => c !== 'ALL'))];
  const reporter = byIso.get(arc.imposer)!.m49;
  const partners = arc.target === 'EUN' ? euMembers : [byIso.get(arc.target)!.m49];
  const res = await importsByCode(reporter, partners, codes, TRADE_YEARS, {offline: OFFLINE});
  if (!res) { missing++; continue; }
  arc.trade = {year: res.year, total: res.byCode.TOTAL, byCode: res.byCode};
}
for (const a of expanded) {
  const byTarget: Record<string, number> = {};
  const years = new Set<number>();
  for (const t of a.targets) {
    const arc = pairs.get(`${a.imposer}>${t}`);
    if (!arc?.trade) continue;
    byTarget[t] = coveredValue(arc.trade.byCode, a.hs);
    years.add(arc.trade.year);
  }
  if (!years.size) continue;
  const computed = Object.values(byTarget).reduce((s, v) => s + v, 0);
  if (a.coveredTradeUsd && computed > 0) {
    // Scale the per-target split to the official coverage figure.
    for (const t of Object.keys(byTarget)) byTarget[t] *= a.coveredTradeUsd / computed;
  }
  a.tradeByTarget = byTarget;
  a.tradeUsd = a.coveredTradeUsd ?? computed;
  if (a.rate !== null) a.dutyUsd = a.tradeUsd * a.rate / 100;
  const ys = [...years].sort();
  a.tradeYear = a.coveredTradeUsd ? 'official estimate' : ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys.at(-1)}`;
}
const withTrade = arcs.filter(a => a.trade).length;

// ---- write -----------------------------------------------------------------
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
