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
  pdKindFromText,
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

test("districts the scanner garbled: codes fixed, names with a dash number, planned developments in odd spellings", () => {
  for (const [text, want] of [
    ["83-1 Community Shopping District", "B3-1"],
    ["332 Community Shopping District", "B3-2"],
    ["Bl-lNeighborhood Shopping District", "B1-1"],
    ["R'r-4 Residential Two-Flat, Townhouse and Multi-Unit District", "RT-4"],
    ["RIv'f-6 Residential Multi-Unit District", "RM-6"],
    ["C l - L Neighborhood Commercial District", "C1-1"],
    ["lVll-2 Limited iVfanufacturing/Business Park District", "M1-2"],
    ["aB2-3 Neighborhood Mixed-Use District", "B2-3"],
    ["theRM-5 Residential Multi-Unit District", "RM-5"],
    ["B3 — 2 Community Shopping District", "B3-2"],
    ["M1--2 Limited Manufacturing/Business Park District", "M1-2"],
    ["C2-]1 Motor Vehicle-Related Commercial District", "C2-1"],
    ["RS-^2 Residential Single-Unit (Detached House) District", "RS-2"],
    ["DX-.5 Downtown Mixed-Use District", "DX-5"],
    ["B38-2 Community Shopping District", "B3-2"],
    ["RS-8 Residential Single-Unit (Detached House) District", "RS-3"],
    ["RM-S Residential Multi-Unit District", "RM-5"],
    ["RM-S5 Residential Multi-Unit District", "RM-5"],
    ["RSS Residential Single-Family (Detached House) District", "RS-3"],
    ["B1-! Neighborhood Shopping District", "B1-1"],
    ["Rt-4 Residential Two-Flat, Townhouse and Multi-Unit District", "RT-4"],
    ["R32, Residential Single-Unit (Detached House) District", "RS-2"],
    ["T-Transportation District", "T"],
    ["T; Transportation District", "T"],
    ["Planned Manufacturing District Number 11(A)", "PMD 11"],
    ["Residential Business Plaimed Development", "PD (new)"],
    ["Manufacturiiig Planned DevclopmentNumber 776, as amended", "PD 776 (amended)"],
    ["Residential Business Institutional Planned #889", "PD 889"],
    ["Commercial Planned Development1185 (B3-1 Community Shopping District underlying)", "PD 1185+B3-1"],
    ["PD 1302, Planned Development District", "PD 1302"],
  ] as const) {
    assert.equal(parseDistricts(text).map(displayDistrict).join("+"), want, text);
  }
  // A name alone, or a code without its dash number, is no district: the parser never guesses.
  assert.deepEqual(parseDistricts("RT, Residential Two-Flat, Townhouse and Multi-Unit District"), []);
  assert.deepEqual(parseDistricts("B1, Neighborhood Shopping District"), []);
  assert.deepEqual(parseDistricts("Community Shopping District"), []);
  assert.equal(parseDistricts("Residential Planned Development No. 1140 and symbols")[0].pdKind, "Residential");
  assert.equal(parseDistricts("Residential-\nBusiness Planned Development PD No. 1558")[0].pdKind, "Residential-Business");
});

