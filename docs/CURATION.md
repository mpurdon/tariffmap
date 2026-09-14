# Weekly curation routine

These are the standing instructions for the scheduled agent that keeps
`data/curated/tariff-actions.json` current. A human reviews every change it
proposes; it never pushes to `main`.

## Goal

Find tariff measures that started, ended, changed rate, or were announced since the
previous run, and propose the corresponding edits as a pull request — each with a
primary source. Accuracy beats coverage: an omission is recoverable, a wrong rate
on the live map is not.

## Scope

Countries on the map are the entities in `public/geo/capitals.json` (the EU is one
entity, `EUN`). Measures worth recording:

- Ad valorem tariffs, surtaxes, countervailing/anti-dumping duties, safeguard
  quotas with an over-quota rate, import bans, and formal suspensions/terminations
  of any of these, imposed **by** or **on** a mapped entity.
- Changes to measures already in the file: rate changes, scope changes that alter
  `hs`/`hsLabel`, expiries, court rulings that end collection, deals that cap rates.

Not in scope: export controls, sanctions, entity lists, AD/CVD cases on single
narrow products under ~US$500M of trade, proposals with no legal instrument yet
(record those as `status: "announced"` only when an effective date is set).

## Sources to check, in this order

1. **Federal Register** — search the last 10 days for presidential proclamations
   and USTR/Commerce notices mentioning tariff, duty, Section 232, 301, 338, 122:
   https://www.federalregister.gov/documents/search?conditions[term]=tariff&order=newest
2. **USTR press releases** https://ustr.gov/about-us/policy-offices/press-office/press-releases
3. **CBP CSMS** messages (implementation dates, stacking rules) https://www.cbp.gov/trade/automated/cargo-systems-messaging-service
4. **Finance Canada** news https://www.canada.ca/en/department-finance/news.html and the
   counter-tariff list page linked from existing `CAN` entries
5. **European Commission trade news** https://policy.trade.ec.europa.eu/news_en
6. **MOFCOM / State Council Tariff Commission** announcements (English:
   http://english.mofcom.gov.cn/ ; search "tariff commission announcement")
7. **Mexico Diario Oficial** for decrees amending the General Import and Export Tax Law
8. **Global Trade Alert** monthly roundup and blog https://globaltradealert.org/analysis
   as a cross-check — never as the sole source
9. Reputable law-firm trackers (Wiley, Holland & Knight, Troutman, Trade Compliance
   Resource Hub) to confirm effective dates and carve-outs.

## Procedure

1. `npm ci`, then read `data/curated/README.md` (schema and rules) and skim
   `data/curated/tariff-actions.json` so you know what is already recorded.
2. Check every source above for developments since the newest `lastVerified` date
   in the file. For each development decide: new entry, edit to an existing entry,
   or out of scope.
3. Also review every entry whose `effective`, `expires`, or a `rateHistory.from`
   falls within ±14 days of today — confirm it actually happened (or was
   postponed) and update accordingly.
4. Edit the JSON. Follow the schema exactly:
   - New measure → new entry with ≥1 primary source, `lastVerified` = today.
   - Rate change → append to `rateHistory` (create it from `effective` if absent)
     and update `rate`; keep `rateNote` accurate.
   - Ended → set `expires` and `status: "revoked"`; never delete.
   - Re-verified, unchanged → bump `lastVerified` only.
   - A partner not in `capitals.json` → add it there (iso3, iso2, m49, num,
     capital, lon/lat) rather than skipping the measure.
5. Validate: `npm run build:data -- --offline` must print counts with no
   validation errors. Fix anything it rejects.
6. If nothing changed, stop and report "no changes" — do not open an empty PR.
7. Otherwise create a branch `curation/YYYY-MM-DD`, commit only the curated
   files, push, and open a pull request titled `Curation: YYYY-MM-DD` whose body
   has a table with one row per change: **Measure · Change · Effective · Source
   link · Confidence (high/medium)**, followed by anything you were unsure about
   and chose *not* to record. Mention the number of entries re-verified.

## Style

- Titles read like a headline for a general reader: "Section 232 tariff on
  semi-finished copper", not "Proclamation 10962".
- `rateNote` carries the nuance (tiers, quotas, carve-outs); `rate` is the
  headline ad valorem number for the main covered goods.
- Dates are ISO `YYYY-MM-DD`, the date the duty became payable, not the signing date.
- Do not touch code, `public/data/`, caches, or files outside `data/curated/` and
  `public/geo/capitals.json`.
