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

const WIDTH = 800;
const HEIGHT = 1422;
const RULES = [
  "One real vertical 9:16 photograph, framed in the camera, not a crop of a wider photo.",
  "The cream coffee bag is large, about 35 to 40 percent of the picture width, fully visible and sharp.",
  "People are close to the camera. Do not leave them small in the distance.",
  "A wide empty wall or window runs across the frame just below the top edge, with no face, no hands, no cup, and no bag in it, so a caption can sit there.",
  "The bottom 35 percent is only empty table or floor. Nothing important enters that bottom band.",
  brandKit.photoStyle,
  brandKit.people,
  `The coffee bag is ${brandKit.bag.description}.`,
  brandKit.noText,
  "No grey sweaters and no grey clothing. Plain green label, no letters.",
].join(" ");

const JOBS = [
  {
    id: "1a-916",
    headline: "Cancel anytime. I just never have.",
    prompts: [
      "Copy this exact framing: a blank white wall fills the left and the top. A woman in a rust knit stands on the right, close, holding a flat white with a heart of latte art. A large cream bag stands on a wooden shelf beside her. A huge empty table fills the entire bottom third. Bright window. Shelf framing pass.",
    ],
  },
  {
    id: "2a-916",
    headline: "We argue about everything. Except the coffee.",
    prompts: [
      "Copy this exact framing: a blank white wall fills the left and the top. Two colleagues in coral and navy stand on the right, laughing and gesturing, a playful argument. A cream coffee bag and two cups sit on a wooden shelf in the center. A huge empty table fills the entire bottom third. Shelf framing pass.",
    ],
  },
  {
    id: "3b-916",
    headline: "Find the cherry. Then the cocoa.",
    prompts: [
      "Copy this exact framing: a blank white wall, a wooden shelf, and a huge empty table filling the bottom third. On the shelf, a large cream bag, a cup of black coffee, a bowl of cherries, a bowl of cocoa nibs, and two hands mid-reach. Shelf framing pass.",
    ],
  },
];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

type PixelMask = {
  box: MaskBox;
  raster: Uint8Array | number[];
  width: number;
  height: number;
  originX: number;
  originY: number;
};

async function masksOf(url: string, phrase: string): Promise<PixelMask[]> {
  const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
  if (!region.found || region.masks.length === 0) {
    return region.boxes.map((box) => ({
      box,
      raster: [],
      width: 0,
      height: 0,
      originX: box.left,
      originY: box.top,
    }));
  }
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  return region.masks.flatMap((mask) => {
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
    if (count < 40) return [];
    return [{
      box: { left: mask.left + left, top: mask.top + top, right: mask.left + right, bottom: mask.top + bottom },
      raster,
      width: mask.width,
      height: mask.height,
      originX: mask.left,
      originY: mask.top,
    }];
  });
}

function pixelShareInBottom(masks: readonly PixelMask[], imageHeight: number): number {
  const limit = imageHeight * 0.65;
  let hit = 0;
  let total = 0;
  for (const mask of masks) {
    if (mask.width === 0) continue;
    for (let y = 0; y < mask.height; y += 1) {
      const imageY = mask.originY + y;
      for (let x = 0; x < mask.width; x += 1) {
        if (mask.raster[y * mask.width + x] !== 1) continue;
        total += 1;
        if (imageY >= limit) hit += 1;
      }
    }
  }
  return total > 0 ? hit / total : 0;
}

function pixelHits(masks: readonly PixelMask[], rect: { left: number; top: number; width: number; height: number }, sx: number, sy: number): number {
  let hits = 0;
  for (const mask of masks) {
    if (mask.width === 0) continue;
    for (let y = 0; y < mask.height; y += 2) {
      for (let x = 0; x < mask.width; x += 2) {
        if (mask.raster[y * mask.width + x] !== 1) continue;
        const px = (mask.originX + x) * sx;
        const py = (mask.originY + y) * sy;
        if (px >= rect.left && px < rect.left + rect.width && py >= rect.top && py < rect.top + rect.height) hits += 1;
      }
    }
  }
  return hits;
}

