/** Read-only audit. Never invokes a model or writes cache entries. */
import { requestKey, readCache } from "../lib/cache";
import { demoPortfolio } from "../lib/demo";
import { demoAssetBytes, sha256 } from "../lib/demo-assets";
import { samKeyMaterial, classifyKeyMaterial, brandKeyMaterial, constraintKeyMaterial } from "../lib/meta";
import { brandUserText, classifyUserText } from "../lib/request-text";
import { segmentationSchema, classificationSchema, brandSummarySchema, constraintsSchema } from "../lib/schemas";
import { SEGMENT_PROMPTS } from "../lib/taxonomy";
const missing: string[] = [];
for (const ad of demoPortfolio.ads) {
  const sha = sha256(demoAssetBytes(ad.file));
  const hits = SEGMENT_PROMPTS.map(p => {
    const hit = readCache("demo", requestKey(samKeyMaterial(sha, p.phrase)), segmentationSchema.shape.product);
    if (!hit) missing.push(`${ad.id}: SAM 3.1 "${p.phrase}"`);
    return [p.key, hit?.result];
  });
  const segmentation = segmentationSchema.safeParse(Object.fromEntries(hits));
  if (!segmentation.success) {
    missing.push(`${ad.id}: Muse Spark classification (key depends on pending SAM results)`);
  } else {
    const userText = classifyUserText({ headline: ad.headline, primaryText: ad.primaryText, segmentation: segmentation.data });
    if (!readCache("demo", requestKey(classifyKeyMaterial(sha, userText)), classificationSchema)) missing.push(`${ad.id}: Muse Spark classification`);
  }
}
const text = brandUserText(demoPortfolio.websiteText, demoPortfolio.brief);
if (!readCache("demo", requestKey(brandKeyMaterial(text)), brandSummarySchema)) missing.push("Muse Spark brand summary (current website text)");
if (!readCache("demo", requestKey(constraintKeyMaterial(text)), constraintsSchema)) missing.push("Muse Spark constraints (current website text)");
console.log(missing.length ? missing.join("\n") : "Complete committed cache");
console.log(`Pending: ${missing.length}. No live calls made.`);
