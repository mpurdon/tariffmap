/** Shared types for the curated dataset, the build pipeline, and the app. */

export type Iso3 = string;

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
  /** Per-target covered imports, USD. */
  tradeByTarget?: Record<Iso3, number>;
  /** Data year(s) behind the trade figures, e.g. "2025" or "2024–2025". */
  tradeYear?: string;
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

/** A renderable arc, produced by the build pipeline (one per imposer→target pair at country level). */
export interface Arc {
  id: string;
  imposer: Iso3;
  target: Iso3;
  from: [number, number];
  to: [number, number];
  /** Headline rate in percent for the pair (max of non-stacking, sum of stacking actions). */
  rate: number;
  /** Annual bilateral trade affected, USD, if known. */
  tradeUsd?: number;
  actionIds: string[];
  /** Earliest effective date among contributing actions (for the timeline). */
  since: string;
  /** Imposer's annual imports from the target: total and by the HS codes its actions reference. */
  trade?: {year: number; total: number; byCode: Record<string, number>};
}

export interface Meta {
  builtAt: string;
  actionsVerifiedThrough: string;
  sources: Record<string, string>;
  counts: {actions: number; arcs: number; arcsWithTrade?: number};
}
