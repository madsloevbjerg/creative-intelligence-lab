import { readFileSync } from "node:fs";

import { demoPortfolio } from "../lib/demo";
import { demoFileDataUrl } from "../lib/demo-data-url";
import { loadCachedDemo } from "../lib/demo-cache";
import { formatUsd } from "../lib/money";
import {
  classifyAd,
  currentCost,
  extractConstraints,
  readSpendTotalUsd,
  runWithCost,
  segmentImage,
  summarizeBrand,
} from "../lib/meta";

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }
  const before = readSpendTotalUsd();
  const ads = demoPortfolio.ads.map((ad) => {
    const bytes = readFileSync(`public${ad.file}`);
    return {
      id: ad.id,
      headline: ad.headline,
      primaryText: ad.primaryText,
      imageDataUrl: demoFileDataUrl(ad.file, bytes),
    };
  });

  await runWithCost("live", async () => {
    for (const ad of ads) {
      const spendBefore = readSpendTotalUsd();
      const segmentation = await segmentImage({
        imageUrl: ad.imageDataUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
      });
      const classification = await classifyAd({
        imageUrl: ad.imageDataUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
        segmentation,
      });
      console.log(
        `${ad.id}: ${classification.motivation} · ${classification.execution} · ${classification.delivery} · ${formatUsd(readSpendTotalUsd() - spendBefore)}`,
      );
    }
    await summarizeBrand({ websiteText: demoPortfolio.websiteText, brief: demoPortfolio.brief });
    const constraints = await extractConstraints({
      websiteText: demoPortfolio.websiteText,
      brief: demoPortfolio.brief,
    });
    console.log(`Exclusions: ${constraints.exclusions.join(" | ")}`);
    console.log(`Focus: ${constraints.focusPoints.join(" | ")}`);
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  const replay = loadCachedDemo({
    websiteText: demoPortfolio.websiteText,
    brief: demoPortfolio.brief,
    ads,
  });
  console.log(replay ? `Replay ok, ${replay.ads.length} ads` : "Replay MISSING");
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())} of ${formatUsd(120)}`);
  if (!replay) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
