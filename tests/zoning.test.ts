import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressMatches,
  allowedHomes,
  direction,
  displayDistrict,
  districtFar,
  lotAreaPerUnit,
  narrativeUnitCount,
  parseAddressList,
  parseCommonAddresses,
  parseDistricts,
  parseLotSf,
  parsePermitAddress,
  parsePins,
  parseSections,
  parseTitle,
  pdUnitCount,
  readMatter,
  splitVersions,
  stageOf,
  streetKey,
} from "../scripts/lib/zoning";

const d = (s: string) => parseDistricts(s)[0];

test("titles: site addresses, application number, Type 1, map numbers", () => {
  const t = parseTitle("Zoning Reclassification Map No. 5-J at 2122-2124 N Springfield Ave and 3901-3911 W Shakespeare Ave - App No. 19990");
  assert.deepEqual(t.addresses, [
    { lo: 2122, hi: 2124, dir: "N", street: "SPRINGFIELD AVE" },
    { lo: 3901, hi: 3911, dir: "W", street: "SHAKESPEARE AVE" },
  ]);
  assert.equal(t.appNo, "19990");
  assert.equal(t.type1, false);
  assert.deepEqual(t.mapNos, ["5-J"]);
  const t1 = parseTitle("Zoning Reclassification Map No. 1-H at 1903-1905 W Huron St - App No. 22827T1");
  assert.equal(t1.type1, true);
  assert.equal(t1.appNo, "22827T1");
  const a = parseTitle("Zoning Reclassification Map Nos. 17-H and 17-I at 2400 W Balmoral Ave, 2409 W Catalpa Ave and 5412-5442 N Western Ave - App No. A-8895");
  assert.equal(a.addresses.length, 3);
  assert.equal(a.appNo, "A-8895");
  assert.deepEqual(a.mapNos, ["17-H", "17-I"]);
  assert.equal(parseTitle("Zoning Reclassification Map No. 5-F at 1854 N Howe St- App No. 22471T1").addresses[0].street, "HOWE ST");
});

test("address lists: ranges, lists, slashes, missing commas, numbered streets, no suffix", () => {
  const ranges = parseAddressList("1600, 1620, 1609-1641 and 1647 N LaSalle St 1601 N Wells St and 130 and 200 W North Ave");
  assert.deepEqual(
    ranges.map((r) => `${r.lo}-${r.hi} ${r.dir} ${r.street}`),
    ["1600-1600 N LASALLE ST", "1620-1620 N LASALLE ST", "1609-1641 N LASALLE ST", "1647-1647 N LASALLE ST", "1601-1601 N WELLS ST", "130-130 W NORTH AVE", "200-200 W NORTH AVE"],
  );
  assert.deepEqual(parseAddressList("1228-1230 N Milwaukee Ave/1210-1214 N Ashland Ave").map((r) => r.street), ["MILWAUKEE AVE", "ASHLAND AVE"]);
  assert.deepEqual(parseAddressList("5401-5459 W 64th Pl, 6435-6459 S Linder Ave").map((r) => r.street), ["64TH PL", "LINDER AVE"]);
  assert.deepEqual(parseAddressList("428-430 N Laramie and 5207-5209 W Ferdinand St").map((r) => `${r.lo}-${r.hi} ${r.street}`), ["428-430 LARAMIE", "5207-5209 FERDINAND ST"]);
  assert.deepEqual(parseAddressList("3431 and 3433 W Flournoy St").map((r) => r.lo), [3431, 3433]);
});

