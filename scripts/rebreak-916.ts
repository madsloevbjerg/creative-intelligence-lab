import { readFileSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { renderLockup, type LayoutQa, type LockupMasks } from "../lib/lockup";
import { readCachedRegions, segmentRegions } from "../lib/meta";
import type { MaskBox } from "../lib/smart-crop";

const WIDTH = 800;
const HEIGHT = 1422;

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function boxes(url: string, phrase: string): Promise<MaskBox[]> {
  const cached = readCachedRegions(url, phrase, "demo");
  const region = cached ?? (await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" }));
  if (!region.found) return [];
  if (region.masks.length === 0) return region.boxes;
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
  let hit = 0;
  let total = 0;
  for (const box of items) {
    const area = Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
    const w = Math.min(box.right, WIDTH) - Math.max(box.left, 0);
    const h = Math.min(box.bottom, height) - Math.max(box.top, limit);
    total += area;
    if (w > 0 && h > 0) hit += w * h;
  }
  return total > 0 ? hit / total : 0;
}

async function place(file: string, id: string, headline: string): Promise<void> {
  const photo = readFileSync(file);
  const url = dataUrl(photo);
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const bagBoxes = await boxes(url, "bag");
  const face = await boxes(url, "face");
  const head = await boxes(url, "head");
  const hands = await boxes(url, "hands");
  const cups = await boxes(url, "cup");
  const bag = [...bagBoxes].sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top))[0];
  if (!bag) throw new Error(`${id} no bag`);
  const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
  for (const scale of [1, 0.92, 0.84, 0.76, 0.68]) {
    const cropW = Math.min(image.width, Math.round(image.height * (9 / 16) * scale));
    const cropH = Math.min(image.height, Math.round(cropW * (16 / 9)));
    for (let left = 0; left <= image.width - cropW; left += Math.max(16, Math.round(cropW / 6))) {
      for (let top = 0; top <= image.height - cropH; top += Math.max(16, Math.round(cropH / 6))) {
        if (bag.left < left - 1 || bag.top < top - 1 || bag.right > left + cropW + 1 || bag.bottom > top + cropH + 1) continue;
        const base = await sharp(photo).extract({ left, top, width: cropW, height: cropH }).resize(WIDTH, HEIGHT, { fit: "fill" }).png().toBuffer();
        const sx = WIDTH / cropW;
        const sy = HEIGHT / cropH;
        const map = (items: MaskBox[]): MaskBox[] =>
          items.flatMap((box) => {
            const x0 = Math.max(left, box.left) - left;
            const y0 = Math.max(top, box.top) - top;
            const x1 = Math.min(left + cropW, box.right) - left;
            const y1 = Math.min(top + cropH, box.bottom) - top;
            if (x1 - x0 < 8 || y1 - y0 < 8) return [];
            return [{ left: x0 * sx, top: y0 * sy, right: x1 * sx, bottom: y1 * sy }];
          });
        const scaled = { bag: map(bagBoxes), face: map(face), head: map(head), hands: map(hands), cup: map(cups) };
        const bottom35Pct = {
          bag: zoneShare(scaled.bag, HEIGHT),
          face: zoneShare(scaled.face, HEIGHT),
          head: zoneShare(scaled.head, HEIGHT),
          hands: zoneShare(scaled.hands, HEIGHT),
          cup: zoneShare(scaled.cup, HEIGHT),
        };
        if (Object.values(bottom35Pct).some((value) => value > 0.02)) continue;
        const masks: LockupMasks = { face: scaled.face, head: scaled.head, hands: scaled.hands, bag: scaled.bag };
        const lockup = await renderLockup({ image: base, headline, aspect: "9:16", masks });
        const bagTop = Math.min(...scaled.bag.map((box) => box.top));
        const above = lockup.rect.top + lockup.rect.height <= bagTop;
        if (id === "2a-916" && (!lockup.qa.ok || !above)) {
          console.log("2a miss", lockup.qa.reason, "above", above, "bagTop", Math.round(bagTop), "y", lockup.rect.top, "h", lockup.rect.height);
        }
        if (!lockup.qa.ok || !above) continue;
        const wanted = headline === "We argue about everything. Except the coffee." ? "We argue about everything. / Except the coffee." : null;
        if (wanted && lockup.qa.lineText.join(" / ") !== wanted) continue;
        const composited = await sharp(base).composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }]).png().toBuffer();
        writeFileSync(`public/demo/m5/${id}.png`, composited);
        qa[id] = { ...lockup.qa, bagClipped: false, recropped: scale < 0.99, aspect: "9:16", bottom35Pct };
        writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
        console.log(id, lockup.qa.lineText.join(" / "), lockup.qa.corner);
        return;
      }
    }
  }
  console.log(id, "FAILED");
}

async function main(): Promise<void> {
  await place("public/demo/m5/1a-916-raw.png", "1a-916", "Cancel anytime. I just never have.");
  await place("public/demo/m5/2a-916-raw.png", "2a-916", "We argue about everything. Except the coffee.");
  await place("public/demo/m5/3b-916-raw.png", "3b-916", "Find the cherry. Then the cocoa.");
  await place("public/demo/m5/persona-raw.png", "persona-916", "We argue about everything. Except the coffee.");
}

main();
