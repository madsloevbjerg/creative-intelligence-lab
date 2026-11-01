import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandLabel } from "../lib/brand-label";
import { brandKit } from "../lib/brand-kit";
import { compositeAd, contactSheet } from "../lib/composite-ad";
import { demoPortfolio } from "../lib/demo";
import { formatUsd } from "../lib/money";
import { conflictQuote, offBrandMotivations, rankGaps, topGaps } from "../lib/gaps";
import {
  classifyAd,
  currentCost,
  extractConstraints,
  readCachedRegions,
  readSpendTotalUsd,
  runWithCost,
  segmentImage,
  segmentRegions,
  summarizeBrand,
  type SegmentRegion,
} from "../lib/meta";
import { placeText, type SubjectMask, type TextSubject } from "../lib/place-text";
import { deliveryNoticeSvg, phoneScreen } from "../lib/phone-notice";
import { FEED_ASPECT, type MaskBox } from "../lib/smart-crop";

const expectedMotivation: Record<string, string> = {
  "dcl-01": "Price/value",
  "dcl-02": "Price/value",
  "dcl-03": "Price/value",
  "dcl-04": "Convenience/time",
  "dcl-05": "Convenience/time",
  "dcl-06": "Convenience/time",
  "dcl-07": "Quality/performance",
  "dcl-08": "Quality/performance",
};

const sources: Record<string, string[]> = {
  "dcl-01": ["public/demo/candidates/dcl-01-c.png", "public/demo/dcl-01-raw.png"],
  "dcl-02": ["public/demo/dcl-02-raw.png"],
  "dcl-03": ["public/demo/redo/dcl-03-b.png", "public/demo/dcl-03-raw.png"],
  "dcl-04": ["public/demo/candidates/dcl-04-a.png", "public/demo/dcl-04-raw.png"],
  "dcl-05": ["public/demo/redo/dcl-05-a.png", "public/demo/dcl-05-raw.png"],
  "dcl-06": ["public/demo/candidates/dcl-06-a.png", "public/demo/dcl-06-raw.png"],
  "dcl-07": ["public/demo/redo/dcl-07-a.png", "public/demo/dcl-07-raw.png"],
  "dcl-08": ["public/demo/candidates/dcl-08-a.png", "public/demo/dcl-08-raw.png"],
};

const lookups: { subject: TextSubject; phrases: string[] }[] = [
  { subject: "bag", phrases: ["coffee bag", "bag"] },
  { subject: "person", phrases: ["person"] },
  { subject: "face", phrases: ["face"] },
  { subject: "phone", phrases: ["phone", "phone screen"] },
  { subject: "hand", phrases: ["hand"] },
  { subject: "kettle", phrases: ["gooseneck kettle", "kettle"] },
  { subject: "roaster", phrases: ["coffee roaster", "roaster"] },
  { subject: "cup", phrases: ["cup", "coffee cup"] },
];

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function tightBoxes(region: SegmentRegion): Promise<MaskBox[]> {
  if (!region.found) return [];
  if (region.masks.length === 0) return region.boxes;
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const found = region.masks.map((mask) => {
    const raster = decodeMaskToRaster(mask);
    let left = mask.width;
    let top = mask.height;
    let right = 0;
    let bottom = 0;
    let count = 0;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (raster[y * mask.width + x] !== 1) continue;
        count += 1;
        if (x < left) left = x;
        if (y < top) top = y;
        if (x + 1 > right) right = x + 1;
        if (y + 1 > bottom) bottom = y + 1;
      }
    }
    return {
      count,
      box: { left: mask.left + left, top: mask.top + top, right: mask.left + right, bottom: mask.top + bottom },
    };
  });
  const largest = Math.max(0, ...found.map((item) => item.count));
  const kept = found.filter((item) => item.count >= Math.max(400, largest * 0.12));
  return (kept.length > 0 ? kept : found).map((item) => item.box);
}

async function loadSubject(files: string[], phrases: string[]): Promise<{ boxes: MaskBox[]; phrase: string } | null> {
  for (const phrase of phrases) {
    for (const file of files) {
      const bytes = readFileSync(path.join(process.cwd(), file));
      const region = readCachedRegions(pngDataUrl(bytes), phrase, "demo");
      if (!region?.found) continue;
      const boxes = await tightBoxes(region);
      if (boxes.length === 0) continue;
      return { boxes, phrase };
    }
  }
  return null;
}

