import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
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
  type SegmentRegion,
} from "../lib/meta";
import { FEED_ASPECT, frameSubjects, unionMaskBoxes, type MaskBox, type SmartCropResult } from "../lib/smart-crop";

const tail = [
  brandKit.photoStyle,
  brandKit.people,
  `When the coffee bag is visible, it is always the same bag: ${brandKit.bag.description}.`,
  brandKit.noText,
].join(" ");

type AdPlan = {
  id: string;
  number: number;
  source: string;
  subjects: string[];
  scenes: string[];
};

const plans: AdPlan[] = [
  {
    id: "dcl-01",
    number: 1,
    source: "public/demo/candidates/dcl-01-c.png",
    subjects: [],
    scenes: [],
  },
  {
    id: "dcl-02",
    number: 2,
    source: "public/demo/dcl-02-raw.png",
    subjects: [],
    scenes: [],
  },
  {
    id: "dcl-03",
    number: 3,
    source: "public/demo/candidates/dcl-03-a.png",
    subjects: ["person"],
    scenes: [
      `The same Aarhus café. An ordinary woman in her thirties, short dark hair, wool sweater, sits at the window table looking at her cup. The cream coffee bag stands fully visible on the table in front of her, complete, with space above the bag. Both the woman and the bag are near the center of a vertical picture. ${tail}`,
      `Same woman, same café table, seen a little closer. She is still looking down. The cream coffee bag is on the table beside the cup, fully visible, not cut off, with empty table below it. ${tail}`,
      `Same café and the same woman, three-quarter view. She and the cream coffee bag share the middle of the frame. The bag is complete from top to bottom. Morning window light. No menu and no signage. ${tail}`,
    ],
  },
  {
    id: "dcl-04",
    number: 4,
    source: "public/demo/candidates/dcl-04-a.png",
    subjects: [],
    scenes: [],
  },
  {
    id: "dcl-05",
    number: 5,
    source: "public/demo/candidates/dcl-05-c.png",
    subjects: ["hand", "kettle"],
    scenes: [
      `A compact 4:5 kitchen photo. An adult hand pours from a gooseneck kettle into a cup, and the cream coffee bag stands right beside the cup. The hand, kettle, cup, and complete bag are grouped tightly in the center, not stretched from the top of the picture to the bottom. Space above the group. No face. ${tail}`,
      `Same compact pour, square-ish framing. The gooseneck kettle is just above the cup, the hand is on the handle, and the cream coffee bag is immediately beside them, fully visible. Everything important sits in the middle of the frame. No face. ${tail}`,
      `Side view, still compact. The pouring hand, the gooseneck spout, the cup, and the complete cream coffee bag fill the center together. None of them touch the top or bottom edge. No face. ${tail}`,
    ],
  },
  {
    id: "dcl-06",
    number: 6,
    source: "public/demo/candidates/dcl-06-a.png",
    subjects: ["phone", "hand"],
    scenes: [
      `A compact 4:5 photo. A hand holds a phone next to a cream coffee bag on a kitchen table. The phone screen is only a cream block and a deep green bar, no letters, no numbers, no icons, no clock. The hand, the phone, and the complete bag are grouped in the center, not stretched to the edges. No face. ${tail}`,
      `Same hand, phone, and cream coffee bag, closer and tighter. The blank cream-and-green screen faces us. The bag is fully visible beside the phone. Everything sits in the middle of the frame. No glyphs. No face. ${tail}`,
      `The phone is held just above the table, screen only the blank cream rectangle and deep green bar. The cream coffee bag stands complete right beside it. Hand, phone, and bag fill the center together. No face. ${tail}`,
    ],
  },
  {
    id: "dcl-07",
    number: 7,
    source: "public/demo/candidates/dcl-07-b.png",
    subjects: ["person"],
    scenes: [
      `A compact 4:5 photo of a real Danish kitchen. An ordinary woman in her sixties, silver hair, grey cardigan, holds a cup and looks aside. The cream coffee bag stands fully visible on the counter beside her. She and the bag are grouped in the center, not stretched to the edges of the picture. ${tail}`,
      `Same woman and the same kitchen, closer. She and the complete cream coffee bag share the middle of the frame. The bag is not cut off. Daylight. ${tail}`,
      `Same kitchen, three-quarter view. The woman and the bag are both easy to see and close together. The bag is complete, with a little space above it. She is not looking at the camera. ${tail}`,
    ],
  },
  {
    id: "dcl-08",
    number: 8,
    source: "public/demo/candidates/dcl-08-a.png",
    subjects: ["coffee roaster"],
    scenes: [
      `A compact 4:5 photo of a small Aarhus roastery. The drum roaster is clearly behind the table. One cream coffee bag stands fully visible in the center, close to the roaster, not touching the top or bottom edge. No other sacks and no signage. ${tail}`,
      `Same drum roaster, closer and still compact. The complete cream coffee bag is in the foreground and the roaster is obvious behind it. Both sit in the middle of the frame. ${tail}`,
      `Daylight in the same Aarhus roastery. The drum roaster and the complete cream coffee bag are grouped together in the center of a 4:5 picture. The bag is not at the bottom edge. ${tail}`,
    ],
  },
];

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function tightBoxes(region: SegmentRegion): Promise<MaskBox[]> {
  if (region.masks.length === 0) return region.boxes;
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const found = region.masks.map((mask) => {
    const raster = decodeMaskToRaster(mask);
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
      box: { left: mask.left + left, top: mask.top + top, right: mask.left + right, bottom: mask.top + bottom },
    };
  });
  const largest = Math.max(0, ...found.map((item) => item.count));
  const kept = found.filter((item) => item.count >= Math.max(400, largest * 0.12));
  return (kept.length > 0 ? kept : found).map((item) => item.box);
}

