import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandKit, demoCandidates } from "../lib/brand-kit";
import { compositeAd, contactSheet } from "../lib/composite-ad";
import { demoPortfolio } from "../lib/demo";
import { formatUsd } from "../lib/money";
import {
  classifyAd,
  currentCost,
  generateDemoStill,
  readSpendTotalUsd,
  runWithCost,
  segmentImage,
  segmentRegions,
  summarizeBrand,
} from "../lib/meta";
import { FEED_ASPECT, smartCrop, unionMaskBoxes, type MaskBox, type SmartCropResult } from "../lib/smart-crop";

const picks = [
  { id: "dcl-01", letter: "c" },
  { id: "dcl-02", letter: "c" },
  { id: "dcl-03", letter: "a" },
  { id: "dcl-04", letter: "a" },
  { id: "dcl-05", letter: "c" },
  { id: "dcl-06", letter: "a" },
  { id: "dcl-07", letter: "b" },
  { id: "dcl-08", letter: "a" },
] as const;

type ManifestEntry = {
  candidate: string;
  regenerated: boolean;
  regenerationReason: string | null;
  fit: SmartCropResult["fit"];
  reason: string;
  crop: SmartCropResult["rect"];
  imageWidth: number;
  imageHeight: number;
  bagCount: number;
};

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  return key ? message.split(key).join("[redacted]") : message;
}

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function maskPng(
  width: number,
  height: number,
  masks: {
    left: number;
    top: number;
    width: number;
    height: number;
    encoding: "lossless" | "one_bit";
    payload: string;
  }[],
): Promise<Buffer> {
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const pixels = Buffer.alloc(width * height * 4);
  for (const mask of masks) {
    const raster = decodeMaskToRaster({
      encoding: mask.encoding,
      payload: mask.payload,
      width: mask.width,
      height: mask.height,
    });
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (raster[y * mask.width + x] !== 1) continue;
        const px = mask.left + x;
        const py = mask.top + y;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const index = (py * width + px) * 4;
        pixels[index] = 0x1f;
        pixels[index + 1] = 0x4a;
        pixels[index + 2] = 0x38;
        pixels[index + 3] = 150;
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

async function regionBoxes(region: Awaited<ReturnType<typeof segmentRegions>>): Promise<MaskBox[]> {
  if (region.masks.length === 0) return region.boxes;
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const tight = region.masks.map((mask) => {
    const raster = decodeMaskToRaster({
      encoding: mask.encoding,
      payload: mask.payload,
      width: mask.width,
      height: mask.height,
    });
    let left = mask.width;
    let top = mask.height;
    let right = 0;
    let bottom = 0;
    let count = 0;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (raster[y * mask.width + x] !== 1) continue;
        count += 1;
        if (x < left) left = x;
        if (y < top) top = y;
        if (x + 1 > right) right = x + 1;
        if (y + 1 > bottom) bottom = y + 1;
      }
    }
    return {
      count,
      box: {
        left: mask.left + left,
        top: mask.top + top,
        right: mask.left + right,
        bottom: mask.top + bottom,
      },
    };
  });
  const largest = Math.max(...tight.map((item) => item.count));
  const kept = tight.filter((item) => item.count >= Math.max(400, largest * 0.15));
  return (kept.length > 0 ? kept : tight).map((item) => item.box);
}

