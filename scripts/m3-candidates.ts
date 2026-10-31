import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { demoCandidates } from "../lib/brand-kit";
import { COMPOSITE_HEIGHT, COMPOSITE_WIDTH, compositeAd, contactSheet, rawPng } from "../lib/composite-ad";
import { formatUsd } from "../lib/money";
import { currentCost, generateDemoStill, readSpendTotalUsd, runWithCost } from "../lib/meta";

const root = process.cwd();
const candidateDir = path.join(root, "public", "demo", "candidates");
const docsDir = path.join(root, "docs", "m3");
const compositedDir = path.join(docsDir, "composited");

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  return key ? message.split(key).join("[redacted]") : message;
}

function promptsMarkdown(): string {
  const lines = [
    "# Danish Coffee Lab candidate prompts",
    "",
    "Each prompt was sent once to `muse-image-1.0` through the Responses API (`store: false`). The photograph has no type. The wordmark and the headline are composited afterwards.",
    "",
    "Picks are not chosen yet. Nothing here has been classified or segmented.",
    "",
  ];
  for (const candidate of demoCandidates) {
    lines.push(`## ${candidate.label} · ${candidate.id}`);
    lines.push("");
    lines.push(`- Ad: ${candidate.adNumber}`);
    lines.push(`- Motivation: ${candidate.motivation}${candidate.discount ? " (discount ad)" : ""}`);
    lines.push(`- Scene: ${candidate.scene}`);
    lines.push(`- Headline overlay: ${candidate.headline}`);
    lines.push("");
    lines.push("```");
    lines.push(candidate.prompt);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }

  mkdirSync(candidateDir, { recursive: true });
  mkdirSync(compositedDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });
  const prompts = promptsMarkdown();
  writeFileSync(path.join(docsDir, "prompts.md"), prompts);

  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const selected = only
    ? demoCandidates.filter((candidate) => candidate.label === only || candidate.id === only)
    : [...demoCandidates];
  if (selected.length === 0) {
    console.error(`No candidate matched ${only ?? ""}.`);
    process.exitCode = 1;
    return;
  }

  const before = readSpendTotalUsd();
  console.log(`Tracked spend before candidates: ${formatUsd(before)}`);

  const rawSheets: { label: string; image: Buffer; fit: "contain" }[] = [];
  const compositedSheets: { label: string; image: Buffer; fit: "cover" }[] = [];

  await runWithCost("live", async () => {
    for (const candidate of selected) {
      const spendBefore = readSpendTotalUsd();
      const cacheBefore = currentCost().cachedUsd;
      const still = await generateDemoStill({ prompt: candidate.prompt, cacheScope: "demo" });
      const bytes = Buffer.from(still.b64Json, "base64");
      const raw = await rawPng(bytes);
      const composited = await compositeAd(bytes, candidate.headline);
      writeFileSync(path.join(candidateDir, candidate.fileName), raw);
      writeFileSync(path.join(compositedDir, candidate.fileName), composited);
      rawSheets.push({ label: candidate.label, image: raw, fit: "contain" });
      compositedSheets.push({ label: candidate.label, image: composited, fit: "cover" });
      const spent = readSpendTotalUsd() - spendBefore;
      const fromCache = currentCost().cachedUsd - cacheBefore;
      console.log(
        `${candidate.label}: spent ${formatUsd(spent)}, from cache ${formatUsd(fromCache)}, ${still.outputFormat}, raw ${raw.byteLength} bytes`,
      );
    }
  });

  const sheetOptions = {
    columns: 3,
    cellWidth: 360,
    cellHeight: 450,
  };
  const rawSheet = await contactSheet({
    title: "Danish Coffee Lab candidates, raw photos",
    cells: rawSheets,
    ...sheetOptions,
  });
  const compositedSheet = await contactSheet({
    title: "Danish Coffee Lab candidates, with wordmark",
    cells: compositedSheets,
    ...sheetOptions,
  });
  writeFileSync(path.join(docsDir, "contact-sheet-raw.png"), rawSheet);
  writeFileSync(path.join(docsDir, "contact-sheet-composited.png"), compositedSheet);

  const after = readSpendTotalUsd();
  console.log(`Candidate step: ${formatUsd(after - before)}`);
  console.log(`Tracked spend so far: ${formatUsd(after)} of ${formatUsd(120)}`);
  console.log(`Composite size: ${COMPOSITE_WIDTH}x${COMPOSITE_HEIGHT}`);
  console.log(`Wrote ${selected.length} candidates.`);
}

main().catch((error: unknown) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
