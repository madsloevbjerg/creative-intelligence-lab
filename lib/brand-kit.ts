/**
 * Danish Coffee Lab visual kit. Every demo photo prompt is built from this,
 * and the wordmark overlay uses the same palette.
 */

export const brandKit = {
  name: "Danish Coffee Lab",
  bag: {
    bodyHex: "#F3EDE3",
    labelHex: "#1F4A38",
    stickerHex: "#F7F1E6",
    description:
      "a matte cream paper coffee bag with a deep green rectangular label that is only a solid color block, and a small blank cream sticker where a roast date would go. The label and the sticker have no writing at all",
  },
  palette: {
    cream: "#F3EDE3",
    deepGreen: "#1F4A38",
    coffee: "#3C2415",
    ink: "#1C1612",
    paper: "#F7F3EC",
    kraft: "#6B4423",
  },
  photoStyle:
    "Natural Scandinavian daylight, the kind in a real Danish home, a small café, or the Aarhus roastery. Shot on a normal camera, a little imperfect, quiet and specific. Not a stock photo, not glossy advertising, not CGI, and not a catalog render.",
  people:
    "Any person is an ordinary adult, varied and natural, caught mid-action rather than posing. Not a recognizable real person, not a celebrity, and not a model on a set. No real brand logos, no clothing logos, no shop signs, and no nameplates.",
  noText:
    "No text anywhere in the photograph: no letters, no numbers, no words, no logos, no watermarks, no brand names, no readable labels, no captions, and no interface copy.",
} as const;

export type DemoMotivation = "Price/value" | "Convenience/time" | "Quality/performance";

export type DemoScene = {
  id: string;
  adNumber: number;
  motivation: DemoMotivation;
  discount: boolean;
  scene: string;
  headline: string;
  variations: readonly [string, string, string];
};

const tail = [
  brandKit.photoStyle,
  brandKit.people,
  `When the coffee bag is visible, it is always the same bag: ${brandKit.bag.description}.`,
  brandKit.noText,
].join(" ");

function scene(
  input: Omit<DemoScene, "variations" | "discount"> & {
    discount?: boolean;
    variations: [string, string, string];
  },
): DemoScene {
  const [first, second, third] = input.variations;
  return {
    ...input,
    discount: input.discount ?? false,
    variations: [`${first} ${tail}`, `${second} ${tail}`, `${third} ${tail}`],
  };
}

