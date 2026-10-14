-- Move PostGIS out of the public schema.
--
-- 001 ran `create extension postgis` without a schema, which installed it into public. That put
-- PostGIS's spatial_ref_sys lookup table on the public REST API with the default anon/authenticated
-- write grants, and Supabase's security advisor flags it (rls_disabled_in_public). The table is owned
-- by supabase_admin, so the postgres role can neither enable RLS on it nor revoke the grants.
-- Reinstalling into Supabase's `extensions` schema takes it off the API entirely.
--
-- PostGIS is not relocatable, so this drops and re-creates it. The two geometry columns come back
-- empty: run `npm run sync-wards` right after to repopulate wards.geom (census_blocks_2020 is
-- rebuilt by load-denominator and was empty anyway). The postgres role's search_path already
-- includes `extensions`, so the unqualified st_* calls in scripts/ keep resolving.

drop index if exists wards_geom_idx;
drop index if exists census_blocks_2020_geom_idx;
drop function if exists ward_at(double precision, double precision);
alter table wards drop column if exists geom;
alter table census_blocks_2020 drop column if exists geom;

drop extension if exists postgis;
create extension postgis with schema extensions;

alter table wards add column geom extensions.geometry(MultiPolygon, 4326);
alter table census_blocks_2020 add column geom extensions.geometry(Point, 4326);
create index wards_geom_idx on wards using gist (geom);
create index census_blocks_2020_geom_idx on census_blocks_2020 using gist (geom);

-- Point-in-polygon ward check used by the ETL for every project. Pins search_path so it resolves
-- the PostGIS functions no matter who calls it.
create or replace function ward_at(lon double precision, lat double precision)
returns int language sql stable
set search_path = public, extensions
as $$
  select ward from wards where st_contains(geom, st_setsrid(st_point(lon, lat), 4326)) limit 1;
$$;
