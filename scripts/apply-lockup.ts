import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { contactSheet } from "../lib/composite-ad";
import { demoPortfolio } from "../lib/demo";
import { layoutQaLine, renderLockup, type LayoutQa, type LockupMasks } from "../lib/lockup";
import { readCachedRegions, runWithCost, segmentRegions } from "../lib/meta";
import { deliveryNoticeSvg, phoneScreen } from "../lib/phone-notice";
import type { ConceptCopy } from "../lib/schemas";
import { FEED_ASPECT, frameSubjects, type MaskBox } from "../lib/smart-crop";

const WIDTH = 800;
const HEIGHT = 1000;
const CLEAN: Record<string, string> = {
  "dcl-01": "public/demo/candidates/dcl-01-c.png",
  "dcl-02": "public/demo/dcl-02-raw.png",
  "dcl-03": "public/demo/redo/dcl-03-b.png",
  "dcl-04": "public/demo/candidates/dcl-04-a.png",
  "dcl-05": "public/demo/redo/dcl-05-a.png",
  "dcl-06": "public/demo/candidates/dcl-06-a.png",
  "dcl-07": "public/demo/redo/dcl-07-a.png",
  "dcl-08": "public/demo/candidates/dcl-08-a.png",
};
const SNIPPETS = [
  ["1a", "rust-coloured knit", 0],
  ["1b", "deep navy shirt", 0],
  ["1c", "cream blouse", 0],
  ["2a", "red, mustard, blue, and green", 1],
  ["2b", "olive, coral, and striped blue", 1],
  ["2c", "halfway across the table", 1],
  ["3a", "A glass of clear black", 2],
  ["3b", "A ceramic cup of clear black", 2],
  ["3c", "slightly wider so the pale table", 2],
] as const;
const PICK_HEADLINES: Record<string, string> = {
  "1a": "I started because I could stop.",
  "2a": "Same Monday coffee. Different kitchens.",
  "3b": "Find the cherry. Then the cocoa.",
};

type Stored = { motivation: string; execution: string; copy: ConceptCopy };

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function intoCrop(
  box: MaskBox,
  crop: { left: number; top: number; width: number; height: number },
): MaskBox | null {
  const left = Math.max(crop.left, box.left) - crop.left;
  const top = Math.max(crop.top, box.top) - crop.top;
  const right = Math.min(crop.left + crop.width, box.right) - crop.left;
  const bottom = Math.min(crop.top + crop.height, box.bottom) - crop.top;
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, right, bottom };
}

function scale(box: MaskBox, crop: { width: number; height: number }): MaskBox {
  const sx = WIDTH / crop.width;
  const sy = HEIGHT / crop.height;
  return {
    left: box.left * sx,
    top: box.top * sy,
    right: box.right * sx,
    bottom: box.bottom * sy,
  };
}

async function regionBoxes(url: string, phrase: string, live: boolean): Promise<MaskBox[]> {
  const cached = readCachedRegions(url, phrase, "demo");
  if (cached) return cached.boxes;
  if (!live) return [];
  const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
  console.log(`  SAM ${phrase}: ${region.found ? region.boxes.length : 0}`);
  return region.boxes;
}

function largest(boxes: readonly MaskBox[]): MaskBox | null {
  return boxes.reduce<MaskBox | null>((best, box) => {
    const area = Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
    if (!best) return box;
    const bestArea = (best.right - best.left) * (best.bottom - best.top);
    return area > bestArea ? box : best;
  }, null);
}

