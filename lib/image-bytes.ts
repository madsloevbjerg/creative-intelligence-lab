import { MAX_IMAGE_BYTES } from "@/lib/limits";

/** Decoded byte size of an image data URL. Invalid payloads count as too large. */
export function decodedImageBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return MAX_IMAGE_BYTES + 1;
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    return Buffer.from(payload, "base64").byteLength;
  }
  try {
    return Buffer.byteLength(decodeURIComponent(payload));
  } catch {
    return Buffer.byteLength(payload);
  }
}

export function imageWithinLimit(dataUrl: string): boolean {
  return decodedImageBytes(dataUrl) <= MAX_IMAGE_BYTES;
}
