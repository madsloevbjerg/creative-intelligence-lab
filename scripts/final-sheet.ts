import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { contactSheet } from "../lib/composite-ad";

const cells = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    label: `Ad ${n}`,
    image: readFileSync(`public/demo/dcl-0${n}.png`),
  })),
  { label: "1 · 4:5\nCancel anytime", image: readFileSync("public/demo/m5/1a.png") },
  { label: "2 · 4:5\nThe one thing we agree on", image: readFileSync("public/demo/m5/2a.png") },
  { label: "3 · 4:5\nFind the cherry", image: readFileSync("public/demo/m5/3b.png") },
  { label: "1 · 9:16\nCancel anytime", image: readFileSync("public/demo/m5/1a-916.png") },
  { label: "2 · 9:16\nWe argue about everything", image: readFileSync("public/demo/m5/2a-916.png") },
  { label: "3 · 9:16\nFind the cherry", image: readFileSync("public/demo/m5/3b-916.png") },
  { label: "Sofie · 9:16\nAI-generated\npersona, fictional", image: readFileSync("public/demo/m5/persona-916.png") },
];

async function main(): Promise<void> {
const sheet = await contactSheet({
  title: "Final creatives",
  columns: 4,
  cells: cells.map((cell) => ({ ...cell, fit: "contain" as const })),
  cellWidth: 300,
  cellHeight: 360,
});
const jpeg = await sharp(sheet).resize({ width: 1600 }).jpeg({ quality: 80 }).toBuffer();
if (jpeg.byteLength > 900 * 1024) throw new Error(String(jpeg.byteLength));
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/final_contact_sheet_v2.jpg", jpeg);
writeFileSync("docs/m5/final-contact-sheet-v2.jpg", jpeg);
console.log(jpeg.byteLength);
}
main();
