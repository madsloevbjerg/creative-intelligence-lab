import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { balanceHeadline, contrastRatio, renderLockup, type LayoutQa } from "../lib/lockup";
import { lockupConfig } from "../lib/lockup-config";

let failures = 0;
function fail(message: string): void {
  failures += 1;
  console.error(message);
}

function assertRecord(name: string, qa: LayoutQa): void {
  if (!qa.ok) fail(`${name} is not ok: ${qa.reason}`);
  if (qa.contrast < lockupConfig.minContrast) fail(`${name} contrast ${qa.contrast}`);
  if (qa.words > lockupConfig.maxWords) fail(`${name} has ${qa.words} words`);
  if (qa.lines > lockupConfig.maxLines) fail(`${name} has ${qa.lines} lines`);
  if (!qa.marginOk) fail(`${name} misses the margin`);
  if (qa.bagClipped) fail(`${name} clips the bag`);
  if (qa.fontSize < 800 * lockupConfig.minHeadlineSizeFraction - 0.5) fail(`${name} headline is under 5% of width`);
  if (qa.wordmarkSize < 800 * lockupConfig.minWordmarkSizeFraction - 0.5) fail(`${name} wordmark is under 2.2% of width`);
  for (const key of ["face", "head", "hands", "bag"] as const) {
    if (qa.overlapPx[key] > 0) fail(`${name} overlaps ${key} by ${qa.overlapPx[key]}px`);
  }
  for (const line of qa.lineText ?? []) {
    const count = line.trim().split(/\s+/).filter(Boolean).length;
    if (qa.words > 1 && count < 2) fail(`${name} leaves a single word on a line: ${line}`);
  }
}

