/**
 * Fictional Danish coffee subscription used as the demo portfolio.
 * Copy and image paths only. Classifications live in the mock fixtures
 * so the UI has to run the analysis to place the ads.
 */

export type DemoAd = {
  id: string;
  file: string;
  rawFile: string;
  maskFile: string;
  headline: string;
  primaryText: string;
};

export const demoPortfolio = {
  brandName: "Danish Coffee Lab",
  websiteText: `Danish Coffee Lab roasts coffee at its roastery in Aarhus and sends a bag on the day you pick. You order once, and the next bag is roasted after that, not months before. The beans are single origin, the roast date is printed on the bag, and the tasting note is short enough to remember. A recent lot's tasting note was dark cherry and cocoa.

The subscription is for home drinkers in Denmark who already buy specialty coffee and are tired of the last-minute shop run. Plans are Home, Office, and Gift. You can see the price per cup before you start, and you can skip or cancel a week.

Nothing here is a limited drop or a slogan about status. The company is small, the tone on the site is calm, and the photos are of bags, cups, and the roastery door.`,
  brief: `Autumn push for new subscribers in Copenhagen and Aarhus. Talk to people who already buy specialty coffee from a café or a supermarket. Focus on the weekly ritual and the roast date. This is not a discount campaign. No limited drops. No status claims. The current ads cluster around price and convenience, and we want to see which motivations we are not using.`,
  ads: [
    {
      id: "dcl-01",
      file: "/demo/dcl-01.png",
      rawFile: "/demo/dcl-01-raw.png",
      maskFile: "/demo/dcl-01-mask.png",
      headline: "Coffee for 49 kr a week",
      primaryText:
        "Specialty coffee, delivered. One bag, one low weekly price. Cancel any time.",
    },
    {
      id: "dcl-02",
      file: "/demo/dcl-02.png",
      rawFile: "/demo/dcl-02-raw.png",
      maskFile: "/demo/dcl-02-mask.png",
      headline: "Your third bag is free",
      primaryText:
        "Stay three months and the third bag is on us. Same beans, lower cost per cup.",
    },
    {
      id: "dcl-03",
      file: "/demo/dcl-03.png",
      rawFile: "/demo/dcl-03-raw.png",
      maskFile: "/demo/dcl-03-mask.png",
      headline: "Three prices, one subscription",
      primaryText:
        "Compare Home, Office, and Gift. Swipe to see what each plan costs per cup.",
    },
    {
      id: "dcl-04",
      file: "/demo/dcl-04.png",
      rawFile: "/demo/dcl-04-raw.png",
      maskFile: "/demo/dcl-04-mask.png",
      headline: "Beans on the mat every Monday",
      primaryText:
        "Pick a day. We roast, pack, and deliver. You just boil water.",
    },
    {
      id: "dcl-05",
      file: "/demo/dcl-05.png",
      rawFile: "/demo/dcl-05-raw.png",
      maskFile: "/demo/dcl-05-mask.png",
      headline: "From bag to cup in four steps",
      primaryText:
        "Open, grind, pour, drink. The subscription removes the shop run.",
    },
    {
      id: "dcl-06",
      file: "/demo/dcl-06.png",
      rawFile: "/demo/dcl-06-raw.png",
      maskFile: "/demo/dcl-06-mask.png",
      headline: "Monday coffee, already handled",
      primaryText:
        "A 10-second look at a bag landing at the door before the kettle boils.",
    },
    {
      id: "dcl-07",
      file: "/demo/dcl-07.png",
      rawFile: "/demo/dcl-07-raw.png",
      maskFile: "/demo/dcl-07-mask.png",
      headline: "Roasted this week in Aarhus",
      primaryText:
        "Small lots, named farms, roasted after you order. A cup by the window, the week it was meant for.",
    },
    {
      id: "dcl-08",
      file: "/demo/dcl-08.png",
      rawFile: "/demo/dcl-08-raw.png",
      maskFile: "/demo/dcl-08-mask.png",
      headline: "One origin. Nothing blended away.",
      primaryText:
        "Single-origin beans, roast date on the bag, tasting notes you can actually taste.",
    },
  ] satisfies DemoAd[],
};
