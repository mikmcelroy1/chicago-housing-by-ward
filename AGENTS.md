# Ward Housing Ranker: working notes for agents and humans

Ranks Chicago's 50 wards by net new housing units permitted. Spec and decisions live in the Claude Doc
"Ward Housing Ranker v1 Spec"; the public rules are docs/METHODOLOGY.md. Keep rules.ts, the spec, and
METHODOLOGY.md in sync when a rule changes.

## Layout

- `app/`, `components/`, `lib/` — Next.js 16 App Router site. `lib/data.ts` picks the backend (Supabase, or
  `data/fixtures/snapshot.json` when `DATA_SOURCE=fixture`). `lib/rank.ts` is the ranking math.
- `scripts/` — ETL in TypeScript, run with `tsx --env-file-if-exists=.env.local`. `scripts/lib/rules.ts` is the
  permit classifier (pure functions, tested in `tests/rules.test.ts`). `scripts/ingest-permits.ts` is the nightly
  job; `--dry-run` skips the database and writes the fixture.
- `supabase/migrations/` — numbered SQL, applied with `npm run migrate -- <file>` AND committed. Never explicit
  BEGIN/COMMIT in a migration; the runner wraps it.
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

## Commands

```
npm test                              # rules + rank tests
npm run classify-sample -- --type "PERMIT - NEW CONSTRUCTION" --since 2025-10-01
npm run etl -- --dry-run [--cache] [--since YYYY-MM-DD] [--no-parcels]
npm run load-denominator -- --dry-run [--cache]
npm run migrate -- 001_schema.sql
npm run sync-wards && npm run load-denominator && npm run etl
npm run dev | build | lint
```
