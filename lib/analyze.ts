import "server-only";

import { ModelOutputError, UserFacingError } from "@/lib/errors";
import { imageWithinLimit } from "@/lib/image-bytes";
import { classifyAd, currentCost, runWithCost, segmentImage, summarizeBrand, type AdapterMode } from "@/lib/meta";
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

  const websiteText =
    request.data.source.kind === "text"
      ? request.data.source.websiteText
      : await websiteTextFromUrl(request.data.source.websiteUrl);

  for (const ad of request.data.ads) {
    if (!imageWithinLimit(ad.imageDataUrl)) {
      throw new UserFacingError(`“${ad.headline}” is over 5 MB. Use a smaller image.`, 413);
    }
  }

  const ads = [];
  for (const ad of request.data.ads) {
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
  try {
    brand = await summarizeBrand({
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
    mode: decision.mode,
    modeReason: decision.reason,
    brand,
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
