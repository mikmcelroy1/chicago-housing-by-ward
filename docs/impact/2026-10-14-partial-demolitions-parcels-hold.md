# Impact report: Three demolition rules: partial demolitions count zero, retired and shared parcels count once, large assessor 

Three demolition rules: partial demolitions count zero, retired and shared parcels count once, large assessor counts are held. A permit for only a part or an outbuilding (smokestack, garage, porch, rear addition) counts zero units and skips the assessor; the assessor lookup leaves out parcels the county retired before the lookup year and counts lots that carry the same building record once; an assessor-sourced demolition of seven or more units is held for review and not counted until a corrections row confirms it. Before is commit 6f68945 (yesterday's rules) and after is the working tree, both dry-run on the same cached permit pull, so every difference is the rules.

- **Generated:** 2026-10-14 (windows end here)
- **Before:** commit 6f68945, dry run on the same cached permit pull; generated 2026-10-14
- **After:** data/fixtures/snapshot.json; generated 2026-10-14
- **Commit:** a83d1c6 plus uncommitted changes in 6 files

## Last 12 months (2025-10-14 to 2026-10-14)

| Chicago | Before | After | Change |
| --- | ---: | ---: | ---: |
| Gross units | 5118 | 5118 | 0 |
| Lost units | 718 | 633 | -85 |
| Net units | 4400 | 4485 | +85 |
| Net per 1,000 existing units | 3.4 | 3.5 | +0.1 |
| Counted projects | 1154 | 1152 | -2 |

Wards that moved (10 of 33, largest net change first):

| Ward | Alder | Net before | Net after | Change | Rank before | Rank after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 44 | Bennett R. Lawson | -11 | 68 | +79 | 50 | 18 |
| 33 | Rossana Rodriguez Sanchez | 21 | 23 | +2 | 27 | 28 |
| 9 | Anthony Beale | 0 | 2 | +2 | 45 | 44 |
| 41 | Anthony V. Napolitano | 12 | 13 | +1 | 33 | 33 |
| 19 | Matthew J. O'Shea | 2 | 3 | +1 | 42 | 41 |
| 12 | Julia M. Ramirez | 27 | 27 | 0 | 18 | 19 |
| 11 | Nicole T. Lee | 35 | 35 | 0 | 19 | 20 |
| 14 | Jeylu B. Gutierrez | 21 | 21 | 0 | 20 | 21 |
| 37 | Emma Mitts | 28 | 28 | 0 | 21 | 22 |
| 15 | Raymond A. Lopez | 22 | 22 | 0 | 22 | 23 |

## This term (2023-05-15 to 2026-10-14)

| Chicago | Before | After | Change |
| --- | ---: | ---: | ---: |
| Gross units | 15631 | 15631 | 0 |
| Lost units | 2206 | 2075 | -131 |
| Net units | 13425 | 13556 | +131 |
| Net per 1,000 existing units | 10.4 | 10.5 | +0.1 |
| Counted projects | 3657 | 3652 | -5 |

Wards that moved (10 of 19, largest net change first):

| Ward | Alder | Net before | Net after | Change | Rank before | Rank after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 44 | Bennett R. Lawson | 244 | 323 | +79 | 17 | 14 |
| 32 | Scott Waguespack | 458 | 472 | +14 | 9 | 9 |
| 47 | Matthew J. Martin | 479 | 486 | +7 | 12 | 11 |
| 43 | Timothy R. Knudsen | 258 | 265 | +7 | 15 | 16 |
| 50 | Debra L. Silverstein | 70 | 75 | +5 | 28 | 28 |
| 38 | Nicholas Sposato | 38 | 43 | +5 | 34 | 34 |
| 10 | Peter Chico | 76 | 79 | +3 | 24 | 24 |
| 33 | Rossana Rodriguez Sanchez | 127 | 129 | +2 | 21 | 21 |
| 41 | Anthony V. Napolitano | 17 | 19 | +2 | 44 | 44 |
| 9 | Anthony Beale | 4 | 6 | +2 | 49 | 48 |

## Projects: 31 changed, 3 regrouped, 48 removed, 1 added

| Status | Ward | Address | Kind | Units before | Units after | Change | Flags after |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| removed | 44 | 421 W MELROSE ST | demolition | -79 |  | +79 |  |
| removed | 43 | 2026 N ORLEANS ST | demolition | -6 |  | +6 |  |
| changed | 32 | 3310 N LINCOLN AVE | new_construction | 15 | 21 | +6 | replaces |
| changed | 32 | 3310 N LINCOLN AVE | demolition | -9 | -3 | +6 | merged, assessor_units |
| changed | 38 | 6330 W IRVING PARK RD | demolition | -10 | -5 | +5 | assessor_units |
| changed | 32 | 2156 W WELLINGTON AVE | new_construction | -2 | 2 | +4 | replaces |
| changed | 32 | 2156 W WELLINGTON AVE | demolition | -6 | -2 | +4 | merged, assessor_units |
| changed | 32 | 2902 N SEELEY AVE | new_construction | -7 | -3 | +4 | replaces |
| changed | 32 | 2902 N SEELEY AVE | demolition | -8 | -4 | +4 | merged, assessor_units |
| removed | 47 | 4329 N ASHLAND AVE | demolition | -4 |  | +4 |  |
| changed | 47 | 1924 W CUYLER AVE | new_construction | -2 | 1 | +3 |  |
| removed | 47 | 1924 W CUYLER AVE | demolition | -3 |  | +3 |  |
| changed | 11 | 2919 S ARCHER AVE | emergency_demolition | -6 | -3 | +3 | emergency, assessor_units, subsidized |
| removed | 6 | 368 E 69TH ST | emergency_demolition | -3 |  | +3 |  |
| removed | 10 | 8757 S BALTIMORE AVE | demolition | -3 |  | +3 |  |
| changed | 9 | 11414 S PERRY AVE | demolition | -2 | 0 | +2 | not_counted, multi_permit, assessor_units |
| removed | 37 | 1239 N PINE AVE | emergency_demolition | -2 |  | +2 |  |
| added | 32 | 3018 N HOYNE AVE | demolition |  | -2 | -2 | assessor_units |
| changed | 33 | 3404 N ALBANY AVE | new_construction | -3 | -1 | +2 | replaces |
| changed | 33 | 3404 N ALBANY AVE | demolition | -4 | -2 | +2 | merged, assessor_units |
| changed | 32 | 3525 N BELL AVE | new_construction | -1 | 1 | +2 |  |
| removed | 32 | 3525 N BELL AVE | demolition | -2 |  | +2 |  |
| removed | 6 | 415 W 70TH ST | emergency_demolition | -2 |  | +2 |  |
| changed | 50 | 5620 N FRANCISCO AVE | new_construction | -2 | 0 | +2 | replaces |
| changed | 50 | 5620 N FRANCISCO AVE | demolition | -3 | -1 | +2 | merged, assessor_units |
| removed | 15 | 6214 S HERMITAGE AVE | emergency_demolition | -2 |  | +2 |  |
| removed | 15 | 6401 S WHIPPLE ST | emergency_demolition | -2 |  | +2 |  |
| changed | 43 | 1942 N ORCHARD ST | new_construction | 3 | 4 | +1 | replaces |
| changed | 43 | 1942 N ORCHARD ST | demolition | -2 | -1 | +1 | merged, assessor_units |
| changed | 2 | 2221 N MAGNOLIA AVE | new_construction | -1 | 0 | +1 | replaces |
| changed | 2 | 2221 N MAGNOLIA AVE | demolition | -2 | -1 | +1 | merged, assessor_units |
| changed | 50 | 2823 W CHASE AVE | new_construction | -1 | 0 | +1 | replaces |
| changed | 50 | 2823 W CHASE AVE | demolition | -2 | -1 | +1 | merged, assessor_units |
| removed | 27 | 2936 W ADAMS ST | demolition | -1 |  | +1 |  |
| changed | 50 | 2939 W MORSE AVE | demolition | -2 | -1 | +1 | assessor_units |
| changed | 29 | 3114 N OLCOTT AVE | new_construction | -1 | 0 | +1 | replaces |
| changed | 29 | 3114 N OLCOTT AVE | demolition | -2 | -1 | +1 | merged, assessor_units |
| changed | 19 | 3327 W 109TH ST | new_construction | -2 | -1 | +1 | replaces |
| changed | 19 | 3327 W 109TH ST | demolition | -3 | -2 | +1 | merged, assessor_units, summed_parcels |
| changed | 45 | 5359 N MELVINA AVE | demolition | -2 | -1 | +1 | assessor_units |
| changed | 41 | 5401 N MONT CLARE AVE | demolition | -2 | -1 | +1 | assessor_units |
| changed | 13 | 5659 S KILDARE AVE | emergency_demolition | -2 | -1 | +1 | emergency, assessor_units |
| changed | 50 | 6050 N BERNARD ST | demolition | -2 | -1 | +1 | assessor_units |
| changed | 41 | 7350 N OCTAVIA AVE | demolition | -2 | -1 | +1 | assessor_units |
| removed | 25 | 1111 W CERMAK RD | demolition | 0 |  | 0 |  |
| removed | 44 | 1200 W BELMONT AVE | demolition | 0 |  | 0 |  |
| removed | 21 | 12247 S HALSTED ST | emergency_demolition | 0 |  | 0 |  |
| removed | 24 | 1443 S KEELER AVE | demolition | 0 |  | 0 |  |
| removed | 26 | 1539 N PULASKI RD | demolition | 0 |  | 0 |  |
| removed | 1 | 1601 W SUPERIOR ST | demolition | 0 |  | 0 |  |
| removed | 27 | 1747 W CARROLL AVE | demolition | 0 |  | 0 |  |
| removed | 26 | 1750 N LAWNDALE AVE | emergency_demolition | 0 |  | 0 |  |
| removed | 3 | 2221 S MICHIGAN AVE | demolition | 0 |  | 0 |  |
| removed | 32 | 2249 W OAKDALE AVE | demolition | 0 |  | 0 |  |
| removed | 27 | 2500 W FULTON ST | demolition | 0 |  | 0 |  |
| removed | 28 | 2517 W CERMAK RD | emergency_demolition | 0 |  | 0 |  |
| regrouped | 12 | 2900 S DAMEN AVE | demolition | 0 | 0 | 0 | not_counted, multi_permit, assessor_units |
| removed | 33 | 2909 W IRVING PARK RD | demolition | 0 |  | 0 |  |
| removed | 28 | 3031 W POLK ST | demolition | 0 |  | 0 |  |
| removed | 11 | 3501 S NORMAL AVE | demolition | 0 |  | 0 |  |

23 more in the Excel file.

## Files

```
AGENTS.md           |    7 +
 README.md           |   12 +
 docs/METHODOLOGY.md |    1 +
 package-lock.json   | 1128 ++++++++++++++++++++++++++++++++++++++++++++++++++-
 package.json        |    4 +-
 5 files changed, 1137 insertions(+), 15 deletions(-)
```
