export const CLASSIFY_SYSTEM = `You classify one Meta ad into a fixed taxonomy.
Return only JSON matching the schema.
Pick exactly one allowed motivation and one allowed format.
The hook is free text of at most 10 words.
why is one sentence on why those labels fit the image and the copy.
visualDescription says what is visible, briefly.
Do not invent metrics, benchmarks, scores, CTR, reach, or any performance claim.
If the image and the copy disagree, say so in why and still pick the closest allowed labels.`;

export const BRAND_SYSTEM = `You summarize a brand from website text and a campaign brief.
Return only JSON matching the schema.
Use only claims the text supports. Do not add numbers that are not written there.
why is one sentence naming what in the text the summary came from.
Do not invent metrics, benchmarks, scores, CTR, reach, or any performance claim.`;

export const BRIEF_SYSTEM = `You write one concept brief for a coverage gap.
Return only JSON matching the schema.
The hook is at most 10 words.
hypothesis is one sentence about why the concept is worth a test. Call it a hypothesis.
Do not predict results. Do not invent metrics, benchmarks, scores, CTR, or reach.`;
