# Ward Housing Ranker: working notes for agents and humans

Ranks Chicago's 50 wards by net new housing units permitted. Spec and decisions live in the Claude Doc
"Ward Housing Ranker v1 Spec"; the public rules are docs/METHODOLOGY.md. Keep rules.ts, projects.ts, the spec,
and METHODOLOGY.md in sync when a rule changes.

## Layout

- `app/`, `components/`, `lib/` — Next.js 16 App Router site. `lib/data.ts` picks the backend (Supabase, or
  `data/fixtures/snapshot.json` when `DATA_SOURCE=fixture`). `lib/rank.ts` is the ranking math.
- `scripts/` — ETL in TypeScript, run with `tsx --env-file-if-exists=.env.local`. `scripts/lib/rules.ts` is the
  permit classifier (pure functions, tested in `tests/rules.test.ts`). `scripts/lib/projects.ts` groups permits
  into projects (tested in `tests/projects.test.ts`). `scripts/lib/parcels.ts` is the assessor lookup for
  demolitions. `scripts/lib/flags.ts` is the registry of project flags shared by the ETL and the site.
  `scripts/ingest-permits.ts` is the nightly job; `--dry-run` skips the database and writes the fixture.
  `scripts/ingest-zoning.ts` is the zoning stage that runs after it (the Alder actions tab): `scripts/lib/zoning.ts`
  reads an ordinance (pure, tested in `tests/zoning.test.ts` and against `data/zoning_golden.csv`),
  `scripts/lib/zoning-source.ts` copies matters from chicago-budget over `ZONING_DATABASE_URL`,
  `scripts/lib/exhibits.ts` reads scanned exhibits with OCR, `scripts/lib/zoning-link.ts` places sites and links
  passed actions to projects. `lib/actions.ts` is the tab's math (tested in `tests/actions.test.ts`).
- `supabase/migrations/` — numbered SQL, applied with `npm run migrate -- <file>` AND committed. Never explicit
  BEGIN/COMMIT in a migration; the runner wraps it. Keep migrations additive when you can: the nightly job runs
  whatever code is on main, which may be older or newer than the schema for a night.
- `data/` — hand-maintained CSVs (alder tenures, ward flags, overrides) that the ETL reloads every run.
  `data/cache/`, `data/fixtures/` and `data/review-queue.csv` are generated and gitignored.
- `.github/workflows/nightly-etl.yml` — 06:00 UTC: tests, sync-wards, etl, upload review queue.

## House rules

- Scripts fail loudly (exit 2) on structural drift: too few permits, stale feed, wrong ward count. A red
  nightly run is the alarm; most problems self-heal the next night.
- The city drops voided permits. We never hard delete: `permits.voided_at` is set instead.
- Emergency demolitions are never counted against a ward. Don't "fix" that.
- Window starts 2023-05-15 because the permit's `ward` column is the ward at time of issuance and the map
  changed that day. Anything earlier needs the historical boundaries (v3).
- Unit counts come from regexes over free text. When a description defeats the rules it goes to
  `data/review-queue.csv`, and a human adds a row to `data/overrides.csv`. Don't special-case one permit in code.
- Demolition unit counts must be deterministic. A permit without a stated count uses every assessor parcel at
  its address, added together (the assessor files several parcels under one address more often than you'd
  think); demolition permits at one address or parcel within 180 days are one project so a parcel never
  counts twice. Lookups persist in the `parcel_cache` table (file cache for dry runs); misses are never saved,
  so they self-heal. Never pick "the first parcel the API returned". Retired PINs (the county renumbers lots)
  and lots carrying the same building record are left out or counted once, see parcels.ts. A permit for a part or
  an outbuilding (smokestack, garage, porch) is `demolition_accessory` with 0 units and never looked up. An
  assessor-sourced demolition of 7+ units is held (not counted) until overrides.csv confirms it.