async function chooseCrop(bytes: Buffer, label: string): Promise<{
  region: Awaited<ReturnType<typeof segmentRegions>>;
  crop: SmartCropResult;
  width: number;
  height: number;
}> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  let region = await segmentRegions({
    imageUrl: pngDataUrl(bytes),
    phrase: "coffee bag",
    cacheScope: "demo",
  });
  if (!region.found) {
    region = await segmentRegions({
      imageUrl: pngDataUrl(bytes),
      phrase: "bag",
      cacheScope: "demo",
    });
  }
  const boxes = await regionBoxes(region);
  const union = unionMaskBoxes(boxes);
  console.log(
    `${label}: SAM bags ${boxes.length}, ${region.note}` +
      (union ? `, union ${Math.round(union.right - union.left)}x${Math.round(union.bottom - union.top)}` : ""),
  );
  if (!union) {
    return {
      region,
      width,
      height,
      crop: {
        rect: { left: 0, top: 0, width, height },
        fit: "impossible",
        overlay: "standard",
        reason: "SAM 3.1 did not find a coffee bag to keep inside the crop.",
      },
    };
  }
  const crop = smartCrop({ width, height }, union, FEED_ASPECT);
  console.log(`${label}: crop ${crop.fit}. ${crop.reason}`);
  return { region, crop, width, height };
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }

  const before = readSpendTotalUsd();
  const manifest: Record<string, ManifestEntry> = {};
  const finals: { label: string; image: Buffer }[] = [];
  const demoDir = path.join(process.cwd(), "public", "demo");
  mkdirSync(demoDir, { recursive: true });

  await runWithCost("live", async () => {
    for (const pick of picks) {
      const candidate = demoCandidates.find((item) => item.id === `${pick.id}-${pick.letter}`);
      const ad = demoPortfolio.ads.find((item) => item.id === pick.id);
      if (!candidate || !ad) throw new Error(`Missing pick ${pick.id} ${pick.letter}.`);
      const sourcePath = path.join(process.cwd(), "public", "demo", "candidates", candidate.fileName);
      let bytes = readFileSync(sourcePath);
      let chosen = await chooseCrop(bytes, candidate.label);
      let regenerated = false;
      let regenerationReason: string | null = null;

      if (chosen.crop.fit === "impossible") {
        regenerationReason = chosen.crop.reason;
        const tail = [
          brandKit.photoStyle,
          brandKit.people,
          `When the coffee bag is visible, it is always the same bag: ${brandKit.bag.description}.`,
          brandKit.noText,
        ].join(" ");
        const knownFit = `${candidate.prompt} Reframe this same scene only: every coffee bag is fully visible in the vertical middle, with empty space above it and empty space below it, not cut off and not touching the bottom edge. Keep the same people and the same place.`;
        const scenePrompt: Record<string, string> = {
          "dcl-02": `Three small cream coffee bags in a compact pile at the vertical center of the picture. Together the pile is only about one third of the picture height and no wider than two bags. A large empty wall fills the space above the pile, and a large empty wooden table fills the space below it. The bags do not touch the top or the bottom of the picture. Slight three-quarter view, not a flat lay. ${tail}`,
          "dcl-08": `A small Aarhus roastery, drum roaster soft in the background, daylight from a high window. One small cream coffee bag stands fully visible on a wooden table, its base near the vertical center of the picture, with a large stretch of empty table below the bag and space above it. No other sacks and no signage. ${tail}`,
        };
        const smaller = `${candidate.prompt} Same scene, same people, but the coffee bag is smaller, complete, and centered, with a wide margin of background around it.`;
        const fresh =
          pick.id === "dcl-02"
            ? [scenePrompt["dcl-02"]]
            : pick.id === "dcl-08"
              ? [scenePrompt["dcl-08"], smaller]
              : [knownFit, smaller];
        let best = chosen;
        let bestBytes = bytes;
        for (const [index, scene] of fresh.entries()) {
          const prompt = scene;
          console.log(`${candidate.label}: regenerating ${index + 1}. ${best.crop.reason}`);
          const still = await generateDemoStill({ prompt, cacheScope: "demo" });
          const nextBytes = await sharp(Buffer.from(still.b64Json, "base64")).png({ compressionLevel: 9 }).toBuffer();
          const next = await chooseCrop(nextBytes, `${candidate.label} regen ${index + 1}`);
          regenerated = true;
          const rank = { fits: 2, tight: 1, impossible: 0 };
          if (rank[next.crop.fit] > rank[best.crop.fit]) {
            best = next;
            bestBytes = nextBytes;
          }
          if (next.crop.fit !== "impossible") break;
        }
        bytes = bestBytes;
        chosen = best;
        if (chosen.crop.fit === "impossible") {
          throw new Error(`${candidate.label} still cannot be cropped after regeneration. ${chosen.crop.reason}`);
        }
      }

      const number = candidate.adNumber;
      const rawName = `dcl-0${number}-raw.png`;
      const maskName = `dcl-0${number}-mask.png`;
      const finalName = `dcl-0${number}.png`;
      const mask = await maskPng(chosen.width, chosen.height, chosen.region.masks);
      const finalImage = await compositeAd(bytes, ad.headline, chosen.crop.rect);
      writeFileSync(path.join(demoDir, rawName), bytes);
      writeFileSync(path.join(demoDir, maskName), mask);
      writeFileSync(path.join(demoDir, finalName), finalImage);
      finals.push({ label: String(number), image: finalImage });
      manifest[pick.id] = {
        candidate: candidate.label,
        regenerated,
        regenerationReason,
        fit: chosen.crop.fit,
        reason: chosen.crop.reason,
        crop: chosen.crop.rect,
        imageWidth: chosen.width,
        imageHeight: chosen.height,
        bagCount: (await regionBoxes(chosen.region)).length,
      };
      console.log(`${candidate.label}: locked ${chosen.crop.fit}, bags ${manifest[pick.id]?.bagCount}`);
    }

    const sheet = await contactSheet({
      title: "Danish Coffee Lab final ads",
      columns: 4,
      cells: finals.map((item) => ({ label: item.label, image: item.image, fit: "cover" as const })),
      cellWidth: 320,
      cellHeight: 400,
    });
    mkdirSync(path.join(process.cwd(), "docs", "m3"), { recursive: true });
    writeFileSync(path.join(process.cwd(), "docs", "m3", "final-ads.png"), sheet);
    writeFileSync(path.join(process.cwd(), "lib", "demo-manifest.json"), `${JSON.stringify({ picks: manifest }, null, 2)}\n`);
    writeFileSync(path.join(demoDir, "manifest.json"), `${JSON.stringify({ picks: manifest }, null, 2)}\n`);

    console.log("Classifying the eight final ads.");
    for (const ad of demoPortfolio.ads) {
      const spendBefore = readSpendTotalUsd();
      const cacheBefore = currentCost().cachedUsd;
      const file = readFileSync(path.join(process.cwd(), "public", ad.file.replace(/^\//, "")));
      const imageUrl = pngDataUrl(file);
      const segmentation = await segmentImage({
        imageUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
      });
      const classification = await classifyAd({
        imageUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
        segmentation,
      });
      const spent = readSpendTotalUsd() - spendBefore;
      const fromCache = currentCost().cachedUsd - cacheBefore;
      console.log(
        `${ad.id}: ${classification.motivation} · ${classification.execution} · ${classification.delivery} · spent ${formatUsd(spent)}, from cache ${formatUsd(fromCache)}`,
      );
      console.log(`  hook: ${classification.hook}`);
      console.log(
        `  SAM product ${segmentation.product.found ? "yes" : "no"}, person ${segmentation.person.found ? "yes" : "no"}, text ${segmentation.textOverlay.found ? "yes" : "no"}, setting ${segmentation.setting.found ? "yes" : "no"}, logo ${segmentation.logo.found ? "yes" : "no"}`,
      );
    }
    const brandBefore = readSpendTotalUsd();
    await summarizeBrand({
      websiteText: demoPortfolio.websiteText,
      brief: demoPortfolio.brief,
    });
    console.log(`Brand summary spent ${formatUsd(readSpendTotalUsd() - brandBefore)}`);
    const cost = currentCost();
    console.log(`Failed attempts this run: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  const after = readSpendTotalUsd();
  console.log(`Lock step: ${formatUsd(after - before)}`);
  console.log(`Tracked spend so far: ${formatUsd(after)} of ${formatUsd(120)}`);
}

main().catch((error: unknown) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
