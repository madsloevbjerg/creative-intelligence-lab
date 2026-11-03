export const CLASSIFY_SYSTEM = `You classify one Meta ad into a fixed taxonomy.
Return only JSON matching the schema.
Pick exactly one allowed motivation, one allowed execution style, and one allowed delivery.
Execution is how the ad is made: Product focus, Lifestyle scene, Person/UGC, Testimonial, Demo/how-to, Before/after, or Text-led.
Delivery is only Static, Carousel, or Video.
The hook is free text of at most 10 words.
why is one sentence on why those labels fit the image and the copy.
visualDescription says what is visible, briefly.
Do not invent metrics, benchmarks, scores, CTR, reach, or any performance claim.
If the image and the copy disagree, say so in why and still pick the closest allowed labels.`;

export const CONSTRAINT_SYSTEM = `You extract constraints that are written in the website text and the campaign brief.
Return only JSON.
exclusions are full sentences copied from the text for things the brand refuses, such as a discount, a limited drop, or a status claim.
focusPoints are full phrases copied from the text for what the campaign should focus on, such as a weekly ritual or a roast date.
Do not add a constraint that is not written in the text.
Do not invent metrics or predict performance.`;

export const BRAND_SYSTEM = `You summarize a brand from website text and a campaign brief.
Return only JSON matching the schema.
Use only claims the text supports. Do not add numbers that are not written there.
why is one sentence naming what in the text the summary came from.
Do not invent metrics, benchmarks, scores, CTR, reach, or any performance claim.`;

export const CONCEPT_COPY_SYSTEM = `You write one new ad concept for a coverage gap.
Return only JSON matching the schema.
conceptName, headlineDa, hook, primaryTextDa, and ctaDa are Danish, written the way a Danish copywriter writes: short sentences, concrete words, no translated English idioms.
conceptNameEn, hookEn, headlineEn, primaryTextEn, and ctaEn are faithful English translations.
The hook and hookEn are each at most 10 words.
The headline, the hook, and the primary text must express this concept's own motivation. Do not make roast date or Aarhus the message.
If you mention the roast date, write ristedato, and mention it at most once in the Danish fields. Mention Aarhus at most once. Do not put Aarhus or ristedato in the headline.
Do not start the headline the way another concept would. Do not use "Ristet i Aarhus", "drukket hjemme hos os andre", or "Smag Datoen".
Do not use the words delicious, premium, amazing, perfect, or best.
Do not invent metrics, benchmarks, scores, ratings, review counts, customer counts, CTR, reach, or any performance claim.
visualDirection describes the photograph only. No letters in the photograph.`;

/** Extra instructions for one motivation. Empty when the motivation has no special rule. */
export function conceptCopyFocus(motivation: string, execution: string): string {
  if (motivation === "Safety/trust" && execution === "Testimonial") {
    return [
      "Write the headline and the primary text as a first-person quote (jeg).",
      "The message is low risk and transparency: you can skip a week, you can cancel any time, the price per cup is shown before you start, and you know when the bag was roasted.",
      "The speaker is illustrative. Do not present them as a real customer.",
    ].join(" ");
  }
  if (motivation === "Belonging/social proof" && execution === "Person/UGC") {
    return [
      "The message is the shared weekly ritual among home brewers: Monday mornings, the bag arriving, neighbours or colleagues on the same plan.",
      "Do not invent numbers, customer counts, ratings, or reviews.",
    ].join(" ");
  }
  if (motivation === "Curiosity/novelty" && execution === "Demo/how-to") {
    return [
      "The message is discovery: a small tasting experiment at home. Find the dark cherry and the cocoa. Compare the first cup from the bag with the last.",
      "The steps should feel playful, not like instructions printed on a pack.",
    ].join(" ");
  }
  return "Let the headline say the motivation in plain language.";
}

export const PERSONA_SYSTEM = `You draft one fictional AI persona for a testimonial or creator-style ad.
Return only JSON matching the schema.
The person is not a real individual. name is a Danish first name.
look describes an ordinary adult, varied and natural, not a celebrity.
scriptDa is a short spoken script in Danish, under 40 words. scriptEn is the English translation.
Do not invent metrics or predict performance.`;

export const BRIEF_SYSTEM = `You write one concept brief for a coverage gap.
Return only JSON matching the schema.
The hook is at most 10 words.
hypothesis is one sentence about why the concept is worth a test. Call it a hypothesis.
Do not predict results. Do not invent metrics, benchmarks, scores, CTR, or reach.`;
