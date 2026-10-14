# Ward Housing Ranker

Which of Chicago's 50 wards are actually adding housing? This site ranks every ward by **net new dwelling units permitted**, nightly, from the city's own building permit data, and gives credit to the alders who let housing get built.

- Ranks the ward, attributes each project to the alder in office on the permit date
- Counts new construction, ADUs and conversions; subtracts demolitions and deconversions; excludes city-ordered emergency demolitions
- Rank by net units per 1,000 existing units, or by raw net
- Every ward drills down to the permits behind its number, and every project carries flags that say where its count came from
- [Methodology](docs/METHODOLOGY.md) states every rule

## How it works

```
City & county open data ──► nightly ETL (GitHub Action, TypeScript) ──► Supabase Postgres ──► Next.js on Vercel
                                     ▲            │
                       data/*.csv (alder tenures, flags, overrides)   review-queue.csv (permits the rules can't read)
```

1. `scripts/ingest-permits.ts` pulls every permit issued since May 15, 2023 (the current ward map), classifies each one with the rules in `scripts/lib/rules.ts`, resolves demolition unit counts against Cook County Assessor parcels (every parcel at the address, added together), groups multi-permit projects, attributes each project to an alder tenure, and loads Supabase. `--dry-run` does everything except the database and writes `data/fixtures/snapshot.json`.
2. `scripts/load-denominator.ts` builds the existing-units denominator per ward from assessor parcels.
3. The Next.js app reads Supabase (or the fixture) and computes rankings in `lib/rank.ts`.

## Run it locally

```bash
npm install
cp .env.example .env.local        # DATA_SOURCE=fixture is enough for the site
npm run etl -- --dry-run          # ~5 minutes; writes data/fixtures/snapshot.json
npm run load-denominator -- --dry-run
npm run etl -- --dry-run --cache  # re-run using the cached pull, folds the denominator in
npm run dev                       # http://localhost:3000
npm test
```

`npm run classify-sample -- --type "PERMIT - NEW CONSTRUCTION" --since 2025-10-01` prints how the rules read a year of permits, by category, for tuning.

## Deploy

1. Create a Supabase project. In the dashboard click **Connect**, pick the **Session pooler** URI (not Direct connection: that host is IPv6-only and GitHub Actions runners have no IPv6), fill in the database password, and put it in `.env.local` as `DATABASE_URL`. Then apply every file in `supabase/migrations/` in order: `npm run migrate -- 001_schema.sql`, and so on.
2. `npm run sync-wards`, `npm run load-denominator`, `npm run etl`.
3. Add repository secrets `DATABASE_URL`, `SOCRATA_APP_TOKEN` (optional), `VERCEL_DEPLOY_HOOK` (optional). `.github/workflows/nightly-etl.yml` then runs every night at 06:00 UTC and uploads the review queue as an artifact.
4. Deploy to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_REPO_URL`.

## Maintaining the data files

- `data/alder_tenure.csv`: who held each seat when. Add a row when a seat changes hands (appointment or election) with a source URL. The nightly run reloads it.
- `data/ward_flags.csv`: good-behavior flags shown on the table, one row per ward per flag (for example `adu_opt_in,yes`).
- `data/overrides.csv`: corrections for permits the rules misread. The nightly run's `review-queue.csv` artifact lists candidates; add a row with the permit id, the right category and units, and a note.

## Data sources

| Source | Id |
| --- | --- |
| Building Permits, City of Chicago | [ydr8-5enu](https://data.cityofchicago.org/d/ydr8-5enu) |
| Boundaries: Wards 2023-, City of Chicago | [p293-wvbd](https://data.cityofchicago.org/d/p293-wvbd) |
| Ward Offices, City of Chicago | [htai-wnw4](https://data.cityofchicago.org/d/htai-wnw4) |
| ACS 5-year by ward, City of Chicago | [awnk-6fvc](https://data.cityofchicago.org/d/awnk-6fvc) |
| Affordable Rental Housing Developments, City of Chicago | [s6ha-ppgi](https://data.cityofchicago.org/d/s6ha-ppgi) |
| Parcel Universe, Cook County Assessor | [nj4t-kc8j](https://datacatalog.cookcountyil.gov/d/nj4t-kc8j) |
| Parcel Addresses, Cook County Assessor | [3723-97qp](https://datacatalog.cookcountyil.gov/d/3723-97qp) |
| Improvement Characteristics, Cook County Assessor | [x54s-btds](https://datacatalog.cookcountyil.gov/d/x54s-btds) |
| Commercial Valuation, Cook County Assessor | [csik-bsws](https://datacatalog.cookcountyil.gov/d/csik-bsws) |

## Roadmap

- v2: an alder-actions tab from the City Clerk's eLMS API (upzonings, downzonings and planned developments sponsored), a ward timeline with tenure bands, a map on the ward page, vacant-building rehabs counted as units returned to stock
- v3: history before May 2023 using the older ward boundaries; developer identity behind LLCs
- Denominator from 2020 Census blocks (needs a free `CENSUS_API_KEY` and block centroids) instead of assessor parcels

## License

MIT. Data is public domain from the City of Chicago and Cook County.
