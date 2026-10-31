import { cellDensity, cellKey, COVERAGE_CELL_COUNT } from "../lib/coverage";
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
import { FORMATS, HOOK_MAX_WORDS, MOTIVATIONS, wordCount } from "../lib/taxonomy";

const expected: Record<string, { motivation: string; format: string }> = {
  "bonne-01": { motivation: "Price/value", format: "Static image" },
  "bonne-02": { motivation: "Price/value", format: "Static image" },
  "bonne-03": { motivation: "Price/value", format: "Carousel" },
  "bonne-04": { motivation: "Convenience/time", format: "Static image" },
  "bonne-05": { motivation: "Convenience/time", format: "Product demo" },
  "bonne-06": { motivation: "Convenience/time", format: "Short video (<15s)" },
  "bonne-07": { motivation: "Quality/performance", format: "Lifestyle scene" },
  "bonne-08": { motivation: "Quality/performance", format: "Static image" },
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
  if (classification.motivation !== want.motivation || classification.format !== want.format) {
    fail(
      `${ad.id} placed at ${classification.motivation} × ${classification.format}, expected ${want.motivation} × ${want.format}`,
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
if (!/Bønne|does not estimate/i.test(brand.why)) {
  fail("Brand why does not explain the reading");
}

const counts = new Map();
for (const item of placed) {
  const key = cellKey(item.motivation, item.format);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
let empty = 0;
let thin = 0;
let covered = 0;
for (const motivation of MOTIVATIONS) {
  for (const format of FORMATS) {
    const density = cellDensity(counts.get(cellKey(motivation, format)) ?? 0);
    if (density === "empty") empty += 1;
    else if (density === "thin") thin += 1;
    else covered += 1;
  }
}
if (empty + thin + covered !== COVERAGE_CELL_COUNT) fail("Cell count drifted");
if (empty !== 83 || thin !== 6 || covered !== 1) {
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
if (safety.motivation !== "Safety/trust" || safety.format !== "Static image") {
  fail(`Heuristic missed Safety/trust static: ${safety.motivation} / ${safety.format}`);
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
    motivation: "Emotion/nostalgia",
    format: "Lifestyle scene",
    offer: brand.offer,
  }),
);
mockupSchema.parse(mockMockup({ visualDirection: "A cup on a quiet table." }));

console.log("Mock output matches the schemas.");
console.log(`Demo coverage: ${empty} empty, ${thin} thin, ${covered} covered.`);
