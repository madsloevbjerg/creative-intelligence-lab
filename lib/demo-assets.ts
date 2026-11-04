import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { demoPortfolio } from "@/lib/demo";

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function demoAssetBytes(publicPath: string): Buffer {
  const name = publicPath.split("/").pop();
  if (!name || name.includes("..")) {
    throw new Error("Missing demo file name.");
  }
  return readFileSync(path.join(process.cwd(), "public", "demo", name));
}

/** Build the same PNG data URL the browser sends for a demo ad. */
export function demoImageDataUrl(publicPath: string): string {
  return `data:image/png;base64,${demoAssetBytes(publicPath).toString("base64")}`;
}

let demoShas: Set<string> | null = null;

export function isDemoImageSha(sha: string): boolean {
  if (!demoShas) {
    demoShas = new Set(demoPortfolio.ads.map((ad) => sha256(demoAssetBytes(ad.file))));
  }
  return demoShas.has(sha);
}

export function isDemoBrandText(websiteText: string, brief: string): boolean {
  return (
    websiteText.trim() === demoPortfolio.websiteText.trim() &&
    brief.trim() === demoPortfolio.brief.trim()
  );
}
