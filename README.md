# Ward Housing Ranker

Which of Chicago's 50 wards are actually adding housing? This site ranks every ward by **net new dwelling units permitted**, nightly, from the city's own building permit data, and gives credit to the alders who let housing get built.

- Ranks the ward, attributes each project to the alder in office on the permit date
- Counts new construction, ADUs and conversions; subtracts demolitions and deconversions; excludes city-ordered emergency demolitions
- Rank by net units per 1,000 existing units, or by raw net
- Every ward drills down to the permits behind its number, and every project carries flags that say where its count came from
- A second tab, **Alder actions**, ranks what each alder did about housing: the rezonings and planned developments they let through, the ones that stalled, the downzonings, the ADU opt-in and their part in citywide housing ordinances, read from the City Clerk's record
- [Methodology](docs/METHODOLOGY.md) states every rule

## How it works

```
City & county open data ──► nightly ETL (GitHub Action, TypeScript) ──► Supabase Postgres ──► Next.js on Vercel
                                     ▲            │
                       data/*.csv (alder tenures, flags, overrides)   review-queue.csv (permits the rules can't read)
Chicago Budget's copy of the City Clerk's record ──► zoning stage (copy, read, place, link) ──┘
```

1. `scripts/ingest-permits.ts` pulls every permit issued since May 15, 2023 (the current ward map), classifies each one with the rules in `scripts/lib/rules.ts`, resolves demolition unit counts against Cook County Assessor parcels (every parcel at the address, added together), groups multi-permit projects, attributes each project to an alder tenure, and loads Supabase. `--dry-run` does everything except the database and writes `data/fixtures/snapshot.json`.
2. `scripts/ingest-zoning.ts` copies every zoning reclassification ordinance since 2019 from the [chicago-budget](https://github.com/mikmcelroy1/chicago-budget) project (a nightly copy of the City Clerk's eLMS record), reads each one with `scripts/lib/zoning.ts` (site, from and to district, direction, homes requested and approved), reads scanned exhibits with OCR a few dozen per night, places each site in a ward through assessor parcels, links passed actions to the permit projects they enabled, and loads the alder-actions tables. `--dry-run` writes into the same fixture.
3. `scripts/load-denominator.ts` builds the existing-units denominator per ward from assessor parcels.
4. The Next.js app reads Supabase (or the fixture) and computes rankings in `lib/rank.ts` (permits) and `lib/actions.ts` (alder actions).

## Run it locally

```bash
npm install
cp .env.example .env.local        # DATA_SOURCE=fixture is enough for the site
npm run etl -- --dry-run          # ~5 minutes; writes data/fixtures/snapshot.json
npm run load-denominator -- --dry-run
npm run etl -- --dry-run --cache  # re-run using the cached pull, folds the denominator in
npm run etl-zoning -- --dry-run   # the alder-actions tab; needs ZONING_DATABASE_URL once, then --cache reuses the copy
npm run dev                       # http://localhost:3000
npm test
```

The zoning stage needs poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and `tesseract` on PATH to read scanned exhibits (`brew install poppler tesseract`); without them it runs and leaves those matters marked "exhibits not read yet". The first run on a fresh machine reads 25 exhibits; `npm run etl-zoning -- --dry-run --cache --ocr-limit 2000 --ocr-workers 6` is the one-time backfill (about a minute per exhibit per worker).

`npm run classify-sample -- --type "PERMIT - NEW CONSTRUCTION" --since 2025-10-01` prints how the rules read a year of permits, by category, for tuning.

## Deploy

1. Create a Supabase project. In the dashboard click **Connect**, pick the **Session pooler** URI (not Direct connection: that host is IPv6-only and GitHub Actions runners have no IPv6), fill in the database password, and put it in `.env.local` as `DATABASE_URL`. Then apply every file in `supabase/migrations/` in order: `npm run migrate -- 001_schema.sql`, and so on.
2. `npm run sync-wards`, `npm run load-denominator`, `npm run etl`.
3. Add repository secrets `DATABASE_URL`, `ZONING_DATABASE_URL` (a read-only role on the chicago-budget project; see its migration `017_zoning_readonly_role.sql`), `SOCRATA_APP_TOKEN` (optional), `VERCEL_DEPLOY_HOOK` (optional). `.github/workflows/nightly-etl.yml` then runs every night at 06:00 UTC and uploads the review queue as an artifact. The run goes red when a golden-list permit disagrees or when a project's units changed with the same permits and the same code (the drift alarm); the data still loads, the red run is the signal.
4. Deploy to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_REPO_URL`.

## Changing a rule

Any change that can move a number (the rules, the project builder, the parcel lookup, the rank math, the corrections file) ships with a before-and-after report in [docs/impact](docs/impact/): Chicago and every ward for the two default windows, plus every project whose number moved. Run it before the ETL loads the change, while the database still holds the old numbers:

```bash
npm run etl -- --dry-run --cache                              # the "after": your working tree on the cached permit pull
npm run impact -- --before-commit HEAD --note "what changed"  # the "before": the last commit on the same pull; writes docs/impact/<date>-<slug>.xlsx and .md
npm run etl                                                   # then load it
```

`--before db` compares against what the live site shows instead of the last commit.

## Maintaining the data files

- `data/alder_tenure.csv`: who held each seat when. Add a row when a seat changes hands (appointment or election) with a source URL. The nightly run reloads it.
- `data/ward_flags.csv`: good-behavior flags shown on the table, one row per ward per flag (for example `adu_opt_in,yes`).
- `data/golden.csv`: permits a person has checked, with the agreed answer. The test suite checks what the rules read from each one, and every nightly run checks its final number; a mismatch turns the run red. When you spot-check a building, add its permits here.
- `data/overrides.csv`: corrections for permits the rules misread. The nightly run's `review-queue.csv` artifact lists candidates; add a row with the permit id, the right category and units, and a note.
- `data/key_ordinances.csv`: the citywide housing ordinances the alder-actions tab scores sponsorship on, with a label, a stance and, for opt-in ordinances, the ward flag their sponsors fill (`adu_opt_in`).
- `data/zoning_golden.csv`: zoning matters a person has read, with the agreed reading and the text excerpt it came from. Tested on every change; the nightly run goes red on a mismatch. The run's `zoning-review-queue.csv` artifact lists matters the parser could not read fully.

## Data sources

| Source | Id |
| --- | --- |
| Building Permits, City of Chicago | [ydr8-5enu](https://data.cityofchicago.org/d/ydr8-5enu) |
| City Council matters, City Clerk eLMS, via the chicago-budget project's nightly copy | [api.chicityclerkelms.chicago.gov](https://api.chicityclerkelms.chicago.gov) |
| Boundaries: Wards 2023-, City of Chicago | [p293-wvbd](https://data.cityofchicago.org/d/p293-wvbd) |
| Ward Offices, City of Chicago | [htai-wnw4](https://data.cityofchicago.org/d/htai-wnw4) |
| ACS 5-year by ward, City of Chicago | [awnk-6fvc](https://data.cityofchicago.org/d/awnk-6fvc) |
| Affordable Rental Housing Developments, City of Chicago | [s6ha-ppgi](https://data.cityofchicago.org/d/s6ha-ppgi) |
| Parcel Universe, Cook County Assessor | [nj4t-kc8j](https://datacatalog.cookcountyil.gov/d/nj4t-kc8j) |
| Parcel Addresses, Cook County Assessor | [3723-97qp](https://datacatalog.cookcountyil.gov/d/3723-97qp) |
| Improvement Characteristics, Cook County Assessor | [x54s-btds](https://datacatalog.cookcountyil.gov/d/x54s-btds) |
| Commercial Valuation, Cook County Assessor | [csik-bsws](https://datacatalog.cookcountyil.gov/d/csik-bsws) |

## Roadmap

- v2 (remaining): a ward timeline with tenure bands, a map on the ward page, vacant-building rehabs counted as units returned to stock; for the alder-actions tab, a hand-labeled sample large enough to measure the parser, landmark designations that block demolitions, and zoned capacity per ward
- v3: history before May 2023 using the older ward boundaries; developer identity behind LLCs
- Denominator from 2020 Census blocks (needs a free `CENSUS_API_KEY` and block centroids) instead of assessor parcels

## License

MIT. Data is public domain from the City of Chicago and Cook County.
