import { demoPortfolio } from "@/lib/demo";
import type { Classification, Segmentation } from "@/lib/schemas";

type Fixture = {
  segmentation: Segmentation;
  classification: Classification;
};

const noPerson = {
  found: false,
  note: "No match. The frame has no person.",
};

const fixtures: Record<string, Fixture> = {
  "bonne-01": {
    segmentation: {
      product: { found: true, note: "A coffee bag is drawn in the lower half." },
      person: noPerson,
      textOverlay: { found: true, note: "Large price text sits on the image." },
      setting: { found: true, note: "The background is a plain cream field." },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "A weekly bag of specialty coffee for 49 kr.",
      motivation: "Price/value",
      hook: "Coffee for 49 kr a week",
      format: "Static image",
      visualDescription:
        "A cream still with a large 49 kr lockup, a coffee bag, and the wordmark.",
      why: "The headline leads with a weekly price on a single still: a bag, price text, and the wordmark, and no person.",
    },
  },
  "bonne-02": {
    segmentation: {
      product: { found: true, note: "One coffee bag is drawn under the offer." },
      person: noPerson,
      textOverlay: { found: true, note: "The words “3rd bag free” fill the frame." },
      setting: { found: true, note: "The background is a dark brown field." },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "Stay three months and the third bag is free.",
      motivation: "Price/value",
      hook: "Your third bag is free",
      format: "Static image",
      visualDescription:
        "A dark still with a large “3rd bag free” line and a single bag.",
      why: "A free third bag is a price offer, and the frame is one still rather than a sequence.",
    },
  },
  "bonne-03": {
    segmentation: {
      product: { found: true, note: "A small bag is drawn in each of three panels." },
      person: noPerson,
      textOverlay: { found: true, note: "Each panel has a plan name and a price." },
      setting: { found: true, note: "Three side-by-side panels make the background." },
      logo: { found: true, note: "The Bønne & Co wordmark sits above the panels." },
    },
    classification: {
      message: "Three subscription prices, compared per cup.",
      motivation: "Price/value",
      hook: "Three prices, one subscription",
      format: "Carousel",
      visualDescription:
        "Three panels labeled Home, Office, and Gift, each with a price and a bag.",
      why: "The copy tells you to swipe across three prices, so this is a carousel about price.",
    },
  },
  "bonne-04": {
    segmentation: {
      product: { found: true, note: "A bag sits on a doorstep." },
      person: noPerson,
      textOverlay: { found: true, note: "“Every Monday” is set in large type." },
      setting: { found: true, note: "A door and step are drawn behind the bag." },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "Beans arrive every Monday, so you skip the shop.",
      motivation: "Convenience/time",
      hook: "Beans on the mat every Monday",
      format: "Static image",
      visualDescription:
        "A pale morning still of a bag on a doorstep and the line “Every Monday”.",
      why: "The message is a standing Monday delivery, shown as one still of a bag at the door.",
    },
  },
  "bonne-05": {
    segmentation: {
      product: { found: true, note: "A bag is drawn beside four numbered steps." },
      person: noPerson,
      textOverlay: {
        found: true,
        note: "The steps are labeled Open, Grind, Pour, and Drink.",
      },
      setting: { found: true, note: "The background is a plain warm paper field." },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "Four steps from bag to cup, and no shop run.",
      motivation: "Convenience/time",
      hook: "From bag to cup in four steps",
      format: "Product demo",
      visualDescription:
        "Four numbered circles in a row: Open, Grind, Pour, Drink, plus a bag.",
      why: "Four numbered steps from bag to cup make this a product demo about skipping the shop run.",
    },
  },
  "bonne-06": {
    segmentation: {
      product: { found: true, note: "A small bag is drawn at the bottom of the frame." },
      person: noPerson,
      textOverlay: { found: true, note: "“10s” and a play mark sit in the center." },
      setting: { found: true, note: "The background is a near-black video frame." },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "A short clip of Monday coffee already at the door.",
      motivation: "Convenience/time",
      hook: "Monday coffee, already handled",
      format: "Short video (<15s)",
      visualDescription:
        "A dark frame with a play mark, a 10-second label, and a bag at a door.",
      why: "The copy describes a 10-second clip of a doorstep bag, so this is a short video about time.",
    },
  },
  "bonne-07": {
    segmentation: {
      product: { found: true, note: "A cup is drawn on a windowsill." },
      person: noPerson,
      textOverlay: { found: true, note: "“This week” and “Aarhus” are set on the image." },
      setting: {
        found: true,
        note: "A window and a plant are drawn behind the cup.",
      },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "Beans roasted this week in Aarhus.",
      motivation: "Quality/performance",
      hook: "Roasted this week in Aarhus",
      format: "Lifestyle scene",
      visualDescription:
        "A warm room with a window, a plant, and a cup on the sill.",
      why: "A named roast city and a cup by a window are a quality claim staged as a lifestyle scene.",
    },
  },
  "bonne-08": {
    segmentation: {
      product: { found: true, note: "A bag with an origin label is centered." },
      person: noPerson,
      textOverlay: {
        found: true,
        note: "“One origin” and a green origin label are on the image.",
      },
      setting: { found: true, note: "The background is an off-white field." },
      logo: { found: true, note: "The Bønne & Co wordmark is in the corner." },
    },
    classification: {
      message: "One origin, with the roast date on the bag.",
      motivation: "Quality/performance",
      hook: "One origin. Nothing blended away.",
      format: "Static image",
      visualDescription:
        "An off-white still of one bag with a green single-origin label.",
      why: "Single-origin beans and a roast date on one product still are a quality message, not a price offer.",
    },
  },
};

for (const ad of demoPortfolio.ads) {
  if (!fixtures[ad.id]) {
    throw new Error(`Demo ad ${ad.id} has no mock fixture.`);
  }
}

export function fixtureForDemoAd(id: string): Fixture {
  const fixture = fixtures[id];
  if (!fixture) {
    throw new Error(`Demo ad ${id} has no mock fixture.`);
  }
  return fixture;
}
