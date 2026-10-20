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
| City Clerk [eLMS](https://api.chicityclerkelms.chicago.gov) Council matters, via the Chicago Budget project's nightly copy | Zoning reclassification ordinances since 2019 and the key housing ordinances: titles, texts, outcomes, sponsors, roll calls, exhibits |
| Cook County Assessor [parcel universe](https://datacatalog.cookcountyil.gov/d/nj4t-kc8j) and improvement records | Which ward a rezoned site sits in, and its lot size |
| [Title 17](https://codelibrary.amlegal.com/codes/chicago/latest/chicagozoning_il/0-0-0-48935), the Chicago Zoning Ordinance | Minimum lot area per home and floor area ratio by district, for direction and allowed homes |

The permit data refreshes nightly. Only permits issued on or after May 15, 2023 are included, because the city records each permit's ward as of the day it was issued and the ward map changed on that date.

## How a permit becomes a unit count

The city's permit data has no unit-count field. The count is read from the permit's free-text description, which follows a loose formula ("ERECT A 4 STORY, 9 DWELLING UNIT MASONRY BUILDING").

### New construction permits

1. Permits for tents, stages, cranes, scaffolding, EV chargers, antennas and other temporary or non-building work are dropped. The city files festival tents under "new construction"; they are about a quarter of that category.
2. Garages, sheds, fences, decks and porches with no dwelling are dropped.
3. The unit count is the number before the words UNIT, DWELLING UNIT, D.U. or FLAT. A stated total ("134 TOTAL UNITS") wins. "SINGLE FAMILY RESIDENCE" counts as one unit. A coach house or ADU counts as one.
4. Large projects produce several permits: caissons, foundation, superstructure, a full permit, and revisions. All permits at the same parcel or address within 36 months are grouped into one project. The project's units come from the latest full permit that states a count. A revision that states a reduction adjusts the count. A project whose only permits so far are phases, such as caissons or foundations, counts from them and carries a phase-permit flag until the full permit arrives. When that full permit is issued as a renovation permit, as happens when an existing building is converted and extended, it joins the project and sets the count instead of counting a second time.
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

Every page opens on the current council term, from May 15, 2023 to today; the other periods are a click away. A `completed=1` parameter in the address restricts the count to projects whose primary permit the city has marked COMPLETE; it has no control on the page because it misleads: a demolition completes in weeks and a new building takes one to three years, so in any recent window it keeps most losses and drops most gains.

The dollar figure on each project is the estimated construction cost the applicant reported on the permit. It is not the permit fee. Applicants have reason to report low, so treat it as a floor.

A handful of permits since 2023 carry no ward and no coordinates and cannot be placed. They are excluded and the count is stated in the site footer.

## Alder actions

The permit ranking measures where the market builds. The **Alder actions** tab measures what the alder did about it: the rezonings and planned developments they let through, the ones that stalled, the downzonings they sponsored, the ADU opt-in, and their part in citywide housing ordinances. Its unit of credit is a City Council action in the ward during the alder's tenure. Zoning map amendments pass or die on the local alder's word (aldermanic prerogative), so a passed amendment is the alder's yes and a stalled one is their no, or at least not yet.

### What counts as an alder action

Every zoning reclassification ordinance in the City Clerk's record since January 1, 2019, read from the [Chicago Budget](https://github.com/mikmcelroy1/chicago-budget) project's nightly copy of the Clerk's eLMS data. Matters from 2019 are loaded, though permits before May 2023 are not ranked, so a rezoning that preceded a 2023 permit by a few years is still linked to it.

| Action | What it is | Read as |
| --- | --- | --- |
| Zoning map amendment, passed | A rezoning of one site, including Type 1 site-plan rezonings | The alder's yes |
| Planned development, passed or amended | A negotiated zoning for a large site, usually a tower or a campus | The alder's yes on the biggest projects |
| Zoning map amendment, stalled | Introduced but pending for 180 days or more | The alder's no, or not yet. Most rejections never reach a vote; they sit |
| Downzoning | A map amendment to a district that allows fewer homes, usually sponsored by the alder | The alder removing capacity |
| ADU opt-in | An ordinance opting the ward into the 2025 accessory dwelling unit rules | The alder adding capacity by right |
| Key housing ordinances | Citywide housing rules from a short hand-kept list (`data/key_ordinances.csv`) | The alder's position when it costs them nothing locally, read from sponsorship, since Council votes on these pass 46-0 to 49-0 |

Not an action: a permit (the market's act, on the permits tab), a landmark designation, and anything said at a community meeting. A private application arrives as a "Misc. Transmittal" from the Zoning Administrator, so the alder is not its sponsor; support is read from passage. Applications filed from an alder's ward office (an "A" application number) are the alder's own.

An application pending less than 180 days is **undecided**: shown in the ward's list with the days since filing, and left out of every count. Pending 180 days or more is **stalled**: counted as requested, not approved. Passed, filed, withdrawn and failed are settled. The 180 days is about three times the median time from filing to passage (56 days).

### Reading a zoning ordinance

Every map amendment follows one sentence: "the Chicago Zoning Ordinance be amended by changing all the B3-2 Community Shopping District symbols and indications as shown on Map No. 9-G in the area bounded by ... to those of a B2-3 Neighborhood Mixed-Use District." The reading takes these from the title and that sentence:

1. **Site.** From the title: "at 3724 W Le Moyne St" or a range "at 1401-1459 N Magnolia Ave". A range with both ends odd, or both even, is one side of the street. When the title gives no address, the ordinance's own "Common Address" line is used.
2. **Application number and Type 1.** "App No. 23187T1": a number means a private application; the T1 suffix means a Type 1 rezoning bound to a site plan; an "A" number is the alder's own filing.
3. **From and to district.** The district after "changing all the" and after "to those of". An ordinance with several sections (first to a plain district, then to a planned development) ends in the last section's district, and "to those of a B3-2 then to Planned Development 1150, as amended" ends in the last district named. Letters that a scanner misreads inside a code ("CI-I" for C1-1, "RMS" for RM-5, "B38-2" for B3-2, "RS-8" for RS-3) are corrected; a code no district has (RT-4.5) is read as the one meant (RM-4.5). When the scanner garbles a code beyond repair ("83-1 Community Shopping District", "R'r-4 Residential Two-Flat, Townhouse and Multi-Unit District"), the district's family is read from the name the ordinance spells out and the dash number from the text just before it; a name with no number, or a code typed without its dash number ("B1, Neighborhood Shopping District"), is no district, and the matter goes to review. A substitute whose scan lost the from-district uses the filing's, and the reverse. An ordinance that names no from-district at all ("changing all the Community Shopping District symbols") takes it from the application form bound into the record ("Present Zoning District: B3-3"), and a bare "Planned Development No. 1449" takes its kind from wherever the record names it. The sentence is read in the spellings the scans give it ("changmg", "those o f a", "tho.se ofa", "tb those", "to that of an"), with the to-clause typed as its own section ("SECTION 2: To those of ..."), and with "to those of" dropped by the typist when the new district stands alone before the next section.
4. **Direction.** The two districts are compared on how many homes they allow per square foot of lot (Title 17's minimum lot area per unit); when that is equal, or neither allows homes, on floor area ratio. More homes is an **upzoning**, fewer a **downzoning**, the same a **lateral** change. A manufacturing or C3 district allows no homes, so leaving one for any residential or mixed district is up. A new planned development is its own direction; so is an amendment of an existing one, including one named in any section of the ordinance. Leaving a planned development for a plain district: a business, commercial, institutional, industrial, manufacturing, waterway or transportation planned development allowed no homes, so that is up when the new district allows homes and lateral when it does not; a residential or mixed-use planned development allowed homes, but how many is not in the ordinance, so that is down when the new district allows none and otherwise unknown; a planned development whose kind the record does not name is unknown. A site spanning several districts compares each: more homes than some allowed and fewer than others is lateral.
5. **Ward.** The site's street numbers are resolved through the Cook County Assessor's address table to parcels, and the parcels to the ward the parcel universe places them in under the 2023 map. When no parcel resolves, the permits at the same address decide; then the sponsoring alder's ward; otherwise the matter goes to review and is left out of the ranking.
6. **Homes requested and approved.** For a planned development, the "Maximum Dwelling Unit Count" line of its bulk table: the "Statements and Plans" exhibit as filed gives requested, the final one gives approved; a matter with no substitute has one number for both. For a Type 1 rezoning, the unit-count rules the permit classifier uses are run on the narrative ("a new 4 story mixed use building with 3 dwelling units"), with a labeled total ("Residential Dwelling Units: 30") winning over loose mentions and a number too large for the lot ignored. These exhibits are scanned images, read with OCR a few dozen per night; until an exhibit has been read the matter is marked and the capacity figure below stands in. Older ordinances carry the application form, whose narrative is read the same way for any rezoning. A map amendment that states no count: requested and approved are the homes the rezoning added to what the rules already allowed on the lot (step 7). A planned development's amendment restates the PD's whole bulk table, so where the PD's earlier approval is in the record the amendment approves only the difference. A downzoning requests and approves nothing. Missing is allowed; it goes to the review queue, never guessed. A person's reading of a matter the parser got wrong goes in `data/zoning_overrides.csv` and wins.
7. **Homes allowed before and after.** The lot's size (the ordinance's own "lot area" or "net site area", else the assessor's land square feet for the parcels) divided by each district's minimum lot area per home, before and after. The difference is the homes the rezoning added to, or removed from, what the rules allow. Planned developments use the approved count as the after.
8. **Days pending.** Today minus the introduction date for anything not settled; for a passed substitute, the days from filing to passage, shown as context and never ranked.

The density and floor-area tables are Title 17's as published on October 17, 2026: minimum lot area per home RS-1 6,250, RS-2 5,000, RS-3 2,500, RT-3.5 1,250, RT-4 1,000, RM-4.5 700, RM-5 and RM-5.5 400, RM-6 and RM-6.5 300 square feet; business and commercial districts by dash number, -1 2,500, -1.5 1,350, -2 1,000, -3 400, -5 200; downtown districts -3 400, -5 200, -7 145, -10 115, -12 115, -16 100. Floor area ratios: RS-1 0.5, RS-2 0.65, RS-3 0.9, RT-3.5 1.05, RT-4 1.2, RM-4.5 1.7, RM-5 2.0, RM-5.5 2.5, RM-6 4.4, RM-6.5 6.6; business, commercial and manufacturing dash -1 1.2, -1.5 1.5, -2 2.2, -3 3.0, -5 5.0; downtown districts carry their ratio in the dash number. Transit-served and ADU reductions are not applied.

When terms change in committee a substitute ordinance replaces the original and the Clerk keeps both versions on the one record. Requested homes come from the filing, approved homes from the substitute, and the ward page shows both with the units cut and the days from filing to passage. These are context, never part of the ranking: an alder who negotiates before filing leaves no cut in the record.

### Linking approvals to permits

A passed action links to a permit project when the project's address falls inside the action's address range on the same side of the same street, or the project's parcel is one the ordinance names, and the permit was issued after the action passed, up to four years later. A parcel match beats an address match. Several projects can link to one action; a project links to at most one action, the latest that passed before its permit. Only new construction, ADU and conversion projects link. The permit's units are then the approval's **homes permitted so far**: the follow-through on the alder's yes. A project linked to a downzoning is shown but not counted.

Most housing in Chicago is by right and never crosses the alder's desk in the year it is permitted. The share that needed a rezoning is a floor on the alder's hand, not a measure of it: by-right capacity is the product of past zoning decisions, and a denial chills the next application, which no record shows.

### The alder actions rank

For the selected period, per ward. Settled matters select on their final-action date, pending ones on their introduction date.

- **Homes approved per 1,000** = homes approved by the rezonings and planned developments that passed in the period, divided by the ward's existing housing units, times 1,000. The default sort.
- **Permitted so far** = of the homes approved by the rezonings and planned developments that passed in the period, those in a building permit issued since, whatever the permit's date. A permit is not a building, and whether an approval becomes a permit is the developer's move; the column is the follow-through on the headline, not a score.
- **Homes requested** = homes asked for in every settled application introduced in the period: passed, stalled or withdrawn.
- **Approval rate** = approved divided by requested, among those same applications, after adding a typical ward's volume of homes at the citywide rate to both sides: (approved + k × citywide rate) / (requested + k), where k is the median ward's requested homes in the period. One approved project in a quiet ward then lands near the citywide rate instead of at 100%. Hover a cell for the raw rate and the application count.
- **Allowed homes added** = the sum over passed rezonings of homes allowed after minus before, where both are known; downzonings count against.
- **Stalled** = applications introduced in the period pending 180 days or more.
- **ADU** = opted in, partial or none. Opted in is read from the ordinances: a ward whose alder sponsored or co-sponsored an opt-in ordinance on the key list carries the flag, with the ordinance as its source; the hand-kept flag file covers the pilot areas.
- **Sponsorships** = pro-housing ordinances on the key list, dated in the period, that the alder sponsored or co-sponsored.

Rank 1 is the highest value of the sorted column, as on the permits tab; ties break on homes approved, then ward number. Rank change compares the period to the equal-length period before it. The tab opens on the current council term, because a year holds too few settled applications per ward. A ward with fewer than five settled applications in the period carries the low-sample marker. Rows show the alder in office on each action's date, so a ward that changed hands shows both, split. Matters that could not be placed in a ward are left out of every ward's numbers and counted in the footnote.

### Zoning action markers

On the ward page, each matter shows its direction (upzoning, downzoning, lateral, planned development, PD amendment, or not read), whether it is a Type 1 rezoning, and where it stands (passed on a date, undecided with the days since filing, stalled with the days, or withdrawn, filed or failed). **Needs review** means the parser could not read something it needs; what it did read is under "What was read", and the matter is in the public review queue (`data/zoning-review-queue.csv`). **Exhibits not read yet** means the scanned statements or narrative wait for OCR, so the count shown may be a capacity figure for now. Every matter links to its record on Councilmatic, and each permit it led to is listed under it.

Matters a person has read, with the agreed reading, are kept in `data/zoning_golden.csv`; the parser is tested against them on every change and the nightly run goes red when one disagrees.

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

### Phase permit

Counted from a caissons or foundation permit. No full building permit has been issued at this parcel or address yet, so the count is read from the phase permit's description.

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
- Alder actions: projects that never applied are invisible. An alder who kills proposals in the community meeting leaves no record, so every approval rate is an upper bound: applications are usually filed only once the alder is on board.
- Alder actions: how an alder runs the process shapes the record. One who makes the developer negotiate before filing shows no cut and a fast passage; one who negotiates in committee shows the cut and the delay.
- Alder actions: aldermanic prerogative is a norm, not a rule. The Zoning Committee has overridden a local alder a handful of times since 2021, so a passed amendment is almost always the alder's yes, not always.
- Alder actions: a stall is ambiguous. Applicants withdraw, revise or run out of money; a matter pending 180 days is not proof the alder blocked it.
- Alder actions: requested and approved homes depend on scanned exhibits read with OCR, a few dozen per night, and a share lands in the review queue. Until an exhibit is read, the capacity the new zoning allows stands in.
- Alder actions: a lot's size comes from the ordinance when it states one, else from assessor records, which have none for vacant land; allowed homes are then unknown and left out of that column.
- Alder actions: address ranges do not always contain the permit's address, for example a corner building permitted on the side street. Unmatched approvals stay visible as approvals with no linked project.

## Corrections

Permits the rules cannot read go to a review queue. A person reads the permit and records the right count in a corrections file that the nightly run applies. The queue and the corrections file are in the public repository. A correction on any permit of a multi-permit demolition settles that demolition: corrected permits are added and the others contribute nothing, so correct every permit in the group. A held demolition counts once its permit has a corrections row. Every permit a person has checked is kept, with its agreed answer, in a public list that is tested on every change to the rules and on every nightly run, so a building that has been checked cannot drift.
