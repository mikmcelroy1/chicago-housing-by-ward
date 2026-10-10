-- Ward Housing Ranker: core schema. Applied with `npm run migrate -- 001_schema.sql` (scripts/apply-migration.ts).
-- Everything here is public city/county data; anon read is enabled on every table so the site
-- can use the Supabase anon key. Only the ETL writes, through DATABASE_URL.

create extension if not exists postgis;

-- One row per ward: geometry from Boundaries-Wards-2023 (p293-wvbd), denominators from the
-- 2020 Census (scripts/load-denominator.ts), current alder from Ward Offices (htai-wnw4).
create table wards (
  ward int primary key check (ward between 1 and 50),
  geom geometry(MultiPolygon, 4326),
  units_2020 int,
  pop_2020 int,
  denominator_source text,            -- 'census_2020_blocks' | 'assessor_parcels'
  alder_current text,                 -- "First Last", from Ward Offices
  website text,
  synced_at timestamptz not null default now()
);
create index wards_geom_idx on wards using gist (geom);

-- Hand-maintained in data/alder_tenure.csv; loaded every ETL run (delete + insert).
create table alder_tenures (
  id text primary key,
  ward int not null references wards (ward),
  name text not null,
  photo_url text,
  start_date date not null,
  end_date date,                      -- null = current
  source_url text
);
create index alder_tenures_ward_idx on alder_tenures (ward, start_date);

-- Raw copy of every permit in the window (issue_date >= 2023-05-15), all permit types.
-- Rows the city drops (voided/revoked) are kept with voided_at set; never hard deleted.
create table permits (
  id text primary key,
  permit_no text not null,
  permit_type text not null,
  review_type text,
  issue_date date not null,
  status text,
  address text not null,
  lat double precision,
  lon double precision,
  ward int,
  pins text[] not null default '{}',
  description text not null default '',
  reported_cost numeric,
  contacts jsonb not null default '[]',
  raw jsonb not null,
  fetched_at timestamptz not null default now(),
  voided_at date
);
create index permits_issue_date_idx on permits (issue_date);
create index permits_type_idx on permits (permit_type);
create index permits_ward_idx on permits (ward);

-- Output of scripts/lib/rules.ts for every permit, plus assessor resolution for demolitions.
create table permit_class (
  permit_id text primary key references permits (id) on delete cascade,
  category text not null check (category in (
    'new_residential','new_nonresidential','accessory','noise','revision_or_phase',
    'demolition','emergency_demolition','demolition_accessory',
    'renovation_delta','renovation_other','other_type')),
  units int,                          -- new construction: count; renovation: signed delta; demolition: units removed
  units_source text not null check (units_source in (
    'regex_number','regex_word','sfr_keyword','structured_demo','assessor','override','unknown')),
  needs_review boolean not null default false,
  notes text[] not null default '{}',
  resolved_pin text,                  -- 14-digit assessor PIN used for a demolition lookup
  classified_at timestamptz not null default now()
);
create index permit_class_category_idx on permit_class (category);
create index permit_class_review_idx on permit_class (needs_review) where needs_review;

-- One row per thing that can count: a deduped new-construction project, a renovation with a
-- unit delta, or a demolition. Rebuilt from scratch every ETL run.
create table projects (
  id text primary key,
  project_key text not null,
  kind text not null check (kind in (
    'new_construction','adu','conversion','deconversion','demolition','emergency_demolition')),
  ward int not null references wards (ward),
  units_delta int not null,
  counted boolean not null,
  first_issue_date date not null,
  primary_permit_id text not null references permits (id),
  permit_no text not null default '',
  address text not null,
  lat double precision,
  lon double precision,
  alder_tenure_id text references alder_tenures (id),
  subsidized boolean not null default false,
  replaced_units int not null default 0,     -- new construction: units demolished at the same address for this project
  merged_into text,                          -- demolition: the project it was folded into
  status text,
  description text not null default '',
  reported_cost numeric,
  review_type text,
  needs_review boolean not null default false,
  ward_geom_mismatch boolean not null default false
);
create index projects_ward_date_idx on projects (ward, first_issue_date);
create index projects_date_idx on projects (first_issue_date);
create index projects_kind_idx on projects (kind);

create table project_permits (
  project_id text not null references projects (id) on delete cascade,
  permit_id text not null references permits (id) on delete cascade,
  primary key (project_id, permit_id)
);

-- Hand-maintained in data/ward_flags.csv; loaded every run.
create table ward_flags (
  ward int not null references wards (ward),
  flag text not null,
  value text not null,
  source_url text,
  as_of date,
  primary key (ward, flag)
);

-- Optional denominator source: 2020 Census blocks (PL 94-171) as centroids, Cook County only.
create table census_blocks_2020 (
  geoid text primary key,
  housing_units int not null,
  population int not null,
  geom geometry(Point, 4326) not null
);
create index census_blocks_2020_geom_idx on census_blocks_2020 using gist (geom);

create table etl_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',   -- running | ok | failed
  counts jsonb not null default '{}',
  error text
);

-- Point-in-polygon ward check used by the ETL for every project.
create or replace function ward_at(lon double precision, lat double precision)
returns int language sql stable as $$
  select ward from wards where st_contains(geom, st_setsrid(st_point(lon, lat), 4326)) limit 1;
$$;

-- Public read for the site (anon key) on everything; writes only via DATABASE_URL.
do $$
declare t text;
begin
  foreach t in array array['wards','alder_tenures','permits','permit_class','projects','project_permits','ward_flags','census_blocks_2020','etl_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
