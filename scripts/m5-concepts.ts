import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { brandKit } from "../lib/brand-kit";
import { brandLabel } from "../lib/brand-label";
import { compositeAd, contactSheet, rawPng } from "../lib/composite-ad";
import { demoPortfolio } from "../lib/demo";
import { demoFileDataUrl } from "../lib/demo-data-url";
import { loadCachedDemo } from "../lib/demo-cache";
import { rankGaps, topGaps, type Gap } from "../lib/gaps";
import { formatUsd } from "../lib/money";
import {
  currentCost,
  generateDemoStill,
  readSpendTotalUsd,
  runWithCost,
  segmentRegions,
  writeConceptCopy,
} from "../lib/meta";
import { placeText, type SubjectMask, type TextSubject } from "../lib/place-text";
import type { ConceptCopy } from "../lib/schemas";
import { FEED_ASPECT, frameSubjects, type MaskBox } from "../lib/smart-crop";

const OUT = path.join(process.cwd(), "public", "demo", "m5");
const DOCS = path.join(process.cwd(), "docs", "m5");

const SCENES: Record<string, [string, string, string]> = {
  "Safety/trust|Testimonial": [
    "An ordinary man in his forties sits at his own pale kitchen table, mid-sentence, looking just past the camera. In front of him: a ceramic cup of clear black filter coffee with visible steam, and the cream coffee bag. Morning light from a side window. Calm, specific, not a studio and not a smile-for-the-poster.",
    "An ordinary woman in her sixties at a small table by a tall window, a flat white with fine fern latte art and the cream coffee bag beside the cup. She looks toward the camera as if answering someone, hands around the cup. A different room from a café: her own chair, a wool blanket, afternoon light.",
    "An ordinary man in his twenties on a worn sofa, talking with one hand, a cup of black coffee on the low table and the cream coffee bag next to it. Soft lamp light, a plant out of focus. He is not holding a phone.",
  ],
  "Belonging/social proof|Person/UGC": [
    "Two ordinary adults, different ages, at a small oak table sharing a pot of filter coffee. One pours black coffee into the other's cup. The cream coffee bag stands between them. They are mid-conversation, not posing. Steam, morning light, a rye bun on a plate.",
    "Close on two pairs of hands: one person passes a cup of flat white with a small latte-art leaf to another person. The cream coffee bag is on the counter behind the cups. Casual, like a friend's kitchen, no phone in frame.",
    "Three ordinary adults around a kitchen island, varied ages, each with a cup, one black filter coffee and one flat white. The open cream coffee bag is on the island. Someone reaches for a cup. Daylight, steam, a real moment, not a group portrait.",
  ],
  "Curiosity/novelty|Demo/how-to": [
    "Hands break the seal of the cream coffee bag on a stone counter. Dark beans catch the light. Beside the bag, a cup of clear black filter coffee sends up steam. A window and a linen curtain. No face. This is a how-to still, not a portrait.",
    "An ordinary adult in profile smells a spoon of dark beans held above the open cream coffee bag. On the table, a flat white with fine latte art and a little steam. Morning light. The face is in profile, not a beauty shot.",
    "A wider how-to: one hand steadies a ceramic cup while black coffee pours from a small kettle, the cream coffee bag standing just behind, a few beans on the wood. Not a tight product macro. Leave the room visible.",
  ],
};

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
  if (width <= 0 || height <= 0) return false;
  const label = Math.max(1, (a.right - a.left) * (a.bottom - a.top));
  return (width * height) / label > 0.4;
}

function intoCrop(box: MaskBox, crop: { left: number; top: number; width: number; height: number }): MaskBox | null {
  const left = Math.max(crop.left, box.left) - crop.left;
  const top = Math.max(crop.top, box.top) - crop.top;
  const right = Math.min(crop.left + crop.width, box.right) - crop.left;
  const bottom = Math.min(crop.top + crop.height, box.bottom) - crop.top;
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, right, bottom };
}

function promptFor(scene: string): string {
  return [
    scene,
    "Tall photograph with the cup, the bag, and any person kept in the middle band. Leave quiet space above and below so the same photo can be cropped to 9:16 later without cutting a face, the cup, or the bag.",
    brandKit.photoStyle,
    brandKit.people,
    `The coffee bag is always the same bag: ${brandKit.bag.description}.`,
    brandKit.noText,
    "Make the coffee itself the appetite: steam, a clear black filter coffee or a flat white with fine latte art, morning light, a real surface.",
  ].join(" ");
}

function briefMarkdown(items: { gap: Gap; copy: ConceptCopy }[]): string {
  const blocks = items.map((item, index) => {
    const { gap, copy } = item;
    return `## ${index + 1}. ${copy.conceptName}

- Motivation: ${gap.motivation}
- Execution: ${gap.execution}
- Format: Static

${gap.hypothesis}

### Danish

- Headline: ${copy.headlineDa}
- Primary text: ${copy.primaryTextDa}
- 2-second hook: ${copy.hook}
- CTA: ${copy.ctaDa}
- Core message: ${copy.coreMessage}
- Visual direction: ${copy.visualDirection}

### English

- Headline: ${copy.headlineEn}
- Primary text: ${copy.primaryTextEn}
- CTA: ${copy.ctaEn}
`;
  });
  return `# M5 concept briefs\n\nThe eight existing ads are the before. These three are the after, from the current top gaps.\n\n${blocks.join("\n")}`;
}

