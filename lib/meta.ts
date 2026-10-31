import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import type { ZodType } from "zod";

import { readCache, requestKey, writeCache, type CacheScope } from "@/lib/cache";
import { ModelOutputError, UserFacingError, type CostSummary } from "@/lib/errors";
import { imageSha256 } from "@/lib/image-bytes";
import { imageUrlForModel } from "@/lib/model-image";
import { formatBudgetUsd, formatUsd } from "@/lib/money";
import {
  DEFAULT_LIVE_RUNS_PER_HOUR,
  MAX_BRIEFS_PER_RUN,
  MAX_MOCKUPS_PER_RUN,
} from "@/lib/limits";
import {
  mockBrandSummary,
  mockClassification,
  mockConceptBrief,
  mockMockup,
  mockSegmentation,
} from "@/lib/mock";
import { BRAND_SYSTEM, BRIEF_SYSTEM, CLASSIFY_SYSTEM } from "@/lib/prompts";
import { brandUserText, classifyUserText } from "@/lib/request-text";
import { isDemoBrandText, isDemoImageSha } from "@/lib/demo-assets";
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

/**
 * Official list prices. One place only.
 * Muse Spark: https://dev.meta.ai list rates per 1M tokens.
 * SAM 3.1: $2.50 per 1,000 images. Muse Image: $0.01 per image.
 */
export const LIST_PRICES = {
  museSpark: {
    model: "muse-spark-1.3",
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 4.25,
  },
  sam: {
    model: "sam-3.1",
    usdPerThousandImages: 2.5,
  },
  museImage: {
    model: "muse-image-1.0",
    usdPerImage: 0.01,
  },
} as const;

/** Output tokens reserved when deciding whether a Spark call fits the budget. */
const SPARK_OUTPUT_ALLOWANCE = 800;

const DEFAULT_BUDGET_USD = 120;

type RunLedger = {
  usd: number;
  cachedUsd: number;
  mode: "mock" | "live";
  briefs: number;
  mockups: number;
  liveClaimed: boolean;
};

const runLedger = new AsyncLocalStorage<RunLedger>();
let ledgerQueue: Promise<unknown> = Promise.resolve();

export function sparkCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * LIST_PRICES.museSpark.inputUsdPerMillion) / 1_000_000 +
    (outputTokens * LIST_PRICES.museSpark.outputUsdPerMillion) / 1_000_000
  );
}

export function samCallUsd(): number {
  return LIST_PRICES.sam.usdPerThousandImages / 1000;
}

export function imageCostUsd(images: number): number {
  return images * LIST_PRICES.museImage.usdPerImage;
}

export function budgetLimitUsd(): number {
  const raw = process.env.BUDGET_LIMIT_USD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_BUDGET_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new UserFacingError(
      "BUDGET_LIMIT_USD must be empty or a number that is zero or greater. No model call was made.",
      500,
    );
  }
  return value;
}

function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

const SPEND_FILE = path.join(process.cwd(), ".data", "spend.json");
const LIVE_RUNS_FILE = path.join(process.cwd(), ".data", "live-runs.json");
const HOUR_MS = 60 * 60 * 1000;

export function readSpendTotalUsd(): number {
  let raw: string;
  try {
    raw = readFileSync(SPEND_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw new UserFacingError("The spend file could not be read. No model call was made.", 500);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new UserFacingError(
      "The spend file .data/spend.json is not valid JSON. Fix or delete it before a live model call.",
      500,
    );
  }

  const total = (parsed as { totalUsd?: unknown }).totalUsd;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    throw new UserFacingError(
      "The spend file .data/spend.json has no usable totalUsd. Fix or delete it before a live model call.",
      500,
    );
  }
  return total;
}

function writeSpendTotal(totalUsd: number): void {
  mkdirSync(path.dirname(SPEND_FILE), { recursive: true });
  const safe = Math.max(0, roundUsd(totalUsd));
  writeFileSync(SPEND_FILE, `${JSON.stringify({ totalUsd: safe }, null, 2)}\n`);
}

