import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compositeAd, contactSheet } from "../lib/composite-ad";
import { demoPortfolio } from "../lib/demo";
import { placeText, type SubjectMask, type TextSubject } from "../lib/place-text";
import { FEED_ASPECT, type MaskBox } from "../lib/smart-crop";

type Pick = {
  crop: { left: number; top: number; width: number; height: number };
  elements?: { subject: string; left: number; top: number; right: number; bottom: number }[];
  [key: string]: unknown;
};

function intoCrop(box: MaskBox, crop: Pick["crop"]): MaskBox | null {
  const left = Math.max(crop.left, box.left) - crop.left;
  const top = Math.max(crop.top, box.top) - crop.top;
  const right = Math.min(crop.left + crop.width, box.right) - crop.left;
  const bottom = Math.min(crop.top + crop.height, box.bottom) - crop.top;
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, right, bottom };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "demo-manifest.json"), "utf8")) as {
    picks: Record<string, Pick>;
  };
  const finals: { label: string; image: Buffer }[] = [];
  for (const ad of demoPortfolio.ads) {
    const pick = manifest.picks[ad.id];
    if (!pick) throw new Error(ad.id);
    const number = ad.id.slice(4);
    const raw = readFileSync(path.join(process.cwd(), "public", "demo", `dcl-${number}-raw.png`));
    const masks: SubjectMask[] = [];
    for (const element of pick.elements ?? []) {
      const cropped = intoCrop(element, pick.crop);
      if (!cropped) continue;
      masks.push({ subject: element.subject as TextSubject, box: cropped });
    }
    const placement = placeText({ width: pick.crop.width, height: pick.crop.height }, masks, FEED_ASPECT, {
      headline: ad.headline,
    });
    const image = await compositeAd(raw, ad.headline, pick.crop, placement, {
      width: pick.crop.width,
      height: pick.crop.height,
    });
    writeFileSync(path.join(process.cwd(), "public", "demo", `dcl-${number}.png`), image);
    finals.push({ label: String(Number(number)), image });
    pick.placement = { band: placement.place, reason: placement.reason };
    pick.overlay = placement.place;
    console.log(`${Number(number)}: ${placement.reason}`);
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
  writeFileSync(path.join(process.cwd(), "docs", "m3", "final-ads.png"), sheet);
  console.log("Wrote docs/m3/final-ads.png");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
