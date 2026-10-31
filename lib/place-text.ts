import type { CropRect, MaskBox } from "@/lib/smart-crop";

/**
 * Where the headline and wordmark sit.
 * M5 can pass a Stories/Reels safe zone; the bands stay inside it.
 */

export type TextSubject = "person" | "face" | "bag" | "phone" | "hand" | "kettle" | "roaster";

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

export type TextBand = "top" | "bottom";

export type TextPlacement = {
  band: TextBand;
  rect: CropRect;
  reason: string;
  overlap: { top: number; bottom: number };
};

export type PlaceTextOptions = {
  safeZone?: SafeZone;
  /** Fraction of the frame height used by one text band. */
  bandFraction?: number;
};

/** Tall enough for the wordmark pill and a two-line headline. */
export const TEXT_BAND_FRACTION = 0.26;

const SUBJECT_ORDER: TextSubject[] = ["face", "person", "phone", "hand", "kettle", "bag", "roaster"];

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
        bottom: mask.box.top + height * 0.25,
      };
    });
}

function overlapOf(band: CropRect, masks: readonly SubjectMask[]): number {
  const box = asBox(band);
  return masks.reduce((sum, mask) => sum + intersectionArea(box, mask.box), 0);
}

function subjectsIn(band: CropRect, masks: readonly SubjectMask[], faces: readonly MaskBox[]): TextSubject[] {
  const box = asBox(band);
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

/**
 * Pick the top or bottom band that covers the least of the subject masks.
 * A band that crosses a face is refused when the other band does not.
 */
export function placeText(
  image: { width: number; height: number },
  masks: readonly SubjectMask[],
  aspectRatio: number,
  options: PlaceTextOptions = {},
): TextPlacement {
  const safe = options.safeZone ?? OPEN_SAFE_ZONE;
  const bandFraction = options.bandFraction ?? TEXT_BAND_FRACTION;
  const frame = frameFor(image, aspectRatio);
  const innerLeft = frame.left + safe.left * frame.width;
  const innerRight = frame.left + frame.width - safe.right * frame.width;
  const innerTop = frame.top + safe.top * frame.height;
  const innerBottom = frame.top + frame.height - safe.bottom * frame.height;
  const innerHeight = Math.max(1, innerBottom - innerTop);
  const bandHeight = Math.min(bandFraction * frame.height, innerHeight * 0.45);
  const width = Math.max(1, innerRight - innerLeft);
  const topBand: CropRect = {
    left: Math.round(innerLeft),
    top: Math.round(innerTop),
    width: Math.round(width),
    height: Math.round(bandHeight),
  };
  const bottomBand: CropRect = {
    left: Math.round(innerLeft),
    top: Math.round(innerBottom - bandHeight),
    width: Math.round(width),
    height: Math.round(bandHeight),
  };

  const faces = faceBoxes(masks);
  const overlap = {
    top: overlapOf(topBand, masks),
    bottom: overlapOf(bottomBand, masks),
  };
  const faceHit = {
    top: faces.some((face) => intersectionArea(asBox(topBand), face) > 0),
    bottom: faces.some((face) => intersectionArea(asBox(bottomBand), face) > 0),
  };

  let band: TextBand;
  if (faceHit.top && !faceHit.bottom) band = "bottom";
  else if (faceHit.bottom && !faceHit.top) band = "top";
  else if (overlap.top < overlap.bottom) band = "top";
  else band = "bottom";

  const other: TextBand = band === "top" ? "bottom" : "top";
  const otherRect = other === "top" ? topBand : bottomBand;
  const names = describe(subjectsIn(otherRect, masks, faces));
  const reason = names
    ? `Headline placed at ${band}: ${other} band overlapped ${names}`
    : `Headline placed at ${band}: neither band overlapped a subject`;

  return {
    band,
    rect: band === "top" ? topBand : bottomBand,
    reason,
    overlap,
  };
}