test("common-address lines use full words; street keys ignore spacing", () => {
  const ranges = parseCommonAddresses("SECTION 2.\n\nCommon Address(es): 2122-2124 North Springfield Avenue; 3901-3911 West Shakespeare\nAvenue\n\nSurvey");
  assert.deepEqual(ranges.map((r) => `${r.lo}-${r.hi} ${r.dir} ${r.street}`), ["2122-2124 N SPRINGFIELD AVE", "3901-3911 W SHAKESPEARE AVE"]);
  assert.equal(streetKey("N", "LaSalle St"), streetKey("N", "LA SALLE ST"));
  assert.equal(streetKey("West", "St. Louis Avenue"), "W STLOUISAVE");
  assert.deepEqual(parsePermitAddress("2129 N OAKLEY AVE"), { number: 2129, dir: "N", street: "OAKLEY AVE" });
});

test("a permit matches a range on the same side of the same street", () => {
  const r = { lo: 1401, hi: 1459, dir: "N", street: "MAGNOLIA AVE" };
  assert.equal(addressMatches(r, { number: 1403, dir: "N", street: "MAGNOLIA AVE" }), true);
  assert.equal(addressMatches(r, { number: 1404, dir: "N", street: "MAGNOLIA AVE" }), false, "even number across the street");
  assert.equal(addressMatches(r, { number: 1461, dir: "N", street: "MAGNOLIA AVE" }), false);
  assert.equal(addressMatches(r, { number: 1403, dir: "S", street: "MAGNOLIA AVE" }), false);
  assert.equal(addressMatches({ lo: 2122, hi: 2124, dir: "N", street: "SPRINGFIELD AVE" }, { number: 2122, dir: "N", street: "SPRINGFIELD AVE" }), true);
  assert.equal(addressMatches({ lo: 100, hi: 199, dir: "W", street: "X ST" }, { number: 150, dir: "W", street: "X ST" }), true, "a range spanning both sides");
});

test("districts: codes, OCR misreads, planned developments, display", () => {
  assert.equal(displayDistrict(d("RS-3 Residential Single-Unit (Detached House) District")), "RS-3");
  assert.equal(displayDistrict(d("RT4, Residenfial Two-Flat")), "RT-4");
  assert.equal(displayDistrict(d("RT-4A")), "RT-4A");
  assert.equal(displayDistrict(d("the CI-I Neighborhood Commercial District")), "C1-1");
  assert.equal(displayDistrict(d("Ml-2 Limited Manufacturing/Business Park District")), "M1-2");
  assert.equal(displayDistrict(d("M l - I Limited Manufacturing")), "M1-1");
  assert.equal(displayDistrict(d("B3-] .5 Community Shopping District")), "B3-1.5");
  assert.equal(displayDistrict(d("RMS Residential Multi-Unit District")), "RM-5");
  assert.equal(displayDistrict(d("DX-l6 Downtown Mixed-Use")), "DX-16");
  assert.equal(displayDistrict(d("RT-4.5 Residential")), "RM-4.5", "no RT-4.5 exists; RM-4.5 was meant");
  assert.equal(displayDistrict(d("Residential-Business Planned Development Number 1230, as amended, which")), "PD 1230 (amended)");
  assert.equal(displayDistrict(d("Institutional Planned Development [ ], which is hereby")), "PD (new)");
  assert.deepEqual(parseDistricts("B1-3 Neighborhood Shopping District, Planned Development 89 and RM-5 Residential Multi-Unit District").map(displayDistrict), ["B1-3", "PD 89", "RM-5"]);
  assert.equal(parseDistricts("Map No. 9-G in the area bounded by").length, 0);
});

