import "server-only";

import { ModelOutputError, UserFacingError } from "@/lib/errors";
import { adapterMode, classifyAd, currentCost, runWithCost, segmentImage, summarizeBrand } from "@/lib/meta";
import {
  analysisResponseSchema,
  analyzeRequestSchema,
  type AnalysisResponse,
} from "@/lib/schemas";
import { websiteTextFromUrl } from "@/lib/website";

export async function analyzePortfolio(body: unknown): Promise<AnalysisResponse> {
  return runWithCost(async () => {
    try {
      return await analyzePortfolioInner(body);
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

async function analyzePortfolioInner(body: unknown): Promise<AnalysisResponse> {
  const request = analyzeRequestSchema.safeParse(body);
  if (!request.success) {
    const message = request.error.issues[0]?.message ?? "The form is incomplete.";
    throw new UserFacingError(message, 400);
  }

  const websiteText =
    request.data.source.kind === "text"
      ? request.data.source.websiteText
      : await websiteTextFromUrl(request.data.source.websiteUrl);

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

  const mode = adapterMode();
  const result = {
    mode: mode.mode,
    modeReason: mode.reason,
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