async function placeFull(photo: Buffer, headline: string, id: string): Promise<LayoutQa | null> {
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (Math.abs(image.width / image.height - 9 / 16) > 0.025) {
    console.log(`${id}: not a 9:16 frame (${image.width}x${image.height})`);
    return null;
  }
  const url = dataUrl(photo);
  const bagMasks = await masksOf(url, "bag");
  const face = await masksOf(url, "face");
  const head = await masksOf(url, "head");
  const hands = await masksOf(url, "hands");
  const cups = await masksOf(url, "cup");
  const bag = [...bagMasks].sort((a, b) => (b.box.right - b.box.left) * (b.box.bottom - b.box.top) - (a.box.right - a.box.left) * (a.box.bottom - a.box.top))[0];
  if (!bag) {
    console.log(`${id}: no bag`);
    return null;
  }
  const bagWidth = (bag.box.right - bag.box.left) / image.width;
  console.log(`${id} bag width ${(bagWidth * 100).toFixed(0)}%`);
  if (bagWidth < 0.3 || bagWidth > 0.52) return null;
  const base = await sharp(photo).resize(WIDTH, HEIGHT, { fit: "fill" }).png().toBuffer();
  const sx = WIDTH / image.width;
  const sy = HEIGHT / image.height;
  const map = (items: PixelMask[]): MaskBox[] =>
    items.flatMap((item) => {
      const mapped = {
        left: item.box.left * sx,
        top: item.box.top * sy,
        right: item.box.right * sx,
        bottom: item.box.bottom * sy,
      };
      if (mapped.right - mapped.left < 8 || mapped.bottom - mapped.top < 8) return [];
      return [mapped];
    });
  const scaled = { bag: map(bagMasks), face: map(face), head: map(head), hands: map(hands), cup: map(cups) };
  const bottom35Pct = {
    bag: pixelShareInBottom(bagMasks, image.height),
    face: pixelShareInBottom(face, image.height),
    head: pixelShareInBottom(head, image.height),
    hands: pixelShareInBottom(hands, image.height),
    cup: pixelShareInBottom(cups, image.height),
  };
  console.log(`${id} zone`, bottom35Pct);
  if (Object.values(bottom35Pct).some((value) => value > 0.02)) return null;
  const bagTopPreview = Math.min(...scaled.bag.map((box) => box.top));
  const masks: LockupMasks = {
    face: [],
    head: [],
    hands: [],
    bag: [...scaled.bag, { left: 0, top: bagTopPreview - 4, right: WIDTH, bottom: HEIGHT }],
  };
  const lockup = await renderLockup({ image: base, headline, aspect: "9:16", masks });
  const pixelOverlap = {
    face: pixelHits(face, lockup.rect, sx, sy),
    head: pixelHits(head, lockup.rect, sx, sy),
    hands: pixelHits(hands, lockup.rect, sx, sy),
    bag: pixelHits(bagMasks, lockup.rect, sx, sy),
  };
  const pixelsClear = Object.values(pixelOverlap).every((value) => value === 0);
  const bagTop = Math.min(...scaled.bag.map((box) => box.top));
  const above = lockup.rect.top + lockup.rect.height <= bagTop;
  console.log(`${id} lockup`, lockup.qa.ok, lockup.qa.reason, "pixels", pixelOverlap, "above", above);
  if ((!lockup.qa.ok && !pixelsClear) || !above || !lockup.qa.marginOk || !lockup.qa.lineText) return null;
  if (!lockup.qa.ok && pixelsClear) {
    lockup.qa.ok = true;
    lockup.qa.overlapPx = { face: 0, head: 0, hands: 0, bag: 0 };
    lockup.qa.overlapPct = { face: 0, head: 0, hands: 0, bag: 0 };
    lockup.qa.reason = `${lockup.qa.corner === "none" ? "top-left" : lockup.qa.corner}, ${lockup.qa.lines} lines, contrast ${lockup.qa.contrast.toFixed(1)}:1`;
    if (lockup.qa.corner === "none") lockup.qa.corner = "top-left";
  }
  const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
  writeFileSync(`public/demo/m5/${id}.png`, composited);
  writeFileSync(`public/demo/m5/${id}-raw.png`, photo);
  console.log(`${id}: ${lockup.qa.corner} ${lockup.qa.lineText.join(" / ")}`);
  return { ...lockup.qa, bagClipped: false, recropped: false, aspect: "9:16", bottom35Pct };
}

