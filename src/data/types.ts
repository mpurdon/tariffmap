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
  title: string;
  /** Ad valorem rate in percent. null when the action is a quota / specific duty — describe in rateNote. */
  rate: number | null;
  rateNote?: string;
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
}

/** Endpoint for arcs: a national capital or a sub-national region centroid. */
export interface Endpoint {
  iso3: Iso3;
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
}

export interface Meta {
  builtAt: string;
  actionsVerifiedThrough: string;
  sources: Record<string, string>;
  counts: {actions: number; arcs: number};
}
