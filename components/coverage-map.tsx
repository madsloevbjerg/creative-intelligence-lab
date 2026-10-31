"use client";

import { cellDensity, cellKey } from "@/lib/coverage";
import type { AnalyzedAd } from "@/lib/schemas";
import { EXECUTIONS, MOTIVATIONS, type Execution, type Motivation } from "@/lib/taxonomy";

export type MapAd = AnalyzedAd & {
  imageDataUrl: string;
};

type CoverageMapProps = {
  ads: MapAd[];
  pinnedId: string | null;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
  highlighted?: { motivation: Motivation; execution: Execution; hypothesis: string }[];
  offBrand?: Motivation[];
};

function adsInCell(ads: MapAd[], motivation: Motivation, execution: Execution) {
  const key = cellKey(motivation, execution);
  return ads.filter(
    (ad) => cellKey(ad.classification.motivation, ad.classification.execution) === key,
  );
}

export function coverageCounts(ads: MapAd[]) {
  let empty = 0;
  let thin = 0;
  let covered = 0;
  for (const motivation of MOTIVATIONS) {
    for (const execution of EXECUTIONS) {
      const density = cellDensity(adsInCell(ads, motivation, execution).length);
      if (density === "empty") empty += 1;
      else if (density === "thin") thin += 1;
      else covered += 1;
    }
  }
  const motivationsUsed = new Set(ads.map((ad) => ad.classification.motivation)).size;
  return { empty, thin, covered, motivationsUsed };
}

function cellClass(density: ReturnType<typeof cellDensity>): string {
  if (density === "empty") {
    return "border border-dashed border-[#d5cbbd] bg-[#efe8dc] text-[#6d6458]";
  }
  if (density === "thin") {
    return "border border-[#c4a15a] bg-[#f6e7c4]";
  }
  return "border border-foreground/15 bg-card";
}

function AdThumb({
  ad,
  pinned,
  onHover,
  onPin,
}: {
  ad: MapAd;
  pinned: boolean;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`overflow-hidden rounded-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring ${pinned ? "ring-2 ring-primary" : ""}`}
      onMouseEnter={() => onHover(ad.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(ad.id)}
      onBlur={() => onHover(null)}
      onClick={() => onPin(ad.id)}
      aria-pressed={pinned}
    >
      {/* Data URLs from uploads and demo SVGs are not next/image sources. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ad.imageDataUrl}
        alt={ad.headline}
        className="h-20 w-16 bg-white object-cover"
      />
      <span className="block bg-[#1c1612] px-1 py-0.5 text-center text-[9px] font-medium tracking-wide text-[#f7f3ec] uppercase">
        {ad.classification.delivery}
      </span>
    </button>
  );
}

export function WhyPanel({ ad }: { ad: MapAd | null }) {
  if (!ad) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        Hover or click an ad to read why it sits in that cell.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.imageDataUrl}
          alt=""
          className="h-20 w-16 shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ad.headline}</p>
          <p className="text-xs text-muted-foreground">
            {ad.classification.motivation} · {ad.classification.execution} · {ad.classification.delivery}
          </p>
          <p className="mt-1 text-sm leading-snug">
            <span className="font-medium">Why: </span>
            {ad.classification.why}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CoverageMap({ ads, pinnedId, onHover, onPin, highlighted = [], offBrand = [] }: CoverageMapProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">3. Coverage map</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Rows are motivations. Columns are execution styles. The badge on a thumbnail is
            the delivery: Static, Carousel, or Video. Highlighted cells are the top gaps.
            Off-brand rows are not gaps. The map shows coverage only.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 text-xs">
          <li className="rounded-md border border-[#1F4A38]/30 bg-[#e7f0ea] px-2 py-1">Top gap</li>
          <li className="rounded-md border border-[#c4a15a] bg-[#f6e7c4] px-2 py-1">One ad</li>
          <li className="rounded-md border border-foreground/15 bg-card px-2 py-1">Two or more</li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full min-w-[1080px] border-separate border-spacing-1.5">
          <caption className="sr-only">
            Coverage map of motivations by execution style. Top gaps are highlighted. Empty cells have no label.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-background p-2 text-left text-xs font-medium text-muted-foreground"
              >
                Motivation
              </th>
              {EXECUTIONS.map((execution) => (
                <th
                  key={execution}
                  scope="col"
                  className="w-[7.5rem] p-1 text-center text-[11px] leading-tight font-medium"
                >
                  {execution}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOTIVATIONS.map((motivation) => (
              <tr key={motivation}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-background p-2 text-left text-xs font-medium"
                >
                  {motivation}
                  {offBrand.includes(motivation) ? (
                    <span className="mt-1 block text-[10px] font-normal tracking-wide text-muted-foreground uppercase">
                      off-brand
                    </span>
                  ) : null}
                </th>
                {EXECUTIONS.map((execution) => {
                  const cellAds = adsInCell(ads, motivation, execution);
                  const density = cellDensity(cellAds.length);
                  const gap = highlighted.find(
                    (item) => item.motivation === motivation && item.execution === execution,
                  );
                  const quiet = density === "empty";
                  return (
                    <td
                      key={execution}
                      className={`min-h-24 min-w-[7.25rem] rounded-md p-1.5 align-top ${
                        gap
                          ? "border border-[#1F4A38]/40 bg-[#e7f0ea]"
                          : quiet
                            ? "bg-[#f6f1e8]"
                            : cellClass(density)
                      }`}
                      aria-label={
                        gap
                          ? `${motivation}, ${execution}, top gap. ${gap.hypothesis}`
                          : `${motivation}, ${execution}, ${density === "empty" ? "no ads" : density === "thin" ? "one ad" : `${cellAds.length} ads`}`
                      }
                      title={gap?.hypothesis}
                    >
                      {quiet ? (
                        <span className="block min-h-16" />
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {cellAds.map((ad) => (
                            <AdThumb
                              key={ad.id}
                              ad={ad}
                              pinned={pinnedId === ad.id}
                              onHover={onHover}
                              onPin={onPin}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
