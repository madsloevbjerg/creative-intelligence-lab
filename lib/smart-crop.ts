/**
 * Pick a crop of a fixed aspect ratio that keeps a mask fully visible
 * and out of the wordmark and headline bands.
 * aspectRatio is width / height. Feed is 4/5. Stories and Reels are 9/16.
 */

export type MaskBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SmartCropFit = "fits" | "tight" | "impossible";

export type OverlayPlace = "standard" | "top" | "bottom";

export type SmartCropResult = {
  rect: CropRect;
  fit: SmartCropFit;
  reason: string;
  overlay: OverlayPlace;
};

export type SmartCropOptions = {
  /** Pixels of air around the mask. The largest padding that fits is used. */
  padding?: number;
  /** Fraction of the crop height kept clear at the top for the wordmark. */
  reservedTop?: number;
  /** Fraction of the crop height kept clear at the bottom for the headline. */
  reservedBottom?: number;
};

export const FEED_ASPECT = 4 / 5;
export const REELS_ASPECT = 9 / 16;
/** Matches the wordmark pill and the headline block drawn on the cropped ad. */
export const WORDMARK_RESERVE = 0.11;
export const HEADLINE_RESERVE = 0.14;

export function unionMaskBoxes(boxes: readonly MaskBox[]): MaskBox | null {
  if (boxes.length === 0) return null;
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
  };
}

function expand(box: MaskBox, padding: number, width: number, height: number): MaskBox {
  return {
    left: Math.max(0, box.left - padding),
    top: Math.max(0, box.top - padding),
    right: Math.min(width, box.right + padding),
    bottom: Math.min(height, box.bottom + padding),
  };
}

function attempt(
  image: { width: number; height: number },
  mask: MaskBox,
  aspectRatio: number,
  padding: number,
  reservedTop: number,
  reservedBottom: number,
): CropRect | null {
  const content = expand(mask, padding, image.width, image.height);
  const contentW = content.right - content.left;
  const contentH = content.bottom - content.top;
  if (contentW <= 0 || contentH <= 0) return null;
  const safeFraction = 1 - reservedTop - reservedBottom;
  if (safeFraction <= 0) return null;

  let cropH = Math.max(contentH / safeFraction, contentW / aspectRatio);
  let cropW = cropH * aspectRatio;
  if (cropW > image.width) {
    cropW = image.width;
    cropH = cropW / aspectRatio;
  }
  if (cropH > image.height) {
    cropH = image.height;
    cropW = cropH * aspectRatio;
  }
  if (cropW > image.width + 1e-6 || cropH > image.height + 1e-6) return null;
  if (cropH * safeFraction + 1e-6 < contentH) return null;
  if (cropW + 1e-6 < contentW) return null;

  const safeTop = reservedTop * cropH;
  const safeBottom = reservedBottom * cropH;
  const minTop = content.bottom - (cropH - safeBottom);
  const maxTop = content.top - safeTop;
  const minLeft = content.right - cropW;
  const maxLeft = content.left;
  const topLo = Math.max(0, minTop);
  const topHi = Math.min(image.height - cropH, maxTop);
  const leftLo = Math.max(0, minLeft);
  const leftHi = Math.min(image.width - cropW, maxLeft);
  if (topLo > topHi + 2 || leftLo > leftHi + 2) return null;

  const idealTop = content.top - safeTop - (cropH - safeTop - safeBottom - contentH) / 2;
  const idealLeft = content.left - (cropW - contentW) / 2;
  const top = Math.min(topHi, Math.max(topLo, idealTop));
  const left = Math.min(leftHi, Math.max(leftLo, idealLeft));

  const rect = {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropW),
    height: Math.round(cropH),
  };
  if (rect.left < 0 || rect.top < 0) return null;
  if (rect.left + rect.width > image.width) rect.width = image.width - rect.left;
  if (rect.top + rect.height > image.height) rect.height = image.height - rect.top;
  if (rect.width < 1 || rect.height < 1) return null;

  const wordmarkBottom = rect.top + reservedTop * rect.height;
  const headlineTop = rect.top + rect.height - reservedBottom * rect.height;
  const inside =
    mask.left >= rect.left - 1 &&
    mask.top >= wordmarkBottom - 1 &&
    mask.right <= rect.left + rect.width + 1 &&
    mask.bottom <= headlineTop + 1;
  if (!inside) return null;
  return rect;
}

export function smartCrop(
  image: { width: number; height: number },
  mask: MaskBox,
  aspectRatio: number,
  options: SmartCropOptions = {},
): SmartCropResult {
  if (image.width < 1 || image.height < 1) {
    return {
      rect: { left: 0, top: 0, width: 0, height: 0 },
      fit: "impossible",
      overlay: "standard",
      reason: "The image has no pixels to crop.",
    };
  }
  if (!(aspectRatio > 0)) {
    return {
      rect: { left: 0, top: 0, width: 0, height: 0 },
      fit: "impossible",
      overlay: "standard",
      reason: "The aspect ratio has to be greater than zero.",
    };
  }
  const reservedTop = options.reservedTop ?? WORDMARK_RESERVE;
  const reservedBottom = options.reservedBottom ?? HEADLINE_RESERVE;
  const requested =
    options.padding ?? Math.max(8, Math.round(0.03 * Math.min(image.width, image.height)));

  for (let padding = requested; padding >= 0; padding -= 1) {
    const rect = attempt(image, mask, aspectRatio, padding, reservedTop, reservedBottom);
    if (!rect) continue;
    const fit: SmartCropFit = padding === requested ? "fits" : "tight";
    const room = fit === "fits" ? `${padding}px of padding` : `${padding}px of padding, less than the ${requested}px asked for`;
    return {
      rect,
      fit,
      overlay: "standard",
      reason: `A ${aspectRatio.toFixed(3)} crop keeps the mask clear of the wordmark and the headline, with ${room}.`,
    };
  }

  return {
    rect: { left: 0, top: 0, width: image.width, height: image.height },
    fit: "impossible",
    overlay: "standard",
    reason: "No crop of this aspect ratio can hold the full mask and still leave room for the wordmark and the headline.",
  };
}

