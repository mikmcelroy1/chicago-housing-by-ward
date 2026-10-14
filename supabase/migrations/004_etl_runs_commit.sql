-- The git commit each run used. The drift alarm compares a run with the previous one and only goes red when the
-- commit is the same: then a counted project that changed units with the same permits moved because the county's
-- or the city's data moved, not because of us. Applied with `npm run migrate -- 004_etl_runs_commit.sql`.
alter table etl_runs add column commit text;
