import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { UserFacingError } from "../lib/errors";
import {
  chargeKnownUsd,
  currentCost,
  imageCostUsd,
  readSpendTotalUsd,
  reserveEstimateUsd,
  runWithCost,
  samCallUsd,
  segmentImage,
  settleEstimateUsd,
  sparkCostUsd,
  usageCostUsd,
} from "../lib/meta";

const spendFile = path.join(process.cwd(), ".data", "spend.json");
const backup = existsSync(spendFile) ? readFileSync(spendFile) : null;
let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(message);
}

function near(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-9) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

function resetSpend(totalUsd: number): void {
  mkdirSync(path.dirname(spendFile), { recursive: true });
  writeFileSync(spendFile, `${JSON.stringify({ totalUsd }, null, 2)}\n`);
}

process.env.USE_MOCK = "true";
delete process.env.MODEL_API_KEY;

near(sparkCostUsd(1_000_000, 1_000_000), 5.5, "spark million/million");
near(sparkCostUsd(1_000_000, 0), 1.25, "spark input only");
near(sparkCostUsd(0, 1_000_000), 4.25, "spark output only");
near(samCallUsd(), 0.0025, "one sam call");
near(samCallUsd() * 1000, 2.5, "1000 sam calls");
near(imageCostUsd(1), 0.01, "one image");
near(
  usageCostUsd({ prompt_tokens: 2_000_000, completion_tokens: 1_000_000 }) ?? -1,
  2.5 + 4.25,
  "usage field",
);
near(
  usageCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }) ?? -1,
  1.25,
  "responses-style usage",
);
if (usageCostUsd(null) !== null) fail("missing usage should stay null");

async function main(): Promise<void> {
  resetSpend(0);
  process.env.BUDGET_LIMIT_USD = "0.01";

  await chargeKnownUsd(samCallUsd(), "SAM 3.1");
  await chargeKnownUsd(samCallUsd(), "SAM 3.1");
  await chargeKnownUsd(samCallUsd(), "SAM 3.1");
  await chargeKnownUsd(samCallUsd(), "SAM 3.1");
  near(readSpendTotalUsd(), 0.01, "exact budget is allowed");

  let refused = false;
  try {
    await chargeKnownUsd(samCallUsd(), "SAM 3.1");
  } catch (error) {
    refused = true;
    if (!(error instanceof UserFacingError) || error.status !== 402) {
      fail(`budget refusal should be a 402, got ${error instanceof Error ? error.message : error}`);
    } else if (!error.message.includes("over the $0.01 budget") || !error.message.includes("not sent")) {
      fail(`budget message was unclear: ${error.message}`);
    }
  }
  if (!refused) fail("a call over the budget was allowed");
  near(readSpendTotalUsd(), 0.01, "refused call did not change the total");

  resetSpend(0);
  process.env.BUDGET_LIMIT_USD = "1";
  const estimate = sparkCostUsd(1000, 800);
  await reserveEstimateUsd(estimate, "Muse Spark");
  const actual = usageCostUsd({ prompt_tokens: 1000, completion_tokens: 100 }) ?? 0;
  await settleEstimateUsd(estimate, actual);
  near(readSpendTotalUsd(), actual, "spark settle uses real usage");

  const before = readSpendTotalUsd();
  const snapshot = await runWithCost("mock", async () => {
    await segmentImage({
      imageUrl: "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E",
      headline: "Coffee for 49 kr a week",
      primaryText: "Specialty coffee, delivered. One bag, one low weekly price. Cancel any time.",
    });
    return currentCost();
  });
  near(snapshot.runUsd, 0, "mock run cost");
  near(readSpendTotalUsd(), before, "mock run did not write spend");
  if (snapshot.budgetUsd !== 1) fail(`budget snapshot was ${snapshot.budgetUsd}`);

  if (failures > 0) {
    console.error(`${failures} budget check(s) failed`);
    return;
  }

  console.log("Budget math, the hard cap, and the $0 mock path check out.");
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.error(error instanceof Error ? error.message : error);
  })
  .finally(() => {
    if (backup) writeFileSync(spendFile, backup);
    else rmSync(spendFile, { force: true });
    if (failures > 0) process.exitCode = 1;
  });
