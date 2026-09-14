/**
 * Statistics Canada table 12-10-0175-01: provincial domestic exports by NAPCS section and
 * principal trading partner, monthly, C$ thousands. We sum the trailing 12 months.
 * WDS API: https://www.statcan.gc.ca/en/developers/wds/user-guide
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const WDS = 'https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods';
const PRODUCT = 12100175;
const CACHE = resolve(import.meta.dirname, '../../data/cache/statcan');
const CACHE_TTL_DAYS = 28;
mkdirSync(CACHE, {recursive: true});

/** Principal-trading-partner member ids in the table. */
export const STATCAN_PARTNER: Record<string, number> = {
  USA: 2, CHN: 3, MEX: 4, GBR: 5, JPN: 6, DEU: 7, KOR: 8, ITA: 9, FRA: 10, NLD: 11, BEL: 12, ESP: 13,
  BRA: 15, NOR: 17, IND: 18, CHE: 19, SAU: 20, TUR: 21, TWN: 22, PER: 23, AUS: 24, IRQ: 25, IDN: 26, SGP: 27, RUS: 28
};

/** NAPCS section member ids. */
export const NAPCS = {
  farm: 2, energy: 3, ores: 4, metals: 5, chemicals: 6, forestry: 7, machinery: 8, electronics: 9, vehicles: 10, aircraft: 11, consumer: 12
} as const;

/** Approximate HS chapter/heading → NAPCS section. Headings first, then chapters. */
const HS_TO_NAPCS: Record<string, number> = {
  '8418': NAPCS.consumer, '8450': NAPCS.consumer, '8471': NAPCS.electronics, '8711': NAPCS.vehicles, '2306': NAPCS.farm,
  '01': NAPCS.farm, '03': NAPCS.farm, '05': NAPCS.farm, '06': NAPCS.farm, '07': NAPCS.farm, '08': NAPCS.farm, '09': NAPCS.farm, '10': NAPCS.farm,
  '11': NAPCS.farm, '12': NAPCS.farm, '13': NAPCS.farm, '14': NAPCS.farm, '15': NAPCS.farm, '23': NAPCS.farm, '41': NAPCS.farm,
  '02': NAPCS.consumer, '04': NAPCS.consumer, '16': NAPCS.consumer, '17': NAPCS.consumer, '18': NAPCS.consumer, '19': NAPCS.consumer,
  '20': NAPCS.consumer, '21': NAPCS.consumer, '22': NAPCS.consumer, '24': NAPCS.consumer, '30': NAPCS.consumer, '42': NAPCS.consumer, '43': NAPCS.consumer,
  '25': NAPCS.ores, '26': NAPCS.ores, '31': NAPCS.ores, '27': NAPCS.energy,
  '28': NAPCS.chemicals, '29': NAPCS.chemicals, '32': NAPCS.chemicals, '33': NAPCS.chemicals, '34': NAPCS.chemicals, '35': NAPCS.chemicals,
  '36': NAPCS.chemicals, '37': NAPCS.chemicals, '38': NAPCS.chemicals, '39': NAPCS.chemicals, '40': NAPCS.chemicals,
  '44': NAPCS.forestry, '45': NAPCS.forestry, '46': NAPCS.forestry, '47': NAPCS.forestry, '48': NAPCS.forestry, '49': NAPCS.forestry,
  '68': NAPCS.metals, '69': NAPCS.metals, '70': NAPCS.metals, '72': NAPCS.metals, '73': NAPCS.metals, '74': NAPCS.metals, '75': NAPCS.metals,
  '76': NAPCS.metals, '78': NAPCS.metals, '79': NAPCS.metals, '80': NAPCS.metals, '81': NAPCS.metals, '82': NAPCS.metals, '83': NAPCS.metals,
  '84': NAPCS.machinery, '85': NAPCS.electronics, '90': NAPCS.electronics, '86': NAPCS.aircraft, '88': NAPCS.aircraft, '89': NAPCS.aircraft, '87': NAPCS.vehicles
};

/** NAPCS sections touched by a measure's HS list (ALL → every section except adjustments). */
export function napcsFor(hs: string[]): number[] {
  if (hs.includes('ALL')) return Object.values(NAPCS);
  const out = new Set<number>();
  for (const code of hs) {
    const sec = HS_TO_NAPCS[code] ?? HS_TO_NAPCS[code.slice(0, 4)] ?? HS_TO_NAPCS[code.slice(0, 2)] ?? NAPCS.consumer;
    out.add(sec);
  }
  return [...out];
}

export interface ProvinceExports {
  /** Period covered, e.g. "Aug 2025–Jul 2026". */
  period: string;
  /** provinceMemberId → napcsSection → C$ (not thousands). */
  cad: Record<number, Record<number, number>>;
}

const PROVINCES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15];
const DOMESTIC_EXPORT = 2;

/** Trailing-12-month domestic exports from every province to one partner, by NAPCS section. */
export async function provinceExports(partnerMember: number, offline = false): Promise<ProvinceExports | null> {
  const file = resolve(CACHE, `12100175-partner${partnerMember}.json`);
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8')) as ProvinceExports & {fetchedAt: string};
    if ((Date.now() - Date.parse(c.fetchedAt)) / 86400000 < CACHE_TTL_DAYS || offline) return c;
  }
  if (offline) return null;

  const coords = PROVINCES.flatMap(p => Object.values(NAPCS).map(s => ({productId: PRODUCT, coordinate: `${p}.${DOMESTIC_EXPORT}.${s}.${partnerMember}.0.0.0.0.0.0`, latestN: 12})));
  let rows: {status: string; object: {coordinate: string; vectorDataPoint: {refPer: string; value: number; scalarFactorCode: number}[]}}[];
  try {
    const res = await fetch(WDS, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(coords)});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (err) {
    console.warn(`statcan: partner ${partnerMember} failed: ${(err as Error).message}`);
    return null;
  }
  const cad: ProvinceExports['cad'] = {};
  let first = '', last = '';
  for (const r of rows) {
    if (r.status !== 'SUCCESS') continue;
    const [prov, , section] = r.object.coordinate.split('.').map(Number);
    const pts = r.object.vectorDataPoint;
    if (!pts.length) continue;
    const scale = 10 ** (pts[0].scalarFactorCode ?? 0);
    (cad[prov] ??= {})[section] = pts.reduce((s, p) => s + p.value * scale, 0);
    first = first && first < pts[0].refPer ? first : pts[0].refPer;
    last = last > pts.at(-1)!.refPer ? last : pts.at(-1)!.refPer;
  }
  const mon = (iso: string) => new Date(iso).toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'});
  const out: ProvinceExports = {period: `${mon(first)}–${mon(last)}`, cad};
  writeFileSync(file, JSON.stringify({...out, fetchedAt: new Date().toISOString()}));
  return out;
}
