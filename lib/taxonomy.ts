/**
 * The only taxonomy config for Creative Intelligence Lab.
 * Motivations, formats, hook length, and SAM phrases live here.
 * Do not duplicate these lists in prompts or UI code.
 */

export const MOTIVATIONS = [
  "Price/value",
  "Quality/performance",
  "Convenience/time",
  "Safety/trust",
  "Status/identity",
  "Belonging/social proof",
  "Curiosity/novelty",
  "Fear of missing out",
  "Problem/solution",
  "Emotion/nostalgia",
] as const;

/** Matrix columns. How the ad is made, not how it is delivered. */
export const EXECUTIONS = [
  "Product focus",
  "Lifestyle scene",
  "Person/UGC",
  "Testimonial",
  "Demo/how-to",
  "Before/after",
  "Text-led",
] as const;

/** Badge on each thumbnail. Not a matrix column. */
export const DELIVERIES = ["Static", "Carousel", "Video"] as const;

/**
 * One short noun phrase per SAM 3.1 call. `background` is stored as setting.
 * These phrases are the ones that actually matched the demo photos.
 */
export const SEGMENT_PROMPTS = [
  { key: "product", phrase: "bag" },
  { key: "person", phrase: "person" },
  { key: "textOverlay", phrase: "words" },
  { key: "setting", phrase: "background" },
  { key: "logo", phrase: "green logo" },
] as const;

export const HOOK_MAX_WORDS = 10;

export const MIN_ADS = 5;
export const MAX_ADS = 20;

export type Motivation = (typeof MOTIVATIONS)[number];
export type Execution = (typeof EXECUTIONS)[number];
export type Delivery = (typeof DELIVERIES)[number];
export type SegmentKey = (typeof SEGMENT_PROMPTS)[number]["key"];

export function wordCount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
