import { demoPortfolio } from "@/lib/demo";
import { ModelOutputError } from "@/lib/errors";
import { fixtureForDemoAd } from "@/lib/mock-fixtures";
import type {
  BrandSummary,
  Classification,
  ConceptBrief,
  Mockup,
  Segmentation,
} from "@/lib/schemas";
import {
  HOOK_MAX_WORDS,
  type Delivery,
  type Execution,
  type Motivation,
} from "@/lib/taxonomy";
import type { Constraints } from "@/lib/schemas";

const TONE_WORDS = [
  "calm",
  "direct",
  "playful",
  "warm",
  "dry",
  "bold",
  "quiet",
  "friendly",
  "serious",
  "plain",
] as const;

const MOTIVATION_RULES: { motivation: Motivation; pattern: RegExp }[] = [
  {
    motivation: "Price/value",
    pattern: /\b(price|prices|priced|kr|free|cost|costs|cheap|save|discount|value)\b/i,
  },
  {
    motivation: "Convenience/time",
    pattern:
      /\b(monday|deliver|delivery|steps?|door|doorstep|time|already handled|shop run|boil)\b/i,
  },
  {
    motivation: "Quality/performance",
    pattern:
      /\b(roast|roasted|origin|taste|tasting|aarhus|quality|single-origin|freshness|fresh)\b/i,
  },
  {
    motivation: "Safety/trust",
    pattern: /\b(trust|guarantee|guaranteed|secure|safety|safe|certified|certification)\b/i,
  },
  {
    motivation: "Status/identity",
    pattern: /\b(status|identity|the kind of person)\b/i,
  },
  {
    motivation: "Belonging/social proof",
    pattern: /\b(everyone|community|customers|social proof|join us|thousands)\b/i,
  },
  {
    motivation: "Curiosity/novelty",
    pattern: /\b(new|secret|discover|novelty|curious|never tried)\b/i,
  },
  {
    motivation: "Fear of missing out",
    pattern: /\b(miss out|fomo|last chance|ends soon|only this week)\b/i,
  },
  {
    motivation: "Problem/solution",
    pattern: /\b(tired of|problem|solution|instead of|the fix)\b/i,
  },
  {
    motivation: "Emotion/ritual",
    pattern: /\b(ritual|nostalgia|nostalgic|childhood|memory|comfort|sunday)\b/i,
  },
];

type CopyInput = {
  headline: string;
  primaryText: string;
};

function matchDemo(input: CopyInput) {
  const headline = input.headline.trim();
  const primaryText = input.primaryText.trim();
  return demoPortfolio.ads.find(
    (ad) => ad.headline === headline && ad.primaryText === primaryText,
  );
}

export function mockSegmentation(input: CopyInput): Segmentation {
  const demo = matchDemo(input);
  if (demo) return fixtureForDemoAd(demo.id).segmentation;

  const copy = `${input.headline} ${input.primaryText}`;
  const logo = /danish coffee lab/i.test(copy);
  return {
    product: {
      found: true,
      note: "Mock: a product is assumed because this is an uploaded ad image. SAM was not called.",
    },
    person: {
      found: false,
      note: "No match (mock). SAM was not called.",
    },
    textOverlay: input.headline.trim()
      ? {
          found: true,
          note: "Mock: a text overlay is assumed because a headline was provided. SAM was not called.",
        }
      : {
          found: false,
          note: "No match (mock). No headline was provided, and SAM was not called.",
        },
    setting: {
      found: false,
      note: "No match (mock). SAM was not called.",
    },
    logo: logo
      ? {
          found: true,
          note: "Mock: the Danish Coffee Lab name appears in the copy. SAM was not called.",
        }
      : {
          found: false,
          note: "No match (mock). SAM was not called.",
        },
  };
}

function motivationFromCopy(copy: string): Motivation {
  for (const rule of MOTIVATION_RULES) {
    if (rule.pattern.test(copy)) return rule.motivation;
  }
  throw new ModelOutputError(
    "Mock mode could not find a motivation in the headline or primary text. Name the angle in the copy, for example price, time saved, quality, trust, status, belonging, curiosity, missing out, a problem, or a feeling.",
  );
}

function executionFromCopy(copy: string): Execution {
  if (/\b(ugc|creator|selfie)\b/i.test(copy)) return "Person/UGC";
  if (/\bbefore\b/i.test(copy) && /\bafter\b/i.test(copy)) return "Before/after";
  if (/\b(testimonial|review)\b|\bcustomers say\b/i.test(copy)) return "Testimonial";
  if (/\b(steps?|demo|how to|from bag to cup)\b/i.test(copy)) return "Demo/how-to";
  if (/\b(meme|text-led|text only)\b/i.test(copy)) return "Text-led";
  if (/\b(lifestyle|window|kitchen|morning light|roastery)\b/i.test(copy)) return "Lifestyle scene";
  return "Product focus";
}

function deliveryFromCopy(copy: string): Delivery {
  if (/\b(swipe|carousel|slides?)\b/i.test(copy)) return "Carousel";
  if (/\b\d{1,2}\s*-?\s*seconds?\b|\bvideo\b|\bclip\b/i.test(copy)) return "Video";
  return "Static";
}

function hookFromHeadline(headline: string): string {
  return headline.trim().split(/\s+/).slice(0, HOOK_MAX_WORDS).join(" ");
}

