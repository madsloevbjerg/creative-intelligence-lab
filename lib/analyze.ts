import "server-only";

import { demoImageDataUrl } from "@/lib/demo-assets";
import { isExactDemoSubmission, loadCachedDemo } from "@/lib/demo-cache";
import { ModelOutputError, UserFacingError } from "@/lib/errors";
import { imageWithinLimit } from "@/lib/image-bytes";
import {
  budgetLimitUsd,
  classifyAd,
  currentCost,
  extractConstraints,
  readSpendTotalUsd,
  runWithCost,
  segmentImage,
  summarizeBrand,
  type AdapterMode,
} from "@/lib/meta";
import {
  analysisResponseSchema,
  analyzeRequestSchema,
  type AnalysisResponse,
} from "@/lib/schemas";
import { websiteTextFromUrl } from "@/lib/website";

export async function analyzePortfolio(body: unknown, decision: AdapterMode): Promise<AnalysisResponse> {
  return runWithCost(decision.mode, async () => {
    try {
      return await analyzePortfolioInner(body, decision);
    } catch (error) {
      if (error instanceof UserFacingError) {
        let cost: AnalysisResponse["cost"] | undefined;
        try {
          cost = currentCost();
        } catch {
          cost = undefined;
        }
        throw new UserFacingError(error.message, error.status, cost);
      }
      throw error;
    }
  });
}

async function analyzePortfolioInner(body: unknown, decision: AdapterMode): Promise<AnalysisResponse> {
  const request = analyzeRequestSchema.safeParse(body);
  if (!request.success) {
    const message = request.error.issues[0]?.message ?? "The form is incomplete.";
    throw new UserFacingError(message, 400);
  }

  const requestAds = request.data.ads.map((ad) => ({
    id: ad.id,
    headline: ad.headline,
    primaryText: ad.primaryText,
    imageDataUrl: ad.imageDataUrl ?? demoImageDataUrl(ad.imageRef ?? ""),
  }));

  const websiteText =
    request.data.source.kind === "text"
      ? request.data.source.websiteText
      : await websiteTextFromUrl(request.data.source.websiteUrl);

  for (const ad of requestAds) {
    if (!imageWithinLimit(ad.imageDataUrl)) {
      throw new UserFacingError(`“${ad.headline}” is over 5 MB. Use a smaller image.`, 413);
    }
  }

  const demoInput = {
    websiteText,
    brief: request.data.brief,
    ads: requestAds,
  };
  let chosen = decision;
  if (decision.mode !== "live" && isExactDemoSubmission(demoInput)) {
    const cached = loadCachedDemo(demoInput);
    if (cached) {
      const checked = analysisResponseSchema.safeParse({
        mode: "cached",
        modeReason: "Saved model results for the Danish Coffee Lab demo. No API call was made.",
        brand: cached.brand,
        constraints: cached.constraints,
        ads: cached.ads,
        cost: {
          runUsd: 0,
          cachedUsd: cached.cachedUsd,
          totalUsd: readSpendTotalUsd(),
          budgetUsd: budgetLimitUsd(),
          failedAttempts: 0,
          failedUsd: 0,
        },
      });
      if (checked.success) return checked.data;
    }
    chosen = {
      mode: "mock",
      reason:
        "This demo is not in the saved model cache yet, so mock labels were used. No API call was made.",
    };
  }

  const ads = [];
  for (const ad of requestAds) {
    try {
      const segmentation = await segmentImage({
        imageUrl: ad.imageDataUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
      });
      const classification = await classifyAd({
        imageUrl: ad.imageDataUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
        segmentation,
      });
      ads.push({
        id: ad.id,
        headline: ad.headline,
        primaryText: ad.primaryText,
        segmentation,
        classification,
      });
    } catch (error) {
      if (error instanceof UserFacingError) {
        throw new UserFacingError(
          `Could not read “${ad.headline}”. ${error.message}`,
          error.status,
        );
      }
      const detail = error instanceof Error ? error.message : "Unknown error.";
      throw new UserFacingError(`Could not read “${ad.headline}”. ${detail}`, 422);
    }
  }

  let brand;
  let constraints;
  try {
    brand = await summarizeBrand({
      websiteText,
      brief: request.data.brief,
    });
    constraints = await extractConstraints({
      websiteText,
      brief: request.data.brief,
    });
  } catch (error) {
    if (error instanceof ModelOutputError || error instanceof UserFacingError) {
      const status = error instanceof UserFacingError ? error.status : 422;
      throw new UserFacingError(error.message, status);
    }
    throw error;
  }

  const result = {
    mode: chosen.mode,
    modeReason: chosen.reason,
    brand,
    constraints,
    ads,
    cost: currentCost(),
  };

  const checked = analysisResponseSchema.safeParse(result);
  if (!checked.success) {
    throw new UserFacingError(
      "The analysis did not match the expected format. Nothing was filled in.",
      422,
    );
  }
  return checked.data;
}
