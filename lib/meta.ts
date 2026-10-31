import "server-only";

import OpenAI from "openai";

import { ModelOutputError } from "@/lib/errors";
import {
  mockBrandSummary,
  mockClassification,
  mockConceptBrief,
  mockMockup,
  mockSegmentation,
} from "@/lib/mock";
import { BRAND_SYSTEM, BRIEF_SYSTEM, CLASSIFY_SYSTEM } from "@/lib/prompts";
import {
  brandSummaryJsonSchema,
  brandSummarySchema,
  classificationJsonSchema,
  classificationSchema,
  conceptBriefJsonSchema,
  conceptBriefSchema,
  mockupSchema,
  segmentationSchema,
  withOneRetry,
  type BrandSummary,
  type Classification,
  type ConceptBrief,
  type Mockup,
  type Segmentation,
} from "@/lib/schemas";
import { SEGMENT_PROMPTS, type Format, type Motivation } from "@/lib/taxonomy";

const META_BASE_URL = "https://api.meta.ai/v1";

export type AdapterMode = {
  mode: "mock" | "live";
  reason: string;
};

/**
 * Mock when USE_MOCK is true, or whenever MODEL_API_KEY is missing.
 * Live calls run only when a key is set and mock is not forced.
 */
export function adapterMode(): AdapterMode {
  const flag = process.env.USE_MOCK?.trim().toLowerCase();
  const hasKey = Boolean(process.env.MODEL_API_KEY?.trim());
  if (flag === "true" || flag === "1" || flag === "yes") {
    return { mode: "mock", reason: "USE_MOCK is on, so no model was called." };
  }
  if (!hasKey) {
    return {
      mode: "mock",
      reason: "MODEL_API_KEY is not set, so no model was called.",
    };
  }
  return { mode: "live", reason: "A model key is set and mock mode is off." };
}

function isMock(): boolean {
  return adapterMode().mode === "mock";
}

function liveClient(): OpenAI {
  const apiKey = process.env.MODEL_API_KEY?.trim();
  if (!apiKey) {
    throw new ModelOutputError("MODEL_API_KEY is not set.");
  }
  return new OpenAI({
    baseURL: META_BASE_URL,
    apiKey,
    maxRetries: 0,
  });
}

function parseJsonContent(content: string, label: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ModelOutputError(`${label} was not valid JSON.`);
  }
}

type JsonSchema = Record<string, unknown>;

async function museJson(input: {
  schemaName: string;
  jsonSchema: JsonSchema;
  system: string;
  userText: string;
  imageUrl?: string;
}): Promise<unknown> {
  const client = liveClient();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: input.userText },
  ];
  if (input.imageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: input.imageUrl },
    });
  }

  const response = await client.chat.completions.create({
    model: "muse-spark-1.3",
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: input.schemaName,
        strict: true,
        schema: input.jsonSchema,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new ModelOutputError(`${input.schemaName} came back empty.`);
  }
  return parseJsonContent(content, input.schemaName);
}

type SegmentHit = Segmentation["product"];

/**
 * SAM 3.1 returns special-token text, not JSON. One call per noun phrase.
 * Empty output is a real "no match", not a missing field.
 */
async function segmentOne(imageUrl: string, phrase: string): Promise<SegmentHit> {
  const client = liveClient();
  const events = await client.responses.create({
    model: "sam-3.1",
    stream: true,
    metadata: { mask_encoding: "one_bit" },
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: phrase },
          // `detail` is the OpenAI SDK's image field. "auto" is its documented default.
          { type: "input_image", image_url: imageUrl, detail: "auto" },
        ],
      },
    ],
  });

  const { parseImageStream, recordsOfKind } = await import("@meta-sam/parser");
  let result;
  try {
    const parsed = parseImageStream(events);
    result = await parsed.finalResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parser error.";
    throw new ModelOutputError(`Could not read the segmentation for “${phrase}”. ${message}`);
  }
  if (result.outcome.status !== "completed") {
    const detail = result.outcome.detail ? ` ${result.outcome.detail}` : "";
    throw new ModelOutputError(
      `Segmentation for “${phrase}” did not finish (${result.outcome.reason}).${detail}`,
    );
  }

  const boxes = recordsOfKind(result.records, "box");
  const failed = result.diagnostics.some((item) => item.severity === "error");
  if (boxes.length === 0 && result.rawOutput.trim() === "") {
    return { found: false, note: "No match" };
  }
  if (failed && boxes.length === 0) {
    throw new ModelOutputError(`Could not read the segmentation for “${phrase}”.`);
  }
  if (boxes.length === 0) {
    return { found: false, note: "No match" };
  }

  const countLabel = boxes.length === 1 ? "1 match" : `${boxes.length} matches`;
  return { found: true, note: `${countLabel} for “${phrase}”.` };
}

