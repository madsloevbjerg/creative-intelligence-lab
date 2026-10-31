import type { Segmentation } from "@/lib/schemas";

export function classifyUserText(input: {
  headline: string;
  primaryText: string;
  segmentation: Segmentation;
}): string {
  return [
    `Headline: ${input.headline}`,
    `Primary text: ${input.primaryText}`,
    "Segmentation notes (from SAM 3.1; “No match” means that phrase was not found):",
    JSON.stringify(input.segmentation),
  ].join("\n");
}

export function brandUserText(websiteText: string, brief: string): string {
  return `Website text:\n${websiteText}\n\nCampaign brief:\n${brief}`;
}
