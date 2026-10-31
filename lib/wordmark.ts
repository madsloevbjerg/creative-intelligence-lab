import { brandKit } from "@/lib/brand-kit";

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
export function adOverlaySvg(input: { width: number; height: number; headline: string }): string {
  const { width, height } = input;
  const lines = headlineLines(input.headline);
  const { ink, paper, deepGreen, cream } = brandKit.palette;
  const scrimTop = Math.round(height * 0.68);
  const lineHeight = Math.round(width * 0.055);
  const headlineSize = Math.round(width * 0.048);
  const brandSize = Math.round(width * 0.028);
  const pad = Math.round(width * 0.05);
  const firstBaseline = height - pad - (lines.length === 2 ? lineHeight : 0);
  const headlineText = lines
    .map((line, index) => {
      const y = firstBaseline + index * lineHeight;
      return `<text x="${pad}" y="${y}" font-family="Noto Serif, serif" font-size="${headlineSize}" font-weight="700" fill="${paper}">${escapeXml(line)}</text>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ink}" stop-opacity="0"/>
      <stop offset="0.45" stop-color="${ink}" stop-opacity="0.15"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimTop}" width="${width}" height="${height - scrimTop}" fill="url(#scrim)"/>
  <rect x="${pad}" y="${Math.round(width * 0.045)}" width="${Math.round(width * 0.46)}" height="${Math.round(width * 0.07)}" rx="${Math.round(width * 0.035)}" fill="${ink}" fill-opacity="0.55"/>
  <circle cx="${pad + Math.round(width * 0.028)}" cy="${Math.round(width * 0.08)}" r="${Math.round(width * 0.016)}" fill="${deepGreen}"/>
  <circle cx="${pad + Math.round(width * 0.028)}" cy="${Math.round(width * 0.08)}" r="${Math.round(width * 0.007)}" fill="${cream}"/>
  <text x="${pad + Math.round(width * 0.054)}" y="${Math.round(width * 0.088)}" font-family="Noto Serif, serif" font-size="${brandSize}" font-weight="700" fill="${paper}">${escapeXml(brandKit.name)}</text>
  ${headlineText}
</svg>`;
}
