import { existsSync } from "node:fs";

import { Resvg } from "@resvg/resvg-js";

import { brandKit } from "@/lib/brand-kit";

const NOTO_BOLD = "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Break a headline into at most three lines without changing the words. */
export function headlineLines(headline: string, maxChars = 24, maxLines = 2): string[] {
  const words = headline.trim().split(/\s+/);
  if (headline.length <= maxChars || words.length < 2) return [headline.trim()];
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let split = 1; split < words.length; split += 1) {
    const left = words.slice(0, split).join(" ");
    const right = words.slice(split).join(" ");
    const score = Math.abs(left.length - right.length) + (left.length > maxChars ? 20 : 0);
    if (score < bestScore) {
      best = split;
      bestScore = score;
    }
  }
  if (maxLines < 3) return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars && lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Pixel width of one line in Noto Serif Bold. Falls back to a character estimate. */
export function labelWidth(label: string, fontSize: number): number {
  const estimate = label.length * fontSize * 0.52;
  if (!existsSync(NOTO_BOLD)) return estimate;
  const height = Math.ceil(fontSize * 2);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="${height}">
  <text x="0" y="${Math.round(fontSize * 1.25)}" font-family="Noto Serif" font-size="${fontSize}" font-weight="700" fill="#000000">${escapeXml(label)}</text>
</svg>`;
  const rendered = new Resvg(svg, {
    font: { fontFiles: [NOTO_BOLD], loadSystemFonts: false, defaultFontFamily: "Noto Serif" },
  }).render();
  const pixels = rendered.pixels;
  let minX = rendered.width;
  let maxX = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha < 16) continue;
    const x = (index / 4) % rendered.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (maxX < minX) return estimate;
  return maxX - minX + 1;
}

/**
 * Same wordmark on every ad, pinned top-left. Only the headline block moves.
 * The pill is as wide as the name, plus padding.
 */
export function adOverlaySvg(input: {
  width: number;
  height: number;
  headline: string;
  headlineBox: { left: number; top: number; width: number; height: number };
  wordmark: { left: number; top: number };
}): string {
  const { width, height } = input;
  const { ink, paper, deepGreen, cream } = brandKit.palette;
  const lineHeight = Math.round(width * 0.055);
  const headlineSize = Math.round(width * 0.048);
  const maxChars = Math.max(12, Math.round(input.headlineBox.width / (headlineSize * 0.52)));
  const maxLines = input.headlineBox.height > lineHeight * 2.5 ? 3 : 2;
  const lines = headlineLines(input.headline, maxChars, maxLines);
  const brandSize = Math.round(width * 0.036);
  const pillHeight = Math.round(width * 0.09);
  const pillPadX = Math.round(pillHeight * 0.55);
  const textWidth = labelWidth(brandKit.name, brandSize);
  const pillWidth = Math.min(Math.round(width * 0.92), Math.round(textWidth + pillPadX * 2));
  const inset = Math.round(width * 0.05);
  const pillX = Math.round(input.wordmark.left);
  const pillY = Math.round(input.wordmark.top);
  const textX = Math.max(inset, Math.round(input.headlineBox.left));
  const low = input.headlineBox.top > height * 0.45;
  const boxBottom = Math.round(Math.min(height - inset, input.headlineBox.top + input.headlineBox.height));
  const firstBaseline = low
    ? boxBottom - (lines.length - 1) * lineHeight
    : Math.max(pillY + pillHeight + Math.round(width * 0.045), Math.round(input.headlineBox.top)) + Math.round(lineHeight * 0.85);
  const headlineText = lines
    .map((line, index) => {
      const y = firstBaseline + index * lineHeight;
      return `<text x="${textX}" y="${y}" font-family="Noto Serif, serif" font-size="${headlineSize}" font-weight="700" fill="${paper}">${escapeXml(line)}</text>`;
    })
    .join("");
  const bandPad = Math.round(width * 0.045);
  const scrimY = low
    ? Math.max(0, firstBaseline - lineHeight - bandPad)
    : Math.max(0, firstBaseline - lineHeight - bandPad);
  const scrimH = low ? height - scrimY : Math.min(height - scrimY, lineHeight * lines.length + bandPad * 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="${low ? 0 : 1}" x2="0" y2="${low ? 1 : 0}">
      <stop offset="0" stop-color="${ink}" stop-opacity="0"/>
      <stop offset="0.42" stop-color="${ink}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimY}" width="${width}" height="${scrimH}" fill="url(#scrim)"/>
  <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${Math.round(pillHeight / 2)}" fill="${deepGreen}"/>
  <text x="${pillX + pillPadX}" y="${pillY + Math.round(pillHeight * 0.68)}" font-family="Noto Serif, serif" font-size="${brandSize}" font-weight="700" fill="${cream}">${escapeXml(brandKit.name)}</text>
  ${headlineText}
</svg>`;
}
