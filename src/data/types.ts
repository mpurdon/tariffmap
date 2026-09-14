/** Shared types for the curated dataset, the build pipeline, and the app. */

export type Iso3 = string;

/** Sentinel used in `targets` (every partner) and `hs` (every product). */
export const ALL = 'ALL';
/** EU member states are represented on the map by the Union itself. */
export const EU = 'EUN';

export const coversAllGoods = (a: Pick<TariffAction, 'hs'>) => a.hs.includes(ALL);
export const targetsEveryone = (a: Pick<TariffAction, 'targets'>) => a.targets.includes(ALL);
/** The ISO3 an entity trades under: EU members collapse to EUN. */
export const tradeIso = (e: Pick<Endpoint, 'iso3' | 'eu'>) => (e.eu ? EU : e.iso3);
/** Human label for a measure's product scope. */
export const hsLabelOf = (a: Pick<TariffAction, 'hs' | 'hsLabel'>) => a.hsLabel ?? (coversAllGoods(a) ? 'all goods' : `HS ${a.hs.join(', ')}`);

export type Status = 'active' | 'suspended' | 'revoked' | 'announced';

export type LegalBasis =
  | 'IEEPA'
  | 'Section 232'
  | 'Section 301'
  | 'Section 338'
  | 'Section 122'
  | 'countermeasure'
  | 'safeguard'
  | 'anti-dumping'
  | 'deal'
  | 'MFN'
  | 'other';

/** One curated tariff action, as written in data/curated/tariff-actions.json. */
export interface TariffAction {
  id: string;
  /** ISO3 of the country/customs union imposing the duty. EUN = European Union. */
  imposer: Iso3;
  /** ISO3 targets, or ["ALL"] for every trading partner (expanded at build time). */
  targets: Iso3[];
  /** With targets ["ALL"]: partners carved out because a separate entry covers them (e.g. deal partners). */
  except?: Iso3[];
  title: string;
  /** Current headline ad valorem rate in percent. null for import bans / quotas / specific duties — describe in rateNote. */
  rate: number | null;
  rateNote?: string;
  /** Rate changes over the life of the measure, oldest first; the entry whose `from` ≤ the viewed date applies. */
  rateHistory?: {from: string; rate: number; note?: string}[];
  /** Actions whose rates add on top of this one for the same goods (e.g. IEEPA + Section 232). */
  stacksWith?: string[];
  /** Actions superseded by this one at the pair level. */
  replaces?: string[];
  /** HS chapters (2-digit), headings (4) or subheadings (6). ["ALL"] = all goods. */
  hs: string[];
  /** Human label for the HS scope, e.g. "steel & aluminum". */
  hsLabel?: string;
  /** Carve-outs that matter for reading the number, e.g. "USMCA-compliant goods exempt". */
  exemptions?: string;
  legalBasis: LegalBasis;
  /** ISO date the duty became (or becomes) payable. */
  effective: string;
  expires?: string | null;
  status: Status;
  /** Primary sources: Federal Register, USTR, CBP CSMS, Dept. of Finance Canada, EU OJ, MOFCOM, gazettes. */
  sources: string[];
  /** ISO date a human last confirmed the entry against its sources. */
  lastVerified: string;
  notes?: string;
  /** Curated: official statement of trade covered, USD (e.g. "C$27.6B of US goods"). Overrides the computed figure. */
  coveredTradeUsd?: number;
  coveredTradeNote?: string;
  /** Filled in by the build pipeline from UN Comtrade: annual imports of the covered goods from all targets, USD. */
  tradeUsd?: number;
  /** tradeUsd × current rate — a ceiling on annual duty, before exemptions and trade diversion. */
  dutyUsd?: number;
  /** Data year(s) behind the trade figures, e.g. "2025" or "2024–2025". */
  tradeYear?: string;
  /** NAPCS sections (StatCan) the HS scope maps onto; filled in by the build. */
  napcs?: number[];
}

/** Endpoint for arcs: a national capital or a sub-national region centroid. */
export interface Endpoint {
  iso3: Iso3;
  /** ISO 3166-1 alpha-2, lower-case — the flag-icons code. */
  iso2: string;
  /** UN Comtrade M49 code. */
  m49: number;
  name: string;
  capital: string;
  lon: number;
  lat: number;
  num?: string | null;
  eu?: boolean;
}

/** A renderable arc, produced by the build pipeline (one per imposer→target pair at country level). Rates are resolved at runtime. */
export interface Arc {
  id: string;
  imposer: Iso3;
  target: Iso3;
  from: [number, number];
  to: [number, number];
  actionIds: string[];
  /** Imposer's annual imports from the target by HS code (plus TOTAL), USD. */
  trade?: {year: number; byCode: Record<string, number>};
}

/** A sub-national region (US state or Canadian province) with its arc anchor. */
export interface Region {
  id: string;
  iso3: Iso3;
  name: string;
  anchor: string;
  lon: number;
  lat: number;
  census?: string;
  statcan?: number;
}

/**
 * Imposer → region exports of the targeted goods. `byCode` is keyed by HS code (Census) or
 * `n<section>` NAPCS section (StatCan) plus TOTAL, so measures can be unioned like country arcs.
 */
export interface RegionalArc {
  id: string;
  imposer: Iso3;
  target: Iso3;
  region: string;
  from: [number, number];
  to: [number, number];
  source: 'census' | 'statcan';
  period: string;
  byCode: Record<string, number>;
  actionIds: string[];
}

export interface Meta {
  builtAt: string;
  actionsVerifiedThrough: string;
  sources: Record<string, string>;
  counts: {actions: number; arcs: number; arcsWithTrade?: number; regionalArcs?: number; regionalPairs?: number};
}
