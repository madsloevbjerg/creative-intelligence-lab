import { FEED_ASPECT, REELS_ASPECT } from "../lib/smart-crop";
import { REELS_SAFE_ZONE, faceBoxes, placeText, type SubjectMask } from "../lib/place-text";

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(message);
}

const feed = { width: 800, height: 1000 };

const person: SubjectMask = {
  subject: "person",
  box: { left: 80, top: 40, right: 520, bottom: 780 },
};
const onFace = placeText(feed, [person], FEED_ASPECT);
if (onFace.place === "top") fail(`a face in the top band should move the headline, got ${onFace.place}`);
if (!onFace.reason.includes("face") && !onFace.reason.includes("person")) {
  fail(`reason should name the person or the face: ${onFace.reason}`);
}
if (onFace.wordmark.nudged && onFace.wordmark.left < 0) fail("a nudge must stay on the canvas");
const derived = faceBoxes([person]);
if (derived.length !== 1 || derived[0]!.bottom > person.box.top + (person.box.bottom - person.box.top) * 0.32 + 1) {
  fail("the face proxy should be the top of the person mask");
}

const lowBag: SubjectMask = {
  subject: "bag",
  box: { left: 400, top: 720, right: 700, bottom: 980 },
};
const bagLow = placeText(feed, [lowBag], FEED_ASPECT);
if (bagLow.rect.top + bagLow.rect.height > lowBag.box.top + 2 && bagLow.rect.left < lowBag.box.right) {
  const overlaps =
    bagLow.rect.left < lowBag.box.right &&
    bagLow.rect.left + bagLow.rect.width > lowBag.box.left &&
    bagLow.rect.top < lowBag.box.bottom &&
    bagLow.rect.top + bagLow.rect.height > lowBag.box.top;
  if (overlaps) fail(`headline still covers the bag: ${bagLow.place} ${bagLow.reason}`);
}

const phone: SubjectMask = {
  subject: "phone",
  box: { left: 40, top: 20, right: 360, bottom: 280 },
};
const phoneTop = placeText(feed, [phone], FEED_ASPECT);
if (!phoneTop.reason.toLowerCase().includes("wordmark")) {
  fail(`reason should mention the wordmark: ${phoneTop.reason}`);
}
const phoneHits =
  phoneTop.rect.left < phone.box.right &&
  phoneTop.rect.left + phoneTop.rect.width > phone.box.left &&
  phoneTop.rect.top < phone.box.bottom &&
  phoneTop.rect.top + phoneTop.rect.height > phone.box.top;
if (phoneHits) fail(`headline still covers the phone: ${phoneTop.place}`);

const explicitFace: SubjectMask = {
  subject: "face",
  box: { left: 100, top: 760, right: 280, bottom: 960 },
};
const faceBottom = placeText(feed, [explicitFace], FEED_ASPECT);
if (faceBottom.place === "bottom" || faceBottom.place === "bottom-left") {
  fail(`an explicit face in the bottom should move the headline, got ${faceBottom.place}`);
}

const clear = placeText(feed, [], FEED_ASPECT);
if (clear.place !== "bottom") fail(`a clear frame should keep the headline at the bottom, got ${clear.place}`);
if (clear.wordmark.nudged) fail("a clear frame should leave the wordmark at the top-left");

const bagAndRoaster: SubjectMask[] = [
  { subject: "bag", box: { left: 280, top: 520, right: 560, bottom: 980 } },
  { subject: "roaster", box: { left: 300, top: 40, right: 760, bottom: 520 } },
];
const side = placeText(feed, bagAndRoaster, FEED_ASPECT);
const bagHit =
  side.rect.left < 560 &&
  side.rect.left + side.rect.width > 280 &&
  side.rect.top < 980 &&
  side.rect.top + side.rect.height > 520;
if (bagHit) fail(`headline covers the bag when a side is free: ${side.place} ${side.reason}`);

const story = { width: 900, height: 1600 };
const safe = placeText(story, [], REELS_ASPECT, { safeZone: REELS_SAFE_ZONE });
const bottomLimit = story.height * (1 - REELS_SAFE_ZONE.bottom);
if (safe.rect.top + safe.rect.height > bottomLimit + 2) {
  fail(`safe zone let the headline end at ${safe.rect.top + safe.rect.height}, below ${bottomLimit}`);
}

if (failures > 0) {
  console.error(`${failures} placeText check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("placeText keeps the wordmark top-left and the headline off the bag and the face.");
}
