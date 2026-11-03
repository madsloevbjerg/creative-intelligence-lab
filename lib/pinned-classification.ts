import { demoAssetBytes, sha256 } from "@/lib/demo-assets";
import { demoPortfolio } from "@/lib/demo";
import { imageSha256 } from "@/lib/image-bytes";
import type { Classification } from "@/lib/schemas";

/**
 * Demo ads whose label must not move when the pixels are rendered again.
 * Ad 7 was classified Emotion/ritual on the run the current concepts were built from.
 */
export const PINNED_DEMO_CLASSIFICATIONS: Record<string, { priceUsd: number; result: Classification }> = {
  "dcl-07": {
    priceUsd: 0.01000475,
    result: {
      message:
        "Small lots, named farms, roasted after you order. A cup by the window, the week it was meant for.",
      motivation: "Emotion/ritual",
      hook: "Roasted this week in Aarhus",
      execution: "Lifestyle scene",
      delivery: "Static",
      visualDescription:
        "Older woman in a kitchen holding a mug and gazing out a window beside a Danish Coffee Lab coffee bag on the counter",
      why: "A single still image stages a quiet window coffee ritual with person and product in a home kitchen, fitting Emotion/ritual, Lifestyle scene, and Static delivery.",
    },
  },
};

export function pinnedDemoClassification(imageUrl: string): { id: string; priceUsd: number; result: Classification } | null {
  const sha = imageSha256(imageUrl);
  for (const ad of demoPortfolio.ads) {
    const pin = PINNED_DEMO_CLASSIFICATIONS[ad.id];
    if (!pin) continue;
    if (sha256(demoAssetBytes(ad.file)) === sha) return { id: ad.id, ...pin };
  }
  return null;
}
