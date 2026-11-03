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

export const NOTICE_TEXT = "Danish Coffee Lab: Your beans are on the way. Roasted Friday in Aarhus.";

export type Point = { x: number; y: number };

export type OrientedRect = {
  center: Point;
  width: number;
  height: number;
  angle: number;
  corners: [Point, Point, Point, Point];
};

/** The notification sentence, split the way the card draws it. */
export function noticeLines(): { title: string; line1: string; line2: string } {
  const [title, rest] = NOTICE_TEXT.split(": ");
  const [line1, line2] = (rest ?? "").split(". ").map((part, index, all) => (index < all.length - 1 ? `${part}.` : part));
  return { title: title ?? "", line1: line1 ?? "", line2: line2 ?? "" };
}

export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Smallest rotated rectangle around the screen pixels. */
export function minAreaRect(points: readonly Point[]): OrientedRect | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let best: OrientedRect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let index = 0; index < hull.length; index += 1) {
    const start = hull[index]!;
    const end = hull[(index + 1) % hull.length]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const ux = dx / length;
    const uy = dy / length;
    const vx = -uy;
    const vy = ux;
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (const point of hull) {
      const u = point.x * ux + point.y * uy;
      const v = point.x * vx + point.y * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const width = maxU - minU;
    const height = maxV - minV;
    const area = width * height;
    if (area >= bestArea) continue;
    bestArea = area;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    const corners = [
      { u: minU, v: minV },
      { u: maxU, v: minV },
      { u: maxU, v: maxV },
      { u: minU, v: maxV },
    ].map((corner) => ({ x: corner.u * ux + corner.v * vx, y: corner.u * uy + corner.v * vy })) as OrientedRect["corners"];
    best = {
      center: { x: cu * ux + cv * vx, y: cu * uy + cv * vy },
      width,
      height,
      angle: Math.atan2(uy, ux),
      corners,
    };
  }
  return best;
}

export type ScreenAxes = {
  rect: OrientedRect;
  lx: number;
  ly: number;
  sx: number;
  sy: number;
  halfLong: number;
  halfShort: number;
};

/** Long axis points toward the top of the photo. Short axis points to the phone's right. */
export function screenAxes(rect: OrientedRect): ScreenAxes {
  const longIsWidth = rect.width >= rect.height;
  const angle = longIsWidth ? rect.angle : rect.angle + Math.PI / 2;
  let lx = Math.cos(angle);
  let ly = Math.sin(angle);
  if (ly > 0) {
    lx = -lx;
    ly = -ly;
  }
  return {
    rect,
    lx,
    ly,
    sx: -ly,
    sy: lx,
    halfLong: (longIsWidth ? rect.width : rect.height) / 2,
    halfShort: (longIsWidth ? rect.height : rect.width) / 2,
  };
}

function rotatePoint(center: Point, local: Point, radians: number): Point {
  return {
    x: center.x + local.x * Math.cos(radians) - local.y * Math.sin(radians),
    y: center.y + local.x * Math.sin(radians) + local.y * Math.cos(radians),
  };
}

export type NoticePlacement = {
  center: Point;
  width: number;
  height: number;
  rotationDeg: number;
  corners: [Point, Point, Point, Point];
};

/**
 * A card in the upper part of the tilted screen, inset by a margin.
 * Rotation follows the screen so the card does not cross the bezel.
 */
export const SCREEN_CARD_MARGIN = 0.14;

export function placeNotice(rect: OrientedRect, marginFraction = SCREEN_CARD_MARGIN): NoticePlacement {
  const axes = screenAxes(rect);
  const margin = Math.min(axes.halfShort, axes.halfLong) * marginFraction * 2;
  const width = Math.max(40, axes.halfShort * 2 - margin * 2);
  const height = Math.max(28, Math.min(width * 0.46, axes.halfLong * 2 - margin * 2));
  const along = axes.halfLong - margin - height / 2;
  const center = {
    x: rect.center.x + axes.lx * along,
    y: rect.center.y + axes.ly * along,
  };
  const rotationDeg = (Math.atan2(axes.sy, axes.sx) * 180) / Math.PI;
  const radians = (rotationDeg * Math.PI) / 180;
  const local = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];
  const corners = local.map((point) => rotatePoint(center, point, radians)) as NoticePlacement["corners"];
  return { center, width, height, rotationDeg, corners };
}

/** Sample the card so a check can confirm it stays on the screen. */
export function noticeSamples(placement: NoticePlacement, columns = 10, rows = 6): Point[] {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const points: Point[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -placement.width / 2 + (placement.width * column) / Math.max(1, columns - 1);
      const y = -placement.height / 2 + (placement.height * row) / Math.max(1, rows - 1);
      points.push(rotatePoint(placement.center, { x, y }, radians));
    }
  }
  return points;
}

export function noticeOverlay(width: number, height: number, placement: NoticePlacement): string {
  const { title, line1, line2 } = noticeLines();
  const cardWidth = placement.width;
  const pad = Math.max(6, cardWidth * 0.045);
  const icon = Math.max(16, cardWidth * 0.14);
  const textX = pad + icon + pad * 0.7;
  const titleSize = Math.max(10, Math.min(cardWidth * 0.062, (cardWidth - textX - pad) / 16));
  const bodySize = Math.max(9, Math.min(cardWidth * 0.048, (cardWidth - textX - pad) / 22));
  const lineGap = bodySize * 1.35;
  const titleY = pad + icon * 0.72;
  const bodyY = pad + icon + bodySize * 1.15;
  const radius = Math.min(placement.height, cardWidth) * 0.16;
  const left = -cardWidth / 2;
  const top = -placement.height / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g transform="translate(${placement.center.x.toFixed(2)} ${placement.center.y.toFixed(2)}) rotate(${placement.rotationDeg.toFixed(3)})">
    <rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${cardWidth.toFixed(2)}" height="${placement.height.toFixed(2)}" rx="${radius.toFixed(2)}" fill="#F7F3EC" fill-opacity="0.94" stroke="#E4DDD2"/>
    <rect x="${(left + pad).toFixed(2)}" y="${(top + pad).toFixed(2)}" width="${icon.toFixed(2)}" height="${icon.toFixed(2)}" rx="${(icon * 0.22).toFixed(2)}" fill="#1F4A38"/>
    <ellipse cx="${(left + pad + icon / 2).toFixed(2)}" cy="${(top + pad + icon * 0.56).toFixed(2)}" rx="${(icon * 0.22).toFixed(2)}" ry="${(icon * 0.14).toFixed(2)}" fill="none" stroke="#F3EDE3" stroke-width="${Math.max(1.2, icon * 0.07).toFixed(2)}"/>
    <text x="${(left + cardWidth - pad).toFixed(2)}" y="${(top + titleY).toFixed(2)}" text-anchor="end" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${Math.max(9, titleSize * 0.72).toFixed(2)}" fill="#6B6258">now</text>
    <text x="${(left + textX).toFixed(2)}" y="${(top + titleY).toFixed(2)}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${titleSize.toFixed(2)}" font-weight="700" fill="#1C1612">${title}</text>
    <text x="${(left + textX).toFixed(2)}" y="${(top + bodyY).toFixed(2)}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${bodySize.toFixed(2)}" fill="#3C2415">${line1}</text>
    <text x="${(left + textX).toFixed(2)}" y="${(top + bodyY + lineGap).toFixed(2)}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="${bodySize.toFixed(2)}" fill="#3C2415">${line2}</text>
  </g>
</svg>`;
}
