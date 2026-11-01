import { rankGaps, topGaps } from "../lib/gaps";
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

if (failures > 0) {
  console.error(`${failures} gap ranking check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(
    `Gap ranking: ${ranked.map((gap) => `${gap.motivation} × ${gap.execution}`).join("; ")}`,
  );
}
