"use client";

import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CoverageMap, WhyPanel, type MapAd } from "@/components/coverage-map";
import { CoverageStory } from "@/components/coverage-story";
import { FeedFrame } from "@/components/feed-frame";
import { readImageFile } from "@/components/read-image";
import { SamCropView } from "@/components/sam-crop-view";
import { demoFileDataUrl } from "@/lib/demo-data-url";
import { demoPortfolio } from "@/lib/demo";
import { formatBudgetUsd, formatUsd } from "@/lib/money";
import {
  analysisResponseSchema,
  costSummarySchema,
  type AnalysisResponse,
  type BrandSummary,
} from "@/lib/schemas";
import { MAX_ADS, MIN_ADS } from "@/lib/taxonomy";

type SourceMode = "text" | "url";

type AdDraft = {
  localId: string;
  headline: string;
  primaryText: string;
  imageDataUrl: string;
  fileName: string;
};

function emptyAd(): AdDraft {
  return {
    localId: crypto.randomUUID(),
    headline: "",
    primaryText: "",
    imageDataUrl: "",
    fileName: "",
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fingerprint(input: {
  sourceMode: SourceMode;
  websiteText: string;
  websiteUrl: string;
  brief: string;
  accessCode: string;
  ads: AdDraft[];
}): string {
  return JSON.stringify({
    sourceMode: input.sourceMode,
    websiteText: input.websiteText.trim(),
    websiteUrl: input.websiteUrl.trim(),
    brief: input.brief.trim(),
    accessCode: input.accessCode,
    ads: input.ads.map((ad) => ({
      id: ad.localId,
      headline: ad.headline.trim(),
      primaryText: ad.primaryText.trim(),
      image: `${ad.imageDataUrl.length}:${ad.imageDataUrl.slice(0, 48)}`,
    })),
  });
}

export function LabApp() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("text");
  const [websiteText, setWebsiteText] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brief, setBrief] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [ads, setAds] = useState<AdDraft[]>([]);
  const [adError, setAdError] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCost, setErrorCost] = useState<AnalysisResponse["cost"] | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [resultFingerprint, setResultFingerprint] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [cropView, setCropView] = useState(false);
  const [manifest, setManifest] = useState<{
    picks: Record<
      string,
      {
        candidate: string;
        regenerated: boolean;
        fit: string;
        reason: string;
        crop: { left: number; top: number; width: number; height: number };
        imageWidth: number;
        imageHeight: number;
        bagCount: number;
        placement?: { band: string; reason: string };
      }
    >;
  } | null>(null);

  const currentFingerprint = fingerprint({
    sourceMode,
    websiteText,
    websiteUrl,
    brief,
    accessCode,
    ads,
  });
  const stale = Boolean(result && resultFingerprint && resultFingerprint !== currentFingerprint);

  const blocker = useMemo(() => {
    if (sourceMode === "text" && websiteText.trim().length < 40) {
      return "Paste at least a short paragraph from the website, or switch to a URL.";
    }
    if (sourceMode === "url" && !isHttpUrl(websiteUrl)) {
      return "Enter an http or https website URL, or switch to pasted text.";
    }
    if (brief.trim().length < 20) {
      return "Add a campaign brief of at least a sentence.";
    }
    if (ads.length < MIN_ADS) {
      const missing = MIN_ADS - ads.length;
      return `Add ${missing} more ${missing === 1 ? "ad" : "ads"}. The map needs ${MIN_ADS} to ${MAX_ADS}.`;
    }
    if (ads.length > MAX_ADS) {
      return `Remove ads until there are ${MAX_ADS} or fewer.`;
    }
    if (ads.some((ad) => !ad.imageDataUrl || !ad.headline.trim() || !ad.primaryText.trim())) {
      return "Every ad needs an image, a headline, and primary text.";
    }
    return null;
  }, [ads, brief, sourceMode, websiteText, websiteUrl]);

  function updateAd(localId: string, patch: Partial<AdDraft>) {
    setAds((current) => current.map((ad) => (ad.localId === localId ? { ...ad, ...patch } : ad)));
  }

  async function onPickImage(localId: string, file: File | undefined) {
    if (!file) return;
    setAdError(null);
    try {
      const imageDataUrl = await readImageFile(file);
      updateAd(localId, { imageDataUrl, fileName: file.name });
    } catch (picked) {
      setAdError(picked instanceof Error ? picked.message : "That image could not be read.");
    }
  }

  async function loadDemo() {
    setLoadingDemo(true);
    setError(null);
    setAdError(null);
    try {
      const loaded = await Promise.all(
        demoPortfolio.ads.map(async (ad) => {
          const response = await fetch(ad.file);
          if (!response.ok) {
            throw new Error(`Could not load ${ad.file}.`);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          return {
            localId: ad.id,
            headline: ad.headline,
            primaryText: ad.primaryText,
            fileName: ad.file.split("/").pop() ?? ad.file,
            imageDataUrl: demoFileDataUrl(ad.file, bytes),
          } satisfies AdDraft;
        }),
      );
      setSourceMode("text");
      setWebsiteText(demoPortfolio.websiteText);
      setWebsiteUrl("");
      setBrief(demoPortfolio.brief);
      const manifestResponse = await fetch("/demo/manifest.json");
      if (manifestResponse.ok) {
        setManifest((await manifestResponse.json()) as NonNullable<typeof manifest>);
      }
      setAds(loaded);
      setResult(null);
      setResultFingerprint(null);
      setHoverId(null);
      setPinnedId(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The demo data did not load.");
    } finally {
      setLoadingDemo(false);
    }
  }

  async function analyze() {
    if (blocker) return;
    setAnalyzing(true);
    setError(null);
    setErrorCost(null);
    setHoverId(null);
    setPinnedId(null);
    const sentFingerprint = currentFingerprint;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source:
            sourceMode === "text"
              ? { kind: "text", websiteText: websiteText.trim() }
              : { kind: "url", websiteUrl: websiteUrl.trim() },
          brief: brief.trim(),
          accessCode: accessCode.trim(),
          ads: ads.map((ad) => ({
            id: ad.localId,
            headline: ad.headline.trim(),
            primaryText: ad.primaryText.trim(),
            imageDataUrl: ad.imageDataUrl,
          })),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `The analysis failed (${response.status}).`;
        const costParsed = costSummarySchema.safeParse(
          body && typeof body === "object" && "cost" in body ? body.cost : null,
        );
        setErrorCost(costParsed.success ? costParsed.data : null);
        setError(message);
        return;
      }
      const parsed = analysisResponseSchema.safeParse(body);
      if (!parsed.success) {
        setError("The analysis response did not match the expected format. Nothing was filled in.");
        return;
      }
      setResult(parsed.data);
      setResultFingerprint(sentFingerprint);
      requestAnimationFrame(() => {
        document.getElementById("coverage")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setError("The analysis could not be reached. Check that the app is still running.");
    } finally {
      setAnalyzing(false);
    }
  }

  const imageById = new Map(ads.map((ad) => [ad.localId, ad.imageDataUrl]));
  const mapAds: MapAd[] = (result?.ads ?? []).flatMap((ad) => {
    const imageDataUrl = imageById.get(ad.id);
    if (!imageDataUrl) return [];
    return [{ ...ad, imageDataUrl }];
  });
  const activeId = hoverId ?? pinnedId;
  const activeAd = mapAds.find((ad) => ad.id === activeId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-[88rem] flex-col gap-8 px-4 py-8 md:px-6 md:py-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">Meta ad creative coverage</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
            Creative Intelligence Lab
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            Meta&apos;s next-gen Andromeda scores every eligible ad and encodes ad content
            together with its serving context, while the pool of ads keeps growing with
            generative AI. Variations of the same idea compete in a crowded pool. This tool
            maps which distinct ideas are missing.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            It does not predict results, scores, or click-through.{" "}
            <a
              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
              href="https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/"
            >
              Source
            </a>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0"
          onClick={() => void loadDemo()}
          disabled={loadingDemo || analyzing}
        >
          {loadingDemo ? "Loading demo…" : "Load demo data"}
        </Button>
      </header>

      <section className="space-y-4" aria-labelledby="brand-heading">
        <div>
          <h2 id="brand-heading" className="text-xl font-semibold tracking-tight">
            1. Brand and brief
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the website, or give a public URL. Then add the campaign brief in a
            sentence or two.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={sourceMode === "text" ? "default" : "outline"}
                onClick={() => setSourceMode("text")}
              >
                Paste text
              </Button>
              <Button
                type="button"
                variant={sourceMode === "url" ? "default" : "outline"}
                onClick={() => setSourceMode("url")}
              >
                Website URL
              </Button>
            </div>
            {sourceMode === "text" ? (
              <div className="space-y-2">
                <Label htmlFor="website-text">Website text</Label>
                <Textarea
                  id="website-text"
                  value={websiteText}
                  onChange={(event) => setWebsiteText(event.target.value)}
                  className="min-h-40"
                  placeholder="Paste the about page, offer, and who the product is for."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="website-url">Website URL</Label>
                <Input
                  id="website-url"
                  type="url"
                  inputMode="url"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  placeholder="https://example.com"
                />
                <p className="text-xs text-muted-foreground">
                  The lab fetches public page text. If the site blocks that, paste the text
                  instead.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="brief">Campaign brief</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                className="min-h-28"
                placeholder="Who is this for, and what should the work say?"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="ads-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="ads-heading" className="text-xl font-semibold tracking-tight">
              2. Existing ads
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add {MIN_ADS}–{MAX_ADS} ads. Each one needs the image, the headline, and the
              primary text.
            </p>
          </div>
          <Badge variant="outline">
            {ads.length} of {MIN_ADS}–{MAX_ADS} ads
          </Badge>
        </div>

        {ads.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No ads yet. Load the Danish Coffee Lab demo, or add your own.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void loadDemo()} disabled={loadingDemo || analyzing}>
                {loadingDemo ? "Loading demo…" : "Load demo data"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAds([emptyAd()])}
                disabled={analyzing}
              >
                Add an ad
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ads.map((ad, index) => (
              <Card key={ad.localId} size="sm">
                <CardHeader>
                  <CardTitle>Ad {index + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {ad.imageDataUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ad.imageDataUrl} alt="" className="h-full w-full object-cover" />
                        </>
                      ) : (
                        <span className="px-2 text-center text-[11px] text-muted-foreground">
                          No image
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            void onPickImage(ad.localId, file);
                            event.target.value = "";
                          }}
                        />
                        {ad.imageDataUrl ? "Replace image" : "Upload image"}
                      </label>
                      {ad.fileName ? (
                        <p className="truncate text-xs text-muted-foreground">{ad.fileName}</p>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        className="self-start"
                        onClick={() => setAds((current) => current.filter((item) => item.localId !== ad.localId))}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`headline-${ad.localId}`}>Headline</Label>
                    <Input
                      id={`headline-${ad.localId}`}
                      value={ad.headline}
                      onChange={(event) => updateAd(ad.localId, { headline: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`primary-${ad.localId}`}>Primary text</Label>
                    <Textarea
                      id={`primary-${ad.localId}`}
                      value={ad.primaryText}
                      onChange={(event) => updateAd(ad.localId, { primaryText: event.target.value })}
                      className="min-h-20"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {ads.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAds((current) => (current.length >= MAX_ADS ? current : [...current, emptyAd()]))}
            disabled={ads.length >= MAX_ADS || analyzing}
          >
            Add an ad
          </Button>
        ) : null}
        {adError ? <p className="text-sm text-destructive">{adError}</p> : null}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Label htmlFor="access-code">Enter access code for live mode</Label>
          <Input
            id="access-code"
            type="password"
            autoComplete="off"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            className="mt-2"
            placeholder="Leave blank for the demo"
          />
        </div>
        <Button
          type="button"
          className="h-10"
          onClick={() => void analyze()}
          disabled={Boolean(blocker) || analyzing || loadingDemo}
        >
          {analyzing ? "Reading the ads…" : "Analyze coverage"}
        </Button>
        <p className="text-sm text-muted-foreground sm:mb-2">
          {blocker ?? "Ready. The map will place each ad and show why. Blank code stays on mock data."}
        </p>
      </div>

      {error ? (
        <div className="space-y-3">
          {errorCost ? <CostLine cost={errorCost} /> : null}
          <Alert variant="destructive">
            <AlertTitle>Analysis stopped</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {result ? (
        <section id="coverage" className="scroll-mt-4 space-y-4">
          <ModeBanner result={result} />
          <CostLine cost={result.cost} />
          {stale ? (
            <Alert>
              <AlertTitle>The inputs changed</AlertTitle>
              <AlertDescription>
                This map is from the last run. Analyze again to place the current ads.
              </AlertDescription>
            </Alert>
          ) : null}
          <BrandSummaryCard brand={result.brand} />
          <CoverageStory ads={mapAds} />
          <div className="sticky top-2 z-30 space-y-3">
            <WhyPanel ad={activeAd} />
            {activeAd ? <AdInspect ad={activeAd} manifest={manifest} cropView={cropView} onToggle={() => setCropView((value) => !value)} /> : null}
          </div>
          {mapAds.length === result.ads.length ? (
            <CoverageMap
              ads={mapAds}
              pinnedId={pinnedId}
              onHover={setHoverId}
              onPin={setPinnedId}
            />
          ) : (
            <Alert variant="destructive">
              <AlertTitle>The map is missing an image</AlertTitle>
              <AlertDescription>
                An analyzed ad no longer matches an uploaded image. Analyze again.
              </AlertDescription>
            </Alert>
          )}
        </section>
      ) : (
        <section id="coverage" className="rounded-xl border border-dashed px-4 py-8">
          <h2 className="text-xl font-semibold tracking-tight">3. Coverage map</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The map appears here after you analyze at least {MIN_ADS} ads. Empty cells have
            no ad. Thin cells have one. Nothing on this page is a performance prediction.
          </p>
        </section>
      )}
    </main>
  );
}

function AdInspect({
  ad,
  manifest,
  cropView,
  onToggle,
}: {
  ad: MapAd;
  manifest: {
    picks: Record<
      string,
      {
        crop: { left: number; top: number; width: number; height: number };
        imageWidth: number;
        imageHeight: number;
        reason: string;
        placement?: { band: string; reason: string };
      }
    >;
  } | null;
  cropView: boolean;
  onToggle: () => void;
}) {
  const demo = demoPortfolio.ads.find((item) => item.id === ad.id);
  const pick = demo ? manifest?.picks[demo.id] : undefined;
  const elements = [
    ["Product", ad.segmentation.product],
    ["Person", ad.segmentation.person],
    ["Text overlay", ad.segmentation.textOverlay],
    ["Setting", ad.segmentation.setting],
    ["Logo", ad.segmentation.logo],
  ] as const;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{ad.headline}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pick?.placement ? <p className="text-sm text-muted-foreground">{pick.placement.reason}</p> : null}
          <Button type="button" variant={cropView ? "outline" : "default"} onClick={() => cropView && onToggle()}>
            Final ad
          </Button>
          <Button
            type="button"
            variant={cropView ? "default" : "outline"}
            onClick={() => !cropView && onToggle()}
            disabled={!pick || !demo}
          >
            SAM 3.1 mask
          </Button>
        </div>
      </div>
      <div className="mt-3">
        {cropView && pick && demo ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              SAM 3.1 at work. Green is the coffee-bag mask. The pale frame is the crop used for the ad.
            </p>
            <SamCropView
              rawUrl={demo.rawFile}
              maskUrl={demo.maskFile}
              crop={pick.crop}
              imageWidth={pick.imageWidth}
              imageHeight={pick.imageHeight}
            />
            <p className="text-xs text-muted-foreground">{pick.reason}</p>
          </div>
        ) : (
          <FeedFrame imageUrl={ad.imageDataUrl} headline={ad.headline} primaryText={ad.primaryText} />
        )}
      </div>
      <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {elements.map(([label, hit]) => (
          <li key={label}>
            <span className="font-medium">{label}: </span>
            {hit.found ? "found" : "not found"}. {hit.note}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CostLine({ cost }: { cost: AnalysisResponse["cost"] }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-sm">
        Estimated API cost this run: {formatUsd(cost.runUsd)} · from cache: {formatUsd(cost.cachedUsd)} ·
        total: {formatUsd(cost.totalUsd)} of {formatBudgetUsd(cost.budgetUsd)} budget
      </p>
      <p className="mt-1 text-sm">
        Failed attempts: {cost.failedAttempts}, {formatUsd(cost.failedUsd)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Estimate based on Meta&apos;s list prices. Cache hits are $0. Mock calls are $0.
      </p>
    </div>
  );
}

function ModeBanner({ result }: { result: AnalysisResponse }) {
  return (
    <Alert>
      <AlertTitle>
        {result.mode === "live" ? "Live model" : result.mode === "cached" ? "Cached results" : "Mock mode"}
      </AlertTitle>
      <AlertDescription>
        {result.modeReason}{" "}
        {result.mode === "mock" && !result.modeReason.includes("mock labels")
          ? "Demo ads use prepared labels. Other copy is labeled from the words in the text. These are not Muse Spark results."
          : result.mode === "live"
            ? "Labels come from the model. They describe the ads. They are not a forecast."
            : ""}
      </AlertDescription>
    </Alert>
  );
}

function BrandSummaryCard({ brand }: { brand: BrandSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <SummaryItem label="Offer" value={brand.offer} />
        <SummaryItem label="Tone" value={brand.tone} />
        <SummaryItem label="Audiences" value={brand.audiences.join("; ")} />
        <SummaryItem label="Key benefits" value={brand.keyBenefits.join("; ")} />
        <div className="md:col-span-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Why</p>
          <p className="mt-1 text-sm leading-relaxed">{brand.why}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm leading-relaxed">{value}</p>
    </div>
  );
}
