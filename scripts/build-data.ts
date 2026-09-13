/**
 * Build pipeline: curated actions + geo → public/data/*.json
 * Phase 1: validate, expand "ALL" targets, emit actions + country arcs + meta.
 * Phase 3 adds WITS baseline tariffs and bilateral trade values.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import type {TariffAction, Endpoint, Arc, Meta} from '../src/data/types';

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
    return entities.filter(e => !e.eu && e.iso3 !== a.imposer).map(e => e.iso3);
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

// ---- write -----------------------------------------------------------------
mkdirSync(OUT, {recursive: true});
const meta: Meta = {
  builtAt: new Date().toISOString(),
  actionsVerifiedThrough: actions.map(a => a.lastVerified).sort().at(-1)!,
  sources: {curated: 'data/curated/tariff-actions.json'},
  counts: {actions: actions.length, arcs: arcs.length}
};
writeFileSync(resolve(OUT, 'actions.json'), JSON.stringify(expanded));
writeFileSync(resolve(OUT, 'arcs-country.json'), JSON.stringify(arcs));
writeFileSync(resolve(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`actions: ${actions.length}  pairs: ${arcs.length}  verified through: ${meta.actionsVerifiedThrough}`);
