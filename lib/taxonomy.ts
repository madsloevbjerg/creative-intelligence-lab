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

export const FORMATS = [
  "Static image",
  "Carousel",
  "Short video (<15s)",
  "UGC/creator style",
  "Product demo",
  "Testimonial",
  "Before/after",
  "Text-led/meme",
  "Lifestyle scene",
] as const;

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
export type Format = (typeof FORMATS)[number];
export type SegmentKey = (typeof SEGMENT_PROMPTS)[number]["key"];

export function wordCount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