test("the rezoning sentence as the scans spell it", () => {
  for (const [text, from, to] of [
    // "changmg", "those o f a", a lowercase code with spaces
    ["is hereby amended by changmg all the RS3\nResidential Single-Unit (Detached House) District symbols and indications as shovvTi on\nMap No. 15-H in area bound by:\nNorth Hamilton Avenue\n\nTo those o f a\n\nc i - 1 Neighborhood Commercial District\n\nSECTION 2.", "RS-3", "C1-1"],
    // "t o those", "To tho.se ofa", "tb those", "fo those", "lo lhat ofa"
    ["amendedby changing all of the B2-3 neighborhood m i x - u s e . D i s t r i c t symbols arid\ni n d i c a t i o n s as shown on Map No. ( 9 - K ) i n the area bounded by\nWest Belmont Avenue.\nt o those o f a C l - 3 neighborhood Commercial D i s t r i c t .\n\nSECTION 2.", "B2-3", "C1-3"],
    ["amended by changing all ofthe RT-4 Residential T'v\\'o-Flal, Townhouse and Multi-Unit\nDistrict symbols and indications as shown on Map No.4-G in the area bounded by:\nSouth May Street;\nTo tho.se ofa B2-3 Neighborhood Mixed-Use District.\nSECTION 2.", "RT-4", "B2-3"],
    ["is amended by changing all of the RT-4,\nResidential Two-Flat, Townhouse and Multi-Unit District synribols and indications as\nshown on Map No. 1-J in the area bound by:\nNorth Lawndale Avenue,\ntb those of a RS-3, Residential Single-Unit (Detached House) District.\nSECTION 2.", "RT-4", "RS-3"],
    ["amended by changing the current ResidentialBusine-ss Planned Development 186. a.s amended as shovvn on Map i-E in the area bounded by:\nNorth Michigan\nAvenue\nlo lhat ofa DX-16 Downtown Mi.\\ed-Use Dislrict.\nSECTION 2.", "PD 186 (amended)", "DX-16"],
    // "tothose ofa", "to thoscof ... asamended", "symbolsand"
    ["amended by changing all ofthe .Ml-L Limiied Manufacturmg/Business Park District symbols and\nindications as shown on Map No. 14-H in the area bounded by\nsouth Winchester Avenue.\n\ntothose ofa Cl-1 Neidiborhood Commercial District.\n\nSECTION 2.", "M1-1", "C1-1"],
    ["amended by changingall the RM5\nResidential Multi-Unit District and Institutional Planned Development Number43. as amended.symbolsand\nindications as shown on Map Numbers 12-D and 14-D in the area bounded by:\nSouth University Avenue,\n\nto thoscof Institutional Planned Development Number 43, asamended, which is hereby established", "RM-5+PD 43 (amended)", "PD 43 (amended)"],
    // "to that of an", "those of" with the "to" lost, the district alone after a blank line, "within the area herein above as"
    ["is hereby amended by changing the RS-3, Residential Single Unit District,\nas shown on Map 1-H in the area bounded:\nWest Huron Street,\n\nto that of an RT-4 Residential Two-Flat, Townhouse and Multi-Unit Districts.\n\nSECTION 2.", "RS-3", "RT-4"],
    ["hereby amended by changing all of the B1-2 Neighborhood Shopping District symbols and\nindications as shown on Map No. 7-F in the area bounded by\n\nNorth Halsted Street\n\nthose of a B3-3 Community Shopping District.\n\nSECTION 2.", "B1-2", "B3-3"],
    ["hereby amended by changing all of the RS-3, Residential Single-Unit (Detached House) District\nsymbols and indications as shown on Map No. 5-L in the area bounded by\n\nNorth Linder Avenue\n\nRT-4, Residential Two-Flat, Townhouse and Multi-Unit District.\n\nSECTION 2.", "RS-3", "RT-4"],
    ["amended by changing all the RS3\nResidential Single-Unit (Detached House) District symbols cind indications within the area\nherein above as Institutional Planned Development Number\n, which is hereby\nestablished", "RS-3", "PD (new)"],
    // the district typed without a dash number is not guessed; the "to" clause in its own section; "to Residential Planned Development"
    ["amended by changing all of the Business Planned Development 1025 symbols and indications and Ml-3\nLimited Manufacturing/Business Park District symbols and indications as shown on Map No. 7-H in the area bounded by:\nNorth Holly Avenue\n\nSECTION 2: To those of a Business Planned Development 1025, as Amended;\nSECTION 3: This ordinance", "PD 1025+M1-3", "PD 1025 (amended)"],
    ["amended by changing all of the Residential Planned Development Number 1135 symbols and\nindications as shown on Map Number 10-F in the area bounded by:\nSouth Federal Street,\nto Residential Planned Development Number 1135, as amended, which is hereby established", "PD 1135", "PD 1135 (amended)"],
  ] as const) {
    const sec = parseSections(text);
    assert.equal(sec.length >= 1, true, text.slice(0, 50));
    assert.equal(sec[0].from.map(displayDistrict).join("+"), from, text.slice(0, 50));
    assert.equal(displayDistrict(sec[sec.length - 1].to!), to, text.slice(0, 50));
  }
  // "to those of a B3-2 then to Institutional Planned Development #1150, as amended": the last district named.
  const then = parseSections("amended by changing all of the Residential Planned Development #1149\nsymbols and indications as shown on Map No. 5-L in the area bounded by:\nNorth Laramie Avenue;\nto those of a B3-2 Community Shopping District then to Institutional Planned\nDevelopment #1150, as amended which is hereby established in the area described.");
  assert.equal(displayDistrict(then[0].to!), "PD 1150 (amended)");
  // Several districts each with their own "symbols and indications".
  const several = parseSections("amended by changing all ofthe Institutional Planned\nDevelopment No. 17 symbols and indications and all the RS-3 Residential\nSingle-Unit (Detached House) District symbols and indications, as shown on Map\nNumber 13-H in the area bounded by:\nNorth Paulina Street\nto those of a RM4.5 Residential Multi-Unit District and a corresponding use\ndistrict is hereby established in the area above described.");
  assert.deepEqual(several[0].from.map(displayDistrict), ["PD 17", "RS-3"]);
  // A boundary description that says "Section 28, Township 40" is not a new section; the disclosure forms' "changing the zoning designation" is no rezoning.
  const legal = parseSections("amended by changing all the RS-3 Residential Single-Unit (Detached House) District symbols and indications as shown on Map No. 6-H in the area bounded by\nLots 24 and 25 in the Southwest Quarter of Section 30, Township 38 North; West 25th Street\nto those of a C1-1 Neighborhood Commercial District.\nSECTION 2. This ordinance shall be in force.\n\nDoes the Matter involve changing the zoning designation of a property? If so, does any official or employee of the City have an interest other than in an officer's or employee's official capacity?");
  assert.equal(legal.length, 1);
  assert.equal(displayDistrict(legal[0].to!), "C1-1");
});