function withLedger<T>(task: () => T): Promise<T> {
  const run = ledgerQueue.then(task, task);
  ledgerQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function addRunUsd(usd: number): void {
  const run = runLedger.getStore();
  if (run) run.usd = roundUsd(run.usd + usd);
}

function assertFits(totalUsd: number, additionalUsd: number, label: string): void {
  const limit = budgetLimitUsd();
  const next = roundUsd(totalUsd + additionalUsd);
  if (next > roundUsd(limit)) {
    throw new UserFacingError(
      `Stopped before the ${label} call. Estimated spend would reach ${formatUsd(next)}, which is over the ${formatBudgetUsd(limit)} budget. This call was not sent.`,
      402,
    );
  }
}

/** Charge a known list price, or refuse before the call if it would break the cap. */
export async function chargeKnownUsd(usd: number, label: string): Promise<void> {
  await withLedger(() => {
    const total = readSpendTotalUsd();
    assertFits(total, usd, label);
    writeSpendTotal(total + usd);
    addRunUsd(usd);
  });
}

/** Hold an estimate for a token-priced call. Settled to real usage after the response. */
export async function reserveEstimateUsd(estimateUsd: number, label: string): Promise<void> {
  await chargeKnownUsd(estimateUsd, label);
}

export async function settleEstimateUsd(estimateUsd: number, actualUsd: number): Promise<void> {
  const delta = roundUsd(actualUsd - estimateUsd);
  if (delta === 0) return;
  await withLedger(() => {
    writeSpendTotal(readSpendTotalUsd() + delta);
    addRunUsd(delta);
  });
}

export function usageCostUsd(
  usage:
    | {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        input_tokens?: number | null;
        output_tokens?: number | null;
      }
    | null
    | undefined,
): number | null {
  if (!usage) return null;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  if (typeof input !== "number" || typeof output !== "number") return null;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return sparkCostUsd(input, output);
}

function sparkEstimateUsd(text: string): number {
  const inputTokens = Math.max(1, Math.ceil(text.length / 4));
  return sparkCostUsd(inputTokens, SPARK_OUTPUT_ALLOWANCE);
}

function addCachedUsd(usd: number): void {
  const run = runLedger.getStore();
  if (run) run.cachedUsd = roundUsd(run.cachedUsd + usd);
}

export function currentCost(): CostSummary {
  return {
    runUsd: roundUsd(runLedger.getStore()?.usd ?? 0),
    cachedUsd: roundUsd(runLedger.getStore()?.cachedUsd ?? 0),
    totalUsd: roundUsd(readSpendTotalUsd()),
    budgetUsd: budgetLimitUsd(),
  };
}

export function runWithCost<T>(mode: "mock" | "live", task: () => Promise<T>): Promise<T> {
  return runLedger.run(
    { usd: 0, cachedUsd: 0, mode, briefs: 0, mockups: 0, liveClaimed: false },
    task,
  );
}

async function ensureLiveClaimed(): Promise<void> {
  const run = runLedger.getStore();
  if (!run || run.mode !== "live") {
    throw new UserFacingError("Live mode is not enabled for this run. No model call was made.", 403);
  }
  if (run.liveClaimed) return;
  await claimLiveRun();
  run.liveClaimed = true;
}

function takeOutputSlot(kind: "brief" | "mockup"): void {
  const run = runLedger.getStore();
  const noun = kind === "brief" ? "concept brief" : "mockup";
  const limit = kind === "brief" ? MAX_BRIEFS_PER_RUN : MAX_MOCKUPS_PER_RUN;
  if (!run) {
    throw new UserFacingError(`A ${noun} has to be part of an analysis run.`, 400);
  }
  if (kind === "brief") run.briefs += 1;
  else run.mockups += 1;
  const count = kind === "brief" ? run.briefs : run.mockups;
  if (count > limit) {
    throw new UserFacingError(
      `This run is limited to ${limit} ${kind === "brief" ? "concept briefs" : "mockups"}. Nothing further was requested.`,
      400,
    );
  }
}

export function liveRunsPerHour(): number {
  const raw = process.env.LIVE_RUNS_PER_HOUR;
  if (raw === undefined || raw.trim() === "") return DEFAULT_LIVE_RUNS_PER_HOUR;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new UserFacingError(
      "LIVE_RUNS_PER_HOUR must be empty or a whole number that is zero or greater. No model call was made.",
      500,
    );
  }
  return value;
}

