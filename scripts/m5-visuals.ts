import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { compositeAd, contactSheet, rawPng } from "../lib/composite-ad";
import { formatUsd } from "../lib/money";
import {
  currentCost,
  generateDemoStill,
  readSpendTotalUsd,
  runWithCost,
  segmentRegions,
} from "../lib/meta";
import { placeText, type SubjectMask, type TextSubject } from "../lib/place-text";
import type { ConceptCopy } from "../lib/schemas";
import { FEED_ASPECT, frameSubjects, type MaskBox } from "../lib/smart-crop";

type Stored = {
  motivation: string;
  execution: string;
  hypothesis: string;
  copy: ConceptCopy;
};

const SCENES: Record<string, [string, string, string]> = {
  "Safety/trust": [
    "A close, calm portrait at a bright window seat. An ordinary woman in her forties, in a rust-coloured knit, holds a flat white with fine clean fern latte art. She looks slightly left of the camera, mouth open as if mid-sentence. Airy daylight, pale walls, a cream coffee bag on the seat beside her. No grey clothing.",
    "The same bright window seat. An ordinary man in his thirties, in a deep navy shirt, holds the flat white and looks slightly right of the camera, mid-sentence. Fine latte art, steam, the cream coffee bag in the lower corner. Airy and light. No grey clothing.",
    "The same bright window seat. An ordinary woman in her sixties, in a cream blouse, holds the cup with both hands and looks just past the camera. Fine latte art, morning light, the cream coffee bag beside the window. Airy. No grey clothing.",
  ],
  "Belonging/social proof": [
    "A shared Sunday breakfast table seen from slightly above, handheld and a little tilted. Four ordinary adults of different ages, in red, mustard, blue, and green clothes, no grey. Several cups of coffee, real food and clutter, and the cream coffee bag being passed across the table. Warm and lively.",
    "The same Sunday table, a bit closer, from slightly above. Three ordinary adults, one older and one younger, in olive, coral, and striped blue, no grey. Hands pass the cream coffee bag. Cups, bread, jam, and crumbs. Warm handheld feeling.",
    "A wider view of that breakfast, still from slightly above. The cream coffee bag is halfway across the table between two people. Steam from several cups, fruit, napkins, and a lived-in table. Clothing in rust, navy, and cream. No grey. Warm and lively.",
  ],
  "Curiosity/novelty": [
    "An overhead tasting flat lay on a pale table. A glass of clear black filter coffee, small bowls of dark cherries and cocoa nibs, a tasting spoon, the cream coffee bag, and two hands mid-action. Graphic, clean, bright daylight. No grey clothing.",
    "The same overhead tasting layout. A ceramic cup of clear black filter coffee, the bowls of cherries and cocoa nibs, a spoon lifting a nib, the cream coffee bag, two hands. Clean graphic daylight. No grey clothing.",
    "Overhead again, slightly wider so the pale table shows around the objects. Black filter coffee, cherries, cocoa nibs, spoon, the cream coffee bag, and two hands comparing the cup and the cherries. Graphic and clean. No grey clothing.",
  ],
};

const PHRASES = ["bag", "person", "face", "head", "phone", "cup", "hand", "green label"] as const;

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function largest(boxes: readonly MaskBox[]): MaskBox | null {
  let best: MaskBox | null = null;
  let area = 0;
  for (const box of boxes) {
    const next = Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
    if (next > area) {
      area = next;
      best = box;
    }
  }
  return best;
}

function overlaps(a: MaskBox, b: MaskBox): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0;
}

function intoCrop(box: MaskBox, crop: { left: number; top: number; width: number; height: number }): MaskBox | null {
  const left = Math.max(crop.left, box.left) - crop.left;
  const top = Math.max(crop.top, box.top) - crop.top;
  const right = Math.min(crop.left + crop.width, box.right) - crop.left;
  const bottom = Math.min(crop.top + crop.height, box.bottom) - crop.top;
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, right, bottom };
}