async function main(): Promise<void> {
const blank = await sharp({
  create: { width: 800, height: 1000, channels: 3, background: "#ffffff" },
}).png().toBuffer();
const open = await renderLockup({
  image: blank,
  headline: "Coffee for 49 kr a week",
  aspect: "4:5",
  masks: { face: [], head: [], hands: [], bag: [] },
});
if (open.qa.corner !== "bottom-left") fail(`empty frame should sit bottom-left, got ${open.qa.corner}`);
if (!open.qa.ok) fail(`empty frame failed: ${open.qa.reason}`);
if (open.qa.fontSize < 800 * lockupConfig.minHeadlineSizeFraction) fail("headline is under 5% of width");

const blocked = await renderLockup({
  image: blank,
  headline: "Coffee for 49 kr a week",
  aspect: "4:5",
  masks: {
    face: [{ left: 40, top: 760, right: 280, bottom: 980 }],
    head: [],
    hands: [],
    bag: [],
  },
});
if (blocked.qa.corner !== "top-left") fail(`a face in the bottom-left should move the lockup, got ${blocked.qa.corner}`);

const neither = await renderLockup({
  image: blank,
  headline: "Coffee for 49 kr a week",
  aspect: "4:5",
  masks: {
    face: [
      { left: 40, top: 760, right: 500, bottom: 980 },
      { left: 40, top: 20, right: 500, bottom: 240 },
    ],
    head: [],
    hands: [],
    bag: [],
  },
});
if (neither.qa.ok) fail("both corners covered a face and the lockup was still accepted");

const tall = await sharp({
  create: { width: 800, height: 1422, channels: 3, background: "#ffffff" },
}).png().toBuffer();
const reels = await renderLockup({
  image: tall,
  headline: "Find the cherry. Then the cocoa.",
  aspect: "9:16",
  masks: { face: [], head: [], hands: [], bag: [] },
});
if (reels.rect.top < 1422 * lockupConfig.reels.topClear - 1) fail("9:16 lockup enters the top 14%");
if (reels.rect.top + reels.rect.height > 1422 * (1 - lockupConfig.reels.bottomClear) + 1) {
  fail("9:16 lockup enters the bottom 35%");
}

const cream = brandKit.palette.cream;
const green = brandKit.palette.deepGreen;
const parse = (color: string): [number, number, number] => [
  Number.parseInt(color.slice(1, 3), 16),
  Number.parseInt(color.slice(3, 5), 16),
  Number.parseInt(color.slice(5, 7), 16),
];
const paper = parse("#ffffff");
const ink = parse(green);
const blended: [number, number, number] = [
  paper[0] * (1 - lockupConfig.boxOpacity) + ink[0] * lockupConfig.boxOpacity,
  paper[1] * (1 - lockupConfig.boxOpacity) + ink[1] * lockupConfig.boxOpacity,
  paper[2] * (1 - lockupConfig.boxOpacity) + ink[2] * lockupConfig.boxOpacity,
];
if (contrastRatio(parse(cream), blended) < lockupConfig.minContrast) fail("cream on the green box is under 4.5:1");

const cherry = balanceHeadline("Find the cherry. Then the cocoa.", 40, 520);
if (cherry.join(" / ") !== "Find the cherry. / Then the cocoa.") fail(`sentence break was ${cherry.join(" / ")}`);
for (const sample of ["Coffee for 49 kr a week", "Three prices, one subscription", "From bag to cup in four steps"]) {
  const lines = balanceHeadline(sample, 40, 520);
  if (lines.some((line) => line.trim().split(/\s+/).length < 2)) fail(`orphan in ${sample}: ${lines.join(" / ")}`);
  if (lines.length > 2) fail(`${sample} used ${lines.length} lines`);
}

const REQUIRED = [
  "dcl-01",
  "dcl-02",
  "dcl-03",
  "dcl-04",
  "dcl-05",
  "dcl-06",
  "dcl-07",
  "dcl-08",
  "1a",
  "2a",
  "3b",
  "1a-916",
  "2a-916",
  "3b-916",
  "persona-916",
];
const FILES: Record<string, string> = {
  "dcl-01": "public/demo/dcl-01.png",
  "dcl-02": "public/demo/dcl-02.png",
  "dcl-03": "public/demo/dcl-03.png",
  "dcl-04": "public/demo/dcl-04.png",
  "dcl-05": "public/demo/dcl-05.png",
  "dcl-06": "public/demo/dcl-06.png",
  "dcl-07": "public/demo/dcl-07.png",
  "dcl-08": "public/demo/dcl-08.png",
  "1a": "public/demo/m5/1a.png",
  "2a": "public/demo/m5/2a.png",
  "3b": "public/demo/m5/3b.png",
  "1a-916": "public/demo/m5/1a-916.png",
  "2a-916": "public/demo/m5/2a-916.png",
  "3b-916": "public/demo/m5/3b-916.png",
  "persona-916": "public/demo/m5/persona-916.png",
};
const VERTICAL = new Set(["1a-916", "2a-916", "3b-916", "persona-916"]);
const MEANINGFUL = 0.02;

const stored = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
const names = [...new Set([...REQUIRED, ...Object.keys(stored)])].sort();
const rows: string[] = [];
for (const name of names) {
  const qa = stored[name];
  const before = failures;
  if (FILES[name] && !existsSync(FILES[name])) fail(`${name} image is missing`);
  if (!qa) {
    fail(`${name} has no layout record`);
  } else {
    assertRecord(name, qa);
    if (VERTICAL.has(name) || qa.aspect === "9:16") {
      const zone = qa.bottom35Pct;
      if (!zone) fail(`${name} has no bottom-35% measurement`);
      else {
        for (const key of ["bag", "face", "head", "hands", "cup"] as const) {
          if (zone[key] > MEANINGFUL) fail(`${name} puts ${key} in the bottom 35% (${(zone[key] * 100).toFixed(1)}%)`);
        }
      }
    }
  }
  const zone = qa?.bottom35Pct;
  const zoneText = zone
    ? ["bag", "face", "head", "hands", "cup"]
        .map((key) => `${key} ${((zone[key as keyof typeof zone] ?? 0) * 100).toFixed(1)}%`)
        .join(" ")
    : "—";
  rows.push(
    [
      name.padEnd(14),
      (failures === before ? "PASS" : "FAIL").padEnd(6),
      (qa?.corner ?? "—").padEnd(12),
      String(qa?.lines ?? "—").padEnd(3),
      (qa ? qa.contrast.toFixed(1) : "—").padEnd(6),
      zoneText,
    ].join(" "),
  );
}
console.log("creative       result corner       lines contrast bottom 35%");
for (const row of rows) console.log(row);

if (failures > 0) {
  console.error(`${failures} layout check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`Layout QA holds for ${names.length} creatives. A 9:16 mask in the bottom 35% fails above ${(MEANINGFUL * 100).toFixed(0)}% of that mask.`);
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