function readLiveRuns(): number[] {
  let raw: string;
  try {
    raw = readFileSync(LIVE_RUNS_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new UserFacingError("The live-run log could not be read. No model call was made.", 500);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new UserFacingError(
      "The live-run log .data/live-runs.json is not valid JSON. Fix or delete it before a live model call.",
      500,
    );
  }
  const startedAt = (parsed as { startedAt?: unknown }).startedAt;
  if (!Array.isArray(startedAt) || startedAt.some((stamp) => typeof stamp !== "number")) {
    throw new UserFacingError(
      "The live-run log .data/live-runs.json is damaged. Fix or delete it before a live model call.",
      500,
    );
  }
  return startedAt;
}

function writeLiveRuns(startedAt: number[]): void {
  mkdirSync(path.dirname(LIVE_RUNS_FILE), { recursive: true });
  writeFileSync(LIVE_RUNS_FILE, `${JSON.stringify({ startedAt }, null, 2)}\n`);
}

/** Count one live analysis against the hourly cap, or refuse before any model call. */
export async function claimLiveRun(): Promise<void> {
  await withLedger(() => {
    const limit = liveRunsPerHour();
    const now = Date.now();
    const recent = readLiveRuns().filter((stamp) => now - stamp < HOUR_MS);
    if (recent.length >= limit) {
      const noun = limit === 1 ? "live run" : "live runs";
      throw new UserFacingError(
        `Live analysis is paused. This server allows ${limit} ${noun} per hour, and that limit is used up. Leave the access code blank to use the demo. Try again later.`,
        429,
      );
    }
    recent.push(now);
    writeLiveRuns(recent);
  });
}

function accessCodesMatch(given: string, expected: string): boolean {
  const left = createHash("sha256").update(given).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/**
 * Live mode needs a server-side passcode. The code is never returned to the browser.
 * A missing or wrong code, or an unset LIVE_ACCESS_CODE, stays on mock data.
 */
export function resolveLiveAccess(accessCode: string | undefined): AdapterMode {
  const env = adapterMode();
  if (env.mode === "mock") return env;

  const configured = process.env.LIVE_ACCESS_CODE?.trim() ?? "";
  if (!configured) {
    return {
      mode: "mock",
      reason: "LIVE_ACCESS_CODE is not set, so live mode is disabled. Mock data was used.",
    };
  }

  const given = accessCode?.trim() ?? "";
  if (!given || !accessCodesMatch(given, configured)) {
    return {
      mode: "mock",
      reason: given
        ? "That access code was not accepted, so this run used mock data."
        : "No access code was entered, so this run used mock data.",
    };
  }

  return {
    mode: "live",
    reason: "The access code was accepted, so this run can call the models.",
  };
}

export type AdapterMode = {
  mode: "mock" | "live";
  reason: string;
};

/**
 * Env-only gate. A key alone is not enough for a live call: the request
 * also needs a matching LIVE_ACCESS_CODE, checked in the API route.
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
  return runLedger.getStore()?.mode !== "live";
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

async function museJson<T>(input: {
  schemaName: string;
  jsonSchema: JsonSchema;
  schema: ZodType<T>;
  system: string;
  userText: string;
  imageUrl?: string;
  cacheScope: CacheScope;
  keyMaterial: unknown;
}): Promise<T> {
  const key = requestKey(input.keyMaterial);
  const hit = readCache(input.cacheScope, key, input.schema);
  if (hit) {
    addCachedUsd(hit.priceUsd);
    return hit.result;
  }

  const modelImageUrl = input.imageUrl ? await imageUrlForModel(input.imageUrl) : undefined;
  await ensureLiveClaimed();
  const estimate = sparkEstimateUsd([input.system, input.userText, modelImageUrl ?? ""].join("\n"));
  await reserveEstimateUsd(estimate, "Muse Spark");

  const client = liveClient();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: input.userText },
  ];
  if (modelImageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: modelImageUrl },
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

  const actual = usageCostUsd(response.usage);
  const priceUsd = actual ?? estimate;
  if (actual !== null) await settleEstimateUsd(estimate, actual);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new ModelOutputError(`${input.schemaName} came back empty.`);
  }
  const parsed = input.schema.safeParse(parseJsonContent(content, input.schemaName));
  if (!parsed.success) {
    throw new ModelOutputError(`${input.schemaName} did not match the expected format.`);
  }
  writeCache(input.cacheScope, key, { priceUsd, result: parsed.data });
  return parsed.data;
}

type SegmentHit = Segmentation["product"];

/**
 * SAM 3.1 returns special-token text, not JSON. One call per noun phrase.
 * Empty output is a real "no match", not a missing field.
 */
const segmentHitSchema = segmentationSchema.shape.product;

export function samKeyMaterial(imageSha: string, phrase: string) {
  return {
    model: "sam-3.1" as const,
    phrase,
    imageSha256: imageSha,
    stream: true as const,
    metadata: { mask_encoding: "one_bit" },
    detail: "auto" as const,
  };
}

export function classifyKeyMaterial(imageSha: string, userText: string) {
  return {
    model: "muse-spark-1.3" as const,
    task: "classifyAd" as const,
    system: CLASSIFY_SYSTEM,
    userText,
    imageSha256: imageSha,
    responseFormat: { type: "json_schema" as const, strict: true, name: "Classification" },
  };
}

export function brandKeyMaterial(userText: string) {
  return {
    model: "muse-spark-1.3" as const,
    task: "summarizeBrand" as const,
    system: BRAND_SYSTEM,
    userText,
    responseFormat: { type: "json_schema" as const, strict: true, name: "BrandSummary" },
  };
}

async function segmentOne(imageUrl: string, phrase: string): Promise<SegmentHit> {
  const imageSha = imageSha256(imageUrl);
  const cacheScope: CacheScope = isDemoImageSha(imageSha) ? "demo" : "private";
  const key = requestKey(samKeyMaterial(imageSha, phrase));
  const hit = readCache(cacheScope, key, segmentHitSchema);
  if (hit) {
    addCachedUsd(hit.priceUsd);
    return hit.result;
  }

  const modelImageUrl = await imageUrlForModel(imageUrl);
  await ensureLiveClaimed();
  await chargeKnownUsd(samCallUsd(), "SAM 3.1");
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
          { type: "input_image", image_url: modelImageUrl, detail: "auto" },
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
  const finish = (hit: SegmentHit): SegmentHit => {
    const checked = segmentHitSchema.parse(hit);
    writeCache(cacheScope, key, { priceUsd: samCallUsd(), result: checked });
    return checked;
  };
  if (boxes.length === 0 && result.rawOutput.trim() === "") {
    return finish({ found: false, note: "No match" });
  }
  if (failed && boxes.length === 0) {
    throw new ModelOutputError(`Could not read the segmentation for “${phrase}”.`);
  }
  if (boxes.length === 0) {
    return finish({ found: false, note: "No match" });
  }

  const countLabel = boxes.length === 1 ? "1 match" : `${boxes.length} matches`;
  return finish({ found: true, note: `${countLabel} for “${phrase}”.` });
}

/** One SAM 3.1 call for a single noun phrase. Used by the smoke script. */
export async function segmentPhrase(imageUrl: string, phrase: string): Promise<SegmentHit> {
  return withOneRetry(segmentHitSchema, `Segmentation “${phrase}”`, () => segmentOne(imageUrl, phrase));
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

    const userText = classifyUserText(input);
    const imageSha = imageSha256(input.imageUrl);
    return museJson({
      schemaName: "Classification",
      jsonSchema: classificationJsonSchema,
      schema: classificationSchema,
      system: CLASSIFY_SYSTEM,
      imageUrl: input.imageUrl,
      userText,
      cacheScope: isDemoImageSha(imageSha) ? "demo" : "private",
      keyMaterial: classifyKeyMaterial(imageSha, userText),
    });
  });
}

