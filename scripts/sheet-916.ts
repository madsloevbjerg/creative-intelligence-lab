import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import sharp from "sharp";

import { contactSheet } from "../lib/composite-ad";

async function main(): Promise<void> {
  const cells = [
    { label: "1 · best of 3\nbag in the bottom band", image: readFileSync("/tmp/1a-916-c1.png") },
    { label: "2 · best of 3\nbag in the bottom band", image: readFileSync("/tmp/2a-916-c2.png") },
    { label: "3 · closest\n13% of the bag is low", image: readFileSync("/tmp/3b-916-c1.png") },
    { label: "Sofie · best of 3\nbag in the bottom band", image: readFileSync("/tmp/persona-916-c1.png") },
  ];
  const sheet = await contactSheet({
    title: "New 9:16 candidates",
    columns: 2,
    cells: cells.map((cell) => ({ ...cell, fit: "contain" as const })),
    cellWidth: 360,
    cellHeight: 640,
  });
  const jpeg = await sharp(sheet).jpeg({ quality: 80 }).toBuffer();
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/verticals_916_candidates.jpg", jpeg);
  writeFileSync("docs/m5/verticals-916-candidates.jpg", jpeg);
  console.log(jpeg.byteLength);
}

main();
