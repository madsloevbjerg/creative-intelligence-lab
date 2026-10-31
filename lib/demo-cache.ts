import { readCache, requestKey } from "@/lib/cache";
import { demoAssetBytes, isDemoBrandText, sha256 } from "@/lib/demo-assets";
import { demoPortfolio } from "@/lib/demo";
import { imageSha256 } from "@/lib/image-bytes";
import { brandKeyMaterial, classifyKeyMaterial, constraintKeyMaterial, samKeyMaterial } from "@/lib/meta";
import { brandUserText, classifyUserText } from "@/lib/request-text";
import {
  brandSummarySchema,
  classificationSchema,
  constraintsSchema,
  segmentationSchema,
  type AnalyzedAd,
  type BrandSummary,
  type Constraints,
  type Segmentation,
} from "@/lib/schemas";
import { SEGMENT_PROMPTS } from "@/lib/taxonomy";

const segmentHitSchema = segmentationSchema.shape.product;

export type CachedDemo = {
  brand: BrandSummary;
  constraints: Constraints;
  ads: AnalyzedAd[];
  cachedUsd: number;
};

type DemoInput = {
  websiteText: string;
  brief: string;
  ads: Array<{
    id: string;
    headline: string;
    primaryText: string;
    imageDataUrl: string;
  }>;
};

export function isExactDemoSubmission(input: DemoInput): boolean {
  if (!isDemoBrandText(input.websiteText, input.brief)) return false;
  if (input.ads.length !== demoPortfolio.ads.length) return false;
  const remaining = new Map(
    demoPortfolio.ads.map((ad) => [
      `${ad.headline}\n${ad.primaryText}`,
      sha256(demoAssetBytes(ad.file)),
    ]),
  );
  for (const ad of input.ads) {
    const key = `${ad.headline.trim()}\n${ad.primaryText.trim()}`;
    const expectedSha = remaining.get(key);
    if (!expectedSha) return false;
    if (imageSha256(ad.imageDataUrl) !== expectedSha) return false;
    remaining.delete(key);
  }
  return remaining.size === 0;
}

/**
 * Replay a full demo analysis from data/cache. Returns null if any piece is missing.
 * Does not call the API.
 */
export function loadCachedDemo(input: DemoInput): CachedDemo | null {
  if (!isExactDemoSubmission(input)) return null;

  let cachedUsd = 0;
  const ads: AnalyzedAd[] = [];

  for (const ad of input.ads) {
    const imageSha = imageSha256(ad.imageDataUrl);
    const segmentation: Partial<Segmentation> = {};
    for (const prompt of SEGMENT_PROMPTS) {
      const hit = readCache(
        "demo",
        requestKey(samKeyMaterial(imageSha, prompt.phrase)),
        segmentHitSchema,
      );
      if (!hit) return null;
      cachedUsd += hit.priceUsd;
      segmentation[prompt.key] = hit.result;
    }
    const fullSegmentation = segmentationSchema.safeParse(segmentation);
    if (!fullSegmentation.success) return null;

    const userText = classifyUserText({
      headline: ad.headline,
      primaryText: ad.primaryText,
      segmentation: fullSegmentation.data,
    });
    const classified = readCache(
      "demo",
      requestKey(classifyKeyMaterial(imageSha, userText)),
      classificationSchema,
    );
    if (!classified) return null;
    cachedUsd += classified.priceUsd;
    ads.push({
      id: ad.id,
      headline: ad.headline,
      primaryText: ad.primaryText,
      segmentation: fullSegmentation.data,
      classification: classified.result,
    });
  }

  const summaryText = brandUserText(input.websiteText, input.brief);
  const brand = readCache("demo", requestKey(brandKeyMaterial(summaryText)), brandSummarySchema);
  if (!brand) return null;
  cachedUsd += brand.priceUsd;
  const constraints = readCache(
    "demo",
    requestKey(constraintKeyMaterial(summaryText)),
    constraintsSchema,
  );
  if (!constraints) return null;
  cachedUsd += constraints.priceUsd;

  return { brand: brand.result, constraints: constraints.result, ads, cachedUsd };
}
