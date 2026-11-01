import { EXECUTIONS, EXECUTION_FIT, MOTIVATIONS, type Execution, type Motivation } from "@/lib/taxonomy";

export type Gap = {
  motivation: Motivation;
  execution: Execution;
  score: number;
  hypothesis: string;
};

/**
 * General language in a focus point, mapped to a taxonomy motivation.
 * Not tied to one brand. "Ritual" maps to Emotion/ritual, not to a motivation the brand already uses.
 */
const FOCUS_LINKS: { pattern: RegExp; motivation: Motivation; label: string }[] = [
  { pattern: /ritual|emotion/i, motivation: "Emotion/ritual", label: "the ritual" },
  { pattern: /roast|origin|quality/i, motivation: "Quality/performance", label: "quality and roast detail" },
  { pattern: /trust|safe|guarantee/i, motivation: "Safety/trust", label: "trust" },
  { pattern: /belong|community|together/i, motivation: "Belonging/social proof", label: "belonging" },
  { pattern: /curios|discover|new/i, motivation: "Curiosity/novelty", label: "curiosity" },
];

/** Motivations the extracted exclusions rule out. They are not gaps. */
export function offBrandMotivations(exclusions: readonly string[]): Motivation[] {
  const text = exclusions.join(" ");
  const found: Motivation[] = [];
  if (/status/i.test(text)) found.push("Status/identity");
  if (/limited drop|missing out|scarcity|fomo|last chance/i.test(text)) found.push("Fear of missing out");
  return found;
}

/** A price or free offer conflicts with an exclusion that refuses discounts. */
export function conflictQuote(copy: string, exclusions: readonly string[]): string | null {
  const offer = /\b(free|gratis|discount|%\s*off|\d[\d\s.,]*\s*(kr|dkk|€|eur|£|gbp|\$|usd))\b/i.test(copy);
  if (!offer) return null;
  const quotes = exclusions.filter((line) => /discount|price cut|gratis|free bag/i.test(line));
  quotes.sort((a, b) => b.length - a.length);
  return quotes[0] ?? null;
}

function focusFor(motivation: Motivation, focusPoints: readonly string[]): string | null {
  const text = focusPoints.join(" ");
  const link = FOCUS_LINKS.find((item) => item.motivation === motivation && item.pattern.test(text));
  return link?.label ?? null;
}

function executionFor(motivation: Motivation, used: ReadonlySet<string>): Execution | null {
  for (const execution of EXECUTION_FIT[motivation]) {
    if (!used.has(`${motivation}::${execution}`)) return execution;
  }
  for (const execution of EXECUTIONS) {
    if (!used.has(`${motivation}::${execution}`)) return execution;
  }
  return null;
}

/**
 * One gap per motivation. Motivations with no ads rank above a new execution
 * of a motivation the set already uses. Focus points raise a motivation.
 * Off-brand motivations are left out. The sentence is a hypothesis, not a forecast.
 */
export function rankGaps(input: {
  ads: readonly { motivation: Motivation; execution: Execution }[];
  focusPoints: readonly string[];
  exclusions: readonly string[];
}): Gap[] {
  const offBrand = new Set(offBrandMotivations(input.exclusions));
  const used = new Set(input.ads.map((ad) => `${ad.motivation}::${ad.execution}`));
  const counts = new Map<Motivation, number>();
  for (const ad of input.ads) counts.set(ad.motivation, (counts.get(ad.motivation) ?? 0) + 1);

  const gaps: Gap[] = [];
  for (const motivation of MOTIVATIONS) {
    if (offBrand.has(motivation)) continue;
    const execution = executionFor(motivation, used);
    if (!execution) continue;
    const unused = (counts.get(motivation) ?? 0) === 0;
    const focus = focusFor(motivation, input.focusPoints);
    const score = (unused ? 100 : 0) + (focus ? 40 : 0);
    const hypothesis = unused
      ? focus
        ? `Hypothesis: ${motivation} has no ad in this set, so a ${execution} would cover a new idea, in line with ${focus}. This is not a forecast.`
        : `Hypothesis: ${motivation} has no ad in this set, so a ${execution} would cover a motivation the portfolio does not use. This is not a forecast.`
      : `Hypothesis: a ${execution} would be another execution of ${motivation}, which this set already uses. This is not a forecast.`;
    gaps.push({ motivation, execution, score, hypothesis });
  }
  gaps.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return MOTIVATIONS.indexOf(a.motivation) - MOTIVATIONS.indexOf(b.motivation);
  });
  return gaps;
}

/** Top gaps, at most one per motivation. */
export function topGaps(gaps: readonly Gap[], count = 3): Gap[] {
  const chosen: Gap[] = [];
  const seen = new Set<Motivation>();
  for (const gap of gaps) {
    if (seen.has(gap.motivation)) continue;
    seen.add(gap.motivation);
    chosen.push(gap);
    if (chosen.length === count) break;
  }
  return chosen;
}
