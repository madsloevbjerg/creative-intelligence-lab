"use client";

import { cellDensity, cellKey } from "@/lib/coverage";
import type { AnalyzedAd } from "@/lib/schemas";
import { FORMATS, MOTIVATIONS } from "@/lib/taxonomy";

export type MapAd = AnalyzedAd & {
  imageDataUrl: string;
};

type CoverageMapProps = {
  ads: MapAd[];
  pinnedId: string | null;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
};

function adsInCell(ads: MapAd[], motivation: (typeof MOTIVATIONS)[number], format: (typeof FORMATS)[number]) {
  const key = cellKey(motivation, format);
  return ads.filter(
    (ad) => cellKey(ad.classification.motivation, ad.classification.format) === key,
  );
}

export function coverageCounts(ads: MapAd[]) {
  let empty = 0;
  let thin = 0;
  let covered = 0;
  for (const motivation of MOTIVATIONS) {
    for (const format of FORMATS) {
      const density = cellDensity(adsInCell(ads, motivation, format).length);
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
            {ad.classification.motivation} · {ad.classification.format}
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

export function CoverageMap({ ads, pinnedId, onHover, onPin }: CoverageMapProps) {
  const counts = coverageCounts(ads);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">3. Coverage map</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Rows are motivations. Columns are formats. {ads.length} ads use{" "}
            {counts.motivationsUsed} of {MOTIVATIONS.length} motivations. {counts.empty} cells
            are empty, {counts.thin} are thin, and {counts.covered}{" "}
            {counts.covered === 1 ? "cell has" : "cells have"} two or more ads. The map
            shows coverage only.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 text-xs">
          <li className="rounded-md border border-dashed border-[#d5cbbd] bg-[#efe8dc] px-2 py-1 text-[#6d6458]">
            Empty · no ads
          </li>
          <li className="rounded-md border border-[#c4a15a] bg-[#f6e7c4] px-2 py-1">
            Thin · one ad
          </li>
          <li className="rounded-md border border-foreground/15 bg-card px-2 py-1">
            Covered · two or more
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full min-w-[1080px] border-separate border-spacing-1.5">
          <caption className="sr-only">
            Coverage map of motivations by formats. Empty and thin cells are highlighted.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-background p-2 text-left text-xs font-medium text-muted-foreground"
              >
                Motivation
              </th>
              {FORMATS.map((format) => (
                <th
                  key={format}
                  scope="col"
                  className="w-[7.5rem] p-1 text-center text-[11px] leading-tight font-medium"
                >
                  {format}
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
                </th>
                {FORMATS.map((format) => {
                  const cellAds = adsInCell(ads, motivation, format);
                  const density = cellDensity(cellAds.length);
                  return (
                    <td
                      key={format}
                      className={`min-h-24 min-w-[7.25rem] rounded-md p-1.5 align-top ${cellClass(density)}`}
                      aria-label={`${motivation}, ${format}, ${density === "empty" ? "empty" : density === "thin" ? "one ad" : `${cellAds.length} ads`}`}
                    >
                      {density === "empty" ? (
                        <span className="block px-1 py-6 text-center text-[11px] tracking-wide uppercase">
                          Empty
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {density === "thin" ? (
                            <span className="block text-[10px] font-medium tracking-wide text-[#7a5b1e] uppercase">
                              Thin
                            </span>
                          ) : (
                            <span className="block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              {cellAds.length} ads
                            </span>
                          )}
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
