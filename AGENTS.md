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
- Every change that can move a number ships with an impact report in `docs/impact/`: anything touching rules.ts,
  projects.ts, parcels.ts, rank.ts, overrides.csv, or a migration that changes counts. `npm run etl -- --dry-run
  --cache` (the "after": the working tree), then `npm run impact -- --before-commit HEAD --note "..."` (the
  "before": the last commit, dry-run on the same pull, so only the rules differ). Commit the .xlsx and .md with
  the change. `--before db` compares against the live site instead, but a live `npm run etl` rewrites the cached
  pull, so the two sides may then differ by a day of permits. Cosmetic changes don't need one.

## Commands

```
npm test                              # rules + projects + parcels + flags + rank tests
npm run classify-sample -- --type "PERMIT - NEW CONSTRUCTION" --since 2025-10-01
npm run etl -- --dry-run [--cache] [--since YYYY-MM-DD] [--no-parcels]
npm run load-denominator -- --dry-run [--cache]
npm run migrate -- 003_flags_and_parcel_cache.sql
npm run impact -- --before-commit HEAD --note "what changed"   # or --before db|file.json, --after file.json
npm run sync-wards && npm run load-denominator && npm run etl
npm run dev | build | lint
```