function largestFrame(image: { width: number; height: number }, aspectRatio: number): { width: number; height: number } {
  let height = image.height;
  let width = height * aspectRatio;
  if (width > image.width) {
    width = image.width;
    height = width / aspectRatio;
  }
  return { width, height };
}

function containsBox(rect: CropRect, box: MaskBox): boolean {
  return (
    box.left >= rect.left - 1 &&
    box.right <= rect.left + rect.width + 1 &&
    box.top >= rect.top - 1 &&
    box.bottom <= rect.top + rect.height + 1
  );
}

function bandClears(rect: CropRect, bag: MaskBox, overlay: OverlayPlace): boolean {
  if (overlay === "standard") {
    const wordmarkBottom = rect.top + WORDMARK_RESERVE * rect.height;
    const headlineTop = rect.top + rect.height * (1 - HEADLINE_RESERVE);
    return bag.top >= wordmarkBottom - 2 && bag.bottom <= headlineTop + 2;
  }
  if (overlay === "top") {
    return bag.top >= rect.top + 0.22 * rect.height - 2;
  }
  return bag.bottom <= rect.top + rect.height * (1 - 0.22) + 2;
}

function centerOf(box: MaskBox): { x: number; y: number } {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

function subjectInside(rect: CropRect, box: MaskBox): boolean {
  const huge = box.right - box.left > rect.width * 0.85 || box.bottom - box.top > rect.height * 0.85;
  if (!huge) return containsBox(rect, box);
  const center = centerOf(box);
  return (
    center.x >= rect.left &&
    center.x <= rect.left + rect.width &&
    center.y >= rect.top &&
    center.y <= rect.top + rect.height
  );
}

/**
 * Largest 4:5 or 9:16 window that keeps the whole bag inside.
 * A person-sized mask only has to stay visibly in frame, because SAM often
 * outlines the whole body. The type sits clear of the bag.
 */
export function frameSubjects(
  image: { width: number; height: number },
  subjects: readonly MaskBox[],
  bag: MaskBox,
  aspectRatio: number,
): SmartCropResult {
  if (subjects.length === 0) {
    return {
      rect: { left: 0, top: 0, width: 0, height: 0 },
      fit: "impossible",
      overlay: "standard",
      reason: "There is no subject to keep inside the crop.",
    };
  }
  const frame = largestFrame(image, aspectRatio);
  const cropW = Math.round(frame.width);
  const cropH = Math.round(frame.height);
  if (bag.right - bag.left > cropW + 2 || bag.bottom - bag.top > cropH + 2) {
    return {
      rect: { left: 0, top: 0, width: cropW, height: cropH },
      fit: "impossible",
      overlay: "standard",
      reason: "The bag itself is larger than a 4:5 or 9:16 frame of this photo.",
    };
  }
  const leftLo = Math.max(0, bag.right - cropW);
  const leftHi = Math.min(image.width - cropW, bag.left);
  const topLo = Math.max(0, bag.bottom - cropH);
  const topHi = Math.min(image.height - cropH, bag.top);
  if (leftLo > leftHi + 2 || topLo > topHi + 2) {
    return {
      rect: { left: 0, top: 0, width: cropW, height: cropH },
      fit: "impossible",
      overlay: "standard",
      reason: "The bag does not fit inside a 4:5 or 9:16 frame.",
    };
  }

  const placements: OverlayPlace[] = ["standard", "top", "bottom"];
  for (const overlay of placements) {
    const topStep = Math.max(1, Math.floor((topHi - topLo) / 16));
    const leftStep = Math.max(1, Math.floor((leftHi - leftLo) / 16));
    for (let top = topLo; top <= topHi; top += topStep) {
      for (let left = leftLo; left <= leftHi; left += leftStep) {
        const rect = { left: Math.round(left), top: Math.round(top), width: cropW, height: cropH };
        if (!containsBox(rect, bag)) continue;
        if (!subjects.every((box) => subjectInside(rect, box))) continue;
        if (!bandClears(rect, bag, overlay)) continue;
        const where =
          overlay === "standard"
            ? "wordmark at the top and the headline at the bottom"
            : overlay === "top"
              ? "wordmark and headline together at the top, clear of the bag"
              : "wordmark and headline together at the bottom, clear of the bag";
        return {
          rect,
          fit: "fits",
          overlay,
          reason: `A wide ${aspectRatio.toFixed(3)} crop keeps the scene, with the ${where}.`,
        };
      }
    }
  }

  return {
    rect: { left: Math.round(Math.max(0, leftLo)), top: Math.round(Math.max(0, topLo)), width: cropW, height: cropH },
    fit: "impossible",
    overlay: "standard",
    reason: "The bag and its scene subject do not share a frame that also leaves room for the type.",
  };
}
