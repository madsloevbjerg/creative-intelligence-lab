import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { requestKey, writeCache } from "../lib/cache";
import { demoPortfolio } from "../lib/demo";
import { isExactDemoSubmission, loadCachedDemo } from "../lib/demo-cache";
import { UserFacingError } from "../lib/errors";
import { decodedImageBytes, imageSha256 } from "../lib/image-bytes";
import { MAX_BRIEFS_PER_RUN, MAX_IMAGE_BYTES, MAX_MOCKUPS_PER_RUN } from "../lib/limits";
import {
  budgetLimitUsd,
  claimLiveRun,
  currentCost,
  generateMockup,
  readSpendTotalUsd,
  resolveLiveAccess,
  runWithCost,
  samKeyMaterial,
  segmentPhrase,
  writeBrief,
} from "../lib/meta";

const saved = {
  key: process.env.MODEL_API_KEY,
  mock: process.env.USE_MOCK,
  code: process.env.LIVE_ACCESS_CODE,
  runs: process.env.LIVE_RUNS_PER_HOUR,
  budget: process.env.BUDGET_LIMIT_USD,
};

const runsFile = path.join(process.cwd(), ".data", "live-runs.json");
const spendFile = path.join(process.cwd(), ".data", "spend.json");
const runsBackup = existsSync(runsFile) ? readFileSync(runsFile) : null;
const spendBackup = existsSync(spendFile) ? readFileSync(spendFile) : null;

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(message);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const briefInput = {
  motivation: "Price/value" as const,
  format: "Static image" as const,
  offer: "A weekly bag of coffee.",
  websiteText: "Danish Coffee Lab roasts coffee in Aarhus and sends a bag each week.",
  brief: "Autumn push for people who already buy specialty coffee.",
  hypothesis: "Hypothesis: a price test would cover an unused cell.",
};

async function main(): Promise<void> {
  delete process.env.BUDGET_LIMIT_USD;
  if (budgetLimitUsd() !== 120) fail(`default budget was ${budgetLimitUsd()}`);

  process.env.MODEL_API_KEY = "test-key-not-used";
  delete process.env.USE_MOCK;
  delete process.env.LIVE_ACCESS_CODE;
  const disabled = resolveLiveAccess("any-code");
  if (disabled.mode !== "mock" || !disabled.reason.includes("LIVE_ACCESS_CODE is not set")) {
    fail(`unset code should disable live mode: ${disabled.mode} ${disabled.reason}`);
  }

  process.env.LIVE_ACCESS_CODE = "owner-secret";
  const blank = resolveLiveAccess("");
  const wrong = resolveLiveAccess("not-the-code");
  const right = resolveLiveAccess("owner-secret");
  if (blank.mode !== "mock" || wrong.mode !== "mock" || right.mode !== "live") {
    fail(`code check failed: blank=${blank.mode} wrong=${wrong.mode} right=${right.mode}`);
  }
  if (wrong.reason.includes("owner-secret")) fail("the reason leaked the access code");

  process.env.USE_MOCK = "true";
  if (resolveLiveAccess("owner-secret").mode !== "mock") {
    fail("USE_MOCK should keep the run on mock data even with the right code");
  }

  delete process.env.USE_MOCK;
  process.env.LIVE_RUNS_PER_HOUR = "2";
  rmSync(runsFile, { force: true });
  await claimLiveRun();
  await claimLiveRun();
  let paused = false;
  try {
    await claimLiveRun();
  } catch (error) {
    paused = true;
    if (!(error instanceof UserFacingError) || error.status !== 429) {
      fail(`rate limit should be a 429, got ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!paused) fail("a third live run was allowed inside the hourly cap");
  const logged = JSON.parse(readFileSync(runsFile, "utf8")) as { startedAt: number[] };
  if (logged.startedAt.length !== 2) fail(`rate log has ${logged.startedAt.length} runs`);

  process.env.USE_MOCK = "true";
  await runWithCost("mock", async () => {
    for (let index = 0; index < MAX_BRIEFS_PER_RUN; index += 1) {
      await writeBrief(briefInput);
    }
    for (let index = 0; index < MAX_MOCKUPS_PER_RUN; index += 1) {
      await generateMockup({ visualDirection: "A cup on a quiet table." });
    }
    let extraBrief = false;
    try {
      await writeBrief(briefInput);
    } catch (error) {
      extraBrief = error instanceof UserFacingError && error.status === 400;
    }
    if (!extraBrief) fail("a sixth concept brief was allowed");
    let extraMockup = false;
    try {
      await generateMockup({ visualDirection: "Another cup." });
    } catch (error) {
      extraMockup = error instanceof UserFacingError && error.status === 400;
    }
    if (!extraMockup) fail("a sixth mockup was allowed");
  });

  const oversized = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`;
  if (decodedImageBytes(oversized) <= MAX_IMAGE_BYTES) fail("a 5 MB image was treated as small enough");
  const tiny = "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E";
  if (decodedImageBytes(tiny) > MAX_IMAGE_BYTES) fail("a tiny svg was rejected");

  const demoAds = demoPortfolio.ads.map((ad) => {
    const svg = readFileSync(path.join(process.cwd(), "public", ad.file.replace(/^\//, "")), "utf8");
    return {
      id: ad.id,
      headline: ad.headline,
      primaryText: ad.primaryText,
      imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    };
  });
  const demoSubmission = {
    websiteText: demoPortfolio.websiteText,
    brief: demoPortfolio.brief,
    ads: demoAds,
  };
  if (!isExactDemoSubmission(demoSubmission)) fail("demo files do not match the data URLs the page sends");
  if (loadCachedDemo(demoSubmission) !== null) fail("an empty demo cache should not replay results");

  const probe = `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")}`;
  const probeKey = requestKey(samKeyMaterial(imageSha256(probe), "coffee bag"));
  writeCache("private", probeKey, {
    priceUsd: 0.0025,
    result: { found: true, note: "1 match for coffee bag." },
  });
  const spendBefore = readSpendTotalUsd();
  const snap = await runWithCost("live", async () => {
    const hit = await segmentPhrase(probe, "coffee bag");
    if (!hit.found || !hit.note.includes("coffee bag")) fail("cache hit was not returned");
    return currentCost();
  });
  if (readSpendTotalUsd() !== spendBefore) fail("a cache hit changed tracked spend");
  if (Math.abs(snap.cachedUsd - 0.0025) > 1e-9) fail(`cache credit was ${snap.cachedUsd}`);
  rmSync(path.join(process.cwd(), ".data", "cache", `${probeKey}.json`), { force: true });

  if (failures > 0) {
    console.error(`${failures} safety check(s) failed`);
    return;
  }
  console.log("Access code, hourly cap, image size, brief limits, and cache hits check out.");
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error(error instanceof Error ? error.message : error);
  })
  .finally(() => {
    restoreEnv("MODEL_API_KEY", saved.key);
    restoreEnv("USE_MOCK", saved.mock);
    restoreEnv("LIVE_ACCESS_CODE", saved.code);
    restoreEnv("LIVE_RUNS_PER_HOUR", saved.runs);
    restoreEnv("BUDGET_LIMIT_USD", saved.budget);
    if (runsBackup) writeFileSync(runsFile, runsBackup);
    else rmSync(runsFile, { force: true });
    if (spendBackup) writeFileSync(spendFile, spendBackup);
    else rmSync(spendFile, { force: true });
    if (failures > 0) process.exitCode = 1;
  });
