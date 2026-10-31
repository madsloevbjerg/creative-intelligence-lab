import { EXECUTIONS, MOTIVATIONS, type Execution, type Motivation } from "@/lib/taxonomy";

export type Gap = {
  motivation: Motivation;
  execution: Execution;
  score: number;
  hypothesis: string;
};

const FOCUS_LINKS: { pattern: RegExp; motivations: Motivation[]; label: string }[] = [
  { pattern: /ritual|weekly|habit/i, motivations: ["Convenience/time", "Emotion/nostalgia"], label: "the weekly ritual" },
  { pattern: /roast date|roast|origin|quality/i, motivations: ["Quality/performance"], label: "the roast date" },
  { pattern: /trust|safe|guarantee/i, motivations: ["Safety/trust"], label: "trust" },
];

/** Phrases the demo brief and website actually contain, used if the model shortens them. */
export function writtenConstraints(text: string): { exclusions: string[]; focusPoints: string[] } {
  return {
    exclusions: [
      ...(/not a discount campaign/i.test(text) ? ["This is not a discount campaign."] : []),
      ...(/no limited drops|limited drop/i.test(text) ? ["No limited drops."] : []),
      ...(/no status claims|slogan about status/i.test(text) ? ["No status claims."] : []),
    ],
    focusPoints: [
      ...(/weekly ritual/i.test(text) ? ["weekly ritual"] : []),
      ...(/roast date/i.test(text) ? ["roast date"] : []),
    ],
  };
}

/** Motivations the brief rules out. They are not gaps. */
export function offBrandMotivations(exclusions: readonly string[]): Motivation[] {
  const text = exclusions.join(" ");
  const found: Motivation[] = [];
  if (/status/i.test(text)) found.push("Status/identity");
  if (/limited drop|missing out|scarcity|fomo/i.test(text)) found.push("Fear of missing out");
  return found;
}

export function conflictQuote(copy: string, exclusions: readonly string[]): string | null {
  const offer = /\b\d+\s*kr\b|\bfree\b/i.test(copy);
  if (!offer) return null;
  const quotes = exclusions.filter((line) => /discount/i.test(line));
  quotes.sort((a, b) => b.length - a.length);
  return quotes[0] ?? null;
}

/**
 * Empty cells, excluding off-brand rows. Focus points raise the score.
 * The sentence is a hypothesis, not a forecast.
 */
export function rankGaps(input: {
  ads: readonly { motivation: Motivation; execution: Execution }[];
  focusPoints: readonly string[];
  exclusions: readonly string[];
}): Gap[] {
  const offBrand = new Set(offBrandMotivations(input.exclusions));
  const used = new Set(input.ads.map((ad) => `${ad.motivation}::${ad.execution}`));
  const focusText = input.focusPoints.join(" ");
  const gaps: Gap[] = [];
  for (const motivation of MOTIVATIONS) {
    if (offBrand.has(motivation)) continue;
    for (const execution of EXECUTIONS) {
      if (used.has(`${motivation}::${execution}`)) continue;
      const link = FOCUS_LINKS.find(
        (item) => item.motivations.includes(motivation) && item.pattern.test(focusText),
      );
      const score = link ? 4 : 1;
      const hypothesis = link
        ? `Hypothesis: a ${motivation} idea told as a ${execution} would open a cell this set does not use, in line with ${link.label}. This is not a forecast.`
        : `Hypothesis: a ${motivation} idea told as a ${execution} would open a cell this set leaves empty. This is not a forecast.`;
      gaps.push({ motivation, execution, score, hypothesis });
    }
  }
  gaps.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const row = MOTIVATIONS.indexOf(a.motivation) - MOTIVATIONS.indexOf(b.motivation);
    if (row !== 0) return row;
    return EXECUTIONS.indexOf(a.execution) - EXECUTIONS.indexOf(b.execution);
  });
  return gaps;
}

export function topGaps(gaps: readonly Gap[], count = 3): Gap[] {
  return gaps.slice(0, count);
}
