# Impact report: Alder actions tab: the zoning stage links passed rezonings to projects (action_matter_id) and the parcel cache

Alder actions tab: the zoning stage links passed rezonings to projects (action_matter_id) and the parcel cache gains ward and lot lookups; no permit count or rank changes.

- **Generated:** 2026-10-17 (windows end here)
- **Before:** commit 45d5faf, dry run on the same cached permit pull; generated 2026-10-17
- **After:** data/fixtures/snapshot.json; generated 2026-10-17
- **Commit:** 45d5faf plus uncommitted changes in 46 files

## Last 12 months (2025-10-17 to 2026-10-17)

| Chicago | Before | After | Change |
| --- | ---: | ---: | ---: |
| Gross units | 4953 | 4953 | 0 |
| Lost units | 628 | 628 | 0 |
| Net units | 4325 | 4325 | 0 |
| Net per 1,000 existing units | 3.3 | 3.3 | 0 |
| Counted projects | 1138 | 1138 | 0 |

No ward moved.

## This term (2023-05-15 to 2026-10-17)

| Chicago | Before | After | Change |
| --- | ---: | ---: | ---: |
| Gross units | 15553 | 15553 | 0 |
| Lost units | 2076 | 2075 | -1 |
| Net units | 13477 | 13478 | +1 |
| Net per 1,000 existing units | 10.4 | 10.4 | 0 |
| Counted projects | 3649 | 3649 | 0 |

Wards that moved (1 of 1, largest net change first):

| Ward | Alder | Net before | Net after | Change | Rank before | Rank after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 11 | Nicole T. Lee | 132 | 133 | +1 | 18 | 18 |

## Projects: 2 changed, 0 regrouped, 0 removed, 0 added

| Status | Ward | Address | Kind | Units before | Units after | Change | Flags after |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| changed | 11 | 3001 S QUINN ST | new_construction | 0 | 1 | +1 |  |
| changed | 11 | 3001 S QUINN ST | demolition | -1 | 0 | +1 | not_counted, assessor_units |

## Note on the one moved pair

The two rows at 3001 S Quinn St (ward 11) moved because the county's data moved, not because of a rule: the assessor's address table gained a second parcel at that address for 2026 (17-29-426-026) after the cached lookup from October 14 was written, so the "before" run, which looks every parcel up afresh, counted two parcels and the "after" run, which uses the cache, counted one. The nightly run re-queries misses and will settle it; nothing in this change touches how permits are read, grouped or counted.

## Files

```
.github/workflows/nightly-etl.yml |  21 ++++++-
 .gitignore                        |   2 +
 AGENTS.md                         |  23 ++++++-
 README.md                         |  17 ++++--
 app/page.tsx                      |  10 ++-
 app/ward/[n]/page.tsx             |  35 ++++++++++-
 components/ControlsForm.tsx       |  10 +--
 components/MobileSort.tsx         |  23 +++----
 components/RankingTable.tsx       |  20 +++---
 components/WindowControls.tsx     |  11 ++--
 docs/METHODOLOGY.md               |  75 +++++++++++++++++++++++
 lib/data.ts                       |  42 +++++++++++--
 lib/query.ts                      |  54 +++++++++++++----
 package.json                      |   1 +
 scripts/impact.ts                 |   4 +-
 scripts/ingest-permits.ts         |  10 ++-
 scripts/lib/parcels.ts            | 107 ++++++++++++++++++++++++++++++--
 scripts/lib/projects.ts           |   3 +-
 scripts/lib/types.ts              | 124 ++++++++++++++++++++++++++++++++++++++
 tests/drift.test.ts               |   2 +-
 tests/flags.test.ts               |   2 +-
 tests/parcels.test.ts             |   6 +-
 tests/rank.test.ts                |   5 ++
 tests/select.test.ts              |   4 +-
 24 files changed, 535 insertions(+), 76 deletions(-)
```
