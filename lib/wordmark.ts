import { brandKit } from "@/lib/brand-kit";
import type { OverlayPlace } from "@/lib/smart-crop";

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

/**
 * The same wordmark and key line on every ad: top-left mark, headline on a
 * bottom scrim. Colors come from the brand kit.
 */
export function adOverlaySvg(input: {
  width: number;
  height: number;
  headline: string;
  place?: OverlayPlace;
}): string {
  const { width, height } = input;
  const place = input.place ?? "standard";
  const lines = headlineLines(input.headline);
  const { ink, paper, deepGreen, cream } = brandKit.palette;
  const lineHeight = Math.round(width * 0.055);
  const headlineSize = Math.round(width * 0.048);
  const brandSize = Math.round(width * 0.036);
  const pad = Math.round(width * 0.05);
  const pillHeight = Math.round(width * 0.09);
  const pillWidth = Math.round(width * 0.64);
  const pillY =
    place === "bottom"
      ? height - pad - lineHeight * lines.length - pillHeight - Math.round(width * 0.02)
      : Math.round(width * 0.04);
  const firstBaseline =
    place === "top"
      ? pillY + pillHeight + lineHeight
      : height - pad - (lines.length === 2 ? lineHeight : 0);
  const headlineText = lines
    .map((line, index) => {
      const y = firstBaseline + index * lineHeight;
      return `<text x="${pad}" y="${y}" font-family="Noto Serif, serif" font-size="${headlineSize}" font-weight="700" fill="${paper}">${escapeXml(line)}</text>`;
    })
    .join("");
  const scrim =
    place === "top"
      ? `<rect x="0" y="0" width="${width}" height="${Math.round(height * 0.34)}" fill="url(#scrimTop)"/>`
      : `<rect x="0" y="${Math.round(height * 0.68)}" width="${width}" height="${Math.round(height * 0.32)}" fill="url(#scrim)"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ink}" stop-opacity="0"/>
      <stop offset="0.45" stop-color="${ink}" stop-opacity="0.15"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0.78"/>
    </linearGradient>
    <linearGradient id="scrimTop" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${ink}" stop-opacity="0"/>
      <stop offset="0.45" stop-color="${ink}" stop-opacity="0.15"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  ${place === "standard" || place === "bottom" ? scrim : scrim}
  <rect x="${pad}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${Math.round(pillHeight / 2)}" fill="${deepGreen}"/>
  <text x="${pad + Math.round(pillHeight * 0.45)}" y="${pillY + Math.round(pillHeight * 0.68)}" font-family="Noto Serif, serif" font-size="${brandSize}" font-weight="700" fill="${cream}">${escapeXml(brandKit.name)}</text>
  ${headlineText}
</svg>`;
}