export async function summarizeBrand(input: {
  websiteText: string;
  brief: string;
}): Promise<BrandSummary> {
  return withOneRetry(brandSummarySchema, "Brand summary", async () => {
    if (isMock()) return mockBrandSummary(input);
    const userText = brandUserText(input.websiteText, input.brief);
    return museJson({
      schemaName: "BrandSummary",
      jsonSchema: brandSummaryJsonSchema,
      schema: brandSummarySchema,
      system: BRAND_SYSTEM,
      userText,
      cacheScope: isDemoBrandText(input.websiteText, input.brief) ? "demo" : "private",
      keyMaterial: brandKeyMaterial(userText),
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
  takeOutputSlot("brief");
  return withOneRetry(conceptBriefSchema, "Concept brief", async () => {
    if (isMock()) {
      return mockConceptBrief({
        motivation: input.motivation,
        format: input.format,
        offer: input.offer,
      });
    }
    const userText = [
      `Motivation: ${input.motivation}`,
      `Format: ${input.format}`,
      `Offer: ${input.offer}`,
      `Coverage note: ${input.hypothesis}`,
      `Website text:\n${input.websiteText}`,
      `Campaign brief:\n${input.brief}`,
    ].join("\n\n");
    return museJson({
      schemaName: "ConceptBrief",
      jsonSchema: conceptBriefJsonSchema,
      schema: conceptBriefSchema,
      system: BRIEF_SYSTEM,
      userText,
      cacheScope: "private",
      keyMaterial: {
        model: "muse-spark-1.3",
        task: "writeBrief",
        system: BRIEF_SYSTEM,
        userText,
        responseFormat: { type: "json_schema", strict: true, name: "ConceptBrief" },
      },
    });
  });
}

export async function generateMockup(input: {
  visualDirection: string;
  cacheScope?: CacheScope;
}): Promise<Mockup> {
  takeOutputSlot("mockup");
  return withOneRetry(mockupSchema, "Mockup", async () => {
    if (isMock()) return mockMockup(input);

    const cacheScope = input.cacheScope ?? "private";
    const body = {
      model: "muse-image-1.0" as const,
      prompt: input.visualDirection,
      n: 1,
      size: "1024x1024" as const,
      response_format: "b64_json" as const,
      output_format: "png" as const,
      tool_enablement: { enable_web_search: false },
    };
    const key = requestKey(body);
    const hit = readCache(cacheScope, key, mockupSchema);
    if (hit) {
      addCachedUsd(hit.priceUsd);
      return hit.result;
    }

    await ensureLiveClaimed();
    await chargeKnownUsd(imageCostUsd(1), "Muse Image");
    const client = liveClient();
    const response = await client.images.generate(
      body as OpenAI.Images.ImageGenerateParamsNonStreaming,
    );
    const b64Json = response.data?.[0]?.b64_json;
    if (!b64Json) {
      throw new ModelOutputError("Muse Image returned no image.");
    }
    const result = mockupSchema.parse({
      prompt: input.visualDirection,
      outputFormat: "png",
      b64Json,
    });
    writeCache(cacheScope, key, { priceUsd: imageCostUsd(1), result });
    return result;
  });
}
