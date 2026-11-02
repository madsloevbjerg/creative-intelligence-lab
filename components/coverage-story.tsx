import type { MapAd } from "@/components/coverage-map";
import { MOTIVATIONS } from "@/lib/taxonomy";

/** Counts come from the classifications on screen, not from a fixed sentence. */
export function CoverageStory({ ads }: { ads: MapAd[] }) {
  const counts = MOTIVATIONS.map((motivation) => ({
    motivation,
    count: ads.filter((ad) => ad.classification.motivation === motivation).length,
  }));
  const used = counts.filter((item) => item.count > 0);
  const noun = used.length === 1 ? "motivation" : "motivations";
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-sm font-medium">
        {ads.length} {ads.length === 1 ? "ad" : "ads"}, {used.length} {noun}.
        Visual variety is not the same as different ideas.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {used.length} of {MOTIVATIONS.length} motivations are used.
        {used.length > 0
          ? ` ${used
              .map((item) => {
                const share = ads.length === 0 ? 0 : Math.round((item.count / ads.length) * 100);
                return `${item.motivation} ${item.count} (${share}%)`;
              })
              .join(" · ")}.`
          : ""}
      </p>
    </div>
  );
}
