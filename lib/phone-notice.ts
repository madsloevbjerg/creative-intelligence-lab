import type { MaskBox } from "@/lib/smart-crop";

export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Pull the screen in from the phone bezel. */
export function phoneScreen(box: MaskBox): ScreenRect {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const insetX = width * 0.07;
  const insetY = height * 0.08;
  return {
    left: Math.round(box.left + insetX),
    top: Math.round(box.top + insetY),
    width: Math.max(1, Math.round(width - insetX * 2)),
    height: Math.max(1, Math.round(height - insetY * 2)),
  };
}

/**
 * A lock-screen delivery card, sized to the phone screen.
 * Drawn in code. It is not part of the photograph.
 */
export function deliveryNoticeSvg(screen: ScreenRect): { svg: string; left: number; top: number; width: number; height: number } {
  const cardWidth = Math.round(screen.width * 0.9);
  const pad = Math.max(8, Math.round(cardWidth * 0.045));
  const icon = Math.max(22, Math.round(cardWidth * 0.14));
  const textX = pad + icon + Math.round(pad * 0.7);
  const nowWidth = Math.round(cardWidth * 0.12);
  const titleRoom = Math.max(40, cardWidth - textX - nowWidth - pad);
  const titleSize = Math.max(11, Math.min(Math.round(cardWidth * 0.062), Math.round(titleRoom / 11)));
  const bodyRoom = Math.max(40, cardWidth - textX - pad);
  const bodySize = Math.max(10, Math.min(Math.round(cardWidth * 0.048), Math.round(bodyRoom / 16)));
  const title = "Danish Coffee Lab";
  const line1 = "Your beans are on the way.";
  const line2 = "Roasted Friday in Aarhus.";
  const lineGap = Math.round(bodySize * 1.35);
  const titleY = pad + Math.round(icon * 0.72);
  const bodyY = pad + icon + Math.round(bodySize * 1.2);
  const cardHeight = bodyY + lineGap + pad;
  const left = Math.round(screen.left + (screen.width - cardWidth) / 2);
  let top = Math.round(screen.top + Math.max(6, screen.height * 0.12));
  if (top + cardHeight > screen.top + screen.height - 4) {
    top = Math.max(screen.top, Math.round(screen.top + screen.height - cardHeight - 4));
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}">
  <rect x="1" y="1" width="${cardWidth - 2}" height="${cardHeight - 2}" rx="${Math.round(cardHeight * 0.18)}" fill="#F7F3EC" fill-opacity="0.94" stroke="#E4DDD2"/>
  <rect x="${pad}" y="${pad}" width="${icon}" height="${icon}" rx="${Math.round(icon * 0.22)}" fill="#1F4A38"/>
  <ellipse cx="${pad + icon / 2}" cy="${pad + icon * 0.56}" rx="${icon * 0.22}" ry="${icon * 0.14}" fill="none" stroke="#F3EDE3" stroke-width="${Math.max(1.4, icon * 0.07)}"/>
  <path d="M${pad + icon * 0.38} ${pad + icon * 0.4} q${icon * 0.12} ${icon * -0.14} ${icon * 0.24} 0" fill="none" stroke="#F3EDE3" stroke-width="${Math.max(1.2, icon * 0.06)}" stroke-linecap="round"/>
  <text x="${cardWidth - pad}" y="${titleY}" text-anchor="end" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${Math.max(10, Math.round(titleSize * 0.72))}" fill="#6B6258">now</text>
  <text x="${textX}" y="${titleY}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${titleSize}" font-weight="700" fill="#1C1612">${title}</text>
  <text x="${textX}" y="${bodyY}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${bodySize}" fill="#3C2415">${line1}</text>
  <text x="${textX}" y="${bodyY + lineGap}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${bodySize}" fill="#3C2415">${line2}</text>
</svg>`;

  return { svg, left, top, width: cardWidth, height: cardHeight };
}