function messageFromCopy(input: CopyInput): string {
  const primary = input.primaryText.trim();
  const sentence = primary.split(/(?<=[.!?])\s+/)[0]?.trim();
  if (!sentence) {
    throw new ModelOutputError(
      "Mock mode could not read a message because the primary text was empty.",
    );
  }
  return sentence.slice(0, 240);
}

export function mockClassification(input: CopyInput): Classification {
  const demo = matchDemo(input);
  if (demo) return fixtureForDemoAd(demo.id).classification;

  const copy = `${input.headline}\n${input.primaryText}`;
  const motivation = motivationFromCopy(copy);
  const execution = executionFromCopy(copy);
  const delivery = deliveryFromCopy(copy);
  const segmentation = mockSegmentation(input);
  const seen = [
    segmentation.product,
    segmentation.person,
    segmentation.textOverlay,
    segmentation.setting,
    segmentation.logo,
  ]
    .filter((hit) => hit.found)
    .map((hit) => hit.note)
    .join(" ");

  return {
    message: messageFromCopy(input),
    motivation,
    hook: hookFromHeadline(input.headline),
    execution,
    delivery,
    visualDescription: seen || "Mock visual read: nothing in the frame was marked as found.",
    why: `Mock reading of the copy only, not a model call. The words point to ${motivation}, told as a ${execution} ${delivery.toLowerCase()}.`,
  };
}

function isDanishCoffeeLab(websiteText: string, brief: string): boolean {
  return /danish coffee lab/i.test(`${websiteText}\n${brief}`);
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function mockBrandSummary(input: {
  websiteText: string;
  brief: string;
}): BrandSummary {
  if (isDanishCoffeeLab(input.websiteText, input.brief)) {
    return {
      offer: "A weekly bag of specialty coffee, roasted in Aarhus after you order.",
      audiences: ["Home drinkers in Denmark who already buy specialty coffee"],
      keyBenefits: [
        "Roasted the week you drink it",
        "Delivered on a day you choose",
        "Price per cup shown before you start",
      ],
      tone: "Calm, concrete, and small-company direct.",
      why: "Read from the Danish Coffee Lab page and the autumn brief: a weekly roasted bag, people who already buy specialty coffee, and a calm tone. This describes the brand. It does not estimate results.",
    };
  }

  const sentences = sentencesOf(input.websiteText);
  const offer = sentences[0];
  if (!offer) {
    throw new ModelOutputError(
      "Mock mode could not find an offer because the website text had no sentence.",
    );
  }

  const audienceMatch = input.brief.match(/\bfor\s+([^.]{8,140})/i);
  if (!audienceMatch?.[1]) {
    throw new ModelOutputError(
      "Mock mode could not find an audience. Say who the brief is for, for example “for office managers in Copenhagen”.",
    );
  }

  const keyBenefits = sentences.slice(1, 4);
  if (keyBenefits.length === 0) {
    throw new ModelOutputError(
      "Mock mode needs a second sentence of website text so it can list a benefit without inventing one.",
    );
  }

  const haystack = `${input.websiteText} ${input.brief}`.toLowerCase();
  const tones = TONE_WORDS.filter((word) => haystack.includes(word));
  if (tones.length === 0) {
    throw new ModelOutputError(
      "Mock mode could not read a tone. Use a word such as calm, direct, warm, or playful in the website text.",
    );
  }

  return {
    offer,
    audiences: [audienceMatch[1].trim()],
    keyBenefits,
    tone: tones.join(", "),
    why: "Mock summary built by quoting the pasted website text and the brief. No model was called, and no result was estimated.",
  };
}

export function mockConstraints(input: { websiteText: string; brief: string }): Constraints {
  const text = `${input.websiteText}\n${input.brief}`;
  const exclusions = [
    ...(/not a discount campaign/i.test(text) ? ["This is not a discount campaign."] : []),
    ...(/no limited drops|limited drop/i.test(text) ? ["No limited drops."] : []),
    ...(/no status claims|slogan about status/i.test(text) ? ["No status claims."] : []),
  ];
  const focusPoints = [
    ...(/weekly ritual/i.test(text) ? ["weekly ritual"] : []),
    ...(/roast date/i.test(text) ? ["roast date"] : []),
  ];
  if (exclusions.length === 0 || focusPoints.length === 0) {
    throw new ModelOutputError(
      "Mock mode could not find a written exclusion and a focus point in the brief or the website text.",
    );
  }
  return { exclusions, focusPoints };
}

export function mockConceptBrief(input: {
  motivation: Motivation;
  execution: Execution;
  delivery: Delivery;
  offer: string;
}): ConceptBrief {
  return {
    conceptName: `${input.motivation} as a ${input.execution.toLowerCase()}`,
    motivation: input.motivation,
    coreMessage: `Test a ${input.motivation.toLowerCase()} angle for this offer: ${input.offer}`,
    hook: "Try a different angle this week",
    execution: input.execution,
    delivery: input.delivery,
    visualDirection: `A rough ${input.execution.toLowerCase()} frame that states the angle in the first screen.`,
    examplePrimaryText: `Mock primary text for a ${input.motivation} ${input.execution} test. This is a hypothesis, not a forecast.`,
    hypothesis: `Hypothesis: a ${input.motivation} × ${input.execution} test would cover a cell this portfolio is not using. This is not a performance prediction.`,
  };
}

/** 1×1 PNG. Enough for the mockup schema. The M1 UI does not render it. */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function mockMockup(input: { visualDirection: string }): Mockup {
  return {
    prompt: `Rough placeholder frame, not a finished ad. ${input.visualDirection}`,
    outputFormat: "png",
    b64Json: TINY_PNG,
  };
}