function promptFor(scene: string, extra = ""): string {
  return [
    scene,
    extra,
    "Tall photograph. Keep people, cups, and the bag in the middle band. Leave quiet space above and below so the photo can later crop to 9:16 without cutting a face or the cup.",
    brandKit.photoStyle,
    brandKit.people,
    `The coffee bag is always the same bag: ${brandKit.bag.description}.`,
    brandKit.noText,
    "No grey sweaters and no grey clothing.",
  ]
    .filter((line) => line.length > 0)
    .join(" ");
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }
  const before = readSpendTotalUsd();
  const items = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "m5", "briefs.json"), "utf8")) as Stored[];
  const out = path.join(process.cwd(), "public", "demo", "m5");
  mkdirSync(out, { recursive: true });
  const phraseHits = { face: 0, head: 0, both: 0, neither: 0 };
  const cells: { label: string; image: Buffer }[] = [];

  await runWithCost("live", async () => {
    for (const [index, item] of items.entries()) {
      const scenes = SCENES[item.motivation];
      if (!scenes) throw new Error(`No scenes for ${item.motivation}`);
      const letters = ["a", "b", "c"] as const;
      for (const [sceneIndex, scene] of scenes.entries()) {
        const letter = letters[sceneIndex] ?? "a";
        const id = `${index + 1}${letter}`;
        let extra = "";
        let accepted: Buffer | null = null;
        let note = "";
        for (let attempt = 1; attempt <= 2 && !accepted; attempt += 1) {
          const still = await generateDemoStill({ prompt: promptFor(scene, extra), cacheScope: "demo" });
          const photo = Buffer.from(still.b64Json, "base64");
          const meta = await sharp(photo).rotate().metadata();
          const width = meta.width ?? 0;
          const height = meta.height ?? 0;
          const url = dataUrl(await rawPng(photo));
          const found = new Map<string, MaskBox[]>();
          for (const phrase of PHRASES) {
            const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
            found.set(phrase, region.boxes);
          }
          const faceOn = (found.get("face") ?? []).length > 0;
          const headOn = (found.get("head") ?? []).length > 0;
          if (attempt === 1) {
            if (faceOn && headOn) phraseHits.both += 1;
            else if (faceOn) phraseHits.face += 1;
            else if (headOn) phraseHits.head += 1;
            else phraseHits.neither += 1;
          }
          const bag = largest(found.get("bag") ?? []);
          const subjects = ["person", "face", "head", "cup", "hand"]
            .flatMap((phrase) => found.get(phrase) ?? [])
            .concat(bag ? [bag] : []);
          let crop = { left: 0, top: 0, width, height };
          if (bag && width > 0 && height > 0) {
            const framed = frameSubjects({ width, height }, subjects.length > 0 ? subjects : [bag], bag, FEED_ASPECT);
            if (framed.rect.width > 0 && framed.rect.height > 0) crop = framed.rect;
          }
          const masks: SubjectMask[] = [];
          for (const [phrase, boxes] of found) {
            const subject = phrase as TextSubject;
            if (!["bag", "person", "face", "head", "phone", "cup", "hand"].includes(phrase)) continue;
            for (const box of boxes) {
              const cropped = intoCrop(box, crop);
              if (cropped) masks.push({ subject, box: cropped });
            }
          }
          const placement = placeText({ width: crop.width, height: crop.height }, masks, FEED_ASPECT, {
            headline: item.copy.headlineDa,
          });
          const pad = Math.round(crop.width * 0.04);
          const blocked = masks
            .filter((mask) => mask.subject === "face" || mask.subject === "head")
            .map((mask) => ({
              left: mask.box.left - pad,
              top: mask.box.top - pad,
              right: mask.box.right + pad,
              bottom: mask.box.bottom + pad,
            }));
          const textBox = {
            left: placement.rect.left,
            top: placement.rect.top,
            right: placement.rect.left + placement.rect.width,
            bottom: placement.rect.top + placement.rect.height,
          };
          const hitsHead = blocked.some((box) => overlaps(textBox, box));
          const bagInCrop = bag ? intoCrop(bag, crop) : null;
          note = `${id}: face ${faceOn ? "yes" : "no"}, head ${headOn ? "yes" : "no"}, bag ${bagInCrop ? "yes" : "no"}, text ${hitsHead ? "HITS" : "clear"} · ${placement.place}`;
          if (!bagInCrop || hitsHead) {
            extra =
              "Keep every face and head in the vertical middle. Leave a large empty band at the top and another at the bottom for type. The cream coffee bag must be fully visible.";
            console.log(`retry ${note}`);
            continue;
          }
          accepted = await compositeAd(photo, item.copy.headlineDa, crop, placement, {
            width: crop.width,
            height: crop.height,
          });
          writeFileSync(path.join(out, `${id}-raw.png`), await rawPng(photo));
          console.log(note);
        }
        if (!accepted) throw new Error(`${id} still failed the bag and face check after one retry. ${note}`);
        writeFileSync(path.join(out, `${id}.png`), accepted);
        const shortName = item.copy.conceptName.length > 28 ? `${item.copy.conceptName.slice(0, 27)}…` : item.copy.conceptName;
        cells.push({ label: `${id}  ${shortName}\n${item.motivation}`, image: accepted });
      }
    }
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  const sheet = await contactSheet({
    title: "M5 concepts — pick a, b, or c",
    columns: 3,
    cells: cells.map((cell) => ({ ...cell, fit: "cover" as const })),
    cellWidth: 320,
    cellHeight: 400,
  });
  const pngPath = path.join(process.cwd(), "docs", "m5", "contact-sheet.png");
  writeFileSync(pngPath, sheet);
  const jpeg = await sharp(sheet).resize({ width: 1600 }).jpeg({ quality: 85 }).toBuffer();
  if (jpeg.byteLength > 900 * 1024) throw new Error(`JPEG is ${jpeg.byteLength} bytes.`);
  writeFileSync(path.join(process.cwd(), "docs", "m5", "contact-sheet.jpg"), jpeg);
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/m5_contact_sheet_v2.jpg", jpeg);
  console.log(
    `Phrases: face only ${phraseHits.face}, head only ${phraseHits.head}, both ${phraseHits.both}, neither ${phraseHits.neither}`,
  );
  console.log(`JPEG ${jpeg.byteLength} bytes`);
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())} of ${formatUsd(120)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
