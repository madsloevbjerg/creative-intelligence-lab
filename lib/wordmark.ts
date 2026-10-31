import { existsSync } from "node:fs";

import { Resvg } from "@resvg/resvg-js";

import { brandKit } from "@/lib/brand-kit";
import type { TextBand } from "@/lib/place-text";

const NOTO_BOLD = "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Break a headline into at most two lines without changing the words. */
export function headlineLines(headline: string, maxChars = 24): [string] | [string, string] {
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
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
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
 * Same wordmark and headline on every ad. Only the band changes.
 * The pill is as wide as the name, plus padding.
 */
export function adOverlaySvg(input: {
  width: number;
  height: number;
  headline: string;
  band?: TextBand;
}): string {
  const { width, height } = input;
  const band = input.band ?? "bottom";
  const lines = headlineLines(input.headline);
  const { ink, paper, deepGreen, cream } = brandKit.palette;
  const lineHeight = Math.round(width * 0.055);
  const headlineSize = Math.round(width * 0.048);
  const brandSize = Math.round(width * 0.036);
  const pad = Math.round(width * 0.05);
  const pillHeight = Math.round(width * 0.09);
  const pillPadX = Math.round(pillHeight * 0.55);
  const textWidth = labelWidth(brandKit.name, brandSize);
  const pillWidth = Math.min(Math.round(width * 0.92), Math.round(textWidth + pillPadX * 2));
  const blockHeight = pillHeight + Math.round(width * 0.03) + lineHeight * lines.length;
  const blockTop =
    band === "top" ? Math.round(width * 0.04) : height - Math.round(width * 0.04) - blockHeight;
  const pillY = blockTop;
  const firstBaseline = pillY + pillHeight + lineHeight;
  const headlineText = lines
    .map((line, index) => {
      const y = firstBaseline + index * lineHeight;
      return `<text x="${pad}" y="${y}" font-family="Noto Serif, serif" font-size="${headlineSize}" font-weight="700" fill="${paper}">${escapeXml(line)}</text>`;
    })
    .join("");
  const scrimHeight = Math.round(height * 0.32);
  const scrim =
    band === "top"
      ? `<rect x="0" y="0" width="${width}" height="${scrimHeight}" fill="url(#scrimTop)"/>`
      : `<rect x="0" y="${height - scrimHeight}" width="${width}" height="${scrimHeight}" fill="url(#scrim)"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ink}" stop-opacity="0"/>
      <stop offset="0.35" stop-color="${ink}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0.72"/>
    </linearGradient>
    <linearGradient id="scrimTop" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${ink}" stop-opacity="0"/>
      <stop offset="0.35" stop-color="${ink}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  ${scrim}
  <rect x="${pad}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${Math.round(pillHeight / 2)}" fill="${deepGreen}"/>
  <text x="${pad + pillPadX}" y="${pillY + Math.round(pillHeight * 0.68)}" font-family="Noto Serif, serif" font-size="${brandSize}" font-weight="700" fill="${cream}">${escapeXml(brandKit.name)}</text>
  ${headlineText}
</svg>`;
}
