/**
 * One set of rules for every creative, at 4:5 now and 9:16 later.
 * Numbers live here. renderLockup does not invent its own.
 */
export const lockupConfig = {
  boxOpacity: 0.92,
  /** Outer gap from each edge, as a fraction of image width. */
  marginFraction: 0.06,
  maxWidthFraction: 0.72,
  /** Inner padding as a multiple of the headline cap height. */
  paddingToCap: 1.2,
  /** Cap height as a fraction of the headline font size. */
  capHeightRatio: 0.7,
  maxWords: 7,
  maxLines: 3,
  /** Headline size as a fraction of image width. The 4:5 ads use this floor. */
  minHeadlineSizeFraction: 0.05,
  /** Wordmark size as a fraction of the headline size. */
  wordmarkSizeRatio: 0.42,
  /** Extra space between uppercase letters, in ems. */
  wordmarkTrackingEm: 0.14,
  cornerRadiusFraction: 0.018,
  minContrast: 4.5,
  /** 9:16 safe band. Not used by the 4:5 renders. */
  reels: {
    topClear: 0.14,
    bottomClear: 0.35,
  },
  /** Tried in this order. The one that returns boxes is cached and used. */
  handPhrases: ["hands", "hand"],
} as const;

export type LockupAspect = "4:5" | "9:16";
