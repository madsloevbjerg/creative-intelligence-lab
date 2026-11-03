import { readFileSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { layoutQaLine, renderLockup, type LockupMasks } from "../lib/lockup";
import { readCachedRegions, runWithCost, segmentRegions } from "../lib/meta";
import { minAreaRect, noticeOverlay, noticeSamples, placeNotice, type Point } from "../lib/phone-notice";
import type { MaskBox } from "../lib/smart-crop";

const WIDTH = 800;
const HEIGHT = 1000;
const CROP = { left: 432, top: 0, width: 1024, height: 1280 };
const PHRASES = ["phone screen", "screen", "green screen"];

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

type RasterMask = {
  phrase: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  raster: Uint8Array | number[];
  points: Point[];
};

async function masksOf(url: string, phrase: string): Promise<RasterMask[]> {
  const cached = readCachedRegions(url, phrase, "demo");
  const region = cached ?? (await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" }));
  if (!region.found || region.masks.length === 0) return [];
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  return region.masks.map((mask) => {
    const raster = decodeMaskToRaster(mask);
    const points: Point[] = [];
    let count = 0;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (raster[y * mask.width + x] !== 1) continue;
        count += 1;
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
    return { phrase, width: mask.width, height: mask.height, originX: mask.left, originY: mask.top, raster, points, count };
  });
}

function inside(mask: RasterMask, point: Point, slack = 2): boolean {
  const x = Math.round(point.x - mask.originX);
  const y = Math.round(point.y - mask.originY);
  for (let dy = -slack; dy <= slack; dy += 1) {
    for (let dx = -slack; dx <= slack; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) continue;
      if (mask.raster[py * mask.width + px] === 1) return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  const source = readFileSync("public/demo/candidates/dcl-06-a.png");
  const base = await sharp(source)
    .extract(CROP)
    .resize(WIDTH, HEIGHT, { fit: "fill" })
    .png()
    .toBuffer();
  writeFileSync("public/demo/dcl-06-base.png", base);
  const url = dataUrl(base);
  await runWithCost("live", async () => {
    const found: Array<RasterMask & { count: number }> = [];
    for (const phrase of PHRASES) {
      const masks = await masksOf(url, phrase);
      console.log(phrase, masks.map((mask) => mask.points.length));
      found.push(...(masks as Array<RasterMask & { count: number }>));
    }
    const ranked = found
      .map((mask) => {
        const rect = minAreaRect(mask.points);
        return { mask, rect };
      })
      .filter((item) => item.rect && item.rect.center.y < HEIGHT * 0.55)
      .sort((a, b) => (b.mask.count ?? 0) - (a.mask.count ?? 0));
    const pick = ranked[0];
    if (!pick?.rect) throw new Error("No screen mask in the upper half");
    console.log("picked", pick.mask.phrase, "center", pick.rect.center, "size", Math.round(pick.rect.width), Math.round(pick.rect.height));
    let placement = placeNotice(pick.rect, 0.1);
    let outside = noticeSamples(placement).filter((point) => !inside(pick.mask, point, 0));
    let opaque = 0;
    let opaqueOutside = 0;
    for (const margin of [0.1, 0.14, 0.18, 0.22, 0.28, 0.34]) {
      placement = placeNotice(pick.rect, margin);
      outside = noticeSamples(placement).filter((point) => !inside(pick.mask, point, 0));
      const overlayTry = await sharp(Buffer.from(noticeOverlay(WIDTH, HEIGHT, placement))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      opaque = 0;
      opaqueOutside = 0;
      for (let y = 0; y < overlayTry.info.height; y += 1) {
        for (let x = 0; x < overlayTry.info.width; x += 1) {
          const alpha = overlayTry.data[(y * overlayTry.info.width + x) * 4 + 3] ?? 0;
          if (alpha < 200) continue;
          opaque += 1;
          if (!inside(pick.mask, { x, y }, 0)) opaqueOutside += 1;
        }
      }
      console.log("margin", margin, "sample outside", outside.length, "opaque outside", opaqueOutside);
      if (opaqueOutside === 0 && outside.length === 0) break;
    }
    console.log("opaque", opaque, "rotation", placement.rotationDeg.toFixed(1));
    const overlay = noticeOverlay(WIDTH, HEIGHT, placement);
    const withCard = await sharp(base)
      .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
      .png()
      .toBuffer();
    writeFileSync("public/demo/dcl-06-card.png", withCard);
    const guide = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <polygon points="${pick.rect.corners.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#ff00aa" stroke-width="3"/>
      <polygon points="${placement.corners.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#00e5ff" stroke-width="3"/>
    </svg>`;
    const debug = await sharp(withCard).composite([{ input: Buffer.from(guide), top: 0, left: 0 }]).png().toBuffer();
    writeFileSync("/tmp/ad6-guide.png", debug);

    const sourceUrl = dataUrl(source);
    const tight = async (phrase: string): Promise<MaskBox[]> => {
      const region = readCachedRegions(sourceUrl, phrase, "demo");
      if (!region?.found) return [];
      return region.boxes;
    };
    const map = (boxes: MaskBox[]): MaskBox[] =>
      boxes.flatMap((box) => {
        const left = Math.max(CROP.left, box.left) - CROP.left;
        const top = Math.max(CROP.top, box.top) - CROP.top;
        const right = Math.min(CROP.left + CROP.width, box.right) - CROP.left;
        const bottom = Math.min(CROP.top + CROP.height, box.bottom) - CROP.top;
        if (right - left < 8 || bottom - top < 8) return [];
        const sx = WIDTH / CROP.width;
        const sy = HEIGHT / CROP.height;
        return [{ left: left * sx, top: top * sy, right: right * sx, bottom: bottom * sy }];
      });
    const hands = map(await tight("hands"));
    const hand = map(await tight("hand"));
    const masks: LockupMasks = {
      face: map(await tight("face")),
      head: map(await tight("head")),
      hands: hands.length > 0 ? hands : hand,
      bag: map(await tight("bag")),
    };
    const lockup = await renderLockup({
      image: withCard,
      headline: "Monday coffee, already handled",
      aspect: "4:5",
      masks,
    });
    console.log(lockup.qa.ok, lockup.qa.reason, layoutQaLine(lockup.qa));
    if (!lockup.qa.ok) throw new Error(lockup.qa.reason);
    const finalImage = await sharp(withCard)
      .composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
    writeFileSync("public/demo/dcl-06.png", finalImage);
    const sourceMeta = await sharp(source).metadata();
    const sx = CROP.width / WIDTH;
    const sy = CROP.height / HEIGHT;
    const sourcePlacement = {
      ...placement,
      center: { x: CROP.left + placement.center.x * sx, y: CROP.top + placement.center.y * sy },
      width: placement.width * sx,
      height: placement.height * sy,
      corners: placement.corners.map((point) => ({ x: CROP.left + point.x * sx, y: CROP.top + point.y * sy })) as typeof placement.corners,
    };
    const sourceOverlay = noticeOverlay(sourceMeta.width ?? 0, sourceMeta.height ?? 0, sourcePlacement);
    const raw = await sharp(source).composite([{ input: Buffer.from(sourceOverlay), top: 0, left: 0 }]).png().toBuffer();
    writeFileSync("public/demo/dcl-06-raw.png", raw);
    const qa = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, unknown>;
    qa["dcl-06"] = { ...lockup.qa, bagClipped: false, recropped: false };
    writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
    writeFileSync(
      "lib/phone-screen.json",
      `${JSON.stringify({ phrase: pick.mask.phrase, sampleOutside: outside.length, opaqueOutside, opaque, rotationDeg: placement.rotationDeg }, null, 2)}\n`,
    );
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