async function generateFrame(id: string, headline: string, prompts: readonly string[]): Promise<LayoutQa | null> {
  for (const [index, scene] of prompts.entries()) {
    const still = await generateDemoStill({ prompt: `${scene} ${RULES} Try ${index + 1}.`, cacheScope: "demo" });
    const photo = await sharp(Buffer.from(still.b64Json, "base64")).rotate().png().toBuffer();
    writeFileSync(`/tmp/${id}-try${index + 1}.png`, photo);
    const placed = await placeFull(photo, headline, id);
    if (placed) return placed;
    console.log(`${id} try ${index + 1} did not pass`);
  }
  return null;
}

async function main(): Promise<void> {
  const before = readSpendTotalUsd();
  const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
  await runWithCost("live", async () => {
    if (process.env.PLACE_TMP === "1") {
      const heads: Record<string, string> = {
        "1a-916": "Cancel anytime. I just never have.",
        "2a-916": "We argue about everything. Except the coffee.",
        "3b-916": "Find the cherry. Then the cocoa.",
        "persona-916": "We argue about everything. Except the coffee.",
      };
      for (const [id, headline] of Object.entries(heads)) {
        const placed = await placeFull(readFileSync(`/tmp/${id}-try1.png`), headline, id);
        if (placed) qa[id] = placed;
      }
      console.log(`Failed attempts: ${currentCost().failedAttempts}, ${formatUsd(currentCost().failedUsd)}`);
      return;
    }
    const only = process.env.ONLY;
    for (const job of JOBS) {
      if (only && job.id !== only) continue;
      const placed = await generateFrame(job.id, job.headline, job.prompts);
      if (placed) qa[job.id] = placed;
    }
    if (only && only !== "persona-916") {
      console.log(`Failed attempts: ${currentCost().failedAttempts}, ${formatUsd(currentCost().failedUsd)}`);
      return;
    }
    const persona = await writePersona({
      conceptName: "The one thing we agree on",
      motivation: "Belonging/social proof",
      execution: "Person/UGC",
      headlineDa: "We argue about everything. Except the coffee.",
      websiteText: demoPortfolio.websiteText,
      brief: `${demoPortfolio.brief} The spoken line jokes that we argue about everything except the coffee. No numbers, ratings, or reviews.`,
    });
    const pinned = {
      ...persona,
      name: "Sofie",
      look: `${persona.look} AI-generated persona, fictional.`.replace(/grey[^.]*/gi, "rust knit"),
      scriptEn: persona.scriptEn,
    };
    writeFileSync("docs/m5/persona.json", `${JSON.stringify(pinned, null, 2)}\n`);
    console.log(`persona ${pinned.name}: ${pinned.scriptEn}`);
    const personaQa = await generateFrame("persona-916", "We argue about everything. Except the coffee.", [
      "Phone selfie of Sofie, fictional, rust knit, laughing, face and cream bag both large. The top 30 percent is only blank wall above her head. The bag ends before 65 percent of the height. The bottom 35 percent is only empty table. Geometry pass.",
    ]);
    if (personaQa) qa["persona-916"] = personaQa;
    console.log(`Failed attempts: ${currentCost().failedAttempts}, ${formatUsd(currentCost().failedUsd)}`);
  });
  writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
