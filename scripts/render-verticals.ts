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
const TAIL = [
  "This is a real vertical 9:16 photograph, much taller than it is wide.",
  "Place the whole cream coffee bag in the middle of the height. The bottom of the bag must be above the lower third of the picture.",
  "Directly above the bag, leave a wide empty patch of wall or window for a caption. That patch is not at the very top edge, and it contains no face, no hands, no cup, and no bag.",
  "The bottom HALF of the photo is empty wooden floor with absolutely nothing on it. The bag, cups, hands, and people are all in the upper half, and the bag is still fully visible around the middle.",
  "Third framing attempt. The lower half must be empty.",
  brandKit.photoStyle,
  brandKit.people,
  `The coffee bag is ${brandKit.bag.description}.`,
  brandKit.noText,
  "No grey sweaters and no grey clothing. Second framing attempt.",
].join(" ");

const JOBS = [
  {
    id: "1a-916",
    headline: "Cancel anytime. I just never have.",
    scene:
      "The same calm window seat. An ordinary woman in a rust knit stands beside the coffee bag, not above it, looking slightly off camera with a flat white. Empty wall fills everything above the woman and the bag. The bag's bottom is above the vertical midpoint. The lower half of the photo is empty floor.",
  },
  {
    id: "2a-916",
    headline: "We argue about everything. Except the coffee.",
    scene:
      "Copy this layout exactly. The left two-thirds of the upper half is a blank white wall with nothing on it, wide enough for a caption. A couple in coral and olive stand only in the right third, softly out of focus, in a light playful argument, gesturing, one rolling their eyes. A sharp cream coffee bag and two filled cups sit in the center. The top of the bag is near the vertical middle and the base of the bag is well above the lower third. The bottom 40 percent is bare wooden floor. Sixth layout.",
  },
  {
    id: "3b-916",
    headline: "Find the cherry. Then the cocoa.",
    scene:
      "The same tasting still, now vertical. A cup of clear black filter coffee, small bowls of dark cherries and cocoa nibs, a tasting spoon, and the cream coffee bag, all sharp in the center. Two hands may enter from the sides at the height of the bag, not lower.",
  },
];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function masksOf(url: string, phrase: string): Promise<MaskBox[]> {
  const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
  if (!region.found || region.masks.length === 0) return region.boxes;
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
    return [{ left: mask.left + left, top: mask.top + top, right: mask.left + right, bottom: mask.top + bottom }];
  });
}

function zoneShare(items: MaskBox[], height: number): number {
  const limit = height * 0.65;
  const zone: MaskBox = { left: 0, top: limit, right: WIDTH, bottom: height };
  let hit = 0;
  let total = 0;
  for (const box of items) {
    const area = Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
    const w = Math.min(box.right, zone.right) - Math.max(box.left, zone.left);
    const h = Math.min(box.bottom, zone.bottom) - Math.max(box.top, zone.top);
    total += area;
    if (w > 0 && h > 0) hit += w * h;
  }
  return total > 0 ? hit / total : 0;
}

