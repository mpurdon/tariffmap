/**
 * UN Comtrade public preview API (no key). Annual goods imports, HS classification,
 * reporter-side values in USD. Cached on disk so weekly builds only fetch what changed.
 *
 * Endpoint notes learned the hard way:
 *  - partner2Code=0&motCode=0&customsCode=C00 selects the aggregate rows; without them
 *    reporters like Canada return hundreds of breakdown rows.
 *  - The EU (97) works as a reporter but not as a partner; sum member states instead.
 *  - 500 rows per call; comma lists of cmdCode and partnerCode are accepted.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const CACHE = resolve(import.meta.dirname, '../../data/cache/comtrade');
const NEGATIVE_TTL_DAYS = 30;
const ROW_CAP = 500;
mkdirSync(CACHE, {recursive: true});

interface ImportRow {
  partner: number;
  code: string;
  usd: number;
}
interface Cached {
  fetchedAt: string;
  rows: ImportRow[];
}

/** Imports by partner then HS code, USD. */
export type ImportTable = Record<number, Record<string, number>>;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let lastCall = 0;
async function politeFetch(url: string): Promise<Response> {
  const wait = 1200 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  return fetch(url, {headers: {accept: 'application/json'}});
}

/** Readable prefix + short hash of the partner/code lists (they are far too long for a filename). */
const cacheKey = (reporter: number, partners: number[], year: number, codes: string[]) =>
  `${reporter}-${year}-${createHash('sha1').update(`${partners.join(',')}|${codes.join(',')}`).digest('hex').slice(0, 12)}`;

/** One API call (or its cached result). null = request failed; [] = no data for that year. */
async function fetchRows(reporter: number, partners: number[], year: number, codes: string[], offline: boolean): Promise<ImportRow[] | null> {
  const file = resolve(CACHE, cacheKey(reporter, partners, year, codes) + '.json');
  if (existsSync(file)) {
    const c: Cached = JSON.parse(readFileSync(file, 'utf8'));
    const ageDays = (Date.now() - Date.parse(c.fetchedAt)) / 86400000;
    if (c.rows.length || ageDays < NEGATIVE_TTL_DAYS) return c.rows;
  }
  if (offline) return null;

  const params = new URLSearchParams({
    reporterCode: String(reporter),
    partnerCode: partners.join(','),
    period: String(year),
    flowCode: 'M',
    cmdCode: codes.join(','),
    partner2Code: '0',
    motCode: '0',
    customsCode: 'C00',
    maxRecords: String(ROW_CAP)
  });
  const url = `${BASE}?${params}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await politeFetch(url);
      if (res.status === 429 || res.status >= 500) { await sleep(4000 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      const body = (await res.json()) as {data?: {partnerCode: number; cmdCode: string; primaryValue: number}[]; error?: string};
      if (body.error) return null;
      const rows: ImportRow[] = (body.data ?? []).map(r => ({partner: r.partnerCode, code: r.cmdCode, usd: r.primaryValue}));
      if (rows.length >= ROW_CAP) console.warn(`comtrade: ${cacheKey(reporter, partners, year, codes)} hit the ${ROW_CAP}-row cap; results truncated`);
      writeFileSync(file, JSON.stringify({fetchedAt: new Date().toISOString(), rows} satisfies Cached));
      return rows;
    } catch (err) {
      if (attempt === 2) console.warn(`comtrade: ${url} failed: ${(err as Error).message}`);
    }
  }
  return null;
}

/**
 * Everything one reporter imports from a set of partners for a set of HS codes (+TOTAL),
 * from the most recent year with data. Calls are chunked to stay under the row cap.
 * Returns null when no year has data (or offline with no cache).
 */
export async function importTable(reporter: number, partners: number[], codes: string[], years: number[], offline = false): Promise<{year: number; table: ImportTable} | null> {
  const perCall = Math.max(1, Math.floor((ROW_CAP - 50) / partners.length));
  const rest = codes.filter(c => c !== 'TOTAL');
  const chunks: string[][] = [['TOTAL', ...rest.slice(0, perCall - 1)]];
  for (let i = perCall - 1; i < rest.length; i += perCall) chunks.push(rest.slice(i, i + perCall));

  for (const year of years) {
    const table: ImportTable = {};
    let ok = true;
    for (const [i, chunk] of chunks.entries()) {
      const rows = await fetchRows(reporter, partners, year, chunk, offline);
      if (rows === null || (i === 0 && !rows.length)) { ok = false; break; }
      for (const row of rows) (table[row.partner] ??= {})[row.code] = (table[row.partner][row.code] ?? 0) + row.usd;
    }
    if (ok) return {year, table};
  }
  return null;
}
