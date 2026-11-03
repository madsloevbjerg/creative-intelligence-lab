"use client";

import { activeConceptCopy, demoCopyLanguage } from "@/lib/copy-language";
import { demoPortfolio } from "@/lib/demo";
import persona from "../docs/m5/persona.json";

const before = demoPortfolio.ads.map((ad, index) => ({
  src: ad.file,
  label: `${index + 1}. ${ad.headline}`,
}));

const after = [
  {
    src: "/demo/m5/1a.png",
    tall: "/demo/m5/1a-916.png",
    title: "Cancel anytime",
    meta: "Safety/trust · Testimonial",
    note: "Illustrative testimonial: replace with a real customer quote before use.",
  },
  {
    src: "/demo/m5/2a.png",
    tall: "/demo/m5/2a-916.png",
    title: "The one thing we agree on",
    meta: "Belonging/social proof · Person/UGC",
    note: "",
  },
  {
    src: "/demo/m5/3b.png",
    tall: "/demo/m5/3b-916.png",
    title: "The two-cup kitchen experiment",
    meta: "Curiosity/novelty · Demo/how-to",
    note: "",
  },
];

function markdownExport(): string {
  const lines = [
    "# Danish Coffee Lab — before and after",
    "",
    "This maps coverage. It does not predict performance.",
    "",
    `Copy language: ${demoCopyLanguage}.`,
    "",
    "## Before",
    "",
    ...before.map((ad) => `- ${ad.label}`),
    "",
    "## After",
    "",
  ];
  const copy = activeConceptCopy();
  for (const concept of after) {
    const key = concept.title === copy["1"].name ? "1" : concept.title === copy["2"].name ? "2" : "3";
    lines.push(`### ${concept.title}`, "", concept.meta, "", copy[key].headline, "", copy[key].primary, "");
    if (concept.note) lines.push(concept.note, "");
  }
  lines.push(
    `### ${persona.name}`,
    "",
    "AI-generated persona, fictional.",
    "",
    persona.scriptEn,
    "",
  );
  return lines.join("\n");
}

export function BeforeAfter({ summary }: { summary: string }) {
  return (
    <section id="before-after" className="scroll-mt-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Before and after</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{summary}</p>
        </div>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => {
            const blob = new Blob([markdownExport()], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "coverage-export.md";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export Markdown
        </button>
      </div>
      <div>
        <h3 className="text-sm font-medium">Before · 8 existing ads</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {before.map((ad) => (
            <figure key={ad.src} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ad.src} alt="" className="aspect-[4/5] w-full rounded-md object-cover" />
              <figcaption className="text-xs text-muted-foreground">{ad.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium">After · 3 concepts</h3>
        <div className="mt-2 grid gap-4 lg:grid-cols-3">
          {after.map((concept) => (
            <article key={concept.title} className="space-y-2 rounded-xl border p-3">
              <h4 className="text-sm font-semibold">{concept.title}</h4>
              <p className="text-xs text-muted-foreground">{concept.meta}</p>
              <div className="grid grid-cols-2 gap-2">
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={concept.src} alt="" className="aspect-[4/5] w-full rounded-md object-cover" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">Feed 4:5</figcaption>
                </figure>
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={concept.tall} alt="" className="aspect-[9/16] w-full rounded-md object-cover" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">Reels 9:16</figcaption>
                </figure>
              </div>
              {concept.note ? <p className="text-xs text-muted-foreground">{concept.note}</p> : null}
            </article>
          ))}
        </div>
      </div>
      <figure className="max-w-[220px] space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/m5/persona-916.png" alt="" className="aspect-[9/16] w-full rounded-md object-cover" />
        <figcaption className="text-xs text-muted-foreground">
          {persona.name} · Reels 9:16 · AI-generated persona, fictional
        </figcaption>
        <p className="text-xs text-muted-foreground">{persona.scriptEn}</p>
      </figure>
    </section>
  );
}
