# Methodology

This site ranks Chicago's 50 wards by **net new housing units permitted**. Every number on the site traces back to individual building permits published by the City of Chicago, and every rule used to turn a permit into a unit count is written down here. If you think a number is wrong, the permit list on each ward page shows exactly what was counted, and each project's flags say where its number came from.

## What is counted

**Headline:** net new dwelling units, by permit issue date, in the selected window, re-expressed per 1,000 existing units so wards with very different housing stock can be compared.

- **Gross units** are units created by new-construction permits, accessory dwelling units (ADUs, coach houses, basement and attic conversions), and conversions of non-residential buildings (offices, retail, warehouses) into apartments.
- **Units lost** are units removed by voluntary demolition and by deconversions, such as a three-flat turned into a single-family home.
- **Net** is gross minus lost.
- **Emergency demolitions**, meaning buildings the city orders torn down because they are derelict or dangerous, are shown but never counted against a ward. They are concentrated in disinvested neighborhoods and are not a choice the alder made.

A unit is a dwelling unit: an apartment, condo, single-family home, SRO room, or efficiency. Hotel rooms, dormitory beds, nursing home beds and shelter beds are not counted. Market-rate and subsidized units count the same.

## Why the ward, not the alder

The ranking is of the ward as a place. The alder is shown because they hold the zoning pen, but seats change hands between elections. Each project is attributed to whoever held the seat on its permit issue date, so when a ward had two alders in the selected window the row shows both, with each one's units.

Permits lag approvals. A large project permitted in an alder's first year was usually rezoned under their predecessor.

## Data

