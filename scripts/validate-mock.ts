import { cellDensity, cellKey, COVERAGE_CELL_COUNT } from "../lib/coverage";
import { conflictQuote, offBrandMotivations, rankGaps, topGaps } from "../lib/gaps";
import { demoPortfolio } from "../lib/demo";
import {
  mockBrandSummary,
  mockClassification,
  mockConceptBrief,
  mockMockup,
  mockSegmentation,
} from "../lib/mock";
import {
  brandSummarySchema,
  classificationSchema,
  conceptBriefSchema,
  mockupSchema,
  segmentationSchema,
} from "../lib/schemas";
import { EXECUTIONS, HOOK_MAX_WORDS, MOTIVATIONS, wordCount } from "../lib/taxonomy";

const expected: Record<string, { motivation: string; execution: string }> = {
  "dcl-01": { motivation: "Price/value", execution: "Product focus" },
  "dcl-02": { motivation: "Price/value", execution: "Product focus" },
  "dcl-03": { motivation: "Price/value", execution: "Product focus" },
  "dcl-04": { motivation: "Convenience/time", execution: "Lifestyle scene" },
  "dcl-05": { motivation: "Convenience/time", execution: "Demo/how-to" },
  "dcl-06": { motivation: "Convenience/time", execution: "Person/UGC" },
  "dcl-07": { motivation: "Quality/performance", execution: "Lifestyle scene" },
  "dcl-08": { motivation: "Quality/performance", execution: "Product focus" },
};

const banned = /\b(ctr|roas|benchmark|click-through|conversion rate)\b/i;

function fail(message: string) {
  console.error(message);
  process.exit(1);
}

const placed = [];

for (const ad of demoPortfolio.ads) {
  const segmentation = segmentationSchema.parse(
    mockSegmentation({ headline: ad.headline, primaryText: ad.primaryText }),
  );
  const classification = classificationSchema.parse(
    mockClassification({ headline: ad.headline, primaryText: ad.primaryText }),
  );
  const want = expected[ad.id];
  if (!want) fail(`Missing expected placement for ${ad.id}`);
  if (classification.motivation !== want.motivation || classification.execution !== want.execution) {
    fail(
      `${ad.id} placed at ${classification.motivation} × ${classification.execution}, expected ${want.motivation} × ${want.execution}`,
    );
  }
  if (wordCount(classification.hook) > HOOK_MAX_WORDS) {
    fail(`${ad.id} hook is longer than ${HOOK_MAX_WORDS} words`);
  }
  const blob = JSON.stringify({ segmentation, classification });
  if (banned.test(blob)) fail(`${ad.id} contains a performance claim`);
  placed.push(classification);
}

const brand = brandSummarySchema.parse(
  mockBrandSummary({
    websiteText: demoPortfolio.websiteText,
    brief: demoPortfolio.brief,
  }),
);
if (banned.test(JSON.stringify(brand))) fail("Brand summary contains a performance claim");
if (!/Danish Coffee Lab|does not estimate/i.test(brand.why)) {
  fail("Brand why does not explain the reading");
}

const counts = new Map();
for (const item of placed) {
  const key = cellKey(item.motivation, item.execution);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
let empty = 0;
let thin = 0;
let covered = 0;
for (const motivation of MOTIVATIONS) {
  for (const execution of EXECUTIONS) {
    const density = cellDensity(counts.get(cellKey(motivation, execution)) ?? 0);
    if (density === "empty") empty += 1;
    else if (density === "thin") thin += 1;
    else covered += 1;
  }
}
if (empty + thin + covered !== COVERAGE_CELL_COUNT) fail("Cell count drifted");
if (empty !== 64 || thin !== 5 || covered !== 1) {
  fail(`Unexpected coverage: empty ${empty}, thin ${thin}, covered ${covered}`);
}

const motivations = new Set(placed.map((item) => item.motivation));
if (motivations.size !== 3) fail(`Expected 3 motivations, got ${motivations.size}`);

const safety = classificationSchema.parse(
  mockClassification({
    headline: "Certified and secure",
    primaryText: "A guarantee you can trust on every bag.",
  }),
);
if (safety.motivation !== "Safety/trust" || safety.delivery !== "Static") {
  fail(`Heuristic missed Safety/trust static: ${safety.motivation} / ${safety.delivery}`);
}

let threw = false;
try {
  mockClassification({ headline: "Hello", primaryText: "Just a short note." });
} catch (error) {
  threw = true;
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("could not find a motivation")) {
    fail(`Unexpected heuristic error: ${message}`);
  }
}
if (!threw) fail("Vague copy was classified instead of refused");

const otherBrand = brandSummarySchema.parse(
  mockBrandSummary({
    websiteText: "We sell desks to schools. They arrive assembled. The tone is direct.",
    brief: "Spring launch for school office managers.",
  }),
);
if (!otherBrand.audiences[0]?.includes("school office managers")) {
  fail("Audience was not taken from the brief");
}

let brandThrew = false;
try {
  mockBrandSummary({
    websiteText: "We sell desks to schools. They arrive assembled.",
    brief: "Please make some ads.",
  });
} catch {
  brandThrew = true;
}
if (!brandThrew) fail("A brief with no audience was accepted");

conceptBriefSchema.parse(
  mockConceptBrief({
    motivation: "Emotion/ritual",
    execution: "Lifestyle scene",
    delivery: "Static",
    offer: brand.offer,
  }),
);
mockupSchema.parse(mockMockup({ visualDirection: "A cup on a quiet table." }));

const exclusions = ["This is not a discount campaign.", "No limited drops.", "No status claims."];
const offBrand = offBrandMotivations(exclusions);
if (!offBrand.includes("Status/identity") || !offBrand.includes("Fear of missing out")) {
  fail(`off-brand rows missing: ${offBrand.join(", ")}`);
}
const priceFlag = conflictQuote("Coffee for 49 kr a week", exclusions);
const freeFlag = conflictQuote("Your third bag is free", exclusions);
const ritualFlag = conflictQuote("Beans on the mat every Monday", exclusions);
if (!priceFlag || !freeFlag) fail("ads 1 and 2 should conflict with the discount line");
if (ritualFlag) fail("the Monday ad should not be flagged as a discount");
const ranked = topGaps(
  rankGaps({
    ads: placed.map((item) => ({ motivation: item.motivation, execution: item.execution })),
    focusPoints: ["weekly ritual", "roast date"],
    exclusions,
  }),
);
if (ranked.length !== 3) fail("expected 3 top gaps");
if (ranked.some((gap) => offBrand.includes(gap.motivation))) fail("an off-brand motivation was ranked as a gap");
if (!ranked.every((gap) => gap.hypothesis.startsWith("Hypothesis:"))) fail("gap reason is not a hypothesis");

console.log("Mock output matches the schemas.");
console.log(`Top gaps: ${ranked.map((gap) => `${gap.motivation} × ${gap.execution}`).join("; ")}`);
console.log(`Demo coverage: ${empty} empty, ${thin} thin, ${covered} covered.`);