test("direction when a site leaves a planned development", () => {
  const pd = (s: string) => parseDistricts(s);
  assert.equal(direction(pd("Business Planned Development Number 29"), d("B3-5 Community Shopping District")), "up", "a business PD allowed no homes");
  assert.equal(direction(pd("Institutional Planned Development No. 462"), d("RM-4.5")), "up");
  assert.equal(direction(pd("Commercial Manufacturing Planned Development No. 1301"), d("Planned Manufacturing District 11")), "lateral", "no homes either side");
  assert.equal(direction(pd("Residential Planned Development No. 1140"), d("M2-1 Light Industry District")), "down", "homes to none");
  assert.equal(direction(pd("Residential Planned Development Number 1463"), d("RT-4")), "unknown", "how many homes the PD allowed is not in the ordinance");
  assert.equal(direction(pd("Residential-Business Planned Development Number 1338"), d("DX-5")), "unknown");
  assert.equal(direction(pd("Planned Development No. 1356"), d("DX-5")), "unknown", "kind not named");
  assert.equal(pdKindFromText("...changing all PD No. 1449 symbols ... The purpose of the rezoning is to eliminate Residential Business Planned Development\nNo. 1449 and rezone the property to a B3-2 Community Shopping District.", 1449), "Residential-Business");
  assert.equal(pdKindFromText("nothing here about 1449", 1449), null);
});

test("readMatter: a missing from-district comes from the application form; a bare planned development's kind from the record", () => {
  const form = readMatter(
    { record_number: "O2019-5540", title: "Zoning Reclassification Map No. 13-G at 5536 N Sheridan Rd - App No. 20096T1", full_text: "is hereby amended by changing all the Community Shopping District symbols\nand indications as shown on Map No. 13-G in the area bounded by\nNorth Sheridan Road,\nto those of a B2-3 Neighborhood Mixed-Use District and a corresponding uses district is\nhereby established in the area above described.\nSECTION 2.\n\n9. Present Zoning District: B3-3 Community Shopping District\nProposed Zoning District: B2-3\nLot size in square feet: 15,000\nThe proposed building will contain 8 dwelling units.\n", attachments: [], exhibit_texts: {}, outcome: "passed", sub_status: "Passed", introduction_date: "2019-07-24", final_action_date: "2019-09-18", filing_office: "Misc.", filing_sponsor: "Misc. Transmittal" },
    "2026-10-17",
  );
  assert.equal(form.from_district, "B3-3");
  assert.equal(form.to_district, "B2-3");
  assert.equal(form.direction, "lateral");
  assert.equal(form.needs_review, false);
  const kind = readMatter(
    { record_number: "O2023-1283", title: "Zoning Reclassification Map No. 5-N at 7152-7190 W North Ave - App No. 22126", full_text: "amended by changing all PD No. 1449 District symbols and indications as shown on Map No.5-N in the\narea bounded by\nNorth Neva Avenue\n\nto those of a B3-2 Community Shopping District\nSECTION 2.\n\nThe purpose of the rezoning is to eliminate Residential Business Planned Development\nNo. 1449 and rezone the property to a B3-2 Community Shopping District.", attachments: [], exhibit_texts: {}, outcome: "passed", sub_status: "Passed", introduction_date: "2023-03-15", final_action_date: "2023-04-19", filing_office: "Misc.", filing_sponsor: "Misc. Transmittal" },
    "2026-10-17",
  );
  assert.equal(kind.from_district, "PD 1449");
  assert.equal(kind.direction, "unknown", "a residential PD: what it allowed is not stated");
  assert.equal(kind.notes.some((n) => /leaving a planned development/.test(n)), true);
});

