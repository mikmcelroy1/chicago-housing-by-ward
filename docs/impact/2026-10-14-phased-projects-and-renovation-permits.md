# Impact report: A phased project's renovation permit joins it instead of counting twice

A phased project's renovation permit joins it instead of counting twice. A new-construction project whose only permits are phases (caissons, foundation) now takes its count from a renovation permit at the same parcel or address within 36 months, which is how an existing building converted and extended gets its full permit; the renovation no longer counts again on its own. Projects still counted from a phase permit alone carry a new phase-permit flag. Also: a parenthetical (D.U.) after the unit word no longer hides a from-to conversion. Before is the previous commit and after is the working tree, both dry-run on the same cached permit pull.

- **Generated:** 2026-10-14 (windows end here)
- **Before:** commit ef26071, dry run on the same cached permit pull; generated 2026-10-14
- **After:** data/fixtures/snapshot.json; generated 2026-10-14
- **Commit:** ef26071 plus uncommitted changes in 8 files

## Last 12 months (2025-10-14 to 2026-10-14)

| Chicago | Before | After | Change |
| --- | ---: | ---: | ---: |
| Gross units | 5118 | 5054 | -64 |
| Lost units | 633 | 633 | 0 |
| Net units | 4485 | 4421 | -64 |
| Net per 1,000 existing units | 3.5 | 3.4 | 0 |
| Counted projects | 1152 | 1151 | -1 |

Wards that moved (3 of 3, largest net change first):

| Ward | Alder | Net before | Net after | Change | Rank before | Rank after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Daniel La Spata | 425 | 363 | -62 | 3 | 4 |
| 32 | Scott Waguespack | 241 | 239 | -2 | 5 | 5 |
| 28 | Jason C. Ervin | 309 | 309 | 0 | 4 | 3 |

## This term (2023-05-15 to 2026-10-14)

| Chicago | Before | After | Change |
| --- | ---: | ---: | ---: |
| Gross units | 15631 | 15553 | -78 |
| Lost units | 2075 | 2075 | 0 |
| Net units | 13556 | 13478 | -78 |
| Net per 1,000 existing units | 10.5 | 10.4 | -0.1 |
| Counted projects | 3652 | 3649 | -3 |

Wards that moved (5 of 5, largest net change first):

| Ward | Alder | Net before | Net after | Change | Rank before | Rank after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Daniel La Spata | 670 | 608 | -62 | 5 | 5 |
| 48 | Leni Manaa-Hoppenworth | 529 | 518 | -11 | 12 | 12 |
| 32 | Scott Waguespack | 472 | 470 | -2 | 9 | 9 |
| 36 | Gilbert Villegas | 131 | 129 | -2 | 19 | 19 |
| 24 | Monique L. Scott | 334 | 333 | -1 | 7 | 7 |

## Projects: 1 changed, 5 regrouped, 5 removed, 1 added

| Status | Ward | Address | Kind | Units before | Units after | Change | Flags after |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| removed | 1 | 2938 W FULLERTON AVE | new_construction | 62 |  | -62 |  |
| removed | 48 | 6212 N WINTHROP AVE | new_construction | 11 |  | -11 |  |
| removed | 36 | 2620 W HURON ST | new_construction | 3 |  | -3 |  |
| changed | 32 | 1427 W BELMONT AVE | conversion | 4 | 2 | -2 |  |
| added | 36 | 1334 N RIDGEWAY AVE | conversion |  | 1 | +1 |  |
| removed | 24 | 4043 W CULLERTON ST | new_construction | 1 |  | -1 |  |
| removed | 40 | 2522 W WINNEMAC AVE | new_construction | 0 |  | 0 |  |
| regrouped | 40 | 2522 W WINNEMAC AVE | deconversion | -1 | -1 | 0 | multi_permit |
| regrouped | 36 | 2620 W HURON ST | deconversion | -2 | -2 | 0 | multi_permit |
| regrouped | 1 | 2938 W FULLERTON AVE | conversion | 62 | 62 | 0 | multi_permit |
| regrouped | 24 | 4043 W CULLERTON ST | adu | 1 | 1 | 0 | multi_permit |
| regrouped | 48 | 6212 N WINTHROP AVE | conversion | 3 | 3 | 0 | multi_permit, subsidized |

## Files

```
components/FlagChips.tsx |  2 ++
 docs/METHODOLOGY.md      |  6 +++++-
 scripts/lib/flags.ts     | 10 +++++++++
 scripts/lib/projects.ts  | 53 +++++++++++++++++++++++++++++++++---------------
 scripts/lib/rules.ts     |  1 +
 scripts/lib/types.ts     |  1 +
 tests/projects.test.ts   | 41 +++++++++++++++++++++++++++++++++++++
 tests/rules.test.ts      |  7 +++++++
 8 files changed, 104 insertions(+), 17 deletions(-)
```
