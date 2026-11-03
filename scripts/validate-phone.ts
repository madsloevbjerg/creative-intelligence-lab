import { readFileSync } from "node:fs";

import sharp from "sharp";

import { readCachedRegions } from "../lib/meta";
import {
  NOTICE_TEXT,
  SCREEN_CARD_MARGIN,
  minAreaRect,
  noticeLines,
  noticeOverlay,
  noticeSamples,
  placeNotice,
  type Point,
} from "../lib/phone-notice";

const PHRASES = ["phone screen", "screen", "green screen"];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const { title, line1, line2 } = noticeLines();
  const joined = `${title}: ${line1} ${line2}`;
  if (joined !== NOTICE_TEXT) fail(`Notification text changed: ${joined}`);

  const saved = JSON.parse(readFileSync("lib/phone-screen.json", "utf8")) as { phrase?: string };
  if (!saved.phrase || !PHRASES.includes(saved.phrase)) fail("Ad 6 screen phrase is missing.");
  const base = readFileSync("public/demo/dcl-06-base.png");
  const url = dataUrl(base);
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const region = readCachedRegions(url, saved.phrase, "demo");
  if (!region?.found) fail(`Ad 6 has no cached “${saved.phrase}” mask.`);
  let chosen: { raster: Uint8Array | number[]; width: number; height: number; originX: number; originY: number; points: Point[]; count: number } | null = null;
  for (const mask of region.masks) {
      const raster = decodeMaskToRaster(mask);
      const points: Point[] = [];
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (raster[y * mask.width + x] !== 1) continue;
          const edge =
            x === 0 ||
            y === 0 ||
            x === mask.width - 1 ||
            y === mask.height - 1 ||
            raster[y * mask.width + x - 1] !== 1 ||
            raster[y * mask.width + x + 1] !== 1 ||
            raster[(y - 1) * mask.width + x] !== 1 ||
            raster[(y + 1) * mask.width + x] !== 1;
          if (edge && (x + y) % 2 === 0) points.push({ x: mask.left + x, y: mask.top + y });
        }
      }
      if (points.length < 40) continue;
      const rect = minAreaRect(points);
      if (!rect || rect.center.y > 1000 * 0.55) continue;
      const count = raster.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0);
      if (!chosen || count > chosen.count) {
        chosen = { raster, width: mask.width, height: mask.height, originX: mask.left, originY: mask.top, points, count };
      }
    }
  if (!chosen) fail("Ad 6 has no cached phone-screen mask.");
  const rect = minAreaRect(chosen.points);
  if (!rect) fail("Ad 6 screen mask has no rotated rectangle.");
  const placement = placeNotice(rect, SCREEN_CARD_MARGIN);
  const sampleOutside = noticeSamples(placement).filter((point) => {
    const x = Math.round(point.x - chosen.originX);
    const y = Math.round(point.y - chosen.originY);
    return x < 0 || y < 0 || x >= chosen.width || y >= chosen.height || chosen.raster[y * chosen.width + x] !== 1;
  });
  if (sampleOutside.length > 0) fail(`Ad 6 card leaves the screen at ${sampleOutside.length} sample points.`);

  const overlay = await sharp(Buffer.from(noticeOverlay(800, 1000, placement))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let outside = 0;
  for (let y = 0; y < overlay.info.height; y += 1) {
    for (let x = 0; x < overlay.info.width; x += 1) {
      const alpha = overlay.data[(y * overlay.info.width + x) * 4 + 3] ?? 0;
      if (alpha < 200) continue;
      opaque += 1;
      const px = x - chosen.originX;
      const py = y - chosen.originY;
      if (px < 0 || py < 0 || px >= chosen.width || py >= chosen.height || chosen.raster[py * chosen.width + px] !== 1) outside += 1;
    }
  }
  if (opaque < 1000) fail("Ad 6 card did not render.");
  if (outside > 0) fail(`Ad 6 card has ${outside} opaque pixels outside the screen mask.`);
  console.log(`Ad 6 card stays inside the ${chosen.points.length > 0 ? "phone screen" : "screen"} mask. ${opaque} opaque pixels, 0 outside.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
