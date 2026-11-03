import { readFileSync } from "node:fs";
import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { contrastRatio, renderLockup, type LayoutQa } from "../lib/lockup";
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
  for (const key of ["face", "head", "hands", "bag"] as const) {
    if (qa.overlapPx[key] > 0) fail(`${name} overlaps ${key} by ${qa.overlapPx[key]}px`);
  }
  if (qa.fontSize < 1) fail(`${name} has no font size`);
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

const stored = JSON.parse(readFileSync("lib/layout-qa.json", "utf8")) as Record<string, LayoutQa>;
const names = Object.keys(stored);
if (names.length < 11) fail(`expected 11 creatives, found ${names.length}`);
for (const [name, qa] of Object.entries(stored)) assertRecord(name, qa);

if (failures > 0) {
  console.error(`${failures} layout check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`Layout QA holds for ${names.length} creatives. Contrast, margins, and the 9:16 band check out.`);
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