| Source | What we use |
| --- | --- |
| City of Chicago [Building Permits](https://data.cityofchicago.org/d/ydr8-5enu) | Every permit issued since May 15, 2023, the day the current ward map and council took effect |
| City of Chicago [Ward boundaries](https://data.cityofchicago.org/d/p293-wvbd) | To verify each permit's ward |
| City of Chicago [Ward Offices](https://data.cityofchicago.org/d/htai-wnw4) | Alder names and headshots |
| Cook County Assessor [parcel addresses](https://datacatalog.cookcountyil.gov/d/3723-97qp) | Which parcels sit at a demolished address |
| Cook County Assessor [parcel records](https://datacatalog.cookcountyil.gov/d/nj4t-kc8j) | Unit counts of demolished buildings, and the existing-unit denominator |
| City of Chicago [Affordable Rental Housing Developments](https://data.cityofchicago.org/d/s6ha-ppgi) | The subsidized flag on projects |
| A hand-maintained list of alder tenures | Who held each seat when, with a source for each change |

The permit data refreshes nightly. Only permits issued on or after May 15, 2023 are included, because the city records each permit's ward as of the day it was issued and the ward map changed on that date.

## How a permit becomes a unit count

The city's permit data has no unit-count field. The count is read from the permit's free-text description, which follows a loose formula ("ERECT A 4 STORY, 9 DWELLING UNIT MASONRY BUILDING").

### New construction permits

1. Permits for tents, stages, cranes, scaffolding, EV chargers, antennas and other temporary or non-building work are dropped. The city files festival tents under "new construction"; they are about a quarter of that category.
2. Garages, sheds, fences, decks and porches with no dwelling are dropped.
3. The unit count is the number before the words UNIT, DWELLING UNIT, D.U. or FLAT. A stated total ("134 TOTAL UNITS") wins. "SINGLE FAMILY RESIDENCE" counts as one unit. A coach house or ADU counts as one.
4. Large projects produce several permits: caissons, foundation, superstructure, a full permit, and revisions. All permits at the same parcel or address within 36 months are grouped into one project. The project's units come from the latest full permit that states a count. A revision that states a reduction adjusts the count.
5. A permit with a residential keyword but no readable unit count goes to a manual review queue and does not count until a person has read it.

### Replacements

More than half of all voluntary demolitions are followed by new construction at the same address, usually within weeks. When a demolition and a new-construction permit fall at the same address or parcel within two years of each other, they are shown as one replacement project, dated at the new-construction permit, with the demolished units subtracted. A house torn down for a bigger house counts zero. A three-flat torn down for a house counts minus two. A frame house torn down for a six-flat counts plus five. The demolition still appears in the ward's list, marked as merged into the rebuild. Until the rebuild permit is issued, a demolition stands on its own as a loss.

### Renovation permits

- "CONVERT FROM 3 TO 4 UNITS" adds one. "DECONVERT 3 UNITS TO SINGLE FAMILY" removes two. "COMBINE 2 UNITS" removes one.
- An ADU, coach house or basement conversion adds one, or the stated number.
- Legalizing an existing unit adds one; removing an illegal unit removes one.
- A conversion of an office, store, warehouse or other non-residential space states its unit count, which is added.
- Any other renovation counts zero, including a full gut rehab of an occupied or vacant building.

### Demolition permits

- A demolition marked EMERGENCY or court-ordered is excluded from the count and shown separately.
- Newer demolition permits state the residential unit count, and that count is believed.
- A permit that takes down only a part or an outbuilding, such as a smokestack, chimney, canopy, garage, porch or rear addition, with no dwelling named, or that says partial, portion or interior, counts zero units and is never sent to the assessor.
- For permits that do not, the building is looked up in Cook County Assessor records for the year before the demolition. When the permit lists parcel numbers, those parcels are used. When it does not, every parcel the assessor files at the permit's address is used, and their units are added together: a building on a double lot, or an assemblage of several lots, is one demolition. A lot the assessor stopped listing at that address more than a year before the lookup year is ignored, because the county renumbers lots and the old number would count the same building twice. Lots that carry the same building record, which is how the assessor files one building standing on several lots, are counted once. Single-family and condo classes count one; two-to-six-unit buildings use the assessor's apartment count; larger apartment buildings use the assessor's commercial valuation unit count; commercial, industrial and vacant classes count zero.
- Several demolition permits at one address or parcel within six months are one demolition. Each parcel counts once however many permits mention it. When the permits state counts, distinct buildings are added and a re-issued permit with the same wording counts once. When a group mixes permits that state a count with ones that do not, the larger of the stated and assessor totals is used.
- A demolition whose parcel cannot be found counts two units if the description says "multi-unit", one if it says "residence", and is flagged for review.
- A building the permit calls mixed use but the assessor files as commercial, with no apartments, counts zero and is flagged for review.
- A demolition of seven or more units read from assessor records is held: shown, flagged, and not counted until a person confirms it in the corrections file. A count the permit states is never held.

## The rank

For the selected window, per ward:

- gross = units added by new construction, ADUs and conversions
- lost = units removed by demolition and deconversion
- net = gross minus lost
- rate = net divided by the ward's existing housing units, times 1,000

The default rank orders wards by rate. The toggle orders by raw net units. Ties break on net, then gross. Rank change compares the selected window to the window of the same length immediately before it, and is hidden when that earlier window would start before May 15, 2023.

The existing-unit denominator is built from Cook County Assessor parcels: single-family homes and condos count one each, two-to-six-unit buildings use the assessor's apartment count, and larger buildings use the assessor's commercial valuation unit count. Equal-population wards do not have equal housing stock: downtown wards have roughly twice the units per resident of family-heavy wards on the Southwest Side, so population is not used as the denominator.

A ward with fewer than three projects in the window carries a low-sample marker. Its rank still computes.

The "completed only" toggle restricts the count to projects whose primary permit the city has marked COMPLETE. A demolition completes in weeks; a new building takes one to three years. In any recent window this view therefore keeps most losses and drops most gains, and ranks look much worse than they are. It is only informative for windows that ended a few years ago.

The dollar figure on each project is the estimated construction cost the applicant reported on the permit. It is not the permit fee. Applicants have reason to report low, so treat it as a floor.

A handful of permits since 2023 carry no ward and no coordinates and cannot be placed. They are excluded and the count is stated in the site footer.

## Flags

Each project in a ward's list carries flags that say where its number came from, or why it is not counted. Tap a flag on the site for its meaning; the same text is here.

### Emergency

A city-ordered demolition of a derelict or dangerous building. Shown, never counted against the ward.

### Merged into rebuild

A demolition followed by new construction at the same address within two years. Its units are subtracted on the new building's row and not counted here.

### Not counted

Not included in the ward's totals: the unit count is zero or could not be read.

### Needs review

The rules were not sure about this permit. It is in the public review queue, and the count shown stands until a person corrects it.

### Replaces units

A building demolished at this address within two years of this permit. Its units are subtracted from this row.

### Multiple permits

Several permits at this address or parcel were combined into one project, so nothing is counted twice.

### Assessor count

The permit did not state a unit count. It comes from Cook County Assessor records for the parcel in the year before the demolition.

### Several parcels

The assessor files more than one parcel under this address. Their units were added together.

### No parcel found

No Cook County parcel matched this address, so the count is taken from the permit's wording: 2 for multi-unit, 1 for residence, otherwise 0.

### Mixed use, no units

The permit calls the building mixed use, but the assessor files it as commercial with no apartments. Counted as zero and flagged for review.

### Held for review

A demolition of seven or more units read from assessor records. Shown but not counted until a person confirms it in the corrections file.

### Corrected

A person read this permit and recorded the count in the public corrections file.

### Subsidized

Matches a development on the city's Affordable Rental Housing list.

### Ward mismatch

The permit's coordinates fall in a different ward from the one the city recorded. The city's ward is used.

## Known limitations

- Permitted is not built. Some permits expire unbuilt.
- The rules are stricter with losses than with gains. A demolition must name a dwelling, survive the assessor checks and, at seven units or more, a review before it counts; a new building counts on the day its permit is issued, from the largest unit count in its description. The net figure leans optimistic by that difference.
- Unit parsing takes the largest number in a description, so a two-unit building with a one-unit coach house in the same permit counts two until reviewed.
- A demolition whose rebuild permit has not been issued yet counts as a loss until it is; once the rebuild appears, the loss moves to the rebuild's date. Rankings for recent windows can therefore shift a little as rebuild permits arrive.
- Assessor records lag about a year, so a parcel demolished and rebuilt inside a year can read as its old use.
- When the assessor files several parcels under one address, all of them count when that address is demolished, even if only one building came down. Parcels sharing an address are almost always one property, and the review queue catches the rest.
- Two identical buildings at one address, same class, size and year built, read as one, because that is also how the assessor files one building on several lots.
- The existing-unit denominator is a fixed snapshot; fast-growing wards look slightly better than they are.
- Office-to-residential conversions count only when the permit states a unit count.
- Vacancy is invisible both ways: a derelict building rehabbed back into use counts zero, and a building that falls vacant without a demolition permit counts zero.
- The ward on each permit is the city's; where the permit's coordinates fall in a different ward it is flagged, not corrected.
- Permits lag approvals, so a new alder's first year reflects the predecessor's zoning decisions.

## Corrections

Permits the rules cannot read go to a review queue. A person reads the permit and records the right count in a corrections file that the nightly run applies. The queue and the corrections file are in the public repository. A correction on any permit of a multi-permit demolition settles that demolition: corrected permits are added and the others contribute nothing, so correct every permit in the group. A held demolition counts once its permit has a corrections row.
