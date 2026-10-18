-- Alder actions (spec "Alder Actions Tab v2"): zoning reclassification matters copied from the chicago-budget
-- project, the parser's reading of each one, the permit projects a passed action enabled, the curated citywide
-- housing ordinances and each alder's part in them. Written by scripts/ingest-zoning.ts; read by the site.
-- Applied with `npm run migrate -- 005_zoning.sql`. Additive only.

-- Straight copy of each matter (zoning reclassifications since 2019 plus data/key_ordinances.csv), as the copy
-- step read it from chicago-budget: the matter row, its sponsors, actions (no roll calls) and attachments.
create table zoning_matters (
  matter_id uuid primary key,
  record_number text unique not null,
  title text,
  type text,
  matter_category text,
  introduction_date date,
  final_action_date date,
  outcome text,                       -- chicago-budget's canonical disposition (passed, pending, filed, withdrawn...)
  sub_status text,
  superseded_by text,
  filing_sponsor text,
  filing_office text,
  sponsor_offices text[] not null default '{}',   -- ward numbers of the alders who sponsored or co-sponsored it
  last_action_date date,
  last_publication_date timestamptz,
  full_text text,
  extraction_method text,
  sponsors jsonb not null default '[]',
  actions jsonb not null default '[]',
  attachments jsonb not null default '[]',
  copied_at timestamptz not null default now()
);
create index zoning_matters_intro_idx on zoning_matters (introduction_date);

-- One row per zoning reclassification ordinance: what the parser read, where it was placed, where it stands.
-- Columns mirror the ZoningAction type in scripts/lib/types.ts.
create table zoning_actions (
  matter_id uuid primary key references zoning_matters (matter_id) on delete cascade,
  record_number text not null,
  title text not null default '',
  introduction_date date not null,
  final_action_date date,
  outcome text not null default '',
  sponsor_ward int,
  sponsor_name text,
  sponsored_by_alder boolean not null default false,
  ward int references wards (ward),
  ward_source text check (ward_source in ('parcel', 'permit', 'sponsor')),
  alder_tenure_id text,               -- no FK: alder_tenures is reloaded (delete + insert) every permit run
  addresses jsonb not null default '[]',
  address text not null default '',
  pins text[] not null default '{}',
  app_no text,
  type1 boolean not null default false,
  from_districts text[] not null default '{}',
  from_district text,
  to_district text,
  from_far numeric,
  to_far numeric,
  direction text not null check (direction in ('up', 'down', 'lateral', 'pd', 'pd_amend', 'unknown')),
  requested_units int,
  approved_units int,
  units_source text not null check (units_source in ('exhibit', 'ordinance', 'narrative', 'capacity', 'override', 'none')),
  lot_sf int,
  allowed_before int,
  allowed_after int,
  stage text not null check (stage in ('passed', 'undecided', 'stalled', 'rejected')),
  stage_date date not null,
  days_pending int,
  substitute boolean not null default false,
  days_to_passage int,
  needs_review boolean not null default false,
  exhibits_pending boolean not null default false,
  notes text[] not null default '{}'
);
create index zoning_actions_ward_date_idx on zoning_actions (ward, stage_date);
create index zoning_actions_stage_idx on zoning_actions (stage);

-- A passed action linked to the permit projects it enabled (same site, permit after passage).
create table action_projects (
  matter_id uuid not null references zoning_matters (matter_id) on delete cascade,
  project_id text not null,           -- projects.id; no FK: projects is rebuilt every permit run
  lag_days int not null,
  match text not null check (match in ('pin', 'address')),
  primary key (matter_id, project_id)
);
create index action_projects_project_idx on action_projects (project_id);

-- The passed action a project's permit needed, so the ranking tab shows the link without a join.
alter table projects add column action_matter_id uuid;

-- Hand-maintained in data/key_ordinances.csv (citywide housing ordinances); the record's own fields are copied.
create table key_ordinances (
  record_number text primary key,
  label text not null,
  stance text not null check (stance in ('pro', 'anti', 'mixed')),
  note text not null default '',
  flag text,                          -- a ward flag the ordinance's sponsors fill (adu_opt_in), else null
  title text,
  introduction_date date,
  final_action_date date,
  outcome text
);

-- Each alder's role and roll-call vote on each key ordinance, from matter_sponsors and matter_votes.
create table alder_sponsorships (
  record_number text not null references key_ordinances (record_number) on delete cascade,
  ward int not null references wards (ward),
  alder_name text not null,
  alder_tenure_id text,
  role text not null check (role in ('sponsor', 'cosponsor', 'none')),
  vote text,
  primary key (record_number, ward)
);

-- Exhibit PDFs ("Statements and Plans", "Narrative and Plans") are scanned images; their text, read once with OCR,
-- is kept here so a nightly run only reads new attachments. Rejected or failed reads are not stored.
create table zoning_attachment_texts (
  source_url text primary key,
  record_number text not null,
  file_name text,
  text text not null,
  pages_read int not null,
  pages_total int,
  method text not null,               -- 'pdftotext' | 'ocr'
  engine text,                        -- "tesseract 5.5.2"
  extracted_at timestamptz not null default now()
);

-- The parcel cache gains two kinds: 'ward' (key = 14-digit PIN, value = ward number from the parcel universe)
-- and 'lot' (key = PIN, value = land square feet and its source), for placing and sizing rezoned sites.
alter table parcel_cache drop constraint parcel_cache_kind_check;
alter table parcel_cache add constraint parcel_cache_kind_check check (kind in ('address', 'units', 'ward', 'lot'));

-- Public read for the site on everything new; writes only via DATABASE_URL.
do $$
declare t text;
begin
  foreach t in array array['zoning_matters','zoning_actions','action_projects','key_ordinances','alder_sponsorships','zoning_attachment_texts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