/** Eight messages, three motivations. Ads 1 and 2 stay the discount ads. */
export const demoScenes: readonly DemoScene[] = [
  scene({
    id: "dcl-01",
    adNumber: 1,
    motivation: "Price/value",
    discount: true,
    scene: "Bold text-led price ad",
    headline: "Coffee for 49 kr a week",
    variations: [
      "A bold graphic still, shot straight on. The cream coffee bag stands just right of center against a flat deep-green wall. A large empty field of warm cream fills the left side and the top, left clear for a headline that will be added later. Hard window light, simple and poster-like, not a lifestyle scene. No person.",
      "The same cream coffee bag sits low in the frame on a cream paper surface, with a deep green wall behind it and a large empty green area above the bag. Camera slightly low. Graphic, quiet, and spare. No person and no other props.",
      "A three-quarter overhead view of the cream coffee bag crossing a surface split into cream on one side and deep green on the other. Empty space remains around the bag for type. No person and no extra props.",
    ],
  }),
  scene({
    id: "dcl-02",
    adNumber: 2,
    motivation: "Price/value",
    discount: true,
    scene: "Flat-lay product shot",
    headline: "Your third bag is free",
    variations: [
      "Overhead flat lay on a pale oak table in daylight: three identical cream coffee bags in a loose row, one pulled slightly apart from the other two. A plain linen napkin at the edge. No person.",
      "Three identical cream coffee bags in a loose triangle on a stone kitchen counter, morning light from the left, one bag lying on its side. A little messy, like a real counter. No person.",
      "Tight overhead of three identical cream coffee bags on warm plaster, long shadows, the nearest bag larger in frame. No person and no other products.",
    ],
  }),
  scene({
    id: "dcl-03",
    adNumber: 3,
    motivation: "Price/value",
    scene: "Café scene",
    headline: "Three prices, one subscription",
    variations: [
      "A small café in Aarhus in the morning. An ordinary woman in her thirties, short dark hair, wool sweater, sits by the window with one ceramic cup. The cream coffee bag is on the table. She looks at the cup, not at the camera. Other tables are soft in the background. No menu board and no signage.",
      "The same kind of small Danish café. An ordinary man in his fifties, grey hair, navy knit, coat on the chair, sits with a cup and the cream coffee bag. He looks out the window. No newspaper, no phone, no menu, no signage.",
      "The café counter rather than a table. Two ordinary adults wait, seen from the side, different ages, one in a work jacket and one in a scarf. Cups and the cream coffee bag sit on the counter. Big windows. No menu board and no shop name.",
    ],
  }),
  scene({
    id: "dcl-04",
    adNumber: 4,
    motivation: "Convenience/time",
    scene: "Doorstep delivery",
    headline: "Beans on the mat every Monday",
    variations: [
      "A Copenhagen apartment doorstep in morning light. The cream coffee bag sits on a coir mat in front of a painted wooden door. Wet stone, a bicycle wheel at the edge of the frame. No person, no house number, no nameplate.",
      "An Aarhus front step under overcast daylight. The cream coffee bag is on the mat. A hand and a coat sleeve are just leaving the frame, the rest of the person unseen. No house number and no nameplate.",
      "A wider view of a terraced-house entrance. The cream coffee bag is clear on the mat, with plants by the door and a simple hallway light. No person, no house number, no nameplate.",
    ],
  }),
  scene({
    id: "dcl-05",
    adNumber: 5,
    motivation: "Convenience/time",
    scene: "Hand pouring coffee",
    headline: "From bag to cup in four steps",
    variations: [
      "Close-up of ordinary adult hands pouring from a plain kettle into a ceramic cup. The cream coffee bag stands behind the cup, slightly soft. A real kitchen, daylight from the side. No face.",
      "Different hands, an older adult, pouring a slow stream into a cup on a wooden counter. The cream coffee bag is sharper in the frame this time. Window light. No face.",
      "Side angle of one hand tilting a kettle, steam above the cup, the deep green label of the cream coffee bag visible beside it. No face and no instructions.",
    ],
  }),
  scene({
    id: "dcl-06",
    adNumber: 6,
    motivation: "Convenience/time",
    scene: "Phone showing a delivery notification",
    headline: "Monday coffee, already handled",
    variations: [
      "A hand holds a phone above a kitchen table in daylight. The phone screen shows only an abstract notification: a cream rectangle and a deep green bar, solid shapes with no glyphs of any kind. The cream coffee bag sits beside the phone. No face, no clock, no icons, no status bar.",
      "The phone lies flat on an oak table, screen up, showing only that same blank cream rectangle and deep green bar. The cream coffee bag and a cup sit next to it. No face, no clock, no icons, no status bar.",
      "Over the shoulder of an ordinary adult in a hallway, face turned away and not visible. They hold a phone whose screen is only the blank cream rectangle and deep green bar. The cream coffee bag is on a sideboard. No clock, no icons, no status bar.",
    ],
  }),
  scene({
    id: "dcl-07",
    adNumber: 7,
    motivation: "Quality/performance",
    scene: "Person in a kitchen",
    headline: "Roasted this week in Aarhus",
    variations: [
      "An ordinary man in his forties, short brown hair, linen shirt, stands in a real Danish kitchen by a window with a ceramic cup. The cream coffee bag is on the counter. Morning light, a plant, unstyled cupboards. He looks outside, not at the camera.",
      "An ordinary woman in her sixties, silver hair tied back, grey cardigan, stands in a smaller kitchen with a cup in hand. The cream coffee bag is by the sink. Overcast daylight. Natural, not glamorous, not looking at the camera.",
      "An ordinary adult in their early thirties, black hair, dark sweater, sits on the edge of a kitchen counter with a cup. The cream coffee bag is beside them. Wooden cabinets, daylight. Relaxed, not a pose, not looking at the camera.",
    ],
  }),
  scene({
    id: "dcl-08",
    adNumber: 8,
    motivation: "Quality/performance",
    scene: "Roastery close-up",
    headline: "One origin. Nothing blended away.",
    variations: [
      "Close-up inside a small Aarhus roastery: a drum roaster, warm metal, daylight from a high window. The cream coffee bag is in the foreground. No signage and no person.",
      "Hands of a roaster, no face, scooping roasted beans. The cream coffee bag is open beside the tray. Chaff and a small workshop, not a showroom. No signage.",
      "Tight shot of beans falling into a cooling tray. The cream coffee bag is soft at the edge of frame, green label still recognizable. Small-scale machinery, daylight. No signage and no person.",
    ],
  }),
];

export type DemoCandidate = {
  id: string;
  fileName: string;
  adId: string;
  adNumber: number;
  letter: "a" | "b" | "c";
  label: string;
  motivation: DemoMotivation;
  discount: boolean;
  scene: string;
  headline: string;
  prompt: string;
};

const letters = ["a", "b", "c"] as const;

export const demoCandidates: readonly DemoCandidate[] = demoScenes.flatMap((item) =>
  letters.map((letter, index) => ({
    id: `${item.id}-${letter}`,
    fileName: `${item.id}-${letter}.png`,
    adId: item.id,
    adNumber: item.adNumber,
    letter,
    label: `${item.adNumber}${letter}`,
    motivation: item.motivation,
    discount: item.discount,
    scene: item.scene,
    headline: item.headline,
    prompt: item.variations[index] ?? item.variations[0],
  })),
);
