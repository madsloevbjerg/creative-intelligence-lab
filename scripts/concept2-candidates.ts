import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { contactSheet } from "../lib/composite-ad";
import { renderLockup, type LockupMasks } from "../lib/lockup";
import { formatUsd } from "../lib/money";
import { currentCost, generateDemoStill, readSpendTotalUsd, runWithCost, segmentRegions } from "../lib/meta";
import { FEED_ASPECT, frameSubjects, type MaskBox } from "../lib/smart-crop";

const SCENES = [
  "Two ordinary flatmates in a small real kitchen in the morning, both laughing. Each has a hand on the same cream coffee bag, and one is playfully pulling it toward herself. Mugs on the counter, a kettle, low morning light. She wears rust, he wears navy. Candid phone photo, slightly tilted, not a stock shot.",
  "A couple at a worn kitchen table, morning. Both laughing, both hands on one cream coffee bag, one pulling it away. Pour-over and two mugs, crumbs, a plant. Clothing in olive and coral. Imperfect handheld photo.",
  "Two flatmates by a bright kitchen window, mid-laugh. One tugs the cream coffee bag while the other holds on. A kettle and two mismatched mugs. Mustard and blue shirts. Phone photo, a little crooked, real clutter.",
];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function holds(rect: { left: number; top: number; width: number; height: number }, bag: MaskBox): boolean {
  return bag.left >= rect.left - 1 && bag.top >= rect.top - 1 && bag.right <= rect.left + rect.width + 1 && bag.bottom <= rect.top + rect.height + 1;
}

async function boxes(url: string, phrase: string): Promise<MaskBox[]> {
  const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
  return region.boxes;
}

async function main(): Promise<void> {
  const before = readSpendTotalUsd();
  const out = path.join("public", "demo", "m5");
  mkdirSync(out, { recursive: true });
  const cells: { label: string; image: Buffer }[] = [];
  await runWithCost("live", async () => {
    for (const [index, scene] of SCENES.entries()) {
      const id = `c2-${String.fromCharCode(97 + index)}`;
      const prompt = [
        scene,
        "Tall photo. Keep the bag and both people in the middle band so it can also crop to 9:16.",
        brandKit.photoStyle,
        brandKit.people,
        `The coffee bag is ${brandKit.bag.description}.`,
        brandKit.noText,
        "No grey sweaters and no grey clothing.",
      ].join(" ");
      const still = await generateDemoStill({ prompt, cacheScope: "demo" });
      const photo = await sharp(Buffer.from(still.b64Json, "base64")).rotate().png().toBuffer();
      const url = dataUrl(photo);
      const meta = await sharp(photo).metadata();
      const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
      const bagBoxes = await boxes(url, "bag");
      const face = await boxes(url, "face");
      const head = await boxes(url, "head");
      const hands = await boxes(url, "hands");
      const bag = bagBoxes.sort(
        (a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top),
      )[0];
      writeFileSync(path.join(out, `${id}-raw.png`), photo);
      if (!bag) {
        console.log(`${id}: no bag`);
        cells.push({ label: `${id}\nno bag`, image: photo });
        continue;
      }
      const cropH = Math.min(image.height, Math.round(image.width / FEED_ASPECT));
      const cropW = Math.min(image.width, Math.round(cropH * FEED_ASPECT));
      let saved = false;
      for (let top = 0; top <= image.height - cropH; top += Math.max(20, Math.round(cropH / 16))) {
        const crop = { left: 0, top, width: cropW, height: cropH };
        if (!holds(crop, bag)) continue;
        const base = await sharp(photo).extract(crop).resize(800, 1000, { fit: "fill" }).png().toBuffer();
        const sx = 800 / crop.width;
        const sy = 1000 / crop.height;
        const map = (items: MaskBox[]): MaskBox[] =>
          items.flatMap((box) => {
            const left = Math.max(crop.left, box.left) - crop.left;
            const itemTop = Math.max(crop.top, box.top) - crop.top;
            const right = Math.min(crop.left + crop.width, box.right) - crop.left;
            const bottom = Math.min(crop.top + crop.height, box.bottom) - crop.top;
            if (right - left < 8 || bottom - itemTop < 8) return [];
            return [{ left: left * sx, top: itemTop * sy, right: right * sx, bottom: bottom * sy }];
          });
        const masks: LockupMasks = { face: map(face), head: map(head), hands: map(hands), bag: map(bagBoxes) };
        const lockup = await renderLockup({
          image: base,
          headline: "We share everything. Except this.",
          aspect: "4:5",
          masks,
        });
        if (!lockup.qa.ok) continue;
        const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
        writeFileSync(path.join(out, `${id}.png`), composited);
        cells.push({ label: `${id}\nbag full · lockup fits · ${lockup.qa.corner}`, image: composited });
        console.log(`${id}: fits ${lockup.qa.corner} ${lockup.qa.lineText.join(" / ")}`);
        saved = true;
        break;
      }
      if (!saved) {
        console.log(`${id}: no crop keeps the whole bag and a clear lockup`);
        cells.push({ label: `${id}\nno clear lockup`, image: photo });
      }
    }
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });
  const sheet = await contactSheet({
    title: "Concept 2 candidates",
    columns: 3,
    cells: cells.map((cell) => ({ ...cell, fit: "cover" as const })),
    cellWidth: 360,
    cellHeight: 450,
  });
  const jpeg = await sharp(sheet).resize({ width: 1600 }).jpeg({ quality: 85 }).toBuffer();
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/concept2_candidates.jpg", jpeg);
  writeFileSync("docs/m5/concept2-candidates.jpg", jpeg);
  console.log(`jpeg ${jpeg.byteLength}`);
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
