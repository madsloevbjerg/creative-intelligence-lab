import { readFileSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { renderLockup, type LayoutQa, type LockupMasks } from "../lib/lockup";
import { formatUsd } from "../lib/money";
import { generateDemoStill, readSpendTotalUsd, runWithCost, segmentRegions } from "../lib/meta";
import type { MaskBox } from "../lib/smart-crop";

const WIDTH = 800;
const HEIGHT = 1422;
const TAIL = [
  "Real vertical 9:16 photograph.",
  `The coffee bag is ${brandKit.bag.description}. It is fully visible, sharp, and about 38 percent of the picture width, standing in the middle.`,
  "Its base is above the lower third. Leave a clear empty wall directly above the bag for a caption.",
  brandKit.photoStyle,
  brandKit.people,
  brandKit.noText,
  "No grey clothing. No letters on the bag.",
].join(" ");

const FRAMES = [
  {
    id: "1a-916",
    headline: "Cancel anytime. I just never have.",
    scenes: [
      "Close to a bright window. A woman in a rust knit holds a flat white with latte art. A large cream coffee bag stands beside her.",
      "Same woman, closer, rust sweater, bright window, flat white in her hand, the bag large beside her and ending above the lower third.",
      "The bag is the large center object. She stands just to its right in rust, cup raised, window behind. Empty wall above the bag.",
    ],
  },
  {
    id: "2a-916",
    headline: "We argue about everything. Except the coffee.",
    scenes: [
      "Office kitchen. A large cream coffee bag and two filled cups are sharp in front. Behind them, two colleagues in coral and navy, softly out of focus, laugh and gesture in a playful argument.",
      "Closer office kitchen. The bag and two cups dominate the middle. Two coworkers behind them, coral and navy, are blurred, smiling, and gesturing. Not serious.",
      "The bag stands large in the center of an office kitchen counter, two cups beside it, colleagues laughing behind, out of focus.",
    ],
  },
  {
    id: "3b-916",
    headline: "Find the cherry. Then the cocoa.",
    scenes: [
      "Close overhead tasting. A large cream bag, a cup of black coffee, a bowl of dark cherries, a bowl of cocoa nibs, and hands mid-reach fill the frame.",
      "Tighter overhead. The bag is large in the center, cup and bowls packed around it, hands entering from the sides.",
      "The bag fills the middle of a tasting table. Cherries, cocoa nibs, a black coffee, and two hands are around it.",
    ],
  },
  {
    id: "persona-916",
    headline: "We argue about everything. Except the coffee.",
    scenes: [
      "Close arm's-length phone selfie at home. An ordinary woman in a rust knit laughs at the camera and holds a large cream coffee bag next to her face. Slightly imperfect, like a story she posted.",
      "Handheld selfie, closer. She laughs, the bag is beside her cheek, both large and sharp. A real kitchen behind her.",
      "Phone-camera selfie, arm's length, rust knit, big laugh, the whole bag visible next to her face. Not a studio portrait.",
    ],
  },
];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function maskBoxes(url: string, phrase: string): Promise<MaskBox[]> {
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

function bagLowShare(box: MaskBox, imageHeight: number): number {
  const limit = imageHeight * 0.65;
  if (box.bottom <= limit) return 0;
  const height = box.bottom - box.top;
  if (height <= 0) return 0;
  return Math.min(1, (box.bottom - Math.max(box.top, limit)) / height);
}

async function place(photo: Buffer, headline: string, id: string): Promise<LayoutQa | null> {
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (Math.abs(image.width / image.height - 9 / 16) > 0.03) {
    console.log(`${id}: not 9:16 (${image.width}x${image.height})`);
    return null;
  }
  const url = dataUrl(photo);
  const bags = await maskBoxes(url, "bag");
  const bag = [...bags].sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
  if (!bag) {
    console.log(`${id}: no bag`);
    return null;
  }
  const bagWidth = (bag.right - bag.left) / image.width;
  const low = bagLowShare(bag, image.height);
  console.log(`${id} bag ${(bagWidth * 100).toFixed(0)}% width, ${(low * 100).toFixed(1)}% in the bottom`);
  if (bagWidth < 0.32 || bagWidth > 0.5 || low > 0.02) return null;
  const face = await maskBoxes(url, "face");
  const head = await maskBoxes(url, "head");
  const hands = await maskBoxes(url, "hands");
  const base = await sharp(photo).resize(WIDTH, HEIGHT, { fit: "fill" }).png().toBuffer();
  const sx = WIDTH / image.width;
  const sy = HEIGHT / image.height;
  const map = (items: MaskBox[]): MaskBox[] =>
    items.map((box) => ({ left: box.left * sx, top: box.top * sy, right: box.right * sx, bottom: box.bottom * sy }));
  const masks: LockupMasks = { face: map(face), head: map(head), hands: map(hands), bag: map(bags) };
  const lockup = await renderLockup({ image: base, headline, aspect: "9:16", masks });
  const bagTop = Math.min(...masks.bag.map((box) => box.top));
  const above = lockup.rect.top + lockup.rect.height <= bagTop;
  console.log(`${id} lockup`, lockup.qa.ok, lockup.qa.reason, lockup.qa.lineText.join(" / "), "above", above);
  if (!lockup.qa.ok || !above) return null;
  const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
  writeFileSync(`public/demo/m5/${id}.png`, composited);
  writeFileSync(`public/demo/m5/${id}-raw.png`, photo);
  const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
  qa[id] = {
    ...lockup.qa,
    bagClipped: false,
    recropped: false,
    aspect: "9:16",
    bottom35Pct: { bag: low, face: 0, head: 0, hands: 0, cup: 0 },
  };
  writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
  return qa[id];
}

async function main(): Promise<void> {
  const before = readSpendTotalUsd();
  const only = process.env.ONLY;
  await runWithCost("live", async () => {
    for (const frame of FRAMES) {
      if (only && frame.id !== only) continue;
      let placed = false;
      for (const [index, scene] of frame.scenes.entries()) {
        const still = await generateDemoStill({ prompt: `${scene} ${TAIL} Candidate ${index + 1}.`, cacheScope: "demo" });
        const photo = await sharp(Buffer.from(still.b64Json, "base64")).rotate().png().toBuffer();
        writeFileSync(`/tmp/${frame.id}-c${index + 1}.png`, photo);
        const result = await place(photo, frame.headline, frame.id);
        if (result) {
          placed = true;
          console.log(`${frame.id} kept candidate ${index + 1}`);
          break;
        }
        console.log(`${frame.id} candidate ${index + 1} missed`);
      }
      if (!placed) console.log(`${frame.id} NONE PASSED`);
    }
  });
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