test("density and floor area tables, as checked against Title 17", () => {
  assert.equal(lotAreaPerUnit(d("RS-3")), 2500);
  assert.equal(lotAreaPerUnit(d("RT-4")), 1000);
  assert.equal(lotAreaPerUnit(d("RM-4.5")), 700);
  assert.equal(lotAreaPerUnit(d("RM-6.5")), 300);
  assert.equal(lotAreaPerUnit(d("B3-1")), 2500);
  assert.equal(lotAreaPerUnit(d("B2-3")), 400);
  assert.equal(lotAreaPerUnit(d("DX-7")), 145);
  assert.equal(lotAreaPerUnit(d("C3-2")), 0, "C3 allows no homes");
  assert.equal(lotAreaPerUnit(d("M1-2")), 0);
  assert.equal(districtFar(d("RT-4")), 1.2);
  assert.equal(districtFar(d("B3-5")), 5);
  assert.equal(districtFar(d("DX-16")), 16);
  assert.equal(districtFar(d("M2-3")), 3);
  assert.equal(allowedHomes(d("RT-4"), 3125), 3);
  assert.equal(allowedHomes(d("RS-3"), 3125), 1);
  assert.equal(allowedHomes(d("M1-2"), 3125), 0);
  assert.equal(allowedHomes(d("RT-4"), null), null);
  assert.equal(allowedHomes(d("Residential Planned Development No. 5"), 100000), null);
});

test("direction: homes per lot first, floor area ratio second, manufacturing to anything residential is up", () => {
  assert.equal(direction([d("RS-3")], d("RT-4")), "up");
  assert.equal(direction([d("RT-4")], d("RS-3")), "down");
  assert.equal(direction([d("B3-2")], d("RM-5")), "up", "fewer square feet per home, though a lower floor area ratio");
  assert.equal(direction([d("B2-3")], d("RM-5")), "down", "same density, lower floor area ratio");
  assert.equal(direction([d("RM-5")], d("RM-5.5")), "up", "same density, higher floor area ratio");
  assert.equal(direction([d("B3-2")], d("C1-2")), "lateral");
  assert.equal(direction([d("M1-2")], d("RT-4")), "up");
  assert.equal(direction([d("M1-2")], d("B3-2")), "up");
  assert.equal(direction([d("RT-4")], d("C3-2")), "down");
  assert.equal(direction([d("M1-1")], d("M2-1")), "lateral");
  assert.equal(direction([d("M1-1")], d("M1-2")), "up");
  assert.equal(direction([d("RS-3"), d("B3-2")], d("RM-5")), "up", "an assemblage: more homes than either district");
  assert.equal(direction([d("B1-3"), d("PD 89")], d("B1-5 Neighborhood Shopping District")), "up");
  assert.equal(direction([d("DX-5")], d("Business Planned Development")), "pd");
  assert.equal(direction([d("DX-7"), d("Residential-Business Planned Development Number 1230")], d("Residential-Business Planned Development Number 1230, as amended")), "pd_amend");
  assert.equal(direction([d("B1-3"), d("Planned Development 89")], d("Planned Development 89")), "pd_amend", "the same number, without the words");
  assert.equal(direction([], d("RT-4")), "unknown");
  assert.equal(direction([d("RS-3")], null), "unknown");
});

const ORDINANCE = `City of Chicago\nOffice of the City Clerk\n\nORDINANCE\n\nBE IT ORDAINED BY THE CITY COUNCIL OF THE CITY OF CHICAGO:\n\nSECTION 1: Title 17 of the Municipal Code of Chicago, Chicago Zoning Ordinance,\nis amended by changing all the RS-3 Residential Single-Unit (Detached House) District\nsymbols and indications as shown on Map No. 5-J in the area bounded by:\nWest Shakespeare Avenue\nNorth Springfield Avenue\nA line 43 feet south of and parallel with West Shakespeare Avenue;\nThe alley next west of and parallel with North Springfield Avenue;\nto those of a RT-4 Residential Two-Flat, Townhouse and Multi-Unit District, which is\nhereby established in the area described.\n\nSECTION 2:\n\nThis ordinance shall take effect upon its passage and due publication.\n\nCommon Address(es): 2122-2124 North Springfield Avenue; 3901-3911 West Shakespeare\nAvenue\n`;