function intoCrop(box: MaskBox, crop: { left: number; top: number; width: number; height: number }): MaskBox | null {
  const left = Math.max(crop.left, box.left) - crop.left;
  const top = Math.max(crop.top, box.top) - crop.top;
  const right = Math.min(crop.left + crop.width, box.right) - crop.left;
  const bottom = Math.min(crop.top + crop.height, box.bottom) - crop.top;
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, right, bottom };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "demo-manifest.json"), "utf8")) as {
    picks: Record<
      string,
      {
        crop: { left: number; top: number; width: number; height: number };
        [key: string]: unknown;
      }
    >;
  };
  const before = readSpendTotalUsd();
  const finals: { label: string; image: Buffer }[] = [];
  const labelNotes: string[] = [];
  const labelBoxes = new Map<string, MaskBox | null>();
  if (process.env.MODEL_API_KEY?.trim()) {
    await runWithCost("live", async () => {
      for (const ad of demoPortfolio.ads) {
        const number = ad.id.slice(4);
        const clean = ad.id === "dcl-06" ? "public/demo/candidates/dcl-06-a.png" : `public/demo/dcl-${number}-raw.png`;
        const bytes = readFileSync(path.join(process.cwd(), clean));
        const imageUrl = pngDataUrl(bytes);
        const cached = readCachedRegions(imageUrl, "green label", "demo");
        const region = cached ?? (await segmentRegions({ imageUrl, phrase: "green label", cacheScope: "demo" }));
        const boxes = region.found ? await tightBoxes(region) : [];
        const box =
          boxes.sort(
            (a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top),
          )[0] ?? null;
        labelBoxes.set(ad.id, box);
      }
    });
  }

  for (const ad of demoPortfolio.ads) {
    const pick = manifest.picks[ad.id];
    if (!pick) throw new Error(ad.id);
    const number = ad.id.slice(4);
    const rawPath = path.join(process.cwd(), "public", "demo", `dcl-${number}-raw.png`);
    const clean = ad.id === "dcl-06" ? "public/demo/candidates/dcl-06-a.png" : `public/demo/dcl-${number}-raw.png`;
    let photo = readFileSync(path.join(process.cwd(), clean));
    const skipLabel = new Set(["dcl-01", "dcl-02", "dcl-06"]);
    const labelled = skipLabel.has(ad.id)
      ? null
      : await brandLabel(photo, labelBoxes.get(ad.id) ?? null, brandKit.name);
    if (labelled) {
      photo = Buffer.from(labelled);
      labelNotes.push(`${Number(number)}: wordmark printed on the green label`);
    } else {
      labelNotes.push(`${Number(number)}: no label print (mask missing or unusable)`);
    }
    const files = sources[ad.id] ?? [`public/demo/dcl-${number}-raw.png`];
    const masks: SubjectMask[] = [];
    const elements: { subject: string; left: number; top: number; right: number; bottom: number }[] = [];
    const used: string[] = [];
    let phoneBox: MaskBox | null = null;
    for (const lookup of lookups) {
      const hit = await loadSubject(files, lookup.phrases);
      if (!hit) continue;
      used.push(`${lookup.subject}:${hit.phrase}`);
      if (lookup.subject === "phone") phoneBox = hit.boxes[0] ?? null;
      for (const box of hit.boxes) {
        elements.push({ subject: lookup.subject, left: box.left, top: box.top, right: box.right, bottom: box.bottom });
        const cropped = intoCrop(box, pick.crop);
        if (cropped) masks.push({ subject: lookup.subject, box: cropped });
      }
    }
    if (ad.id === "dcl-06") {
      if (!phoneBox) throw new Error("Ad 6 has no cached phone mask, so the notification was not drawn.");
      const screen = phoneScreen(phoneBox);
      const notice = deliveryNoticeSvg(screen);
      const meta = await sharp(photo).metadata();
      const left = Math.max(0, Math.min(notice.left, (meta.width ?? 1) - notice.width));
      const top = Math.max(0, Math.min(notice.top, (meta.height ?? 1) - notice.height));
      photo = await sharp(photo)
        .composite([{ input: Buffer.from(notice.svg), left, top }])
        .png({ compressionLevel: 9 })
        .toBuffer();
    }
    const placement = placeText(
      { width: pick.crop.width, height: pick.crop.height },
      masks,
      FEED_ASPECT,
      { headline: ad.headline },
    );
    const finalImage = await compositeAd(photo, ad.headline, pick.crop, placement, {
      width: pick.crop.width,
      height: pick.crop.height,
    });
    writeFileSync(rawPath, photo);
    writeFileSync(path.join(process.cwd(), "public", "demo", `dcl-${number}.png`), finalImage);
    finals.push({ label: String(Number(number)), image: finalImage });
    manifest.picks[ad.id] = {
      ...pick,
      overlay: placement.place,
      placement: { band: placement.place, reason: placement.reason },
      elements,
    };
    console.log(`${Number(number)}: ${placement.reason}`);
    console.log(`  ${labelNotes[labelNotes.length - 1] ?? ""}`);
  }

  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(path.join(process.cwd(), "lib", "demo-manifest.json"), body);
  writeFileSync(path.join(process.cwd(), "public", "demo", "manifest.json"), body);
  const sheet = await contactSheet({
    title: "Danish Coffee Lab — 8 ads",
    columns: 4,
    cells: finals.map((item) => ({ label: item.label, image: item.image, fit: "cover" as const })),
    cellWidth: 320,
    cellHeight: 400,
  });
  mkdirSync(path.join(process.cwd(), "docs", "m3"), { recursive: true });
  writeFileSync(path.join(process.cwd(), "docs", "m3", "final-ads.png"), sheet);
  writeFileSync("/opt/cursor/artifacts/m3_placed_ads.png", sheet);

  if (process.env.PLACE_ONLY === "1") {
    console.log("Placement only. SAM was not called.");
    return;
  }

  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. Ads were written, but SAM was not re-run.");
    process.exitCode = 1;
    return;
  }

  await runWithCost("live", async () => {
    const placed = [];
    for (const ad of demoPortfolio.ads) {
      const file = readFileSync(path.join(process.cwd(), "public", ad.file.replace(/^\//, "")));
      const imageUrl = pngDataUrl(file);
      const segmentation = await segmentImage({ imageUrl, headline: ad.headline, primaryText: ad.primaryText });
      const classification = await classifyAd({
        imageUrl,
        headline: ad.headline,
        primaryText: ad.primaryText,
        segmentation,
      });
      const motivation = expectedMotivation[ad.id];
      const same = classification.motivation === motivation ? "unchanged" : `CHANGED from ${motivation}`;
      console.log(
        `${ad.id}: ${classification.motivation} · ${classification.execution} · ${classification.delivery} · ${same} · product ${segmentation.product.found ? "yes" : "no"}, person ${segmentation.person.found ? "yes" : "no"}, text ${segmentation.textOverlay.found ? "yes" : "no"}, setting ${segmentation.setting.found ? "yes" : "no"}, logo ${segmentation.logo.found ? "yes" : "no"}`,
      );
      placed.push({ ad, classification });
    }
    await summarizeBrand({ websiteText: demoPortfolio.websiteText, brief: demoPortfolio.brief });
    const constraints = await extractConstraints({
      websiteText: demoPortfolio.websiteText,
      brief: demoPortfolio.brief,
    });
    console.log(`Exclusions: ${constraints.exclusions.join(" | ")}`);
    console.log(`Focus: ${constraints.focusPoints.join(" | ")}`);
    const exclusions = constraints.exclusions;
    for (const item of placed) {
      const quote = conflictQuote(`${item.ad.headline} ${item.ad.primaryText}`, exclusions);
      if (quote) console.log(`FLAG ${item.ad.id}: ${quote}`);
    }
    const gaps = topGaps(
      rankGaps({
        ads: placed.map((item) => ({
          motivation: item.classification.motivation,
          execution: item.classification.execution,
        })),
        focusPoints: constraints.focusPoints,
        exclusions,
      }),
    );
    console.log(`Off-brand: ${offBrandMotivations(exclusions).join(", ")}`);
    for (const [index, gap] of gaps.entries()) {
      console.log(`GAP ${index + 1}: ${gap.motivation} × ${gap.execution}`);
      console.log(`  ${gap.hypothesis}`);
    }
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())} of ${formatUsd(120)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
