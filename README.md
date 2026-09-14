# TariffMap

**https://tariffmap.org** — a live, sourced map of the world's tariffs: who imposes them, who they hit, how much trade is affected, and how it changed month by month.

Arcs fire from the country setting a tariff to the country it hits. Thickness is dollars of imports covered; comets are the rate. Scrub the timeline back to 2018 or forward through scheduled changes, click a country to focus, hover an arc for every measure behind it.

## How the data works

- **`data/curated/tariff-actions.json`** is the human-reviewed source of truth. Every measure cites primary sources (Federal Register, USTR, Finance Canada, EU Official Journal, MOFCOM…) and carries the date it was last verified. Schema and editing rules: [`data/curated/README.md`](data/curated/README.md).
- **Trade values** are annual goods imports by HS chapter from [UN Comtrade](https://comtradeplus.un.org), fetched at build time and cached in `data/cache/comtrade`. "Est. duty" figures are imports × rate — a ceiling before exemptions and trade diversion, not revenue.
- **Regional view** (zoom in on North America): arcs land on the provinces/states that export the targeted goods to the imposing country — Canadian provinces from Statistics Canada table 12-10-0175 (trailing 12 months, by NAPCS section), US states from the Census Bureau state-export API (annual, by HS code; needs a free `CENSUS_API_KEY` in `.env`).
- `npm run build:data` validates the curated file, expands targets, joins trade values and writes `public/data/*.json`. `--offline` uses the committed cache only.

Found an error or a missing measure? Open a PR against `tariff-actions.json` with a source link.

## Stack

Vite + TypeScript + [deck.gl](https://deck.gl) (no tile server — Natural Earth polygons rendered directly), hosted on Cloudflare Workers static assets. A weekly GitHub Action refreshes trade data and redeploys.

```
npm install
npm run build:data -- --offline   # or without --offline to refresh Comtrade
npm run dev                       # http://localhost:5173
npm run deploy                    # build + wrangler deploy
```

## Credits

Built by [Matthew Purdon](https://matthewpurdon.me). Flags by [flag-icons](https://github.com/lipis/flag-icons); basemap from [Natural Earth](https://www.naturalearthdata.com) via world-atlas.
