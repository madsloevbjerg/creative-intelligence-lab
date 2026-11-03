import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { renderLockup, type LayoutQa, type LockupMasks } from "../lib/lockup";
import { readCachedRegions } from "../lib/meta";
import { FEED_ASPECT, type MaskBox } from "../lib/smart-crop";
import { decodeMaskToRaster } from "@meta-sam/parser";

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
function holds(rect: { left: number; top: number; width: number; height: number }, bag: MaskBox): boolean {
  return bag.left >= rect.left - 1 && bag.top >= rect.top - 1 && bag.right <= rect.left + rect.width + 1 && bag.bottom <= rect.top + rect.height + 1;
}
function tight(url: string, phrase: string): MaskBox[] {
  const region = readCachedRegions(url, phrase, "demo");
  if (!region?.found || region.masks.length === 0) return region?.boxes ?? [];
  return region.masks.map((mask) => {
    const raster = decodeMaskToRaster(mask);
    let left = mask.width, top = mask.height, right = 0, bottom = 0, count = 0;
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
  const photo = readFileSync("public/demo/m5/v2-b-raw.png");
  const url = dataUrl(photo);
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const bagBoxes = tight(url, "bag");
  const face = tight(url, "face");
  const head = tight(url, "head");
  const hands = tight(url, "hands");
  const bag = [...bagBoxes].sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
  if (!bag) throw new Error("no bag");
  const cropH = Math.min(image.height, Math.round(image.width / FEED_ASPECT));
  const cropW = Math.min(image.width, Math.round(cropH * FEED_ASPECT));
  for (let left = 0; left <= image.width - cropW; left += Math.max(20, Math.round(cropW / 12))) {
    for (let top = 0; top <= image.height - cropH; top += Math.max(20, Math.round(cropH / 10))) {
      const crop = { left, top, width: cropW, height: cropH };
      if (!holds(crop, bag)) continue;
      const base = await sharp(photo).extract(crop).resize(800, 1000, { fit: "fill" }).png().toBuffer();
      const sx = 800 / crop.width;
      const sy = 1000 / crop.height;
      const map = (items: MaskBox[]): MaskBox[] => items.flatMap((box) => {
        const x0 = Math.max(crop.left, box.left) - crop.left;
        const y0 = Math.max(crop.top, box.top) - crop.top;
        const x1 = Math.min(crop.left + crop.width, box.right) - crop.left;
        const y1 = Math.min(crop.top + crop.height, box.bottom) - crop.top;
        if (x1 - x0 < 8 || y1 - y0 < 8) return [];
        return [{ left: x0 * sx, top: y0 * sy, right: x1 * sx, bottom: y1 * sy }];
      });
      const masks: LockupMasks = { face: map(face), head: map(head), hands: map(hands), bag: map(bagBoxes) };
      const lockup = await renderLockup({ image: base, headline: "We argue about everything. Except the coffee.", aspect: "4:5", masks });
      if (!lockup.qa.ok) continue;
      const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
      writeFileSync("public/demo/m5/2a.png", composited);
      writeFileSync("public/demo/m5/2a-raw.png", photo);
      const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
      qa["2a"] = { ...lockup.qa, bagClipped: false, recropped: true };
      writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
      console.log(lockup.qa.lineText.join(" / "));
      return;
    }
  }
  throw new Error("no fit");
}
main();