export async function segmentImage(input: { imageUrl: string; headline: string; primaryText: string }): Promise<Segmentation> {
  if (isMock()) {
    return withOneRetry(segmentationSchema, "Segmentation", async () =>
      mockSegmentation({
        headline: input.headline,
        primaryText: input.primaryText,
      }),
    );
  }

  const hits = await Promise.all(
    SEGMENT_PROMPTS.map(async (prompt) => {
      const hit = await withOneRetry(
        segmentationSchema.shape[prompt.key],
        `Segmentation “${prompt.phrase}”`,
        () => segmentOne(input.imageUrl, prompt.phrase),
      );
      return [prompt.key, hit] as const;
    }),
  );

  return segmentationSchema.parse(Object.fromEntries(hits));
}

export async function classifyAd(input: {
  imageUrl: string;
  headline: string;
  primaryText: string;
  segmentation: Segmentation;
}): Promise<Classification> {
  return withOneRetry(classificationSchema, "Classification", async () => {
    if (isMock()) {
      return mockClassification({
        headline: input.headline,
        primaryText: input.primaryText,
      });
    }

    return museJson({
      schemaName: "Classification",
      jsonSchema: classificationJsonSchema,
      system: CLASSIFY_SYSTEM,
      imageUrl: input.imageUrl,
      userText: [
        `Headline: ${input.headline}`,
        `Primary text: ${input.primaryText}`,
        "Segmentation notes (from SAM 3.1; “No match” means that phrase was not found):",
        JSON.stringify(input.segmentation),
      ].join("\n"),
    });
  });
}

export async function summarizeBrand(input: {
  websiteText: string;
  brief: string;
}): Promise<BrandSummary> {
  return withOneRetry(brandSummarySchema, "Brand summary", async () => {
    if (isMock()) return mockBrandSummary(input);
    return museJson({
      schemaName: "BrandSummary",
      jsonSchema: brandSummaryJsonSchema,
      system: BRAND_SYSTEM,
      userText: `Website text:\n${input.websiteText}\n\nCampaign brief:\n${input.brief}`,
    });
  });
}

export async function writeBrief(input: {
  motivation: Motivation;
  format: Format;
  offer: string;
  websiteText: string;
  brief: string;
  hypothesis: string;
}): Promise<ConceptBrief> {
  return withOneRetry(conceptBriefSchema, "Concept brief", async () => {
    if (isMock()) {
      return mockConceptBrief({
        motivation: input.motivation,
        format: input.format,
        offer: input.offer,
      });
    }
    return museJson({
      schemaName: "ConceptBrief",
      jsonSchema: conceptBriefJsonSchema,
      system: BRIEF_SYSTEM,
      userText: [
        `Motivation: ${input.motivation}`,
        `Format: ${input.format}`,
        `Offer: ${input.offer}`,
        `Coverage note: ${input.hypothesis}`,
        `Website text:\n${input.websiteText}`,
        `Campaign brief:\n${input.brief}`,
      ].join("\n\n"),
    });
  });
}

export async function generateMockup(input: {
  visualDirection: string;
}): Promise<Mockup> {
  return withOneRetry(mockupSchema, "Mockup", async () => {
    if (isMock()) return mockMockup(input);

    const client = liveClient();
    const body = {
      model: "muse-image-1.0",
      prompt: input.visualDirection,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json" as const,
      output_format: "png" as const,
      tool_enablement: { enable_web_search: false },
    };
    const response = await client.images.generate(
      body as OpenAI.Images.ImageGenerateParamsNonStreaming,
    );
    const b64Json = response.data?.[0]?.b64_json;
    if (!b64Json) {
      throw new ModelOutputError("Muse Image returned no image.");
    }
    return {
      prompt: input.visualDirection,
      outputFormat: "png",
      b64Json,
    };
  });
}
