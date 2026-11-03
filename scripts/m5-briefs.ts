import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { briefProblems } from "../lib/brief-rules";
import { demoPortfolio } from "../lib/demo";
import { demoFileDataUrl } from "../lib/demo-data-url";
import { loadCachedDemo } from "../lib/demo-cache";
import { rankGaps, topGaps, type Gap } from "../lib/gaps";
import { formatUsd } from "../lib/money";
import { currentCost, readSpendTotalUsd, runWithCost, writeConceptCopy } from "../lib/meta";
import type { ConceptCopy } from "../lib/schemas";
import { readFileSync } from "node:fs";

const ILLUSTRATIVE =
  "Illustrative testimonial: replace with a real customer quote before use.";

type Item = { gap: Gap; copy: ConceptCopy };

function markdown(items: Item[]): string {
  const blocks = items.map((item, index) => {
    const { gap, copy } = item;
    const label =
      gap.motivation === "Safety/trust" && gap.execution === "Testimonial" ? `\n${ILLUSTRATIVE}\n` : "";
    return `## ${index + 1}. ${copy.conceptName}
${copy.conceptNameEn}

- Motivation: ${gap.motivation}
- Execution: ${gap.execution}
- Format: Static

${gap.hypothesis}
${label}
### Danish

- Headline: ${copy.headlineDa}
- Primary text: ${copy.primaryTextDa}
- 2-second hook: ${copy.hook}
- CTA: ${copy.ctaDa}
- Core message: ${copy.coreMessage}
- Visual direction: ${copy.visualDirection}

### English

- Headline: ${copy.headlineEn}
- Primary text: ${copy.primaryTextEn}
- 2-second hook: ${copy.hookEn}
- CTA: ${copy.ctaEn}
`;
  });
  return `# M5 concept briefs\n\nThe eight existing ads are the before. These three are the after, from the current top gaps.\n\n${blocks.join("\n")}`;
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }
  const before = readSpendTotalUsd();
  const ads = demoPortfolio.ads.map((ad) => ({
    id: ad.id,
    headline: ad.headline,
    primaryText: ad.primaryText,
    imageDataUrl: demoFileDataUrl(ad.file, readFileSync(`public${ad.file}`)),
  }));
  const replay = loadCachedDemo({
    websiteText: demoPortfolio.websiteText,
    brief: demoPortfolio.brief,
    ads,
  });
  if (!replay) throw new Error("The demo cache does not replay. No concept call was made.");
  const gaps = topGaps(
    rankGaps({
      ads: replay.ads.map((ad) => ({
        motivation: ad.classification.motivation,
        execution: ad.classification.execution,
      })),
      focusPoints: replay.constraints.focusPoints,
      exclusions: replay.constraints.exclusions,
    }),
    3,
  );

  const written: Item[] = [];
  await runWithCost("live", async () => {
    for (const gap of gaps) {
      const copy = await writeConceptCopy({
        motivation: gap.motivation,
        execution: gap.execution,
        hypothesis: gap.hypothesis,
        websiteText: demoPortfolio.websiteText,
        brief: demoPortfolio.brief,
      });
      written.push({ gap, copy });
      console.log(`${gap.motivation}: ${copy.conceptName} / ${copy.headlineDa}`);
    }
    let problems = briefProblems(
      written.map((item) => ({ ...item.copy, motivation: item.gap.motivation })),
    );
    if (problems.length > 0) {
      console.log(`Rejected once: ${problems.join("; ")}`);
      written.length = 0;
      for (const gap of gaps) {
        const copy = await writeConceptCopy({
          motivation: gap.motivation,
          execution: gap.execution,
          hypothesis: gap.hypothesis,
          websiteText: demoPortfolio.websiteText,
          brief: demoPortfolio.brief,
          revision: problems.join("; "),
        });
        written.push({ gap, copy });
        console.log(`retry ${gap.motivation}: ${copy.conceptName} / ${copy.headlineDa}`);
      }
      problems = briefProblems(written.map((item) => ({ ...item.copy, motivation: item.gap.motivation })));
      if (problems.length > 0) {
        throw new Error(`Briefs still break the rules after one retry. ${problems.join("; ")}`);
      }
    }
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  const docs = path.join(process.cwd(), "docs", "m5");
  mkdirSync(docs, { recursive: true });
  writeFileSync(path.join(docs, "briefs.md"), markdown(written));
  writeFileSync(
    path.join(docs, "briefs.json"),
    `${JSON.stringify(
      written.map((item) => ({
        motivation: item.gap.motivation,
        execution: item.gap.execution,
        hypothesis: item.gap.hypothesis,
        copy: item.copy,
      })),
      null,
      2,
    )}\n`,
  );
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())} of ${formatUsd(120)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
