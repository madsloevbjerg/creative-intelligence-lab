import { z } from "zod";

import { formatZodIssues, ModelOutputError } from "@/lib/errors";
import {
  FORMATS,
  HOOK_MAX_WORDS,
  MAX_ADS,
  MIN_ADS,
  MOTIVATIONS,
  wordCount,
} from "@/lib/taxonomy";

const nonEmpty = z.string().trim().min(1);

export const hookSchema = nonEmpty.refine(
  (value) => wordCount(value) <= HOOK_MAX_WORDS,
  { message: `Hook must be ${HOOK_MAX_WORDS} words or fewer` },
);

const segmentHitSchema = z.object({
  found: z.boolean(),
  note: nonEmpty,
});

export const segmentationSchema = z.object({
  product: segmentHitSchema,
  person: segmentHitSchema,
  textOverlay: segmentHitSchema,
  setting: segmentHitSchema,
  logo: segmentHitSchema,
});

export const classificationSchema = z.object({
  message: nonEmpty,
  motivation: z.enum(MOTIVATIONS),
  hook: hookSchema,
  format: z.enum(FORMATS),
  visualDescription: nonEmpty,
  why: nonEmpty.max(320),
});

export const brandSummarySchema = z.object({
  offer: nonEmpty,
  audiences: z.array(nonEmpty).min(1).max(6),
  keyBenefits: z.array(nonEmpty).min(1).max(6),
  tone: nonEmpty,
  why: nonEmpty.max(320),
});

export const conceptBriefSchema = z.object({
  conceptName: nonEmpty,
  motivation: z.enum(MOTIVATIONS),
  coreMessage: nonEmpty,
  hook: hookSchema,
  format: z.enum(FORMATS),
  visualDirection: nonEmpty,
  examplePrimaryText: nonEmpty,
  hypothesis: nonEmpty.max(400),
});

export const mockupSchema = z.object({
  prompt: nonEmpty,
  outputFormat: z.enum(["png", "jpeg", "webp"]),
  b64Json: nonEmpty,
});

const imageDataUrlSchema = z
  .string()
  .refine(
    (value) =>
      /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;|,)/i.test(value),
    "Each ad image must be a PNG, JPEG, WEBP, GIF, or SVG.",
  )
  .refine(
    (value) => value.length <= 1_500_000,
    "One of the images is too large. Use a smaller file.",
  );

export const analyzeRequestSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      websiteText: z
        .string()
        .trim()
        .min(40, "Paste at least a short paragraph from the website."),
    }),
    z.object({
      kind: z.literal("url"),
      websiteUrl: z
        .string()
        .trim()
        .refine((value) => {
          try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        }, "Enter an http or https website URL."),
    }),
  ]),
  brief: z.string().trim().min(20, "Add a campaign brief of at least a sentence."),
  ads: z
    .array(
      z.object({
        id: nonEmpty,
        headline: nonEmpty,
        primaryText: nonEmpty,
        imageDataUrl: imageDataUrlSchema,
      }),
    )
    .min(MIN_ADS, `Add at least ${MIN_ADS} ads.`)
    .max(MAX_ADS, `Use ${MAX_ADS} ads or fewer.`),
});

export const analyzedAdSchema = z.object({
  id: nonEmpty,
  headline: nonEmpty,
  primaryText: nonEmpty,
  segmentation: segmentationSchema,
  classification: classificationSchema,
});

export const costSummarySchema = z.object({
  runUsd: z.number().min(0),
  totalUsd: z.number().min(0),
  budgetUsd: z.number().min(0),
});

export const analysisResponseSchema = z.object({
  mode: z.enum(["mock", "live"]),
  modeReason: nonEmpty,
  brand: brandSummarySchema,
  ads: z.array(analyzedAdSchema).min(1),
  cost: costSummarySchema,
});

export type Segmentation = z.infer<typeof segmentationSchema>;
export type Classification = z.infer<typeof classificationSchema>;
export type BrandSummary = z.infer<typeof brandSummarySchema>;
export type ConceptBrief = z.infer<typeof conceptBriefSchema>;
export type Mockup = z.infer<typeof mockupSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type AnalyzedAd = z.infer<typeof analyzedAdSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

const hookPattern = "^(?:\\S+\\s+){0,9}\\S+$";

function strictObject(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

/** JSON schemas sent to Muse Spark. Field lists match the zod schemas above. */
export const classificationJsonSchema = strictObject({
  message: { type: "string", minLength: 1 },
  motivation: { type: "string", enum: [...MOTIVATIONS] },
  hook: { type: "string", minLength: 1, pattern: hookPattern },
  format: { type: "string", enum: [...FORMATS] },
  visualDescription: { type: "string", minLength: 1 },
  why: { type: "string", minLength: 1, maxLength: 320 },
});

export const brandSummaryJsonSchema = strictObject({
  offer: { type: "string", minLength: 1 },
  audiences: {
    type: "array",
    minItems: 1,
    maxItems: 6,
    items: { type: "string", minLength: 1 },
  },
  keyBenefits: {
    type: "array",
    minItems: 1,
    maxItems: 6,
    items: { type: "string", minLength: 1 },
  },
  tone: { type: "string", minLength: 1 },
  why: { type: "string", minLength: 1, maxLength: 320 },
});

export const conceptBriefJsonSchema = strictObject({
  conceptName: { type: "string", minLength: 1 },
  motivation: { type: "string", enum: [...MOTIVATIONS] },
  coreMessage: { type: "string", minLength: 1 },
  hook: { type: "string", minLength: 1, pattern: hookPattern },
  format: { type: "string", enum: [...FORMATS] },
  visualDirection: { type: "string", minLength: 1 },
  examplePrimaryText: { type: "string", minLength: 1 },
  hypothesis: { type: "string", minLength: 1, maxLength: 400 },
});

/**
 * Run a producer up to twice. A zod failure or a ModelOutputError is retried
 * once. Any other error (network, missing key) is not retried.
 * Missing fields are never filled in.
 */
export async function withOneRetry<T>(
  schema: z.ZodType<T>,
  label: string,
  produce: () => Promise<unknown>,
): Promise<T> {
  let lastMessage = "The response was empty.";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await produce();
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      lastMessage = formatZodIssues(parsed.error);
    } catch (error) {
      if (!(error instanceof ModelOutputError)) throw error;
      lastMessage = error.message;
    }
  }

  throw new ModelOutputError(
    `${label} was still invalid after one retry. Nothing was filled in. ${lastMessage}`,
  );
}
