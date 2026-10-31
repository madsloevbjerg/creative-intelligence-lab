# Handoff

Creative Intelligence Lab maps which motivation-and-format combinations a Meta ad portfolio already uses. It does not predict results. The demo brand is Danish Coffee Lab.

Another agent can take over from this file. Do not put secret values in the repo.

## Run it locally

Node.js 22, or at least 20.17. `.nvmrc` says `22`.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Load demo data**, leave the access code blank, then **Analyze coverage**. With the committed cache, that replay costs $0 and must not show a mock banner when `MODEL_API_KEY` is set and `USE_MOCK` is not true.

Checks:

```bash
npm run lint
npm run check:mock
npm run check:budget
npm run check:safety
npm run check:crop
npm run check:text
npm run build
```

`npm run m2:smoke` makes one live SAM call, one classification, one brand summary, and one image if they are not already cached. Do not run it unless you mean to spend.

## Environment variable names

Copy `.env.example` to `.env.local`. `.env.local` is gitignored. Never commit values.

- `MODEL_API_KEY` — Meta Model API key. Empty means mock mode.
- `USE_MOCK` — `true` forces mock mode even when a key is set.
- `LIVE_ACCESS_CODE` — server-only passcode required before any live call. Empty means live mode is off.
- `BUDGET_LIMIT_USD` — hard cap on estimated live spend. Blank means 120.
- `LIVE_RUNS_PER_HOUR` — how many live analysis runs the server may start per hour. Blank means 10. Mock runs do not count.

Scripts also read `PLACE_ONLY` and `SKIP_CLASSIFY` as local switches. They are not app configuration.

The spend ledger is `.data/spend.json` (gitignored). Cache hits and mock calls are $0. Saved demo results live in `data/cache/` and are committed. That folder has no secrets.

## Project structure

- `app/page.tsx` — the one page
- `app/api/analyze/route.ts` — the only analysis route
- `components/lab-app.tsx` — form, results, per-ad view, cost line
- `components/coverage-map.tsx` — motivation × execution grid. Delivery is a badge. Empty cells have no label. Top gaps are highlighted. Off-brand rows are marked, not ranked.
- `components/coverage-story.tsx` — the summary bar, counted from the classifications on screen
- `components/feed-frame.tsx` — Meta-style frame around a finished ad
- `components/sam-crop-view.tsx` — bag mask, crop rectangle, and coloured boxes from cached element masks
- `lib/taxonomy.ts` — motivations, execution styles, delivery badges, and SAM phrases. Do not duplicate these lists.
- `lib/gaps.ts` — deterministic gap ranking, off-brand rows, and brief-conflict quotes. Hypotheses are not forecasts.
- `lib/meta.ts` — the only module that calls Meta. Prices, cache, and the $120 cap live here
- `lib/schemas.ts` — zod checks for every model response
- `lib/mock.ts` and `lib/mock-fixtures.ts` — labels used when there is no live call
- `lib/demo.ts` — Danish Coffee Lab copy and the eight ad paths
- `lib/demo-cache.ts` — replays an exact demo submission from `data/cache/`
- `lib/brand-kit.ts` — bag, palette, photo style
- `lib/smart-crop.ts` — 4:5 and 9:16 crop around SAM boxes
- `lib/place-text.ts` — `placeText(image, masks, aspectRatio, options)`. The wordmark stays top-left. The headline can sit at the top, bottom, or a side. `options.safeZone` is for Stories/Reels in M5.
- `lib/wordmark.ts` — wordmark pill pinned top-left, sized to the name. Headline position comes from `placeText`.
- `lib/phone-notice.ts` — the lock-screen card drawn onto ad 6
- `lib/composite-ad.ts` — crop, overlay, and contact sheets
- `public/demo/` — the eight final ads, raw photos, bag masks, `manifest.json`, candidates, and redo stills
- `lib/demo-manifest.json` — same manifest the UI fetches: crop, and `placement.reason` per ad
- `docs/m3/` — prompts, the selection note, and the labelled contact sheet `final-ads.png`
- `scripts/` — mock, budget, safety, crop, and placeText checks, plus the M2 and M3 runners

There is no database. An analysis stays in the browser until refresh.

## What is done

- M0–M1: one-page app, demo brand, mock analysis, coverage map, budget cap, access code, hourly limit.
- M2: live Muse Spark, SAM 3.1, and Muse Image, with cache. SVG is rasterized before it is sent. The documented image call does not take a size.
- M3: eight visually different ads, three motivations (Price/value 1–3, Convenience/time 4–6, Quality/performance 7–8). Scenes that were flattened back to “bag on a table” were restored. 1, 2, and 4 are the original picks. 6 and 8 are crops of the original photos. 3, 5, and 7 were regenerated as the same scene, not a new one.
- Placement: the wordmark stays top-left on every ad. Only the headline moves. If the top-left corner meets a face or the phone, the placement sentence says so. Ad 6 has a coded delivery notification. Ad 8’s headline sits above the bag, off the drum face.
- M4: matrix columns are execution styles. Delivery (Static, Carousel, Video) is a badge. Muse Spark extracts exclusions and focus points from the brief and website. Ads 1 and 2 are flagged against “This is not a discount campaign.” Status/identity and Fear of missing out are off-brand, not gaps. Gap rank is code in `lib/gaps.ts`. Each ad has a why in a list.

## What is left

- M5: concept briefs, image mockups, placements, and one AI persona. Reuse `placeText` with a Stories/Reels `safeZone` (`REELS_SAFE_ZONE` in `lib/place-text.ts`). Feed ads use an open safe zone.
- M6: deploy, README, and the submission. Update this file at the end of each milestone.

## Known issues

- SAM phrases are `bag`, `person`, `words`, `background`, and `green logo`. `words` still misses the headline on some ads. `background` misses the setting on some ads. Do not invent a mask when SAM returns no match.
- On ads 3, 6, and 7 the wordmark stays top-left even though that corner meets a face or the phone. A nudge inside the corner could not clear it. The sentence says so.
- The phone card is axis-aligned inside the SAM phone box. The phone in the photo is slightly tilted.
- Ad 6 was classified as a Static lifestyle scene. It is a still of a phone, so the model did not call it Video.
- Remotes: `origin` is the Origin git remote. No GitHub remote is configured. Do not create a GitHub repo from here.

## Demo scenes

| Ad | Scene | Headline band |
| --- | --- | --- |
| 1 | Bold price still | bottom, clear of the bag. Wordmark top-left. |
| 2 | Three bags, all visible | bottom. Wordmark top-left. |
| 3 | Woman in a café, bag on the table | bottom, on the table, not on the cup. Wordmark stays top-left and still meets her hair. |
| 4 | Doorstep | bottom. Wordmark top-left. |
| 5 | Gooseneck pour, bag by the cup | bottom. Wordmark top-left. |
| 6 | Phone notification, bag beside it | bottom, off the phone. Wordmark stays top-left and still meets the phone. |
| 7 | Person in a home kitchen with the bag | bottom. Wordmark stays top-left and still meets a face. |
| 8 | Aarhus roastery, bag in front | top, above the bag and off the drum face. Wordmark top-left. |
