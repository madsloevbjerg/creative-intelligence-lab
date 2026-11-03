import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { contactSheet } from "../lib/composite-ad";
import { renderLockup, type LockupMasks } from "../lib/lockup";
import { formatUsd } from "../lib/money";
import { currentCost, generateDemoStill, readSpendTotalUsd, runWithCost, segmentRegions } from "../lib/meta";
import { FEED_ASPECT, type MaskBox } from "../lib/smart-crop";

const HEADLINE = "We argue about everything. Except the coffee.";
const SCENES = [
  "A cream coffee bag and two filled cups are sharp in the foreground, slightly right of center, on a wooden kitchen table. The bottom-left of the table is empty. In the soft background, a couple in a light playful argument: she gestures with one hand, he rolls his eyes, both almost laughing. She wears rust, he wears navy. Morning light, a real home, candid phone photo.",
  "Sharp foreground: the cream coffee bag standing between two full mugs, center of a breakfast table. Empty table at the lower left. Behind them, out of focus, a couple mid playful argument, one shrugging, one pointing at the other and smiling. Olive shirt and coral sweater. Morning window light. Slightly crooked phone photo.",
  "The cream coffee bag is the sharp hero, with two cups of coffee beside it, on a pale kitchen table. Leave the lower-left corner as bare wood. Softly behind, a couple argue playfully, one with raised eyebrows, the other waving a hand, both clearly not serious. Mustard and blue clothing. Morning, imperfect, not a stock photo.",
];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function holds(rect: { left: number; top: number; width: number; height: number }, bag: MaskBox): boolean {
  return bag.left >= rect.left - 1 && bag.top >= rect.top - 1 && bag.right <= rect.left + rect.width + 1 && bag.bottom <= rect.top + rect.height + 1;
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
    if (count < 40) return { left: 0, top: 0, right: 0, bottom: 0 };
    return { left: mask.left + left, top: mask.top + top, right: mask.left + right, bottom: mask.top + bottom };
  }).filter((box) => box.right > box.left + 8);
}

async function main(): Promise<void> {
  const before = readSpendTotalUsd();
  const out = path.join("public", "demo", "m5");
  mkdirSync(out, { recursive: true });
  const cells: { label: string; image: Buffer }[] = [];
  await runWithCost("live", async () => {
    for (const [index, scene] of SCENES.entries()) {
      const id = `v2-${String.fromCharCode(97 + index)}`;
      const prompt = [
        scene,
        "Tall photograph with the bag and cups in the middle band so it can also crop to 9:16 later.",
        brandKit.photoStyle,
        brandKit.people,
        `The coffee bag is ${brandKit.bag.description}.`,
        brandKit.noText,
        "No grey sweaters and no grey clothing.",
      ].join(" ");
      const still = await generateDemoStill({ prompt, cacheScope: "demo" });
      const photo = await sharp(Buffer.from(still.b64Json, "base64")).rotate().png().toBuffer();
      writeFileSync(path.join(out, `${id}-raw.png`), photo);
      const url = dataUrl(photo);
      const meta = await sharp(photo).metadata();
      const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
      const bagBoxes = await boxes(url, "bag");
      const face = await boxes(url, "face");
      const head = await boxes(url, "head");
      const hands = await boxes(url, "hands");
      const bag = [...bagBoxes].sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
      if (!bag) {
        console.log(`${id}: no bag`);
        cells.push({ label: `${id}\nno bag`, image: photo });
        continue;
      }
      const cropH = Math.min(image.height, Math.round(image.width / FEED_ASPECT));
      const cropW = Math.min(image.width, Math.round(cropH * FEED_ASPECT));
      let saved = false;
      for (let left = 0; left <= image.width - cropW; left += Math.max(20, Math.round(cropW / 12))) {
        for (let top = 0; top <= image.height - cropH; top += Math.max(20, Math.round(cropH / 10))) {
          const crop = { left, top, width: cropW, height: cropH };
          if (!holds(crop, bag)) continue;
          const base = await sharp(photo).extract(crop).resize(800, 1000, { fit: "fill" }).png().toBuffer();
          const sx = 800 / crop.width;
          const sy = 1000 / crop.height;
          const map = (items: MaskBox[]): MaskBox[] =>
            items.flatMap((box) => {
              const x0 = Math.max(crop.left, box.left) - crop.left;
              const y0 = Math.max(crop.top, box.top) - crop.top;
              const x1 = Math.min(crop.left + crop.width, box.right) - crop.left;
              const y1 = Math.min(crop.top + crop.height, box.bottom) - crop.top;
              if (x1 - x0 < 8 || y1 - y0 < 8) return [];
              return [{ left: x0 * sx, top: y0 * sy, right: x1 * sx, bottom: y1 * sy }];
            });
          const masks: LockupMasks = { face: map(face), head: map(head), hands: map(hands), bag: map(bagBoxes) };
          const lockup = await renderLockup({ image: base, headline: HEADLINE, aspect: "4:5", masks });
          if (!lockup.qa.ok) continue;
          const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
          writeFileSync(path.join(out, `${id}.png`), composited);
          cells.push({ label: `${id}\nlockup fits · ${lockup.qa.corner}`, image: composited });
          console.log(`${id}: FITS ${lockup.qa.corner} ${lockup.qa.lineText.join(" / ")} faces ${face.length} hands ${hands.length}`);
          saved = true;
          break;
        }
        if (saved) break;
      }
      if (!saved) {
        console.log(`${id}: no clear lockup`);
        cells.push({ label: `${id}\nno clear lockup`, image: photo });
      }
    }
    console.log(`Failed attempts: ${currentCost().failedAttempts}, ${formatUsd(currentCost().failedUsd)}`);
  });
  const sheet = await contactSheet({
    title: "Concept 2 v2 candidates",
    columns: 3,
    cells: cells.map((cell) => ({ ...cell, fit: "cover" as const })),
    cellWidth: 360,
    cellHeight: 450,
  });
  const jpeg = await sharp(sheet).resize({ width: 1600 }).jpeg({ quality: 82 }).toBuffer();
  if (jpeg.byteLength > 900 * 1024) throw new Error(`sheet ${jpeg.byteLength}`);
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/concept2_v2_candidates.jpg", jpeg);
  writeFileSync("docs/m5/concept2-v2-candidates.jpg", jpeg);
  console.log(`jpeg ${jpeg.byteLength}`);
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
