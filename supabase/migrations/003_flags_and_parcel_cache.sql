-- Project flags, every parcel behind a demolition lookup, and a persistent parcel-lookup cache.
-- Applied with `npm run migrate -- 003_flags_and_parcel_cache.sql`. Additive only, so the nightly ETL keeps
-- working whether it runs the code from before or after this change.

-- Flag keys shown as chips on project lists. The registry (labels, descriptions) is scripts/lib/flags.ts.
alter table projects add column flags text[] not null default '{}';

-- Every assessor parcel consulted for a demolition: the permit's own PINs, else every parcel the assessor files
-- at the permit's address. resolved_pin keeps the first of them for older readers.
alter table permit_class add column resolved_pins text[] not null default '{}';

-- Assessor lookups kept between runs, so a nightly run only asks about new permits. Misses are not stored,
-- so they are retried every night and self-heal once the assessor publishes the data.
--   kind 'address': key = street address as the assessor spells it, value = JSON array of 14-digit PINs there
--   kind 'units':   key = "<pin>:<year>", value = the record used (class, units, source, year)
create table parcel_cache (
  kind text not null check (kind in ('address', 'units')),
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);
alter table parcel_cache enable row level security;
create policy "public read" on parcel_cache for select to anon, authenticated using (true);
