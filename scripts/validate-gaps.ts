import { conflictQuote, offBrandMotivations, rankGaps, topGaps } from "../lib/gaps";
import type { Execution, Motivation } from "../lib/taxonomy";

let failures = 0;
function fail(message: string): void {
  failures += 1;
  console.error(message);
}

const demoAds: { motivation: Motivation; execution: Execution }[] = [
  { motivation: "Price/value", execution: "Product focus" },
  { motivation: "Price/value", execution: "Product focus" },
  { motivation: "Price/value", execution: "Lifestyle scene" },
  { motivation: "Convenience/time", execution: "Lifestyle scene" },
  { motivation: "Convenience/time", execution: "Demo/how-to" },
  { motivation: "Convenience/time", execution: "Lifestyle scene" },
  { motivation: "Quality/performance", execution: "Lifestyle scene" },
  { motivation: "Quality/performance", execution: "Product focus" },
];

const exclusions = ["This is not a discount campaign.", "No limited drops.", "No status claims."];
const ranked = topGaps(
  rankGaps({
    ads: demoAds,
    focusPoints: ["weekly ritual", "roast date"],
    exclusions,
  }),
);

if (ranked.length !== 3) fail(`expected 3 gaps, got ${ranked.length}`);
const motivations = ranked.map((gap) => gap.motivation);
if (new Set(motivations).size !== 3) fail(`top gaps share a motivation: ${motivations.join(", ")}`);
if (motivations.some((item) => demoAds.some((ad) => ad.motivation === item))) {
  fail(`a used motivation outranked an unused one: ${motivations.join(", ")}`);
}
if (motivations.includes("Status/identity") || motivations.includes("Fear of missing out")) {
  fail("an off-brand motivation was ranked");
}
if (motivations[0] !== "Emotion/ritual") fail(`focus should put Emotion/ritual first, got ${motivations[0]}`);
if (!ranked.every((gap) => gap.hypothesis.startsWith("Hypothesis:"))) fail("a gap is missing the hypothesis label");
if (ranked.some((gap) => /forecast|ctr|performance/i.test(gap.hypothesis) && !gap.hypothesis.includes("not a forecast"))) {
  fail("a hypothesis predicts performance");
}

const usedBeatsFocus = topGaps(
  rankGaps({
    ads: [{ motivation: "Quality/performance", execution: "Product focus" }],
    focusPoints: ["roast date"],
    exclusions: [],
  }),
  1,
);
if (usedBeatsFocus[0]?.motivation === "Quality/performance") {
  fail("a used motivation with a focus boost outranked unused motivations");
}

// A second brand (office furniture) must use its own focus and exclusions.
const desks = topGaps(rankGaps({
  ads: [{ motivation: "Convenience/time", execution: "Product focus" }],
  focusPoints: ["durability and craftsmanship"],
  exclusions: ["No status claims", "No scarcity", "No discount offers"],
}));
if (desks[0]?.motivation !== "Quality/performance") fail("desk quality focus was ignored");
if (!desks[0]?.hypothesis.includes("durability and craftsmanship")) fail("hypothesis lost the extracted focus");
if (conflictQuote("A free desk with every order", ["No free product offers"]) !== "No free product offers") fail("conflict rule depends on coffee bags");
if (conflictQuote("Built to last", ["No discount offers"]) !== null) fail("non-offer flagged");
if (offBrandMotivations([]).length) fail("exclusions inferred without evidence");
const want = ["Emotion/ritual::Lifestyle scene", "Safety/trust::Testimonial", "Belonging/social proof::Person/UGC"];
if (ranked.map(g => `${g.motivation}::${g.execution}`).join("|") !== want.join("|")) fail("top three executions changed");

if (failures > 0) {
  console.error(`${failures} gap ranking check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(
    `Gap ranking: ${ranked.map((gap) => `${gap.motivation} × ${gap.execution}`).join("; ")}`,
  );
}
