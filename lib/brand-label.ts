import sharp from "sharp";

import { labelWidth } from "@/lib/wordmark";
import type { MaskBox } from "@/lib/smart-crop";

/**
 * Off. The bag keeps the plain green block from the photograph.
 * The function stays so a later pass can turn printing back on in one place.
 */
export const BRAND_LABEL_ENABLED = false;

/**
 * Prints a brand name onto the bag's green label so it looks printed on the pack.
 * Returns null when printing is off, or when the mask is missing, tiny, or almost the whole picture.
 */
export async function brandLabel(
  image: Buffer,
  labelMask: MaskBox | null,
  name: string,
): Promise<Buffer | null> {
  if (!BRAND_LABEL_ENABLED) return null;
  if (!labelMask) return null;
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) return null;

  const boxW = labelMask.right - labelMask.left;
  const boxH = labelMask.bottom - labelMask.top;
  if (boxW < 36 || boxH < 18) return null;
  if (boxW * boxH > width * height * 0.35) return null;
  if (labelMask.left < 0 || labelMask.top < 0) return null;
  if (labelMask.right > width + 2 || labelMask.bottom > height + 2) return null;

  const words = name.trim().split(/\s+/);
  const lines = boxW > boxH * 1.4 || words.length < 3
    ? [name.trim()]
    : [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")];
  let fontSize = Math.max(8, Math.round(boxW / (Math.max(...lines.map((line) => line.length)) * 0.62)));
  fontSize = Math.min(fontSize, Math.round(boxH / (lines.length * 1.35)));
  if (fontSize < 9) return null;

  const textW = Math.max(...lines.map((line) => labelWidth(line, fontSize)));
  const lineH = Math.round(fontSize * 1.25);
  const blockW = Math.ceil(textW + fontSize);
  const blockH = Math.ceil(lineH * lines.length + fontSize * 0.3);
  const text = lines
    .map((line, index) => {
      const y = Math.round(fontSize + index * lineH);
      return `<text x="${Math.round(blockW / 2)}" y="${y}" text-anchor="middle" font-family="Noto Serif" font-size="${fontSize}" font-weight="700" fill="#F3EDE3" fill-opacity="0.82">${line.replaceAll("&", "&amp;")}</text>`;
    })
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${blockW}" height="${blockH}">
  ${text}
</svg>`;
  const rendered = await sharp(Buffer.from(svg)).png().toBuffer();
  const left = Math.round(labelMask.left + (boxW - blockW) / 2);
  const top = Math.round(labelMask.top + (boxH - blockH) / 2);
  const safeLeft = Math.max(0, Math.min(left, width - blockW));
  const safeTop = Math.max(0, Math.min(top, height - blockH));
  return sharp(image)
    .composite([{ input: rendered, left: safeLeft, top: safeTop, blend: "over" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