test("the rezoning sentence, in its variants", () => {
  const s = parseSections(ORDINANCE);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].from.map(displayDistrict), ["RS-3"]);
  assert.equal(displayDistrict(s[0].to!), "RT-4");
  const two = parseSections(
    "SECTION 1. That the Chicago Zoning Ordinance be amended by changing all of DX-5 Downtown Mixed-Use District symbols and indications as shown on Map 1-F in the area bounded by:\nNorth Halsted Street; West Washington Boulevard\nto those of a DX-7 Downtown Mixed-Use District.\nSECTION 2. That the Chicago Zoning Ordinance be amended by changing all of the DX-7\nDowntown Mixed-Use District and Residential-Business Planned Development Number 1230 symbols and\nindications as shown on Map 1-F in the area bounded by:\nNorth Halsted Street; West Randolph Street\nto those of Residential-Business Planned Development Number 1230, as amended, which is hereby\nestablished in the area above described.",
  );
  assert.equal(two.length, 2);
  assert.deepEqual(two[0].from.map(displayDistrict), ["DX-5"]);
  assert.equal(displayDistrict(two[1].to!), "PD 1230 (amended)");
  // "symbols as shown", "symbols and designations", no "symbols" at all, "to an", OCR "lo those of".
  for (const [text, from, to] of [
    ["amended by changing all of the B1-2 Neighborhood Shopping\n\nDistrict symbols as shown on Map No. 1-H\n\nin the area bounded by:\nThe public alley; West Grand Avenue.\n\nTo those of a B1-3 Neighborhood Shopping District, as amended\n\nSECTION 2.", "B1-2", "B1-3"],
    ["be amended by changing all Residential Business Planned Development 1420\nsymbols and designations as shown on Map No. 5-H in the area bounded by\n\nWest Webster Avenue; and North Elston Avenue,\n\nto the designation of a Residential Business Planned Development 1420, as amended,\nwhich is hereby established", "PD 1420", "PD 1420 (amended)"],
    ["is hereby amended by changing all of the RS-3 Residential Single Unit\nDistrict, as shown on Map 1-G in the area bounded by:\n\nThe Public Alley north of and parallel to West Huron Street; and North\n\nArmour Street,\n\nto an RM-4.5 Residential Multi-Unit District.\n\nSECTION 2.", "RS-3", "RM-4.5"],
    ["be ainended by changing all of the current DX7 Downlown Mixed-Use District symbols and indications as shown on Map Ntimber 1-F in the\narea bounded by:\nWesl Randolph Slreet; a line 130.15 feel west of and parallel to Norlh .lefferson\nSireel\nlo those of a Business Planned Developmenl.\nSECTION 2.", "DX-7", "PD (new)"],
    ["amended by changing the RS-3 Residential Single-Unit (Detached House) District symboLs and\nindications as shown on Map No. 1 -M in the area bounded by\nWest Race Avenue.\nto those of a RT-3.5 Residential Two-Flat, Townhouse, and M u l t i - U n i t District.\n\nSECTION 2.", "RS-3", "RT-3.5"],
  ] as const) {
    const sec = parseSections(text);
    assert.equal(sec.length >= 1, true, text.slice(0, 40));
    assert.equal(sec[0].from.map(displayDistrict).join("+"), from, text.slice(0, 40));
    assert.equal(displayDistrict(sec[sec.length - 1].to!), to, text.slice(0, 40));
  }
});

test("versions, PINs, lot size, substitutes", () => {
  const v = splitVersions("===== O2024-0008415 Ordinance.pdf =====\nfiled text\n===== SO2024-0008415 Final Ordinance.pdf =====\nfinal text\n");
  assert.equal(v.original.trim(), "filed text");
  assert.equal(v.final?.trim(), "final text");
  assert.equal(splitVersions("just one").final, null);
  assert.deepEqual(parsePins("PINs: 17-09-105-031-0000, 17-09-105-016 and 17-09-105-031-0000"), ["17091050160000", "17091050310000"]);
  assert.equal(parseLotSf("LOT AREA: 3125 square feet\nMINIMUM LOT AREA PER DWELLING UNIT : 400 square feet"), 3125);
  assert.equal(parseLotSf("Gross Site Area: 45,762 square feet\nNet Site Area: 41,422.5 square feet"), 41422);
  assert.equal(parseLotSf("no area here"), null);
});

