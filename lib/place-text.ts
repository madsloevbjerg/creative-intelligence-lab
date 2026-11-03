import type { CropRect, MaskBox } from "@/lib/smart-crop";
import { headlineLines, labelWidth } from "@/lib/wordmark";

/**
 * Headline position, with the wordmark pinned to the top-left.
 * M5 can pass a Stories/Reels safe zone; both stay inside it.
 */

export type TextSubject = "person" | "face" | "bag" | "phone" | "hand" | "kettle" | "roaster" | "cup";

export type SubjectMask = {
  subject: TextSubject;
  box: MaskBox;
};

/** Fractions of the frame. 0 means the edge is usable. */
export type SafeZone = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export const OPEN_SAFE_ZONE: SafeZone = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Rough Stories/Reels chrome. Not applied to the feed ads.
 * Top status bar and bottom reply/caption area.
 */
export const REELS_SAFE_ZONE: SafeZone = { top: 0.14, bottom: 0.2, left: 0.04, right: 0.04 };

export type HeadlinePlace =
  | "top"
  | "bottom"
  | "middle"
  | "left"
  | "right"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type TextPlacement = {
  place: HeadlinePlace;
  rect: CropRect;
  reason: string;
  /** Wordmark origin in image pixels. The default is the top-left corner. */
  wordmark: { left: number; top: number; nudged: boolean };
  overlap: { top: number; bottom: number };
};

export type PlaceTextOptions = {
  safeZone?: SafeZone;
  /** Fraction of the frame height used by a full headline band. */
  bandFraction?: number;
  headline?: string;
};

/** Headline band only. The wordmark is separate and stays top-left. */
export const TEXT_BAND_FRACTION = 0.16;

const SUBJECT_ORDER: TextSubject[] = ["face", "person", "phone", "hand", "kettle", "cup", "bag", "roaster"];

const PLACE_PREFERENCE: HeadlinePlace[] = [
  "bottom",
  "top",
  "middle",
  "left",
  "right",
  "bottom-left",
  "bottom-right",
  "top-right",
];