async function place(photo: Buffer, headline: string, id: string): Promise<LayoutQa | null> {
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const url = dataUrl(photo);
  const bagBoxes = await masksOf(url, "bag");
  const face = await masksOf(url, "face");
  const head = await masksOf(url, "head");
  const hands = await masksOf(url, "hands");
  const cups = await masksOf(url, "cup");
  const bag = [...bagBoxes].sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
  if (!bag) {
    console.log(`${id}: no bag`);
    return null;
  }
  let nearest = "";
  let bestZone = 1;
  let bestZoneNote = "";
  for (const scale of [1, 0.92, 0.84, 0.76, 0.68, 0.6]) {
  const cropW = Math.min(image.width, Math.round(image.height * (9 / 16) * scale));
  const cropH = Math.min(image.height, Math.round(cropW * (16 / 9)));
  for (let left = 0; left <= Math.max(0, image.width - cropW); left += Math.max(12, Math.round(cropW / 6))) {
    for (let top = 0; top <= Math.max(0, image.height - cropH); top += Math.max(12, Math.round(cropH / 6))) {
      const crop = { left, top, width: cropW, height: cropH };
      if (bag.left < crop.left - 1 || bag.top < crop.top - 1 || bag.right > crop.left + crop.width + 1 || bag.bottom > crop.top + crop.height + 1) continue;
      const base = await sharp(photo).extract(crop).resize(WIDTH, HEIGHT, { fit: "fill" }).png().toBuffer();
      const sx = WIDTH / crop.width;
      const sy = HEIGHT / crop.height;
      const map = (items: MaskBox[]): MaskBox[] =>
        items.flatMap((box) => {
          const x0 = Math.max(crop.left, box.left) - crop.left;
          const y0 = Math.max(crop.top, box.top) - crop.top;
          const x1 = Math.min(crop.left + crop.width, box.right) - crop.left;
          const y1 = Math.min(crop.top + crop.height, box.bottom) - crop.top;
          if (x1 - x0 < 8 || y1 - y0 < 8) return [];
          return [{ left: x0 * sx, top: y0 * sy, right: x1 * sx, bottom: y1 * sy }];
        });
      const scaled = {
        bag: map(bagBoxes),
        face: map(face),
        head: map(head),
        hands: map(hands),
        cup: map(cups),
      };
      const bottom35Pct = {
        bag: zoneShare(scaled.bag, HEIGHT),
        face: zoneShare(scaled.face, HEIGHT),
        head: zoneShare(scaled.head, HEIGHT),
        hands: zoneShare(scaled.hands, HEIGHT),
        cup: zoneShare(scaled.cup, HEIGHT),
      };
      const worstZone = Math.max(...Object.values(bottom35Pct));
      if (worstZone < bestZone) {
        bestZone = worstZone;
        bestZoneNote = JSON.stringify(bottom35Pct);
      }
      const zoneBad = worstZone > 0.02;
      if (zoneBad) continue;
      const masks: LockupMasks = { face: scaled.face, head: scaled.head, hands: scaled.hands, bag: scaled.bag };
      const lockup = await renderLockup({ image: base, headline, aspect: "9:16", masks });
      const bagTop = scaled.bag[0]?.top ?? HEIGHT;
      const aboveBag = lockup.rect.top + lockup.rect.height <= bagTop;
      if (!nearest) {
        nearest = `zone ${JSON.stringify(bottom35Pct)} lockup ${lockup.qa.ok} ${lockup.qa.reason} above ${aboveBag} bagTop ${Math.round(bagTop)}`;
        console.log(`${id} ${nearest}`);
      }
      if (zoneBad || !lockup.qa.ok || !aboveBag) continue;
      const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
      writeFileSync(`public/demo/m5/${id}.png`, composited);
      console.log(`${id}: ${lockup.qa.corner} ${lockup.qa.lineText.join(" / ")}`);
      return { ...lockup.qa, bagClipped: false, recropped: scale < 0.99, aspect: "9:16", bottom35Pct };
    }
  }
  }
  console.log(`${id}: FAILED best zone share ${bestZone.toFixed(3)} ${bestZoneNote}`);
  return null;
}

async function main(): Promise<void> {
  const before = readSpendTotalUsd();
  const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
  await runWithCost("live", async () => {
    const only = process.env.ONLY;
    for (const job of JOBS) {
      if (only && job.id !== only) continue;
      const still = await generateDemoStill({ prompt: `${job.scene} ${TAIL}`, cacheScope: "demo" });
      const photo = await sharp(Buffer.from(still.b64Json, "base64")).rotate().png().toBuffer();
      writeFileSync(`public/demo/m5/${job.id}-raw.png`, photo);
      const placed = await place(photo, job.headline, job.id);
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
      look: "AI-generated persona, fictional. Adult woman from Aarhus with shoulder-length brown hair, no makeup, rust knit sweater, in a small kitchen in morning light.",
    };
    writeFileSync("docs/m5/persona.json", `${JSON.stringify(pinned, null, 2)}\n`);
    console.log(`persona ${pinned.name}: ${pinned.scriptEn}`);
    const personaPrompts = [
      [
        "Vertical handheld phone photo of Sofie, a fictional adult. AI-generated persona, fictional. Rust knit, never grey, shoulder-length brown hair, laughing.",
        "Copy the framing of a tall photo where she stands only in the right quarter. A small cream coffee bag stands on a wooden shelf in the center, fully visible, with the base of the bag above the midpoint. Her hands stay next to the top of the bag and do not hang down. The left side is a blank white wall. The entire lower half is an empty wooden table and floor, with no bag, no hands, and no body. Eighth layout.",
      ].join(" "),
      [
        "Vertical photo. A tiny cream coffee bag, fully visible, sits on a high kitchen shelf exactly at the vertical center. Sofie, rust sweater, stands to the right of the bag and is cropped by the right edge. Her hands are up on the shelf, not below it. Everything below the shelf is empty floor for half the picture. Blank wall on the left. Ninth layout.",
      ].join(" "),
    ];
    let personaQa: LayoutQa | null = null;
    for (const [index, scene] of personaPrompts.entries()) {
      const portrait = await generateDemoStill({
        prompt: `${scene} ${TAIL}`,
        cacheScope: "demo",
      });
      const portraitPng = await sharp(Buffer.from(portrait.b64Json, "base64")).rotate().png().toBuffer();
      writeFileSync("public/demo/m5/persona-raw.png", portraitPng);
      personaQa = await place(portraitPng, "We argue about everything. Except the coffee.", "persona-916");
      if (personaQa) break;
      console.log(`persona prompt ${index + 1} did not place`);
    }
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
