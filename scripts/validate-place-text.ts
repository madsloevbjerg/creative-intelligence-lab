import { FEED_ASPECT, REELS_ASPECT } from "../lib/smart-crop";
import {
  REELS_SAFE_ZONE,
  faceBoxes,
  placeText,
  type SubjectMask,
} from "../lib/place-text";

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
if (onFace.band !== "bottom") fail(`a face in the top band should move the headline, got ${onFace.band}`);
if (!onFace.reason.includes("bottom")) fail(`reason should name the bottom band: ${onFace.reason}`);
if (!onFace.reason.includes("person") && !onFace.reason.includes("face")) {
  fail(`reason should name the person or the face: ${onFace.reason}`);
}
const derived = faceBoxes([person]);
if (derived.length !== 1 || derived[0]!.bottom > person.box.top + (person.box.bottom - person.box.top) * 0.25 + 1) {
  fail("the face proxy should be the top quarter of the person");
}

const lowBag: SubjectMask = {
  subject: "bag",
  box: { left: 400, top: 620, right: 700, bottom: 980 },
};
const bagLow = placeText(feed, [lowBag], FEED_ASPECT);
if (bagLow.band !== "top") fail(`a bag in the bottom band should put the headline on top, got ${bagLow.band}`);
if (!bagLow.reason.includes("bag")) fail(`reason should name the bag: ${bagLow.reason}`);

const phone: SubjectMask = {
  subject: "phone",
  box: { left: 220, top: 30, right: 520, bottom: 420 },
};
const phoneTop = placeText(feed, [phone], FEED_ASPECT);
if (phoneTop.band !== "bottom") fail(`a phone in the top band should put the headline at the bottom, got ${phoneTop.band}`);
if (!phoneTop.reason.includes("phone")) fail(`reason should name the phone: ${phoneTop.reason}`);

const explicitFace: SubjectMask = {
  subject: "face",
  box: { left: 100, top: 700, right: 280, bottom: 920 },
};
const faceBottom = placeText(feed, [explicitFace], FEED_ASPECT);
if (faceBottom.band !== "top") fail(`an explicit face in the bottom band should put the headline on top, got ${faceBottom.band}`);

const clear = placeText(feed, [], FEED_ASPECT);
if (clear.band !== "bottom") fail("a clear frame should keep the headline at the bottom");
if (!clear.reason.includes("neither band")) fail(`clear reason was ${clear.reason}`);

const story = { width: 900, height: 1600 };
const safe = placeText(story, [], REELS_ASPECT, { safeZone: REELS_SAFE_ZONE });
const topLimit = story.height * REELS_SAFE_ZONE.top;
const bottomLimit = story.height * (1 - REELS_SAFE_ZONE.bottom);
if (safe.rect.top < topLimit - 1) fail(`safe zone let the band start at ${safe.rect.top}, above ${topLimit}`);
if (safe.rect.top + safe.rect.height > bottomLimit + 1) {
  fail(`safe zone let the band end at ${safe.rect.top + safe.rect.height}, below ${bottomLimit}`);
}

if (failures > 0) {
  console.error(`${failures} placeText check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("placeText keeps the headline off the face and off the busier band.");
}