test("planned development counts in the spellings the scans give the bulk table, and from the statements' own words", () => {
  for (const [text, want] of [
    ["MAXIMUM NUMBER OF DWELLING 120\nUNITS:\nMINIMUM NUMBER OF OFF STREET 14\nPARKING SPACES:", 120],
    ["Maximum Permitted Dwelling Units: 113\nMaximum Permitted Dwelling Units and\nHotel Keys: 113*", 113],
    ["Maximum Number of Dwelling Units: N/A\nMinimum Number of Required", 0],
    ["Maximum Number of Dwelling\nUnits:\n\nNone Permitted\n\nMinimum Number of Off-Street", 0],
    ["Max Number of Dwelling Units (§17-30402-B) 114 DU (100% on-site ARO units; ii. 105 DU", 114],
    ["Maximum Number of Dwelling Unils:\n\n358\n\nMinimum Off-Slreel Parking Spaces:\n\n186", 358],
    ["Maximum Number of\nDwelling Units:\n\nSub Area A = 374 units\nSub Area B = 320 units\nSub Area C = 6 units\nSub Area D = 82 units\nTotal =\n782 units\n\nMaximum Site Coverage", 782],
    ["MAX. RESIDENTIAL DWELLING UNITS\nSUB-AREA A\n\n327\n\nSUB-AREA B\n\n34\n\nSUB-AREA C\n\n126\n\nSUB-AREA D\n\nN/A\n\nTOTAL\n\n487\n\nMAX. NUMBER OF OFF-STREET LOADING SPACES\nSUB-AREA A\n\n2 (10' X 25')", 487],
    ["Maximum Permitted Dwelling Units:\nSubarea A:\n\n0\n\nSubarea B:\n\n320\n\nMinimum Off-Street Parking Spaces:\nSubarea A:\n\n0\n\nSubarea B:\n\n90", 320],
    ["Maximum\nDwelling\nUnits\n\nMaximum\nFloor Area\nRatio\n\nMinimum\nNumber Of\nParking Spaces\n\n2,400\n\n7.9\n\n930", 2400],
    ["Maximum Permitted Dwelling Units:\nMinimum Off-Street Parking:\nMaximum Building Height:\n\n24.554 sq. ft.\n105.746 sq. ft.", null],
    ["construction of a 25-story, 300 foot tall building with 350 residential units, 50 bicycle parking spaces", 350],
    ["of two towers (47 and 40 stories) containing 1,053 overall residential units, 430 parking spaces", 1053],
    ["allow construction of a proposed new 5-story, 68 dwelling unit building with 27 interior parking stalls", 68],
    ["retail, two (2) live-work units and fifty-six (56) dwelling units.", 56],
    ["Sub-Area A: residential uses, including up to 738 dwelling units. The applicant is amending Sub-Area A to add 232 dwelling units", 738],
    ["The development will contain 0 dwelling units, an existing building containing approximately 275,000 square feet", 0],
    ["residential housing projects with ten or more units that receive a zoning change; include 60 dwelling units or more; (6) number of dwelling units (if applicable); Two (2) Hotel rooms/keys shall be equal to one (1) dwelling unit.", null],
  ] as const) {
    assert.equal(pdUnitCount(text).units, want, text.slice(0, 50));
  }
  const misread = pdUnitCount("Maximum Permitted Dwelling Units 141\n\nSubarea A: 361\n\nSubarea B: 380\n\nMinimum Off-Street Parking Spaces 40");
  assert.equal(misread.units, 741, "a total below its own subareas is misread; the subareas are summed");
  assert.equal(pdUnitCount("Maximum Number of Dwelling Units: 1,844\nSubarea A (Total): 1,500\nSubarea A1: 405\nSubarea B: 344\nMaximum Number").units, 1844, "a total at or above its subareas stands");
  assert.equal(narrativeUnitCount("allow the construction of a three-story 9-dwelling-unit building with a basement.\nUse: 9-Residential dwelling units.\nMIN. LOT AREA/DWELLING UNIT: 688 sq. ft.").units, 9, "a density standard is not a count");
});
