import { createHash } from "node:crypto";

import { MAX_IMAGE_BYTES } from "@/lib/limits";

function imagePayload(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return Buffer.alloc(MAX_IMAGE_BYTES + 1);
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(meta)) return Buffer.from(payload, "base64");
  try {
    return Buffer.from(decodeURIComponent(payload), "utf8");
  } catch {
    return Buffer.from(payload, "utf8");
  }
}

export function imageBytes(dataUrl: string): Buffer {
  return imagePayload(dataUrl);
}

export function imageMime(dataUrl: string): string {
  const match = /^data:([^;,]+)/i.exec(dataUrl.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

export function decodedImageBytes(dataUrl: string): number {
  return imagePayload(dataUrl).byteLength;
}

export function imageSha256(dataUrl: string): string {
  return createHash("sha256").update(imagePayload(dataUrl)).digest("hex");
}

export function imageWithinLimit(dataUrl: string): boolean {
  return decodedImageBytes(dataUrl) <= MAX_IMAGE_BYTES;
}
