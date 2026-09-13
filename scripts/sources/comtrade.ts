/**
 * UN Comtrade public preview API (no key). Annual goods imports, HS classification,
 * reporter-side values in USD. Cached on disk so weekly builds only fetch what changed.
 *
 * Endpoint notes learned the hard way:
 *  - partner2Code=0&motCode=0&customsCode=C00 selects the aggregate rows; without them
 *    reporters like Canada return hundreds of breakdown rows.
 *  - The EU (97) works as a reporter but not as a partner; sum member states instead.
 *  - 500 rows per call; a comma list of cmdCodes and partnerCodes is accepted.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const CACHE = resolve(import.meta.dirname, '../../data/cache/comtrade');
const NEGATIVE_TTL_DAYS = 30;

export interface ImportRow {
  partner: number;
  code: string;
  usd: number;
}

interface Cached {
  fetchedAt: string;
  rows: ImportRow[];
}

let lastCall = 0;
async function politeFetch(url: string): Promise<Response> {
  const wait = 1200 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  return fetch(url, {headers: {accept: 'application/json'}});
}

function key(reporter: number, partners: number[], year: number, codes: string[]): string {
  return `${reporter}-${partners.join('_')}-${year}-${codes.join('_')}`.replace(/[^\w.-]/g, '_');
}

/** Rows for one reporter, a set of partners and a set of HS codes in a year. Empty array = no data. */
export async function fetchImports(reporter: number, partners: number[], year: number, codes: string[], opts: {offline?: boolean} = {}): Promise<ImportRow[] | null> {
  mkdirSync(CACHE, {recursive: true});
  const file = resolve(CACHE, key(reporter, partners, year, codes) + '.json');
  if (existsSync(file)) {
    const c: Cached = JSON.parse(readFileSync(file, 'utf8'));
    const ageDays = (Date.now() - Date.parse(c.fetchedAt)) / 86400000;
    if (c.rows.length || ageDays < NEGATIVE_TTL_DAYS) return c.rows;
  }
  if (opts.offline) return null;

  const params = new URLSearchParams({
    reporterCode: String(reporter),
    partnerCode: partners.join(','),
    period: String(year),
    flowCode: 'M',
    cmdCode: codes.join(','),
    partner2Code: '0',
    motCode: '0',
    customsCode: 'C00',
    maxRecords: '500'
  });
  const url = `${BASE}?${params}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await politeFetch(url);
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as {count?: number; data?: {partnerCode: number; cmdCode: string; primaryValue: number}[]; error?: string};
      if (body.error) return null;
      const rows: ImportRow[] = (body.data ?? []).map(r => ({partner: r.partnerCode, code: r.cmdCode, usd: r.primaryValue}));
      if (rows.length >= 500) console.warn(`comtrade: ${key(reporter, partners, year, codes)} hit the 500-row cap; results truncated`);
      writeFileSync(file, JSON.stringify({fetchedAt: new Date().toISOString(), rows} satisfies Cached));
      return rows;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`comtrade: ${url} failed: ${(err as Error).message}`);
        return null;
      }
    }
  }
  return null;
}

/**
 * Imports by HS code, summed across partners, for the most recent year with data.
 * Returns null when no year has data (or offline with no cache).
 */
export async function importsByCode(reporter: number, partners: number[], codes: string[], years: number[], opts: {offline?: boolean} = {}): Promise<{year: number; byCode: Record<string, number>} | null> {
  // Keep partners × codes under the 500-row cap per call.
  const perCall = Math.max(1, Math.floor(450 / partners.length));
  const rest = codes.filter(c => c !== 'TOTAL');
  const chunks: string[][] = [['TOTAL', ...rest.slice(0, perCall - 1)]];
  for (let i = perCall - 1; i < rest.length; i += perCall) chunks.push(rest.slice(i, i + perCall));

  for (const year of years) {
    const byCode: Record<string, number> = {};
    let ok = true;
    for (const [i, chunk] of chunks.entries()) {
      const rows = await fetchImports(reporter, partners, year, chunk, opts);
      if (rows === null || (i === 0 && !rows.length)) { ok = false; break; }
      for (const r of rows) byCode[r.code] = (byCode[r.code] ?? 0) + r.usd;
    }
    if (ok && byCode.TOTAL) return {year, byCode};
  }
  return null;
}
