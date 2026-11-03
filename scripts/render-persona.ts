import { readFileSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { demoPortfolio } from "../lib/demo";
import { renderLockup, type LayoutQa, type LockupMasks } from "../lib/lockup";
import { formatUsd } from "../lib/money";
import {
  currentCost,
  generateDemoStill,
  readSpendTotalUsd,
  runWithCost,
  segmentRegions,
  writePersona,
} from "../lib/meta";
import type { MaskBox } from "../lib/smart-crop";

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function boxes(url: string, phrase: string): Promise<MaskBox[]> {
  const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
  if (!region.found || region.masks.length === 0) return region.boxes;
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  return region.masks.map((mask) => {
    const raster = decodeMaskToRaster(mask);
    let left = mask.width;
    let top = mask.height;
    let right = 0;
    let bottom = 0;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (raster[y * mask.width + x] !== 1) continue;
        if (x < left) left = x;
        if (y < top) top = y;
        if (x + 1 > right) right = x + 1;
        if (y + 1 > bottom) bottom = y + 1;
      }
    }
    return { left: mask.left + left, top: mask.top + top, right: mask.left + right, bottom: mask.top + bottom };
  });
}

async function fit(photo: Buffer, headline: string, id: string): Promise<LayoutQa | null> {
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const url = dataUrl(photo);
  const bagBoxes = await boxes(url, "bag");
  const face = await boxes(url, "face");
  const head = await boxes(url, "head");
  const hands = await boxes(url, "hands");
  const bag = bagBoxes.sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
  const cropW = Math.min(image.width, Math.round(image.height * (9 / 16)));
  const cropH = Math.min(image.height, Math.round(cropW * (16 / 9)));
  for (let left = 0; left <= Math.max(0, image.width - cropW); left += Math.max(16, Math.round(cropW / 8))) {
    for (let top = 0; top <= Math.max(0, image.height - cropH); top += Math.max(16, Math.round(cropH / 8))) {
      const crop = { left, top, width: cropW, height: cropH };
      if (bag && (bag.left < crop.left - 1 || bag.top < crop.top - 1 || bag.right > crop.left + crop.width + 1 || bag.bottom > crop.top + crop.height + 1)) {
        continue;
      }
      const base = await sharp(photo).extract(crop).resize(800, 1422, { fit: "fill" }).png().toBuffer();
      const sx = 800 / crop.width;
      const sy = 1422 / crop.height;
      const map = (items: MaskBox[]): MaskBox[] =>
        items.flatMap((box) => {
          const x0 = Math.max(crop.left, box.left) - crop.left;
          const y0 = Math.max(crop.top, box.top) - crop.top;
          const x1 = Math.min(crop.left + crop.width, box.right) - crop.left;
          const y1 = Math.min(crop.top + crop.height, box.bottom) - crop.top;
          if (x1 - x0 < 8 || y1 - y0 < 8) return [];
          return [{ left: x0 * sx, top: y0 * sy, right: x1 * sx, bottom: y1 * sy }];
        });
      const masks: LockupMasks = { face: map(face), head: map(head), hands: map(hands), bag: map(bag ? bagBoxes : []) };
      const lockup = await renderLockup({ image: base, headline, aspect: "9:16", masks });
      if (!lockup.qa.ok) {
        if (left === 0 && top === 0) {
          const fallback = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
          writeFileSync(`public/demo/m5/${id}.png`, fallback);
          console.log(`${id} fallback: ${lockup.qa.reason}`);
        }
        continue;
      }
      const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
      writeFileSync(`public/demo/m5/${id}.png`, composited);
      console.log(`${id}: ${lockup.qa.corner} ${lockup.qa.lineText.join(" / ")}`);
      return { ...lockup.qa, bagClipped: false };
    }
  }
  console.log(`${id}: FAILED`);
  return null;
}

async function main(): Promise<void> {
  const before = readSpendTotalUsd();
  const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
  await runWithCost("live", async () => {
    const still = await generateDemoStill({
      prompt: [
        "Vertical 9:16 photograph of the same calm window seat. An ordinary woman in a rust knit looks slightly off camera, mid-sentence, holding a flat white with fine latte art.",
        "The whole cream coffee bag sits low in the frame, fully visible, beside her.",
        "Leave a quiet band across the middle of the cushion with no face, no hands, and no bag.",
        brandKit.photoStyle,
        brandKit.people,
        `The coffee bag is ${brandKit.bag.description}.`,
        brandKit.noText,
        "No grey clothing.",
      ].join(" "),
      cacheScope: "demo",
    });
    const photo = await sharp(Buffer.from(still.b64Json, "base64")).rotate().png().toBuffer();
    writeFileSync("public/demo/m5/1a-916-raw.png", photo);
    const placed = await fit(photo, "Cancel anytime. I just never have.", "1a-916");
    if (placed) qa["1a-916"] = placed;

    const persona = await writePersona({
      conceptName: "The one thing we don't share",
      motivation: "Belonging/social proof",
      execution: "Person/UGC",
      headlineDa: "We share everything. Except this.",
      websiteText: demoPortfolio.websiteText,
      brief: demoPortfolio.brief,
    });
    writeFileSync("docs/m5/persona.json", `${JSON.stringify(persona, null, 2)}\n`);
    console.log(`persona ${persona.name}: ${persona.scriptEn}`);
    const portrait = await generateDemoStill({
      prompt: [
        `Vertical handheld phone photo of one fictional ordinary adult: ${persona.look}.`,
        "They wear a rust-coloured knit, not grey. They are in a real kitchen in the morning, laughing, holding a cream coffee bag as if telling a friend about a flatmate fight over the bag.",
        "A mug and a kettle are behind them. The whole bag is visible. Leave quiet space in the lower middle for type, clear of the face and hands.",
        brandKit.photoStyle,
        brandKit.people,
        `The coffee bag is ${brandKit.bag.description}.`,
        brandKit.noText,
        "No grey clothing. Not a recognizable real person.",
      ].join(" "),
      cacheScope: "demo",
    });
    const portraitPng = await sharp(Buffer.from(portrait.b64Json, "base64")).rotate().png().toBuffer();
    writeFileSync("public/demo/m5/persona-raw.png", portraitPng);
    const personaQa = await fit(portraitPng, "We share everything. Except this.", "persona-916");
    if (personaQa) qa["persona-916"] = personaQa;
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });
  writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
