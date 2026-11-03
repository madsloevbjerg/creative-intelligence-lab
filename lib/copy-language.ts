/**
 * Demo copy language. English is the default. Danish strings stay available.
 * The eight existing ads are already English and keep kr.
 */
export type CopyLanguage = "en" | "da";

export const demoCopyLanguage: CopyLanguage = "en";

export const conceptCopy = {
  en: {
    "1": {
      name: "Cancel anytime",
      headline: "Cancel anytime. I just never have.",
      primary:
        "I saw the price per cup before I started. I can skip a week, and I can cancel any time. I just never have.",
      label: "Illustrative testimonial: replace with a real customer quote before use.",
    },
    "2": {
      name: "The one thing we don't share",
      headline: "We share everything. Except this.",
      primary:
        "House rule for Monday's bag: whoever reaches it first, brews it. The price per cup is on the page before you start, and you can skip a week.",
    },
    "3": {
      name: "The two-cup kitchen experiment",
      headline: "Find the cherry. Then the cocoa.",
      primary:
        "Take two cups from the same bag. Find the dark cherry first, then the cocoa. Taste the first cup, then the last one.",
    },
  },
  da: {
    "1": {
      name: "Opsig når som helst",
      headline: "Jeg kan altid opsige. Det har jeg bare ikke gjort.",
      primary:
        "Jeg så prisen pr. kop, før jeg gik i gang. Jeg kan springe en uge over, og jeg kan opsige når som helst. Det har jeg bare ikke gjort.",
      label: "Illustrativt citat: udskift med et rigtigt kundecitat før brug.",
    },
    "2": {
      name: "Det eneste vi ikke deler",
      headline: "Vi deler alt. Bare ikke den her.",
      primary:
        "Husregel for mandagens pose: den der når den først, brygger den. Prisen pr. kop står der, før du starter, og du kan springe en uge over.",
    },
    "3": {
      name: "Køkkenforsøget med to kopper",
      headline: "Find kirsebærret. Så kakaoen.",
      primary:
        "Tag to kopper fra den samme pose. Find først mørk kirsebær, så kakao. Smag den første kop, og så den sidste.",
    },
  },
} as const;

export function activeConceptCopy(language: CopyLanguage = demoCopyLanguage) {
  return conceptCopy[language];
}
