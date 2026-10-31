import {
  FEED_ASPECT,
  HEADLINE_RESERVE,
  REELS_ASPECT,
  WORDMARK_RESERVE,
  frameSubjects,
  smartCrop,
  unionMaskBoxes,
  type CropRect,
  type MaskBox,
} from "../lib/smart-crop";

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(message);
}

function contains(rect: CropRect, mask: MaskBox): boolean {
  const wordmarkBottom = rect.top + WORDMARK_RESERVE * rect.height;
  const headlineTop = rect.top + rect.height - HEADLINE_RESERVE * rect.height;
  return (
    mask.left >= rect.left - 1 &&
    mask.right <= rect.left + rect.width + 1 &&
    mask.top >= wordmarkBottom - 1 &&
    mask.bottom <= headlineTop + 1
  );
}

function aspectClose(rect: CropRect, aspect: number): boolean {
  return Math.abs(rect.width / rect.height - aspect) < 0.03;
}

const image = { width: 1920, height: 1280 };
const bag: MaskBox = { left: 860, top: 420, right: 1100, bottom: 760 };

const feed = smartCrop(image, bag, FEED_ASPECT);
if (feed.fit !== "fits") fail(`centered bag should fit 4:5, got ${feed.fit}: ${feed.reason}`);
if (!contains(feed.rect, bag)) fail("4:5 crop does not keep the bag clear of the type bands");
if (!aspectClose(feed.rect, FEED_ASPECT)) fail(`4:5 aspect drifted to ${feed.rect.width}/${feed.rect.height}`);
if (feed.rect.left < 0 || feed.rect.top < 0 || feed.rect.left + feed.rect.width > image.width || feed.rect.top + feed.rect.height > image.height) {
  fail("4:5 crop leaves the image");
}

const edge: MaskBox = { left: 1500, top: 500, right: 1780, bottom: 820 };
const edgeCrop = smartCrop(image, edge, FEED_ASPECT);
if (edgeCrop.fit === "impossible") fail("edge bag should still fit");
if (!contains(edgeCrop.rect, edge)) fail("edge bag is clipped or under the type");

const reels = smartCrop(image, bag, REELS_ASPECT);
if (reels.fit === "impossible") fail(`9:16 should fit a small bag: ${reels.reason}`);
if (!contains(reels.rect, bag)) fail("9:16 crop does not keep the bag clear of the type bands");
if (!aspectClose(reels.rect, REELS_ASPECT)) fail(`9:16 aspect drifted to ${reels.rect.width}/${reels.rect.height}`);

const huge: MaskBox = { left: 40, top: 30, right: 1880, bottom: 1250 };
const blocked = smartCrop(image, huge, FEED_ASPECT);
if (blocked.fit !== "impossible") fail("a mask covering the frame should be impossible");
if (!blocked.reason.includes("wordmark")) fail("impossible reason should mention the wordmark");

const union = unionMaskBoxes([
  { left: 100, top: 400, right: 280, bottom: 700 },
  { left: 300, top: 380, right: 520, bottom: 740 },
  { left: 540, top: 420, right: 760, bottom: 690 },
]);
if (!union) fail("union of three bags was empty");
if (union && (union.left !== 100 || union.top !== 380 || union.right !== 760 || union.bottom !== 740)) {
  fail(`union box was ${JSON.stringify(union)}`);
}
if (union) {
  const three = smartCrop(image, union, FEED_ASPECT);
  if (three.fit === "impossible") fail("three grouped bags should fit");
  if (!contains(three.rect, union)) fail("union of three bags is not fully inside the safe area");
}

const empty = unionMaskBoxes([]);
if (empty !== null) fail("empty union should be null");

const lowBag: MaskBox = { left: 700, top: 900, right: 980, bottom: 1260 };
const lowFrame = frameSubjects(image, [lowBag], lowBag, FEED_ASPECT);
if (lowFrame.fit === "impossible") fail(`a low bag should move the type: ${lowFrame.reason}`);
if (lowFrame.overlay === "standard") fail("a bag on the bottom edge should not keep the headline underneath it");
if (lowBag.bottom > lowFrame.rect.top + lowFrame.rect.height + 1 || lowBag.top < lowFrame.rect.top - 1) {
  fail("the low bag is outside the frame");
}

const spreadPerson: MaskBox = { left: 40, top: 200, right: 500, bottom: 900 };
const spreadBag: MaskBox = { left: 1400, top: 700, right: 1700, bottom: 1200 };
const spread = frameSubjects(image, [spreadPerson, spreadBag], spreadBag, FEED_ASPECT);
if (spread.fit !== "impossible") fail("a person and a bag at opposite edges should not share a 4:5 frame");

const nearPerson: MaskBox = { left: 620, top: 180, right: 980, bottom: 860 };
const nearBag: MaskBox = { left: 1000, top: 520, right: 1280, bottom: 980 };
const near = frameSubjects(image, [nearPerson, nearBag], nearBag, FEED_ASPECT);
if (near.fit === "impossible") fail(`a person beside the bag should fit: ${near.reason}`);
if (nearPerson.left < near.rect.left - 1 || nearBag.right > near.rect.left + near.rect.width + 1) {
  fail("the nearby person or bag is outside the frame");
}

const reelsScene = frameSubjects(image, [bag], bag, REELS_ASPECT);
if (reelsScene.fit === "impossible") fail("9:16 framing should hold a small centered bag");

if (failures > 0) {
  console.error(`${failures} crop check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("Smart crop keeps the mask clear of the wordmark and the headline at 4:5 and 9:16.");
}