function cropsFor(
  image: { width: number; height: number },
  bag: MaskBox | null,
  base: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number }[] {
  const list = [base];
  const height = Math.min(image.height, Math.round(image.width / FEED_ASPECT));
  const width = Math.min(image.width, Math.round(height * FEED_ASPECT));
  const push = (left: number, top: number) => {
    const rect = {
      left: Math.max(0, Math.min(image.width - width, Math.round(left))),
      top: Math.max(0, Math.min(image.height - height, Math.round(top))),
      width,
      height,
    };
    if (!bag) {
      list.push(rect);
      return;
    }
    const overlapW = Math.min(bag.right, rect.left + rect.width) - Math.max(bag.left, rect.left);
    const overlapH = Math.min(bag.bottom, rect.top + rect.height) - Math.max(bag.top, rect.top);
    const overlap = Math.max(0, overlapW) * Math.max(0, overlapH);
    const bagArea = Math.max(1, (bag.right - bag.left) * (bag.bottom - bag.top));
    const centerIn =
      bag.left + (bag.right - bag.left) / 2 >= rect.left &&
      bag.left + (bag.right - bag.left) / 2 <= rect.left + rect.width &&
      bag.top + (bag.bottom - bag.top) / 2 >= rect.top &&
      bag.top + (bag.bottom - bag.top) / 2 <= rect.top + rect.height;
    if (overlap >= bagArea * 0.35 || centerIn) list.push(rect);
  };
  if (bag) {
    for (let left = 0; left <= image.width - width; left += Math.max(24, Math.round(width / 12))) {
      for (let top = 0; top <= image.height - height; top += Math.max(24, Math.round(height / 8))) {
        push(left, top);
      }
    }
  }
  const seen = new Set<string>();
  return list.filter((rect) => {
    const key = `${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function paint(
  photo: Buffer,
  headline: string,
  url: string,
  baseCrop: { left: number; top: number; width: number; height: number } | null,
): Promise<{ image: Buffer; qa: LayoutQa; phrase: "hands" | "hand" | "neither" } | null> {
  const meta = await sharp(photo).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const bags = await regionBoxes(url, "bag", true);
  const faces = await regionBoxes(url, "face", true);
  const heads = await regionBoxes(url, "head", true);
  const handBoxes = await regionBoxes(url, "hand", true);
  const handsBoxes = await regionBoxes(url, "hands", true);
  const phrase: "hands" | "hand" | "neither" = handsBoxes.length > 0 ? "hands" : handBoxes.length > 0 ? "hand" : "neither";
  const hands = handsBoxes.length > 0 ? handsBoxes : handBoxes;
  const bag = largest(bags);
  const framed = bag
    ? frameSubjects(image, [bag, ...faces, ...heads], bag, FEED_ASPECT).rect
    : { left: 0, top: 0, width: image.width, height: image.height };
  const first = baseCrop && baseCrop.width > 0 ? baseCrop : framed;
  let skips = 0;
  for (const [index, crop] of cropsFor(image, bag, first).entries()) {
    if (crop.width < 8 || crop.height < 8) continue;
    if (crop.left + crop.width > image.width || crop.top + crop.height > image.height) continue;
    const base = await sharp(photo)
      .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .resize(WIDTH, HEIGHT, { fit: "fill" })
      .png()
      .toBuffer();
    const map = (boxes: readonly MaskBox[]): MaskBox[] =>
      boxes.flatMap((box) => {
        const cropped = intoCrop(box, crop);
        return cropped ? [scale(cropped, crop)] : [];
      });
    const masks: LockupMasks = {
      face: map(faces),
      head: map(heads),
      hands: map(hands),
      bag: map(bags),
    };
    const lockup = await renderLockup({ image: base, headline, aspect: "4:5", masks });
    if (!lockup.qa.ok) {
      skips += 1;
      if (skips <= 2) {
        console.log(`  skip crop ${index}: ${lockup.qa.reason} bag ${masks.bag.length} face ${masks.face.length} head ${masks.head.length} hands ${masks.hands.length}`);
      }
      continue;
    }
    const imageOut = await sharp(base)
      .composite([{ input: Buffer.from(lockup.svg), top: 0, left: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { image: imageOut, qa: { ...lockup.qa, recropped: index > 0 }, phrase };
  }
  console.log(`  no clear corner for “${headline}” after ${skips} crops`);
  return null;
}

async function cachedStill(snippet: string): Promise<Buffer> {
  const files = execSync('rg -l "No grey sweaters" data/cache', { encoding: "utf8" }).trim().split("\n");
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(snippet)) continue;
    const parsed = JSON.parse(text) as { result?: { b64Json?: string } };
    if (parsed.result?.b64Json) return Buffer.from(parsed.result.b64Json, "base64");
  }
  throw new Error(`Missing still for ${snippet}`);
}

async function main(): Promise<void> {
  const briefs = JSON.parse(readFileSync("docs/m5/briefs.json", "utf8")) as Stored[];
  const manifest = JSON.parse(readFileSync("lib/demo-manifest.json", "utf8")) as {
    picks: Record<string, { crop: { left: number; top: number; width: number; height: number }; [key: string]: unknown }>;
  };
  const qa: Record<string, LayoutQa> = {};
  const phraseCount = { hands: 0, hand: 0, neither: 0 };
  const corners = { "bottom-left": 0, "top-left": 0, none: 0 };
  const recrops: string[] = [];

  await runWithCost("live", async () => {
    for (const ad of demoPortfolio.ads) {
      const file = CLEAN[ad.id];
      if (!file) throw new Error(ad.id);
      let photo = readFileSync(file);
      const sourceUrl = dataUrl(photo);
      if (ad.id === "dcl-06") {
        const phone =
          largest(await regionBoxes(sourceUrl, "phone", false)) ??
          largest(await regionBoxes(sourceUrl, "phone screen", false));
        if (!phone) throw new Error("Ad 6 has no cached phone mask.");
        const notice = deliveryNoticeSvg(phoneScreen(phone));
        photo = await sharp(photo)
          .rotate()
          .composite([{ input: Buffer.from(notice.svg), left: notice.left, top: notice.top }])
          .png()
          .toBuffer();
      }
      const plain = photo;
      const result = await paint(plain, ad.headline, sourceUrl, manifest.picks[ad.id]?.crop ?? null);
      if (!result) throw new Error(`${ad.id} has no clear corner.`);
      writeFileSync(path.join("public", "demo", `${ad.id}.png`), result.image);
      writeFileSync(path.join("public", "demo", `${ad.id}-raw.png`), plain);
      qa[ad.id] = result.qa;
      phraseCount[result.phrase] += 1;
      corners[result.qa.corner] += 1;
      if (result.qa.recropped) recrops.push(ad.id);
      manifest.picks[ad.id] = { ...manifest.picks[ad.id], layoutQa: layoutQaLine(result.qa) };
      console.log(`${ad.id}: ${result.qa.corner} recrop ${result.qa.recropped} phrase ${result.phrase} · ${result.qa.reason}`);
    }

    const cells: { label: string; image: Buffer }[] = [];
    for (const [id, snippet, briefIndex] of SNIPPETS) {
      const brief = briefs[briefIndex];
      if (!brief) throw new Error(id);
      const photo = await sharp(await cachedStill(snippet)).rotate().png().toBuffer();
      const headline = PICK_HEADLINES[id] ?? brief.copy.headlineDa;
      const result = await paint(photo, headline, dataUrl(photo), null);
      if (!result) {
        console.log(`${id}: FAILED`);
        continue;
      }
      writeFileSync(path.join("public", "demo", "m5", `${id}.png`), result.image);
      writeFileSync(path.join("public", "demo", "m5", `${id}-raw.png`), photo);
      qa[id] = result.qa;
      phraseCount[result.phrase] += 1;
      corners[result.qa.corner] += 1;
      if (result.qa.recropped) recrops.push(id);
      console.log(`${id}: ${result.qa.corner} recrop ${result.qa.recropped} phrase ${result.phrase} · ${result.qa.reason}`);
      if (PICK_HEADLINES[id]) {
        const note =
          id === "1a"
            ? `${id}  ${brief.copy.conceptName}\n${brief.motivation} · ${brief.execution}\nIllustrative testimonial:\nreplace with a real customer quote before use`
            : `${id}  ${brief.copy.conceptName}\n${brief.motivation} · ${brief.execution}`;
        cells.push({ label: note, image: result.image });
      }
    }

    for (const id of ["1a", "2a", "3b"]) {
      if (!qa[id]) throw new Error(`${id} has no clear corner.`);
    }
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync("lib/demo-manifest.json", body);
    writeFileSync("public/demo/manifest.json", body);
    writeFileSync("lib/layout-qa.json", `${JSON.stringify(qa, null, 2)}\n`);
    const finals = demoPortfolio.ads.map((ad) => ({
      label: String(Number(ad.id.slice(4))),
      image: readFileSync(path.join("public", "demo", `${ad.id}.png`)),
    }));
    const eight = await contactSheet({
      title: "Danish Coffee Lab — 8 ads",
      columns: 4,
      cells: finals.map((item) => ({ ...item, fit: "cover" as const })),
      cellWidth: 320,
      cellHeight: 400,
    });
    writeFileSync("docs/m3/final-ads.png", eight);
    const picks = await contactSheet({
      title: "M5 picks — 1a, 2a, 3b",
      columns: 3,
      cells: cells.map((item) => ({ ...item, fit: "cover" as const })),
      cellWidth: 420,
      cellHeight: 525,
    });
    mkdirSync("docs/m5", { recursive: true });
    writeFileSync("docs/m5/contact-sheet-picks.png", picks);
    const finalJpeg = await sharp(eight).resize({ width: 1600 }).jpeg({ quality: 85 }).toBuffer();
    const picksJpeg = await sharp(picks).resize({ width: 1600 }).jpeg({ quality: 85 }).toBuffer();
    if (finalJpeg.byteLength > 900 * 1024 || picksJpeg.byteLength > 900 * 1024) {
      throw new Error(`JPEG too large: ${finalJpeg.byteLength}, ${picksJpeg.byteLength}`);
    }
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync("/opt/cursor/artifacts/final_ads_lockup.jpg", finalJpeg);
    writeFileSync("/opt/cursor/artifacts/m5_picks_lockup.jpg", picksJpeg);
    writeFileSync("docs/m3/final-ads.jpg", finalJpeg);
    writeFileSync("docs/m5/contact-sheet-picks.jpg", picksJpeg);
    console.log(`phrases hands ${phraseCount.hands} hand ${phraseCount.hand} neither ${phraseCount.neither}`);
    console.log(`corners ${JSON.stringify(corners)} recrops ${recrops.join(", ") || "none"}`);
    console.log(`jpeg ${finalJpeg.byteLength} ${picksJpeg.byteLength}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
