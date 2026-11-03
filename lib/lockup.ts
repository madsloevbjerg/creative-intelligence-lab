import sharp from "sharp";

import { brandKit } from "@/lib/brand-kit";
import { lockupConfig, type LockupAspect } from "@/lib/lockup-config";
import type { MaskBox } from "@/lib/smart-crop";
import { labelWidth } from "@/lib/wordmark";

export type LockupMasks = {
  face: readonly MaskBox[];
  head: readonly MaskBox[];
  hands: readonly MaskBox[];
  bag: readonly MaskBox[];
};

export type LayoutQa = {
  corner: "bottom-left" | "top-left" | "middle-left" | "none";
  contrast: number;
  overlapPx: { face: number; head: number; hands: number; bag: number };
  overlapPct: { face: number; head: number; hands: number; bag: number };
  marginOk: boolean;
  lines: number;
  lineText: string[];
  words: number;
  coverage: number;
  fontSize: number;
  wordmarkSize: number;
  bagClipped: boolean;
  recropped: boolean;
  ok: boolean;
  reason: string;
};

export type LockupResult = {
  svg: string;
  rect: { left: number; top: number; width: number; height: number };
  qa: LayoutQa;
};

function hex(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const left = relativeLuminance(...a);
  const right = relativeLuminance(...b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function blend(base: number, ink: number, opacity: number): number {
  return base * (1 - opacity) + ink * opacity;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wordsOf(headline: string): string[] {
  const trimmed = headline.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

function fits(line: string, fontSize: number, maxWidth: number): boolean {
  return labelWidth(line, fontSize) <= maxWidth + 0.5;
}

function orphan(line: string, totalWords: number): boolean {
  return totalWords > 1 && wordsOf(line).length < 2;
}

function splitBalanced(words: string[], fontSize: number, maxWidth: number, slots: number): string[] | null {
  if (slots < 1) return null;
  if (slots === 1) {
    const line = words.join(" ");
    return fits(line, fontSize, maxWidth) && !orphan(line, words.length) ? [line] : null;
  }
  let best: string[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const minSide = words.length >= 4 ? 2 : 1;
  for (let split = minSide; split <= words.length - minSide; split += 1) {
    const leftWords = words.slice(0, split);
    const rightWords = words.slice(split);
    const left = leftWords.join(" ");
    if (orphan(left, words.length) || !fits(left, fontSize, maxWidth)) continue;
    const rest = splitBalanced(rightWords, fontSize, maxWidth, slots - 1);
    if (!rest) continue;
    const score = Math.abs(labelWidth(left, fontSize) - labelWidth(rest[0] ?? "", fontSize));
    if (score < bestScore) {
      bestScore = score;
      best = [left, ...rest];
    }
  }
  return best;
}

/** Prefer two lines of similar width. Break after a sentence. Never leave one word on its own line. */
export function balanceHeadline(headline: string, fontSize: number, maxWidth: number): string[] {
  const raw = headline.trim();
  const words = wordsOf(raw);
  if (words.length <= 1) return [raw];
  const sentences = raw.split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  if (
    sentences.length >= 2 &&
    sentences.length <= lockupConfig.maxLines &&
    sentences.every((line) => fits(line, fontSize, maxWidth) && !orphan(line, words.length))
  ) {
    return sentences;
  }
  if (sentences.length >= 2) {
    const tail = sentences.slice(1);
    const tailLines = tail.filter((line) => fits(line, fontSize, maxWidth) && !orphan(line, words.length));
    const slots = lockupConfig.maxLines - tailLines.length;
    const headWords = wordsOf(sentences[0] ?? "");
    if (slots >= 1 && tailLines.length === tail.length) {
      const head = splitBalanced(headWords, fontSize, maxWidth, slots);
      if (head && [...head, ...tailLines].length <= lockupConfig.maxLines) return [...head, ...tailLines];
    }
  }
  if (fits(raw, fontSize, maxWidth)) return [raw];
  let best: string[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const minSide = words.length >= 4 ? 2 : 1;
  for (let split = minSide; split <= words.length - minSide; split += 1) {
    const left = words.slice(0, split).join(" ");
    const right = words.slice(split).join(" ");
    if (orphan(left, words.length) || orphan(right, words.length)) continue;
    if (!fits(left, fontSize, maxWidth) || !fits(right, fontSize, maxWidth)) continue;
    const score = Math.abs(labelWidth(left, fontSize) - labelWidth(right, fontSize));
    if (score < bestScore) {
      bestScore = score;
      best = [left, right];
    }
  }
  if (best) return best;
  const lines: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const next = [...current, word].join(" ");
    if (current.length > 0 && !fits(next, fontSize, maxWidth) && lines.length < lockupConfig.maxLines - 1) {
      lines.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current.join(" "));
  for (let index = lines.length - 1; index > 0; index -= 1) {
    if (wordsOf(lines[index] ?? "").length >= 2) continue;
    const previous = wordsOf(lines[index - 1] ?? "");
    if (previous.length < 3) continue;
    const moved = previous[previous.length - 1] ?? "";
    lines[index - 1] = previous.slice(0, -1).join(" ");
    lines[index] = `${moved} ${lines[index] ?? ""}`.trim();
  }
  return lines.slice(0, lockupConfig.maxLines);
}

function area(box: MaskBox): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

function intersection(a: MaskBox, b: MaskBox): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function overlapWith(rect: MaskBox, boxes: readonly MaskBox[]): { px: number; pct: number } {
  const px = boxes.reduce((sum, box) => sum + intersection(rect, box), 0);
  const maskArea = boxes.reduce((sum, box) => sum + area(box), 0);
  return { px: Math.round(px), pct: maskArea > 0 ? px / maskArea : 0 };
}

function allowedBand(width: number, height: number, aspect: LockupAspect, boxHeight: number): { top: number; bottom: number; left: number } {
  const margin = width * lockupConfig.marginFraction;
  if (aspect === "9:16") {
    const top = height * lockupConfig.reels.topClear;
    const bottom = height * (1 - lockupConfig.reels.bottomClear) - boxHeight;
    return { top, bottom, left: margin };
  }
  return { top: margin, bottom: height - margin - boxHeight, left: margin };
}

function corners(width: number, height: number, aspect: LockupAspect, box: { width: number; height: number }): { corner: "bottom-left" | "top-left" | "middle-left"; rect: MaskBox }[] {
  const band = allowedBand(width, height, aspect, box.height);
  const left = Math.round(band.left);
  const topLeft = Math.round(band.top);
  const bottomLeft = Math.round(band.bottom);
  const placed: { corner: "bottom-left" | "top-left" | "middle-left"; rect: MaskBox }[] = [
    {
      corner: "bottom-left" as const,
      rect: { left, top: bottomLeft, right: left + box.width, bottom: bottomLeft + box.height },
    },
    {
      corner: "top-left" as const,
      rect: { left, top: topLeft, right: left + box.width, bottom: topLeft + box.height },
    },
  ];
  if (aspect === "9:16") {
    const mid = Math.round((topLeft + bottomLeft) / 2);
    placed.push({
      corner: "middle-left",
      rect: { left, top: mid, right: left + box.width, bottom: mid + box.height },
    });
  }
  return placed;
}

function forbidden(rect: MaskBox, masks: LockupMasks): number {
  return (
    overlapWith(rect, masks.face).px +
    overlapWith(rect, masks.head).px +
    overlapWith(rect, masks.bag).px
  );
}

async function worstContrast(image: Buffer, rect: MaskBox): Promise<number> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const raw = await sharp(image).ensureAlpha().raw().toBuffer();
  const [gr, gg, gb] = hex(brandKit.palette.deepGreen);
  const cream = hex(brandKit.palette.cream);
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const right = Math.min(width, Math.ceil(rect.right));
  const bottom = Math.min(height, Math.ceil(rect.bottom));
  let worst = Number.POSITIVE_INFINITY;
  const stepX = Math.max(1, Math.floor((right - left) / 24));
  const stepY = Math.max(1, Math.floor((bottom - top) / 16));
  for (let y = top; y < bottom; y += stepY) {
    for (let x = left; x < right; x += stepX) {
      const index = (y * width + x) * 4;
      const blended: [number, number, number] = [
        blend(raw[index] ?? 0, gr, lockupConfig.boxOpacity),
        blend(raw[index + 1] ?? 0, gg, lockupConfig.boxOpacity),
        blend(raw[index + 2] ?? 0, gb, lockupConfig.boxOpacity),
      ];
      worst = Math.min(worst, contrastRatio(cream, blended));
    }
  }
  return Number.isFinite(worst) ? worst : 0;
}

function marginOk(rect: MaskBox, width: number, height: number, aspect: LockupAspect): boolean {
  const margin = width * lockupConfig.marginFraction - 1;
  if (rect.left < margin) return false;
  if (rect.right > width - margin + 1) return false;
  if (aspect === "9:16") {
    if (rect.top < height * lockupConfig.reels.topClear - 1) return false;
    if (rect.bottom > height * (1 - lockupConfig.reels.bottomClear) + 1) return false;
    return true;
  }
  if (rect.top < margin) return false;
  if (rect.bottom > height - margin + 1) return false;
  return true;
}

/**
 * One deep-green lockup: small tracked wordmark, then the headline.
 * Bottom-left unless that corner meets a face, head, hands, or the bag.
 */
export async function renderLockup(input: {
  image: Buffer;
  headline: string;
  aspect: LockupAspect;
  masks: LockupMasks;
}): Promise<LockupResult> {
  const meta = await sharp(input.image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const words = wordsOf(input.headline);
  const fontSize = Math.round(width * lockupConfig.minHeadlineSizeFraction);
  const cap = fontSize * lockupConfig.capHeightRatio;
  const pad = Math.round(cap * lockupConfig.paddingToCap);
  const maxOuter = Math.round(width * lockupConfig.maxWidthFraction);
  const inner = Math.max(40, maxOuter - pad * 2);
  const wordmarkSize = Math.max(10, Math.round(width * lockupConfig.minWordmarkSizeFraction));
  const tracking = wordmarkSize * lockupConfig.wordmarkTrackingEm;
  const wordmark = "DANISH COFFEE LAB";
  const wordmarkWidth = labelWidth(wordmark, wordmarkSize) + tracking * (wordmark.length - 1);
  const wraps = [balanceHeadline(input.headline, fontSize, inner)];
  type Candidate = {
    lines: string[];
    boxWidth: number;
    boxHeight: number;
    corner: "bottom-left" | "top-left" | "middle-left";
    rect: MaskBox;
    forbidden: number;
    hands: number;
  };
  const candidates: Candidate[] = [];
  for (const lines of wraps) {
    if (lines.length > lockupConfig.maxLines) continue;
    const lineWidths = lines.map((line) => labelWidth(line, fontSize));
    const textWidth = Math.max(wordmarkWidth, ...lineWidths, fontSize);
    const boxWidth = Math.min(maxOuter, Math.ceil(textWidth + pad * 2));
    const lineHeight = fontSize;
    const wordmarkBlock = wordmarkSize;
    const gap = Math.round(fontSize * 0.08);
    const boxHeight = pad + wordmarkBlock + gap + lineHeight * lines.length + pad;
    for (const option of corners(width, height, input.aspect, { width: boxWidth, height: boxHeight })) {
      candidates.push({
        lines,
        boxWidth,
        boxHeight,
        corner: option.corner,
        rect: option.rect,
        forbidden: forbidden(option.rect, input.masks),
        hands: overlapWith(option.rect, input.masks.hands).px,
      });
    }
  }
  candidates.sort((a, b) => {
    if (a.forbidden !== b.forbidden) return a.forbidden - b.forbidden;
    if (a.hands !== b.hands) return a.hands - b.hands;
    if (a.corner !== b.corner) return a.corner === "bottom-left" ? -1 : 1;
    return a.lines.length - b.lines.length;
  });
  const chosen = candidates[0];
  const lines = chosen?.lines ?? wraps[0] ?? [input.headline];
  const boxWidth = chosen?.boxWidth ?? maxOuter;
  const boxHeight = chosen?.boxHeight ?? pad * 2;
  const clear = Boolean(chosen && chosen.forbidden === 0);
  const rect = chosen?.rect ?? { left: pad, top: pad, right: pad + boxWidth, bottom: pad + boxHeight };
  const corner = clear ? chosen.corner : "none";
  const face = overlapWith(rect, input.masks.face);
  const head = overlapWith(rect, input.masks.head);
  const hands = overlapWith(rect, input.masks.hands);
  const bag = overlapWith(rect, input.masks.bag);
  const contrast = await worstContrast(input.image, rect);
  const fitsWords = words.length <= lockupConfig.maxWords;
  const fitsLines = lines.length <= lockupConfig.maxLines && lines.every((line) => labelWidth(line, fontSize) <= inner + 1);
  const fitsMark = wordmarkWidth <= inner + 1;
  const margins = marginOk(rect, width, height, input.aspect);
  const contrastOk = contrast >= lockupConfig.minContrast;
  const handsClear = hands.px === 0;
  const lineHeight = fontSize;
  const wordmarkBlock = wordmarkSize;
  const gap = Math.round(fontSize * 0.08);
  const ok = Boolean(
    clear &&
      handsClear &&
      fitsWords &&
      fitsLines &&
      fitsMark &&
      margins &&
      contrastOk &&
      fontSize >= width * lockupConfig.minHeadlineSizeFraction - 0.5,
  );
  const reasons: string[] = [];
  if (!fitsWords) reasons.push(`${words.length} words`);
  if (!fitsLines) reasons.push(`${lines.length} lines`);
  if (!clear) reasons.push("both corners meet a face, head, or bag");
  if (clear && !handsClear) reasons.push("both clear corners still meet hands");
  if (!margins) reasons.push("outside the margin");
  if (!contrastOk) reasons.push(`contrast ${contrast.toFixed(2)}`);
  const qa: LayoutQa = {
    corner,
    contrast: Math.round(contrast * 100) / 100,
    overlapPx: { face: face.px, head: head.px, hands: hands.px, bag: bag.px },
    overlapPct: {
      face: Math.round(face.pct * 1000) / 10,
      head: Math.round(head.pct * 1000) / 10,
      hands: Math.round(hands.pct * 1000) / 10,
      bag: Math.round(bag.pct * 1000) / 10,
    },
    marginOk: margins,
    lines: lines.length,
    lineText: lines,
    words: words.length,
    coverage: Math.round((boxWidth * boxHeight) / Math.max(1, width * height) * 1000) / 10,
    fontSize,
    wordmarkSize,
    bagClipped: false,
    recropped: false,
    ok,
    reason: ok
      ? `${corner}, ${lines.length} line${lines.length === 1 ? "" : "s"}, contrast ${contrast.toFixed(1)}:1`
      : reasons.join("; ") || "lockup does not fit",
  };

  const radius = Math.round(width * lockupConfig.cornerRadiusFraction);
  const textX = rect.left + pad;
  const wordmarkY = rect.top + pad + wordmarkSize;
  const firstBaseline = rect.top + pad + wordmarkBlock + gap + Math.round(fontSize * 0.82);
  const headlineText = lines
    .map((line, index) => {
      const y = firstBaseline + index * lineHeight;
      return `<text x="${textX}" y="${y}" font-family="Noto Serif" font-size="${fontSize}" font-weight="700" fill="${brandKit.palette.cream}">${escapeXml(line)}</text>`;
    })
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="${rect.left}" y="${rect.top}" width="${boxWidth}" height="${boxHeight}" rx="${radius}" fill="${brandKit.palette.deepGreen}" fill-opacity="${lockupConfig.boxOpacity}"/>
  <text x="${textX}" y="${wordmarkY}" font-family="Noto Serif" font-size="${wordmarkSize}" font-weight="700" letter-spacing="${tracking.toFixed(2)}" fill="${brandKit.palette.cream}">${wordmark}</text>
  ${headlineText}
</svg>`;
  return {
    svg,
    rect: { left: rect.left, top: rect.top, width: boxWidth, height: boxHeight },
    qa,
  };
}

export function layoutQaLine(qa: LayoutQa): string {
  const overlap = (["face", "head", "hands", "bag"] as const)
    .filter((key) => qa.overlapPx[key] > 0)
    .map((key) => `${key} ${qa.overlapPx[key]}px (${qa.overlapPct[key]}%)`)
    .join(", ");
  return `Layout QA: ${qa.reason}. Covers ${qa.coverage}% of the image. Margin ${qa.marginOk ? "ok" : "miss"}. ${overlap || "No overlap with face, head, hands, or bag."}`;
}
