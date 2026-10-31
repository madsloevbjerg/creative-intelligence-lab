import sharp from "sharp";

import { brandKit } from "@/lib/brand-kit";
import type { TextPlacement } from "@/lib/place-text";
import { adOverlaySvg } from "@/lib/wordmark";

/** Feed 4:5 canvas. The documented image call does not take a size, so the crop is local. */
export const COMPOSITE_WIDTH = 800;
export const COMPOSITE_HEIGHT = 1000;

export async function compositeAd(
  photo: Buffer,
  headline: string,
  crop?: { left: number; top: number; width: number; height: number },
  placement?: Pick<TextPlacement, "rect" | "wordmark">,
  frame?: { width: number; height: number },
): Promise<Buffer> {
  let image = sharp(photo).rotate();
  if (crop) {
    image = image.extract({
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height,
    });
  }
  const base = await image.resize(COMPOSITE_WIDTH, COMPOSITE_HEIGHT, { fit: "fill" }).png().toBuffer();
  const source = frame ?? { width: COMPOSITE_WIDTH, height: COMPOSITE_HEIGHT };
  const scaleX = COMPOSITE_WIDTH / source.width;
  const scaleY = COMPOSITE_HEIGHT / source.height;
  const headlineBox = placement
    ? {
        left: placement.rect.left * scaleX,
        top: placement.rect.top * scaleY,
        width: placement.rect.width * scaleX,
        height: placement.rect.height * scaleY,
      }
    : { left: COMPOSITE_WIDTH * 0.05, top: COMPOSITE_HEIGHT * 0.78, width: COMPOSITE_WIDTH * 0.9, height: COMPOSITE_HEIGHT * 0.16 };
  const wordmark = placement
    ? { left: placement.wordmark.left * scaleX, top: placement.wordmark.top * scaleY }
    : { left: COMPOSITE_WIDTH * 0.05, top: COMPOSITE_WIDTH * 0.04 };
  const overlay = Buffer.from(
    adOverlaySvg({ width: COMPOSITE_WIDTH, height: COMPOSITE_HEIGHT, headline, headlineBox, wordmark }),
  );
  return sharp(base)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function rawPng(photo: Buffer): Promise<Buffer> {
  return sharp(photo).rotate().png({ compressionLevel: 9 }).toBuffer();
}

type SheetCell = {
  label: string;
  image: Buffer;
  fit: "cover" | "contain";
};

/** One labelled grid. Used for the raw sheet and the composited sheet. */
export async function contactSheet(input: {
  title: string;
  columns: number;
  cells: SheetCell[];
  cellWidth: number;
  cellHeight: number;
}): Promise<Buffer> {
  const pad = 24;
  const labelHeight = 36;
  const gap = 16;
  const header = 72;
  const rows = Math.ceil(input.cells.length / input.columns);
  const width = pad * 2 + input.columns * input.cellWidth + (input.columns - 1) * gap;
  const height = header + pad + rows * (input.cellHeight + labelHeight) + (rows - 1) * gap + pad;
  const { paper, ink, deepGreen } = brandKit.palette;

  const layers: { input: Buffer; left: number; top: number }[] = [];
  for (const [index, cell] of input.cells.entries()) {
    const column = index % input.columns;
    const row = Math.floor(index / input.columns);
    const left = pad + column * (input.cellWidth + gap);
    const top = header + row * (input.cellHeight + labelHeight + gap);
    const fitted = await sharp(cell.image)
      .resize(input.cellWidth, input.cellHeight, {
        fit: cell.fit,
        position: "attention",
        background: paper,
      })
      .png()
      .toBuffer();
    layers.push({ input: fitted, left, top });
    const label = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${input.cellWidth}" height="${labelHeight}">
  <text x="0" y="26" font-family="Noto Serif, serif" font-size="22" font-weight="700" fill="${ink}">${cell.label}</text>
</svg>`);
    layers.push({ input: label, left, top: top + input.cellHeight });
  }

  const frame = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${paper}"/>
  <text x="${pad}" y="46" font-family="Noto Serif, serif" font-size="28" font-weight="700" fill="${deepGreen}">${input.title}</text>
</svg>`);

  return sharp(frame).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}
