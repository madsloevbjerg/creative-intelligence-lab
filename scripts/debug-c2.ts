import { readFileSync } from "node:fs";
import sharp from "sharp";
import { readCachedRegions } from "../lib/meta";

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function main(): Promise<void> {
  for (const id of ["c2-a", "c2-b", "c2-c"]) {
    const photo = readFileSync(`public/demo/m5/${id}-raw.png`);
    const meta = await sharp(photo).metadata();
    const url = dataUrl(photo);
    console.log(id, meta.width, meta.height);
    for (const phrase of ["bag", "face", "head", "hands"]) {
      const region = readCachedRegions(url, phrase, "demo");
      const boxes = region?.boxes ?? [];
      console.log(
        " ",
        phrase,
        boxes
          .slice(0, 4)
          .map((box) => `${Math.round(box.left)},${Math.round(box.top)}-${Math.round(box.right)},${Math.round(box.bottom)}`)
          .join(" | "),
      );
    }
  }
}

main();
