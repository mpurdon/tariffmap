/**
 * US Census Bureau international trade API: state exports by HS code and destination
 * country, annual (ALL_VAL_YR at MONTH=12), USD. Needs CENSUS_API_KEY (free).
 * https://www.census.gov/data/developers/data-sets/international-trade.html
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const BASE = 'https://api.census.gov/data/timeseries/intltrade/exports/statehs';
const CACHE = resolve(import.meta.dirname, '../../data/cache/census');
const CACHE_TTL_DAYS = 28;
mkdirSync(CACHE, {recursive: true});

/** Census country codes for destinations we track. */
export const CENSUS_COUNTRY: Record<string, string> = {CAN: '1220', CHN: '5700', MEX: '2010', JPN: '5880', KOR: '5800', GBR: '4120', IND: '5330', BRA: '3510'};

export interface StateExports {
  year: number;
  /** state USPS code → HS code (2- or 4-digit) → USD */
  usd: Record<string, Record<string, number>>;
}

async function query(params: Record<string, string>, key: string): Promise<string[][] | null> {
  const url = `${BASE}?${new URLSearchParams({...params, key})}`;
  try {
    const res = await fetch(url, {redirect: 'manual'});
    if (res.status !== 200) { console.warn(`census: HTTP ${res.status} for ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')}`); return null; }
    return (await res.json()) as string[][];
  } catch (err) {
    console.warn(`census: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Every state's exports to one country for the latest full year: all HS2 chapters plus the
 * given 4-digit headings. Returns null without a key or data.
 */
export async function stateExports(country: string, headings: string[], years: number[], offline = false): Promise<StateExports | null> {
  const file = resolve(CACHE, `statehs-${country}-${headings.slice().sort().join('_') || 'hs2'}.json`);
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8')) as StateExports & {fetchedAt: string};
    if ((Date.now() - Date.parse(c.fetchedAt)) / 86400000 < CACHE_TTL_DAYS || offline) return c;
  }
  const key = process.env.CENSUS_API_KEY;
  if (offline || !key) return null;

  for (const year of years) {
    const hs2 = await query({get: 'STATE,E_COMMODITY,ALL_VAL_YR', COMM_LVL: 'HS2', CTY_CODE: CENSUS_COUNTRY[country], time: `${year}-12`}, key);
    if (!hs2 || hs2.length < 2) continue;
    const usd: StateExports['usd'] = {};
    const ingest = (rows: string[][]) => {
      const [hdr, ...body] = rows;
      const iS = hdr.indexOf('STATE'), iC = hdr.indexOf('E_COMMODITY'), iV = hdr.indexOf('ALL_VAL_YR');
      for (const r of body) {
        if (!r[iS] || r[iS] === '-') continue;
        (usd[r[iS]] ??= {})[r[iC]] = Number(r[iV]) || 0;
      }
    };
    ingest(hs2);
    if (headings.length) {
      const hs4 = await query({get: 'STATE,E_COMMODITY,ALL_VAL_YR', COMM_LVL: 'HS4', E_COMMODITY: headings.join(','), CTY_CODE: CENSUS_COUNTRY[country], time: `${year}-12`}, key);
      if (hs4) ingest(hs4);
    }
    const out: StateExports = {year, usd};
    writeFileSync(file, JSON.stringify({...out, fetchedAt: new Date().toISOString()}));
    return out;
  }
  return null;
}