async function main(): Promise<void> {
  if (!process.env.MODEL_API_KEY?.trim()) {
    console.error("MODEL_API_KEY is not set. No model call was made.");
    process.exitCode = 1;
    return;
  }
  const before = readSpendTotalUsd();
  const ads = demoPortfolio.ads.map((ad) => ({
    id: ad.id,
    headline: ad.headline,
    primaryText: ad.primaryText,
    imageDataUrl: demoFileDataUrl(ad.file, readFileSync(`public${ad.file}`)),
  }));
  const replay = loadCachedDemo({
    websiteText: demoPortfolio.websiteText,
    brief: demoPortfolio.brief,
    ads,
  });
  if (!replay) throw new Error("The demo cache does not replay. No concept call was made.");
  const gaps = topGaps(
    rankGaps({
      ads: replay.ads.map((ad) => ({
        motivation: ad.classification.motivation,
        execution: ad.classification.execution,
      })),
      focusPoints: replay.constraints.focusPoints,
      exclusions: replay.constraints.exclusions,
    }),
    3,
  );
  for (const gap of gaps) console.log(`Gap: ${gap.motivation} × ${gap.execution}`);

  mkdirSync(OUT, { recursive: true });
  mkdirSync(DOCS, { recursive: true });

  const cells: { label: string; image: Buffer }[] = [];
  const written: { gap: Gap; copy: ConceptCopy }[] = [];

  await runWithCost("live", async () => {
    for (const [index, gap] of gaps.entries()) {
      const copy = await writeConceptCopy({
        motivation: gap.motivation,
        execution: gap.execution,
        hypothesis: gap.hypothesis,
        websiteText: demoPortfolio.websiteText,
        brief: demoPortfolio.brief,
      });
      written.push({ gap, copy });
      console.log(`Concept ${index + 1}: ${copy.conceptName}`);
      console.log(`  DA: ${copy.headlineDa}`);
      console.log(`  EN: ${copy.headlineEn}`);
      const scenes = SCENES[`${gap.motivation}|${gap.execution}`];
      if (!scenes) throw new Error(`No scene set for ${gap.motivation} × ${gap.execution}`);
      const letters = ["a", "b", "c"] as const;
      for (const [sceneIndex, scene] of scenes.entries()) {
        const letter = letters[sceneIndex] ?? "a";
        const id = `${index + 1}${letter}`;
        const still = await generateDemoStill({ prompt: promptFor(scene), cacheScope: "demo" });
        let photo = Buffer.from(still.b64Json, "base64");
        const meta = await sharp(photo).rotate().metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        const url = dataUrl(await rawPng(photo));
        const phrases = ["bag", "person", "face", "phone", "cup", "hand", "green label"] as const;
        const found = new Map<string, MaskBox[]>();
        for (const phrase of phrases) {
          const region = await segmentRegions({ imageUrl: url, phrase, cacheScope: "demo" });
          found.set(phrase, region.boxes);
        }
        const bag = largest(found.get("bag") ?? []);
        const phone = largest(found.get("phone") ?? []);
        const label = largest(found.get("green label") ?? []);
        if (label && !(phone && overlaps(label, phone))) {
          const labelled = await brandLabel(photo, label, brandKit.name);
          if (labelled) photo = labelled;
        }
        const subjects = ["person", "face", "cup", "hand"]
          .flatMap((phrase) => found.get(phrase) ?? [])
          .concat(bag ? [bag] : []);
        let crop = { left: 0, top: 0, width, height };
        if (bag && width > 0 && height > 0) {
          const framed = frameSubjects({ width, height }, subjects, bag, FEED_ASPECT);
          if (framed.rect.width > 0 && framed.rect.height > 0) crop = framed.rect;
        }
        const masks: SubjectMask[] = [];
        for (const [phrase, boxes] of found) {
          const subject: TextSubject | null =
            phrase === "bag"
              ? "bag"
              : phrase === "person"
                ? "person"
                : phrase === "face"
                  ? "face"
                  : phrase === "phone"
                    ? "phone"
                    : phrase === "cup"
                      ? "cup"
                      : phrase === "hand"
                        ? "hand"
                        : null;
          if (!subject) continue;
          for (const box of boxes) {
            const cropped = intoCrop(box, crop);
            if (cropped) masks.push({ subject, box: cropped });
          }
        }
        const placement = placeText({ width: crop.width, height: crop.height }, masks, FEED_ASPECT, {
          headline: copy.headlineDa,
        });
        const image = await compositeAd(photo, copy.headlineDa, crop, placement, {
          width: crop.width,
          height: crop.height,
        });
        writeFileSync(path.join(OUT, `${id}.png`), image);
        writeFileSync(path.join(OUT, `${id}-raw.png`), await rawPng(photo));
        const shortName = copy.conceptName.length > 28 ? `${copy.conceptName.slice(0, 27)}…` : copy.conceptName;
        cells.push({ label: `${id}  ${shortName}\n${gap.motivation}`, image });
        console.log(`  ${id}: bag ${bag ? "yes" : "no"} · ${placement.place} · ${placement.reason}`);
      }
    }
    const cost = currentCost();
    console.log(`Failed attempts: ${cost.failedAttempts}, ${formatUsd(cost.failedUsd)}`);
  });

  writeFileSync(path.join(DOCS, "briefs.md"), briefMarkdown(written));
  const sheet = await contactSheet({
    title: "M5 concepts — pick a, b, or c",
    columns: 3,
    cells: cells.map((cell) => ({ ...cell, fit: "cover" as const })),
    cellWidth: 320,
    cellHeight: 400,
  });
  writeFileSync(path.join(DOCS, "contact-sheet.png"), sheet);
  console.log(`This run: ${formatUsd(readSpendTotalUsd() - before)}`);
  console.log(`Tracked spend: ${formatUsd(readSpendTotalUsd())} of ${formatUsd(120)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const key = process.env.MODEL_API_KEY ?? "";
  console.error(key ? message.split(key).join("[redacted]") : message);
  process.exitCode = 1;
});