- Flags are one registry. To add one: a key in `FlagKey` (scripts/lib/types.ts), an entry in
  `scripts/lib/flags.ts`, and a `### <label>` heading with the same one-sentence description under `## Flags`
  in docs/METHODOLOGY.md. `tests/flags.test.ts` fails until all three agree. Flags the site can tell from the
  row have a `derive`; the rest are set in projects.ts and stored in `projects.flags`.
- The golden list, `data/golden.csv`, is every permit a person has checked, with the agreed answer. A spot check
  that finds a problem adds the permit with the right answer and a neighbor or two that must not change; a wrong
  answer we know about and have not fixed is a row with status `known_gap`. `tests/golden.test.ts` checks what
  the rules read from each row's text; the ETL checks the final numbers every run and a live run goes red on a
  mismatch (data/golden-mismatches.csv, uploaded by the workflow). Never fix a golden row by changing its answer
  to what the code says; fix the code or mark it known_gap.
- The drift alarm: a live run compares every project with last run's. Same project, same permits, different
  units or kind is drift. With the same commit it is the county's or the city's data moving and the run goes
  red (data/drift.csv); after a push it is expected and the impact report covers it.
- Alder actions: the parser never guesses. A matter whose site, districts or unit count cannot be read is
  `needs_review` and goes to `data/zoning-review-queue.csv`; a scanned exhibit not yet read is `exhibits_pending`
  and the capacity figure (what the new zoning allows on the lot) stands in, labeled. Fix the parser or the golden
  list, never one matter in code. Exhibit texts persist in `zoning_attachment_texts` (`data/cache/exhibit-texts.json`
  for dry runs); failures are not stored, so they retry. The copy is incremental on `last_publication_date` and the
  run fails loudly when it holds fewer matters than chicago-budget; `--full` recopies. Matters that could not be
  placed in a ward are left out of the ranking and counted in the footnote.
- Zoning direction compares homes per square foot of lot first (Title 17 minimum lot area per unit), floor area
  ratio second; the tables in zoning.ts were checked against the published code on 2026-10-17. Check them again
  before changing them, and say so in the methodology.
- The ADU flag on the permits tab is derived at render time (`wardFlagsWithDerived` in lib/actions.ts) from the
  sponsors of the opt-in ordinances in `data/key_ordinances.csv`; rows in `data/ward_flags.csv` cover the rest.
- Every change that can move a number ships with an impact report in `docs/impact/`: anything touching rules.ts,
  projects.ts, parcels.ts, rank.ts, overrides.csv, or a migration that changes counts. `npm run etl -- --dry-run
  --cache` (the "after": the working tree), then `npm run impact -- --before-commit HEAD --note "..."` (the
  "before": the last commit, dry-run on the same pull, so only the rules differ). Commit the .xlsx and .md with
  the change. `--before db` compares against the live site instead, but a live `npm run etl` rewrites the cached
  pull, so the two sides may then differ by a day of permits. Cosmetic changes don't need one.

## Commands

```
npm test                              # rules + projects + parcels + flags + golden + drift + rank tests
npm run classify-sample -- --type "PERMIT - NEW CONSTRUCTION" --since 2025-10-01
npm run etl -- --dry-run [--cache] [--since YYYY-MM-DD] [--no-parcels]
npm run load-denominator -- --dry-run [--cache]
npm run migrate -- 005_zoning.sql
npm run impact -- --before-commit HEAD --note "what changed"   # or --before db|file.json, --after file.json
npm run sync-wards && npm run load-denominator && npm run etl && npm run etl-zoning
npm run etl-zoning -- --dry-run [--cache] [--full] [--no-parcels] [--no-ocr] [--ocr-limit N] [--ocr-workers N] [--today YYYY-MM-DD]
npx tsx scripts/dev/zoning-sample.ts --file matters.jsonl [--only needs_review|pd|type1|unknown|noaddr|nosection] [--record SO2024-0008415]
npm run dev | build | lint
```
