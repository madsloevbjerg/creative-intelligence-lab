import type { ConceptCopy } from "@/lib/schemas";

export type BriefFields = Pick<ConceptCopy, "headlineDa" | "hook" | "primaryTextDa"> & {
  motivation?: string;
};

const BANNED = /drukket hjemme hos os andre|smag datoen/i;
const PERFORMANCE = /\b(ctr|reach|benchmark|conversion|rating|anmeldelser|stjerner)\b/i;

function danish(copy: BriefFields): string {
  return `${copy.headlineDa}\n${copy.hook}\n${copy.primaryTextDa}`;
}

function opening(headline: string): string {
  return headline.trim().toLocaleLowerCase("da").split(/\s+/).slice(0, 2).join(" ");
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Reject a set of briefs that share an opening or lean on the same proof.
 * Roast date and Aarhus may show up once per concept, and in at most one headline.
 */
export function briefProblems(copies: readonly BriefFields[]): string[] {
  const problems: string[] = [];
  const openings = new Map<string, number>();
  for (const copy of copies) {
    const start = opening(copy.headlineDa);
    openings.set(start, (openings.get(start) ?? 0) + 1);
  }
  for (const [start, times] of openings) {
    if (start && times > 1) problems.push(`shared headline opening "${start}"`);
  }

  const proofHeadlines = copies.filter((copy) => /aarhus|ristedato/i.test(copy.headlineDa));
  if (proofHeadlines.length > 1) {
    problems.push("Aarhus or ristedato is in more than one headline");
  }

  copies.forEach((copy, index) => {
    const text = danish(copy);
    const label = `concept ${index + 1}`;
    if (BANNED.test(text)) problems.push(`${label} uses a banned phrase`);
    if (PERFORMANCE.test(text)) problems.push(`${label} makes a performance or review claim`);
    if (count(text, /aarhus/gi) > 1) problems.push(`${label} mentions Aarhus more than once`);
    if (count(text, /ristedato/gi) > 1) problems.push(`${label} mentions ristedato more than once`);
    if (/ristningsdato/i.test(text)) problems.push(`${label} should say ristedato`);
    if (copy.motivation === "Safety/trust" && !/\bjeg\b/i.test(text)) {
      problems.push(`${label} is not a first-person quote`);
    }
    if (copy.motivation === "Belonging/social proof" && /\d/.test(text)) {
      problems.push(`${label} invents a number`);
    }
    if (copy.motivation === "Curiosity/novelty" && !/kirsebær/i.test(text)) {
      problems.push(`${label} never names the dark cherry`);
    }
    if (copy.motivation === "Curiosity/novelty" && !/kakao/i.test(text)) {
      problems.push(`${label} never names the cocoa`);
    }
  });

  return problems;
}
