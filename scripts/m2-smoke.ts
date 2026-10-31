import { readFileSync } from "node:fs";
import path from "node:path";

import { demoFileDataUrl } from "../lib/demo-data-url";
import { demoPortfolio } from "../lib/demo";
import { formatUsd } from "../lib/money";
import {
  classifyAd,
  currentCost,
  generateMockup,
  readSpendTotalUsd,
  runWithCost,
  segmentPhrase,
  summarizeBrand,
} from "../lib/meta";

function dataUrlFor(publicPath: string): string {
  const name = publicPath.split("/").pop();
  if (!name) throw new Error("Missing demo file name.");
  const bytes = readFileSync(path.join(process.cwd(), "public", "demo", name));
  return demoFileDataUrl(name, bytes);
}

const notRequested = { found: false, note: "Not requested" };

async function measure(label: string, task: () => Promise<string>): Promise<void> {
  const spendBefore = readSpendTotalUsd();
  const cacheBefore = currentCost().cachedUsd;
  const summary = await task();
  const spent = readSpendTotalUsd() - spendBefore;
  const fromCache = currentCost().cachedUsd - cacheBefore;
  console.log(`${label}: spent ${formatUsd(spent)}, from cache ${formatUsd(fromCache)}`);
  console.log(`  ${summary}`);
}

async function onePass(): Promise<void> {
  const ad = demoPortfolio.ads[0];
  if (!ad) throw new Error("Demo ad 1 is missing.");
  const imageUrl = dataUrlFor(ad.file);
  let coffee = notRequested;

  await measure("SAM 3.1 coffee bag", async () => {
    coffee = await segmentPhrase(imageUrl, "coffee bag");
    return coffee.found ? `found. ${coffee.note}` : `no match. ${coffee.note}`;
  });

  await measure("Muse Spark classify", async () => {
    const classification = await classifyAd({
      imageUrl,
      headline: ad.headline,
      primaryText: ad.primaryText,
      segmentation: {
        product: coffee,
        person: notRequested,
        textOverlay: notRequested,
        setting: notRequested,
        logo: notRequested,
      },
    });
    return `${classification.motivation} · ${classification.execution} · ${classification.delivery}. ${classification.why}`;
  });

  await measure("Muse Spark brand summary", async () => {
    const brand = await summarizeBrand({
      websiteText: demoPortfolio.websiteText,
      brief: demoPortfolio.brief,
    });
    return brand.offer;
  });

  await measure("Muse Image", async () => {
    const mockup = await generateMockup({
      visualDirection: "A small square test frame of a plain coffee bag, no text, no logo.",
      cacheScope: "demo",
    });
    return `png bytes ${Buffer.from(mockup.b64Json, "base64").byteLength}`;
  });
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }

  console.log("M2 smoke, first pass.");
  const before = readSpendTotalUsd();
  await runWithCost("live", onePass);
  const after = readSpendTotalUsd();
  console.log(`M2 smoke total this pass: ${formatUsd(after - before)}`);
  console.log(`Tracked spend so far: ${formatUsd(after)} of ${formatUsd(120)} budget`);
  console.log("Run this command again. The second run should be cache hits at $0.");
}

void main();
