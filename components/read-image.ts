"use client";

const MAX_EDGE = 960;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function readImageFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That image is over 8 MB. Use a smaller file.");
  }

  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const text = await file.text();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Use an image file.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not read that image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
