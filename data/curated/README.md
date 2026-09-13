# Curated tariff actions

`tariff-actions.json` is the human-reviewed source of truth for everything the map
shows about the 2018→present tariff conflicts. The build (`npm run build:data`)
validates it and derives the arcs; nothing reaches the site that isn't in here.

## Rules

1. **Every entry cites a source.** Prefer primary: Federal Register / White House
   proclamations, USTR notices, CBP CSMS, Department of Finance Canada, EU
   Official Journal, MOFCOM / State Council Tariff Commission, Diario Oficial.
   Reputable law-firm trackers are acceptable as a second source or when the
   primary document has no stable URL.
2. **`lastVerified` is the date a human last checked the entry against its
   sources.** Update it whenever you re-verify, even if nothing changed.
3. **Never delete history.** When a measure ends, set `expires` and
   `status: "revoked"`; when the rate changes, append to `rateHistory` and update
   `rate`. The timeline replays these.
4. **One legal instrument ≈ one entry.** Split by target group when the rate
   differs (e.g. `us-232-autos` at 25% for most partners and `us-232-autos-eun`
   at 15% for the EU). Use `targets: ["ALL"]` plus `except` for the general case.
5. **Headline rates are ad valorem percentages** for the main covered goods.
   Put quotas, specific duties, tiered rates and carve-outs in `rateNote` and
   `exemptions`; set `rate: null` only for bans and non-ad-valorem measures.
6. **`hs` drives the regional view.** List the HS chapters (2-digit) or headings
   (4/6-digit) the measure actually covers; `["ALL"]` for economy-wide measures.

## Schema

```jsonc
{
  "id": "us-232-steel-alu-2025",        // imposer-basis-scope-yyyy(-mm)
  "imposer": "USA",                      // ISO3; EUN = European Union
  "targets": ["ALL"],                    // ISO3 list, or ["ALL"] (EU members collapse to EUN)
  "except": ["GBR"],                     // only with ALL: partners covered by a separate entry
  "title": "Section 232 tariffs on steel, aluminum and derivative products",
  "rate": 50,                            // current headline %, or null
  "rateNote": "…",                       // tiers, quotas, caveats
  "rateHistory": [                       // optional; first `from` must equal `effective`
    {"from": "2025-03-12", "rate": 25},
    {"from": "2025-06-04", "rate": 50}
  ],
  "stacksWith": ["…"],                   // ids whose rates add on top for the same goods
  "hs": ["72", "73", "76"],              // or ["ALL"]
  "hsLabel": "steel & aluminum",
  "exemptions": "…",
  "legalBasis": "Section 232",           // IEEPA | Section 232 | Section 301 | Section 338 | Section 122 |
                                         // countermeasure | safeguard | anti-dumping | deal | MFN | other
  "effective": "2025-03-12",
  "expires": null,                       // ISO date when the measure ended, if it has
  "status": "active",                    // active | suspended | revoked | announced
  "sources": ["https://…"],
  "lastVerified": "2026-09-13",
  "notes": "…"
}
```

The validator rejects: unknown ISO3 codes (add them to `public/geo/capitals.json`),
missing sources, rates outside 0–250, `revoked` without `expires`, and
`rateHistory` that disagrees with `rate`/`effective`.
