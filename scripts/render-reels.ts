import { readFileSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { renderLockup, type LayoutQa, type LockupMasks } from "../lib/lockup";
import { readCachedRegions, segmentRegions } from "../lib/meta";
import type { MaskBox } from "../lib/smart-crop";

const WIDTH = 800;
const HEIGHT = 1422;

const JOBS = [
  { id: "1a-916", file: "public/demo/m5/1a-raw.png", headline: "Cancel anytime. I just never have." },
  { id: "3b-916", file: "public/demo/m5/3b-raw.png", headline: "Find the cherry. Then the cocoa." },
];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function holds(rect: { left: number; top: number; width: number; height: number }, bag: MaskBox): boolean {
  return bag.left >= rect.left - 1 && bag.top >= rect.top - 1 && bag.right <= rect.left + rect.width + 1 && bag.bottom <= rect.top + rect.height + 1;
}

async function boxes(url: string, phrase: string): Promise<MaskBox[]> {
  const cached = readCachedRegions(url, phrase, "demo");
  if (cached) return cached.boxes;
  const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
  return region.boxes;
}

async function main(): Promise<void> {
  const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
  for (const job of JOBS) {
    const photo = readFileSync(job.file);
    const meta = await sharp(photo).metadata();
    const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
    const url = dataUrl(photo);
    const bagBoxes = await boxes(url, "bag");
    const face = await boxes(url, "face");
    const head = await boxes(url, "head");
    const hands = await boxes(url, "hands");
    const bag = bagBoxes.sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
    if (!bag) throw new Error(`${job.id} has no bag`);
    const cropW = Math.min(image.width, Math.round(image.height * (9 / 16)));
    const cropH = Math.min(image.height, Math.round(cropW * (16 / 9)));
    let saved = false;
    for (let left = 0; left <= image.width - cropW; left += Math.max(16, Math.round(cropW / 10))) {
      for (let top = 0; top <= image.height - cropH; top += Math.max(16, Math.round(cropH / 8))) {
        const crop = { left, top, width: cropW, height: cropH };
        if (!holds(crop, bag)) continue;
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
        const masks: LockupMasks = { face: map(face), head: map(head), hands: map(hands), bag: map(bagBoxes) };
        const lockup = await renderLockup({ image: base, headline: job.headline, aspect: "9:16", masks });
        if (!lockup.qa.ok) continue;
        const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
        writeFileSync(`public/demo/m5/${job.id}.png`, composited);
        qa[job.id] = { ...lockup.qa, bagClipped: false };
        console.log(`${job.id}: ${lockup.qa.corner} ${lockup.qa.lineText.join(" / ")}`);
        saved = true;
        break;
      }
      if (saved) break;
    }
    if (!saved) console.log(`${job.id}: FAILED`);
  }
  writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