function frameFor(image: { width: number; height: number }, aspectRatio: number): CropRect {
  let height = image.height;
  let width = height * aspectRatio;
  if (width > image.width) {
    width = image.width;
    height = width / aspectRatio;
  }
  return {
    left: Math.round((image.width - width) / 2),
    top: Math.round((image.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function intersectionArea(a: MaskBox, b: MaskBox): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function asBox(rect: CropRect): MaskBox {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

/** Top quarter of each person mask when SAM did not return a face. */
export function faceBoxes(masks: readonly SubjectMask[]): MaskBox[] {
  const explicit = masks.filter((mask) => mask.subject === "face").map((mask) => mask.box);
  if (explicit.length > 0) return explicit;
  return masks
    .filter((mask) => mask.subject === "person")
    .map((mask) => {
      const height = Math.max(0, mask.box.bottom - mask.box.top);
      return {
        left: mask.box.left,
        top: mask.box.top,
        right: mask.box.right,
        bottom: mask.box.top + height * (height > 0 ? 0.32 : 0.25),
      };
    });
}

/** The drum, not the whole machine. */
function roasterKey(box: MaskBox): MaskBox {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return {
    left: box.left + width * 0.22,
    top: box.top + height * 0.18,
    right: box.right - width * 0.18,
    bottom: box.bottom - height * 0.12,
  };
}

function overlapOf(rect: CropRect, boxes: readonly MaskBox[]): number {
  const box = asBox(rect);
  return boxes.reduce((sum, item) => sum + intersectionArea(box, item), 0);
}

function subjectsIn(rect: CropRect, masks: readonly SubjectMask[], faces: readonly MaskBox[]): TextSubject[] {
  const box = asBox(rect);
  const found = new Set<TextSubject>();
  for (const mask of masks) {
    if (intersectionArea(box, mask.box) > 0) found.add(mask.subject);
  }
  if (faces.some((face) => intersectionArea(box, face) > 0)) found.add("face");
  return SUBJECT_ORDER.filter((subject) => found.has(subject));
}

function describe(subjects: readonly TextSubject[]): string {
  if (subjects.length === 0) return "";
  if (subjects.length === 1) return subjects[0] ?? "";
  if (subjects.length === 2) return `${subjects[0]} and ${subjects[1]}`;
  return `${subjects.slice(0, -1).join(", ")}, and ${subjects[subjects.length - 1]}`;
}

function placeName(place: HeadlinePlace): string {
  if (place === "left") return "on the left";
  if (place === "right") return "on the right";
  if (place === "middle") return "across the middle";
  if (place === "top-right") return "in the top-right";
  if (place === "bottom-left") return "in the bottom-left";
  if (place === "bottom-right") return "in the bottom-right";
  return `at ${place}`;
}

type Slot = { place: HeadlinePlace; rect: CropRect };

function textBlock(frame: CropRect, headline: string, maxChars: number, maxLines: number): { width: number; height: number } {
  const fontSize = frame.width * 0.048;
  const lineHeight = frame.width * 0.055;
  const lines = headlineLines(headline || "Headline", maxChars, maxLines);
  const width = Math.max(...lines.map((line) => labelWidth(line, fontSize)), fontSize * 4);
  return { width: width + frame.width * 0.04, height: lineHeight * lines.length + frame.height * 0.02 };
}

function slots(frame: CropRect, safe: SafeZone, wordmark: CropRect, headline: string): Slot[] {
  const left = frame.left + Math.max(safe.left, 0.05) * frame.width;
  const right = frame.left + frame.width * (1 - Math.max(safe.right, 0.05));
  const wordmarkLow = wordmark.top > frame.top + frame.height * 0.45;
  const top = wordmarkLow
    ? frame.top + safe.top * frame.height + frame.height * 0.03
    : Math.max(frame.top + safe.top * frame.height, wordmark.top + wordmark.height + frame.height * 0.02);
  const bottom = wordmarkLow
    ? wordmark.top - frame.height * 0.02
    : frame.top + frame.height * (1 - safe.bottom);
  const wide = textBlock(frame, headline, 28, 2);
  const narrow = textBlock(frame, headline, 16, 3);
  const box = (x: number, y: number, block: { width: number; height: number }): CropRect => ({
    left: Math.round(Math.max(left, Math.min(x, right - block.width))),
    top: Math.round(Math.max(top, Math.min(y, bottom - block.height))),
    width: Math.round(Math.min(block.width, right - left)),
    height: Math.round(block.height),
  });
  return [
    { place: "bottom", rect: box(left, bottom - wide.height, wide) },
    { place: "top", rect: box(left, top, wide) },
    { place: "left", rect: box(left, top + (bottom - top) * 0.34, narrow) },
    { place: "bottom-left", rect: box(left, bottom - narrow.height, narrow) },
    { place: "right", rect: box(right - narrow.width, top + (bottom - top) * 0.34, narrow) },
    { place: "bottom-right", rect: box(right - wide.width, bottom - wide.height, wide) },
    { place: "top-right", rect: box(right - wide.width, top, wide) },
    { place: "middle", rect: box(left, top + (bottom - top) * 0.42, wide) },
  ];
}

/** Default top-left pill, in image pixels. */
export function defaultWordmark(frame: CropRect): CropRect {
  const fontSize = frame.width * 0.036;
  const text = labelWidth("Danish Coffee Lab", fontSize);
  const width = Math.min(frame.width * 0.7, text + frame.width * 0.09 * 1.1);
  const height = frame.width * 0.09;
  return {
    left: Math.round(frame.left + frame.width * 0.05),
    top: Math.round(frame.top + Math.max(frame.width * 0.04, frame.height * 0.03)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function nudgeWordmark(frame: CropRect, blocked: readonly MaskBox[]): { left: number; top: number; nudged: boolean; clearOf: string } {
  const base = defaultWordmark(frame);
  const areaOf = (rect: CropRect) => overlapOf(rect, blocked);
  const marginX = Math.round(frame.width * 0.05);
  const marginY = Math.round(Math.max(frame.width * 0.04, frame.height * 0.03));
  const corners: { rect: CropRect; clearOf: string }[] = [
    { rect: base, clearOf: "" },
    {
      rect: { ...base, left: Math.round(frame.left + frame.width - marginX - base.width) },
      clearOf: "the top-right",
    },
    {
      rect: { ...base, top: Math.round(frame.top + frame.height - marginY - base.height) },
      clearOf: "the bottom-left",
    },
    {
      rect: {
        ...base,
        left: Math.round(frame.left + frame.width - marginX - base.width),
        top: Math.round(frame.top + frame.height - marginY - base.height),
      },
      clearOf: "the bottom-right",
    },
  ];
  for (const shift of [0.06, 0.12]) {
    const left = base.left + shift * frame.width;
    if (left + base.width < frame.left + frame.width * 0.72) {
      corners.splice(1, 0, {
        rect: { ...base, left: Math.round(left) },
        clearOf: "the right, still in the top band",
      });
    }
  }
  for (const corner of corners) {
    if (areaOf(corner.rect) === 0) {
      return {
        left: corner.rect.left,
        top: corner.rect.top,
        nudged: corner.clearOf !== "",
        clearOf: corner.clearOf,
      };
    }
  }
  return { left: base.left, top: base.top, nudged: false, clearOf: "stays" };
}

/**
 * Pick a headline block that keeps the bag, the face, the phone, and a cup clear.
 * The wordmark stays top-left unless that corner covers a face or the phone.
 */
export function placeText(
  image: { width: number; height: number },
  masks: readonly SubjectMask[],
  aspectRatio: number,
  options: PlaceTextOptions = {},
): TextPlacement {
  const safe = options.safeZone ?? OPEN_SAFE_ZONE;
  const frame = frameFor(image, aspectRatio);
  const headline = options.headline ?? "Headline";
  const faces = faceBoxes(masks);
  const bags = masks.filter((mask) => mask.subject === "bag").map((mask) => mask.box);
  const phones = masks.filter((mask) => mask.subject === "phone").map((mask) => mask.box);
  const cups = masks.filter((mask) => mask.subject === "cup").map((mask) => mask.box);
  const roasters = masks.filter((mask) => mask.subject === "roaster").map((mask) => roasterKey(mask.box));
  const wordmarkNudge = nudgeWordmark(frame, phones);
  const wordmarkRect = {
    ...defaultWordmark(frame),
    left: wordmarkNudge.left,
    top: wordmarkNudge.top,
  };
  const hard = [...faces, ...bags, ...phones, ...cups, ...roasters, asBox(wordmarkRect)];
  const optionsSlots = slots(frame, safe, wordmarkRect, headline);

  const clear = (rect: CropRect, boxes: readonly MaskBox[]) => overlapOf(rect, boxes) === 0;
  let pool = optionsSlots.filter((slot) => clear(slot.rect, hard));
  let relaxed = false;
  if (pool.length === 0) {
    pool = optionsSlots.filter((slot) => clear(slot.rect, [...faces, ...bags, ...phones, ...cups]));
    relaxed = true;
  }
  if (pool.length === 0) {
    pool = optionsSlots.filter((slot) => clear(slot.rect, [...faces, ...bags, ...cups]));
    relaxed = true;
  }
  if (pool.length === 0) pool = optionsSlots;

  const subjectBoxes = masks.map((mask) => mask.box);
  pool.sort((a, b) => {
    const delta = overlapOf(a.rect, subjectBoxes) - overlapOf(b.rect, subjectBoxes);
    if (delta !== 0) return delta;
    return PLACE_PREFERENCE.indexOf(a.place) - PLACE_PREFERENCE.indexOf(b.place);
  });
  const chosen = pool[0] ?? optionsSlots[0]!;
  const topSlot = optionsSlots.find((slot) => slot.place === "top")!;
  const bottomSlot = optionsSlots.find((slot) => slot.place === "bottom")!;
  const blockedNames = [
    ...new Set([
      ...subjectsIn(topSlot.rect, masks, faces),
      ...subjectsIn(bottomSlot.rect, masks, faces),
    ]),
  ];
  const why =
    chosen.place === "top" || chosen.place === "bottom"
      ? describe(subjectsIn(chosen.place === "top" ? bottomSlot.rect : topSlot.rect, masks, faces))
      : describe(blockedNames as TextSubject[]);
  const other = chosen.place === "top" ? "bottom" : chosen.place === "bottom" ? "top" : "top and bottom";
  let reason = why
    ? `Headline placed ${placeName(chosen.place)}: ${other} band overlapped ${why}`
    : `Headline placed ${placeName(chosen.place)}: neither band overlapped a subject`;
  if (relaxed && chosen.place !== "top" && chosen.place !== "bottom") {
    reason = `Headline placed ${placeName(chosen.place)}: a full band would cover the bag or the roaster`;
  }
  if (wordmarkNudge.nudged) {
    reason = `${reason}. Wordmark moved to ${wordmarkNudge.clearOf}: the top-left would have covered the phone`;
  } else if (overlapOf(wordmarkRect, faces) > 0) {
    reason = `${reason}. Wordmark stays top-left: a nudge inside the corner would still meet a face`;
  } else if (overlapOf(wordmarkRect, phones) > 0) {
    reason = `${reason}. Wordmark stays top-left: no corner was clear of the phone`;
  }

  return {
    place: chosen.place,
    rect: chosen.rect,
    reason,
    wordmark: { left: wordmarkNudge.left, top: wordmarkNudge.top, nudged: wordmarkNudge.nudged },
    overlap: {
      top: overlapOf(topSlot.rect, subjectBoxes),
      bottom: overlapOf(bottomSlot.rect, subjectBoxes),
    },
  };
}