test("unit counts: planned development tables and Type 1 narratives", () => {
  assert.equal(pdUnitCount("Maximum Floor Area Ratio:\n\n5.65*\n\nMaximum Number of Dwelling Units:\n\n10,000\n\nSubarea 1\n\n5,750\n\nSubarea 2\n\n2,000").units, 10000);
  assert.equal(pdUnitCount("Maximum Number of Dwelling Units:\n\n159 Dwelling Units\n\nMaximum Number of Dwelling Units\nin Sub-Area A:\n\n120 Dwelling Units").units, 159);
  assert.equal(pdUnitCount("Subarea B 15.56\nSubarea C 5.0\nSubarea D 0.35\nMaximum Dwelling Unit Count:\nSubarea A 0\nSubarea B 349\nSubarea C 0\nNeighborhood Shopping District").units, 349);
  assert.equal(pdUnitCount("MAXIMUM NUMBER OF DWELLING UNITS:\n\n414*\n\nMAXIMUM HOTEL KEY COUNT:\n\n414*").units, 414);
  assert.equal(pdUnitCount("Maximum Number of Dwelling Units:\n\n0\n\nMinimum Off-Street Parking Spaces:\n\n130").units, 0);
  assert.equal(pdUnitCount("The PD permits the construction of 500 dwelling units.").units, 500);
  assert.equal(pdUnitCount("nothing").units, null);
  assert.equal(narrativeUnitCount("The building will consist of approximately 980 Square Feet of commercial space on the 1st floor, 3 dwelling units on the floors 2-4. MINIMUM LOT AREA PER DWELLING UNIT : 400 square feet").units, 3);
  assert.equal(narrativeUnitCount("building containing three (3) dwelling units and onsite parking for three (3) cars").units, 3);
  assert.equal(narrativeUnitCount("Number of Dwelling Units: 6\nNumber of parking spaces: 6").units, 6);
  assert.equal(narrativeUnitCount("Residential Dwelling Units: 30").units, 30);
  assert.equal(narrativeUnitCount("The parking ratio of 22 parking spaces for 44 dwelling units").units, 44);
  assert.equal(narrativeUnitCount("Density: 982 SF per dwelling unit. The building will have 2 dwelling units.").units, 2);
  assert.equal(narrativeUnitCount("New 1055 dwelling units", 3165).units, null, "more homes than a 3,165 square foot lot could hold");
  assert.deepEqual(parsePins("PINs: " + Array.from({ length: 41 }, (_, i) => `17-09-105-${String(i).padStart(3, "0")}-0000`).join(", ")), [], "a list of dozens of PINs is not the site");
  assert.equal(narrativeUnitCount("There are no dwelling units proposed").units, 0);
  assert.equal(narrativeUnitCount("No residential dwelling units are being proposed").units, 0);
  assert.equal(narrativeUnitCount("Applicant seeks to renovate the existing building and add a second dwelling unit at the rear").units, null);
});

test("stage: passed, rejected, undecided under 180 days, stalled from 180 days", () => {
  assert.deepEqual(stageOf("passed", "2024-03-20", "2025-04-16", "2026-10-17"), { stage: "passed", stage_date: "2025-04-16", days_pending: null });
  assert.deepEqual(stageOf("withdrawn", "2024-03-20", "2024-05-01", "2026-10-17"), { stage: "rejected", stage_date: "2024-05-01", days_pending: null });
  assert.deepEqual(stageOf("pending", "2026-06-01", null, "2026-10-17"), { stage: "undecided", stage_date: "2026-06-01", days_pending: 138 });
  assert.deepEqual(stageOf("pending", "2026-04-20", null, "2026-10-17"), { stage: "stalled", stage_date: "2026-04-20", days_pending: 180 });
  assert.equal(stageOf(null, "2026-04-20", null, "2026-10-17").stage, "stalled");
});