async function findPhrase(imageUrl: string, phrases: string[]): Promise<{ phrase: string; boxes: MaskBox[] } | null> {
  for (const phrase of phrases) {
    const region = await segmentRegions({ imageUrl, phrase, cacheScope: "demo" });
    const boxes = await tightBoxes(region);
    if (region.found && boxes.length > 0) return { phrase, boxes };
  }
  return null;
}

async function maskPng(width: number, height: number, region: SegmentRegion): Promise<Buffer> {
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const pixels = Buffer.alloc(width * height * 4);
  for (const mask of region.masks) {
    const raster = decodeMaskToRaster(mask);
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

type Choice = {
  bytes: Buffer;
  width: number;
  height: number;
  bag: SegmentRegion;
  crop: SmartCropResult;
  how: "kept" | "cropped" | "regenerated";
  why: string;
};

async function judge(bytes: Buffer, subjects: string[]): Promise<Choice | null> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const imageUrl = pngDataUrl(bytes);
  const bagHit = await findPhrase(imageUrl, ["coffee bag", "bag"]);
  if (!bagHit) return null;
  const subjectBoxes: MaskBox[] = [];
  for (const phrase of subjects) {
    const alternatives =
      phrase === "kettle"
        ? ["gooseneck kettle", "kettle"]
        : phrase === "coffee roaster"
          ? ["coffee roaster", "roaster"]
          : [phrase];
    const hit = await findPhrase(imageUrl, alternatives);
    if (!hit) return null;
    subjectBoxes.push(...hit.boxes);
  }
  const bag = unionMaskBoxes(bagHit.boxes);
  if (!bag) return null;
  const crop = frameSubjects({ width, height }, [...bagHit.boxes, ...subjectBoxes], bag, FEED_ASPECT);
  if (crop.fit === "impossible") return null;
  return {
    bytes,
    width,
    height,
    bag: await segmentRegions({
      imageUrl,
      phrase: bagHit.phrase,
      cacheScope: "demo",
    }),
    crop,
    how: "cropped",
    why: crop.reason,
  };
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }
  const before = readSpendTotalUsd();
  const demoDir = path.join(process.cwd(), "public", "demo");
  const redoDir = path.join(demoDir, "redo");
  mkdirSync(redoDir, { recursive: true });
  const manifest: Record<string, unknown> = {};
  const finals: { label: string; image: Buffer }[] = [];
  const sheets: { label: string; image: Buffer }[] = [];

  await runWithCost("live", async () => {
    for (const plan of plans) {
      const ad = demoPortfolio.ads.find((item) => item.id === plan.id);
      if (!ad) throw new Error(plan.id);
      const original = readFileSync(path.join(process.cwd(), plan.source));
      let chosen = await judge(original, plan.subjects);
      let how: Choice["how"] = "cropped";
      let why = chosen?.why ?? "The original scene does not fit in one 4:5 frame with the bag and its subject.";
      if (chosen) {
        how = plan.id === "dcl-01" || plan.id === "dcl-04" || plan.id === "dcl-02" ? "kept" : "cropped";
        console.log(`${plan.number}: ${how}. ${chosen.crop.overlay}. ${chosen.crop.reason}`);
      } else if (plan.scenes.length === 0) {
        throw new Error(`${plan.id} cannot be cropped and has no regeneration scene.`);
      } else {
        console.log(`${plan.number}: original cannot fit. Generating 3 candidates of the same scene.`);
        const passing: Choice[] = [];
        for (const [index, prompt] of plan.scenes.entries()) {
          const letter = ["a", "b", "c"][index] ?? "a";
          const still = await generateDemoStill({ prompt, cacheScope: "demo" });
          const bytes = await sharp(Buffer.from(still.b64Json, "base64")).png({ compressionLevel: 9 }).toBuffer();
          const file = path.join(redoDir, `${plan.id}-${letter}.png`);
          writeFileSync(file, bytes);
          sheets.push({ label: `${plan.number}${letter}`, image: bytes });
          const judged = await judge(bytes, plan.subjects);
          console.log(`${plan.number}${letter}: ${judged ? judged.crop.fit : "rejected, missing the bag or the subject"}`);
          if (judged) {
            passing.push({
              ...judged,
              how: "regenerated",
              why: `Candidate ${plan.number}${letter}. Same scene, bag placed so it fits. ${judged.crop.reason}`,
            });
          }
        }
        if (passing.length === 0) {
          throw new Error(`${plan.id} had no candidate with both the bag and the scene subject inside a 4:5 crop.`);
        }
        chosen = passing[0] ?? null;
        how = "regenerated";
        why = chosen?.why ?? why;
        console.log(`${plan.number}: selected a regenerated candidate. ${why}`);
      }
      if (!chosen) throw new Error(plan.id);
      const raw = await sharp(chosen.bytes).png({ compressionLevel: 9 }).toBuffer();
      const mask = await maskPng(chosen.width, chosen.height, chosen.bag);
      const finalImage = await compositeAd(raw, ad.headline, chosen.crop.rect);
      writeFileSync(path.join(demoDir, `dcl-0${plan.number}-raw.png`), raw);
      writeFileSync(path.join(demoDir, `dcl-0${plan.number}-mask.png`), mask);
      writeFileSync(path.join(demoDir, `dcl-0${plan.number}.png`), finalImage);
      finals.push({ label: String(plan.number), image: finalImage });
      manifest[plan.id] = {
        candidate: plan.id === "dcl-02" ? "2c pile" : plan.source.split("/").pop(),
        regenerated: how === "regenerated",
        regenerationReason: how === "regenerated" ? why : null,
        fit: chosen.crop.fit,
        overlay: chosen.crop.overlay,
        reason: why,
        crop: chosen.crop.rect,
        imageWidth: chosen.width,
        imageHeight: chosen.height,
        bagCount: (await tightBoxesSafe(chosen.bag)).length,
      };
    }

    const sheet = await contactSheet({
      title: "Danish Coffee Lab scenes restored",
      columns: 4,
      cells: finals.map((item) => ({ label: item.label, image: item.image, fit: "cover" as const })),
      cellWidth: 320,
      cellHeight: 400,
    });
    mkdirSync(path.join(process.cwd(), "docs", "m3"), { recursive: true });
    writeFileSync(path.join(process.cwd(), "docs", "m3", "final-ads.png"), sheet);
    if (sheets.length > 0) {
      const redoSheet = await contactSheet({
        title: "Regenerated scene candidates",
        columns: 3,
        cells: sheets.map((item) => ({ label: item.label, image: item.image, fit: "contain" as const })),
        cellWidth: 320,
        cellHeight: 400,
      });
      writeFileSync(path.join(process.cwd(), "docs", "m3", "redo-candidates.png"), redoSheet);
    }
    const body = `${JSON.stringify({ picks: manifest }, null, 2)}\n`;
    writeFileSync(path.join(process.cwd(), "lib", "demo-manifest.json"), body);
    writeFileSync(path.join(demoDir, "manifest.json"), body);

    if (process.env.SKIP_CLASSIFY === "1") {
      console.log("Skipping classification until the SAM phrases are chosen.");
      return;
    }
    console.log("Classifying the eight scenes.");
    for (const ad of demoPortfolio.ads) {
      const spendBefore = readSpendTotalUsd();
      const file = readFileSync(path.join(process.cwd(), "public", ad.file.replace(/^\//, "")));
      const imageUrl = pngDataUrl(file);
      const segmentation = await segmentImage({ imageUrl, headline: ad.headline, primaryText: ad.primaryText });
      const classification = await classifyAd({
        imageUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
        segmentation,
      });
      console.log(
        `${ad.id}: ${classification.motivation} · ${classification.execution} · ${classification.delivery} · spent ${formatUsd(readSpendTotalUsd() - spendBefore)}`,
      );
      console.log(`  hook: ${classification.hook}`);
      console.log(
        `  product ${segmentation.product.found ? "yes" : "no"}, person ${segmentation.person.found ? "yes" : "no"}, text ${segmentation.textOverlay.found ? "yes" : "no"}, setting ${segmentation.setting.found ? "yes" : "no"}, logo ${segmentation.logo.found ? "yes" : "no"}`,
      );
    }
    await summarizeBrand({ websiteText: demoPortfolio.websiteText, brief: demoPortfolio.brief });
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  console.log(`Restore step: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())} of ${formatUsd(120)}`);
}

async function tightBoxesSafe(region: SegmentRegion): Promise<MaskBox[]> {
  return tightBoxes(region);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
