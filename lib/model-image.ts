import { ModelOutputError } from "@/lib/errors";
import { imageBytes, imageMime } from "@/lib/image-bytes";

/**
 * Media types the Model API accepts on image input.
 * SVG is rasterized to PNG. The cache key stays on the original bytes.
 */
const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function isBase64DataUrl(dataUrl: string): boolean {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return false;
  return /;base64/i.test(dataUrl.slice(0, comma));
}

function base64DataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Turn an app image into `data:<mime>;base64,<payload>` the Model API will accept. */
export async function imageUrlForModel(dataUrl: string): Promise<string> {
  const mime = imageMime(dataUrl);
  if (SUPPORTED_MIME.has(mime)) {
    if (isBase64DataUrl(dataUrl)) return dataUrl;
    const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
    return base64DataUrl(normalized, imageBytes(dataUrl));
  }

  if (mime !== "image/svg+xml") {
    throw new ModelOutputError(
      "This image type cannot be sent. Supported types are JPEG, PNG, GIF, WebP, and ICO.",
    );
  }

  const { Resvg } = await import("@resvg/resvg-js");
  const png = new Resvg(imageBytes(dataUrl), {
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();
  if (png.byteLength === 0) {
    throw new ModelOutputError("The SVG could not be turned into a PNG for the model.");
  }
  return base64DataUrl("image/png", png);
}