test("readMatter: a plain map amendment, a Type 1 with a narrative, a substituted planned development", () => {
  const plain = readMatter(
    { record_number: "O2019-1376", title: "Zoning Reclassification Map No. 5-J at 2122-2124 N Springfield Ave and 3901-3911 W Shakespeare Ave - App No. 19990", full_text: ORDINANCE, attachments: [], exhibit_texts: {}, outcome: "passed", sub_status: "Passed", introduction_date: "2019-03-13", final_action_date: "2019-06-12", filing_office: "Misc.", filing_sponsor: "Misc. Transmittal" },
    "2026-10-17",
    { lot_sf: 3125 },
  );
  assert.equal(plain.address, "2122-2124 N Springfield Ave, 3901-3911 W Shakespeare Ave");
  assert.equal(plain.from_district, "RS-3");
  assert.equal(plain.to_district, "RT-4");
  assert.equal(plain.direction, "up");
  assert.equal(plain.allowed_before, 1);
  assert.equal(plain.allowed_after, 3);
  assert.equal(plain.requested_units, 2, "no stated count: the homes the rezoning added to what the lot allowed");
  assert.equal(plain.units_source, "capacity");
  assert.equal(plain.stage, "passed");
  assert.equal(plain.days_to_passage, 91);
  assert.equal(plain.sponsored_by_alder, false);
  assert.equal(plain.needs_review, false);

  const t1Text = "ORDINANCE\nis hereby amended by changing all the C1-1 Neighborhood Commercial District symbols\nand indications as shown on Map No. 11-J in the area bounded by\nthe alley next north of and parallel to West Irving Park Road,\nto those of a B2-3 Neighborhood Mixed-Use District and a corresponding uses district is\nhereby established.\n\nNARRATIVE\nThe Applicant intends to construct a new 4 story mixed use building with 3 dwelling units on the floors 2-4.\nLOT AREA: 3125 square feet\nMINIMUM LOT AREA PER DWELLING UNIT : 400 square feet\n";
  const t1 = readMatter(
    { record_number: "O2019-2657", title: "Zoning Reclassification Map No. 11-J at 3332 W Irving Park Rd - App No. 19999T1", full_text: t1Text, attachments: [], exhibit_texts: {}, outcome: "passed", sub_status: "Passed", introduction_date: "2019-04-10", final_action_date: "2019-07-24", filing_office: "Misc.", filing_sponsor: "Misc. Transmittal" },
    "2026-10-17",
  );
  assert.equal(t1.type1, true);
  assert.equal(t1.from_district, "C1-1");
  assert.equal(t1.to_district, "B2-3");
  assert.equal(t1.direction, "up");
  assert.equal(t1.approved_units, 3);
  assert.equal(t1.units_source, "narrative");
  assert.equal(t1.lot_sf, 3125);
  assert.equal(t1.allowed_after, 7);

  const pdText = "===== O2024-0008415 Ordinance.pdf =====\nSECTION 1. That the Chicago Zoning Ordinance be amended by changing all of the B1-3 Neighborhood Shopping District, Planned Development 89 and RM-5 Residential Multi-Unit District symbols and indications as shown on Map 5-F in the area bounded by: North Park Avenue; North Avenue;\nto those of the B1-5 Neighborhood Shopping District.\n\nSECTION 2. That the Chicago Zoning Ordinance be amended by changing all of the B1-5 Neighborhood Shopping District symbols and indications as shown on Map 5-F in the area bounded by: North Park Avenue;\nto those of Residential-Business Planned Development No. 89, as amended, which is hereby established.\n===== SO2024-0008415 Final Ordinance.pdf =====\nSECTION 1. That the Chicago Zoning Ordinance be amended by changing all of the B1-3 Neighborhood Shopping District, Planned Development 89 and RM-5 Residential Multi-Unit District symbols and indications as shown on Map 5-F in the area bounded by: North Park Avenue;\nto those of the B1-5 Neighborhood Shopping District.\n\nSECTION 2. That the Chicago Zoning Ordinance be amended by changing all of the B1-5 Neighborhood Shopping District symbols and indications as shown on Map 5-F in the area bounded by: North Park Avenue;\nto those of Residential-Business Planned Development No. 89, as amended, which is hereby established.\n";
  const orig = "https://x/orig.pdf";
  const fin = "https://x/final.pdf";
  const pd = readMatter(
    {
      record_number: "SO2024-0008415",
      title: "Zoning Reclassification Map No. 5-F at 1600, 1620, 1609-1641 and 1647 N LaSalle St 1601 N Wells St and 130 and 200 W North Ave - App No. 22377",
      full_text: pdText,
      attachments: [
        { file_name: "O2024-0008415 Statments and Plans.pdf", attachment_type: "Exhibits", source_url: orig },
        { file_name: "SO2024-0008415 Final Statements and Plans.pdf", attachment_type: "Exhibits", source_url: fin },
        { file_name: "O2024-0008415 Application.pdf", attachment_type: "Miscellaneous", source_url: "https://x/app.pdf" },
      ],
      exhibit_texts: { [orig]: "Maximum Dwelling Unit Count:\nSubarea A 0\nSubarea B 500\nSubarea C 0\nNet Site Area: 200,000 square feet", [fin]: "Maximum Dwelling Unit Count:\nSubarea A 0\nSubarea B 349\nSubarea C 0\nNet Site Area: 200,000 square feet" },
      outcome: "passed",
      sub_status: "Passed as Substitute",
      introduction_date: "2024-03-20",
      final_action_date: "2025-04-16",
      filing_office: "Misc.",
      filing_sponsor: "Misc. Transmittal",
    },
    "2026-10-17",
  );
  assert.equal(pd.addresses.length, 7);
  assert.deepEqual(pd.from_districts, ["B1-3", "PD 89", "RM-5"]);
  assert.equal(pd.to_district, "PD 89 (amended)");
  assert.equal(pd.direction, "pd_amend");
  assert.equal(pd.requested_units, 500);
  assert.equal(pd.approved_units, 349);
  assert.equal(pd.units_source, "exhibit");
  assert.equal(pd.substitute, true);
  assert.equal(pd.days_to_passage, 392);
  assert.equal(pd.exhibits_pending, false);
  assert.deepEqual(pd.wanted_exhibits, []);

  // The same matter before its exhibits were read: the counts are missing and the exhibits are wanted.
  const unread = readMatter({ ...{ record_number: "SO2024-0008415", title: "Zoning Reclassification Map No. 5-F at 1600 N LaSalle St - App No. 22377", full_text: pdText, attachments: [{ file_name: "O2024-0008415 Statments and Plans.pdf", attachment_type: "Exhibits", source_url: orig }], exhibit_texts: {}, outcome: "passed", sub_status: "Passed as Substitute", introduction_date: "2024-03-20", final_action_date: "2025-04-16", filing_office: "Misc.", filing_sponsor: "Misc. Transmittal" } }, "2026-10-17");
  assert.equal(unread.exhibits_pending, true);
  assert.equal(unread.wanted_exhibits.length, 1);
  assert.equal(unread.needs_review, false);

  const stalled = readMatter(
    { record_number: "O2023-1500", title: "Zoning Reclassification Map No. 9-H at 3632 N Ashland Ave - App No. 22150", full_text: ORDINANCE, attachments: [], exhibit_texts: {}, outcome: "pending", sub_status: "Referred", introduction_date: "2023-03-15", final_action_date: null, filing_office: "44", filing_sponsor: "Tunney, Thomas" },
    "2026-10-17",
  );
  assert.equal(stalled.stage, "stalled");
  assert.equal(stalled.approved_units, 0);
  assert.equal(stalled.sponsored_by_alder, true);
  assert.equal(stalled.sponsor_ward, 44);
});
