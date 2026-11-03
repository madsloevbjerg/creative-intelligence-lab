# Handoff

Creative Intelligence Lab maps which motivation-and-execution combinations a Meta ad portfolio already uses. It does not predict results. The demo brand is Danish Coffee Lab.

Another agent can take over from this file. Do not put secret values in the repo. Deadline for the remaining plan: Nov 4, 2026, 9:00 PM ET.

## Run it locally

Node.js 22, or at least 20.17. `.nvmrc` says `22`.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Load demo data**, leave the access code blank, then **Analyze coverage**.

Checks:

```bash
npm run lint
npm run check:mock
npm run check:budget
npm run check:safety
npm run check:crop
npm run check:text
npm run check:gaps
npm run check:layout
npm run build
```

`npm run m2:smoke` makes live calls if they are not already cached. Do not run it unless you mean to spend.

## Environment variables

Names only. No values belong in git. Copy `.env.example` to `.env.local`. `.env.local` and `.env*.local` are gitignored (`.env*` plus those two lines, with `!.env.example`).

| Name | Where the value comes from |
| --- | --- |
| `MODEL_API_KEY` | The Meta Model API key. Create it on the Meta Model API site at https://dev.meta.ai (the same site `lib/meta.ts` cites for list prices). In Cursor cloud agents it is a Runtime Secret named `MODEL_API_KEY`. Empty means mock mode. |
| `USE_MOCK` | Set in `.env.local`. `true` forces mock data even when a key is present. If the key is missing, the app uses mock data anyway. `.env.example` ships this as `true`. |
| `LIVE_ACCESS_CODE` | A passcode you choose. Set it only in `.env.local` or the host's secret store. The server compares the form field to this value. If it is empty, live mode is off and every visitor gets mock data. Never put it in client code. |
| `BUDGET_LIMIT_USD` | Set in `.env.local`. The hard cap on estimated live spend, in US dollars. Blank means 120. `.env.example` sets `120`. Mock calls and cache hits are $0 and do not count. |
| `LIVE_RUNS_PER_HOUR` | Set in `.env.local`. How many live analysis runs the server may start per hour. Blank means 10. Mock runs do not count. |

The live spend ledger is `.data/spend.json` (gitignored, a number only, no key). A copy with the same contents is committed as `data/spend.json` so the total is visible. The hourly run log is `.data/live-runs.json` and stays gitignored. It stores timestamps only.

## Meta Model API

Base URL: `https://api.meta.ai/v1`. Auth: `Authorization: Bearer` using `MODEL_API_KEY`. The OpenAI SDK client is created in `lib/meta.ts` (`liveClient`).

Models:

- `muse-spark-1.3` — chat completions. `client.chat.completions.create` with `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Used for classification, brand summary, constraints, and (in the unfinished M5 helpers) concept copy and persona.
- `sam-3.1` — Responses API. `client.responses.create` with `stream: true`, `metadata: { mask_encoding: "one_bit" }`, and one user message whose content is `{ type: "input_text", text: phrase }` plus `{ type: "input_image", image_url, detail: "auto" }`. The stream is parsed with `@meta-sam/parser` (`parseImageStream`, then `recordsOfKind` for `box` and `mask`). Empty output is a real "no match". One noun phrase per call. SVG inputs are rasterized to PNG first (`lib/model-image.ts`); the API rejects `image/svg+xml`.
- `muse-image-1.0` — two paths. Demo stills use the Responses API: `client.responses.create({ model, input: prompt, store: false })` and read `image_generation_call`. That call does not take a size. The older mockup path uses `client.images.generate` (`/images/generations`) with `size: "1024x1024"`, `response_format: "b64_json"`, `output_format: "png"`.

List prices in `LIST_PRICES` (`lib/meta.ts`), cited there as the https://dev.meta.ai list rates:

- Muse Spark: $1.25 per 1M input tokens, $4.25 per 1M output tokens. The cap holds an estimate before the call, then settles to `usage`.
- SAM 3.1: $2.50 per 1,000 images ($0.0025 per call).
- Muse Image: $0.01 per image.

SAM phrases in `SEGMENT_PROMPTS` (`lib/taxonomy.ts`): `bag` (product), `person`, `words` (text overlay), `background` (setting), `green logo`. On the demo ads, `bag` is the reliable product phrase (`coffee bag` was used earlier for crops and sometimes missed). `person` matches when a person or a large arm is in frame. `words` misses the headline on some composited ads. `background` misses the setting on some ads. `green logo` is inconsistent across ads; a later pass found it more often, but do not treat a miss as "there is no wordmark". `green label` was used only to place type on the bag label (`brandLabel`); on ad 6 it matched the green phone screen, not the bag. Phrases that did not match in earlier probes: `white text`, `headline text`, `text`, `letters`, `logo`, `brand name`. Never invent a mask when SAM says no match.

Pages this repo cites (no other Meta doc pages were fetched into the tree):

- https://dev.meta.ai — list prices, referenced in `lib/meta.ts`
- https://api.meta.ai/v1 — API base, referenced in `lib/meta.ts` and `.env.example`
- https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/ — Andromeda, referenced in `README.md` and the page intro

## Project structure

- `app/page.tsx` — the one page
- `app/api/analyze/route.ts` — the only analysis route
- `components/lab-app.tsx` — form, results, per-ad view, cost line, why list, brief-conflict flags
- `components/coverage-map.tsx` — motivation × execution grid. Delivery (Static, Carousel, Video) is a badge. Top gaps are the only coloured cells.
- `components/coverage-story.tsx` — summary bar, counted from the classifications on screen
- `components/sam-crop-view.tsx` — bag mask, crop rectangle, coloured boxes from cached element masks
- `lib/meta.ts` — the only module that calls Meta. Prices, cache reads/writes, spend cap, `classifyAd`, `segmentImage`, `segmentRegions`, `summarizeBrand`, `extractConstraints`, `generateDemoStill`, plus unfinished `writeConceptCopy` and `writePersona`
- `lib/cache.ts` — request hash to `data/cache/<sha>.json` (demo, committed) or `.data/cache` (private, gitignored, currently empty)
- `lib/taxonomy.ts` — motivations, `EXECUTIONS`, `DELIVERIES`, `EXECUTION_FIT`, SAM phrases. Zod enums in `lib/schemas.ts` import these lists.
- `lib/gaps.ts` — `rankGaps` / `topGaps`, `offBrandMotivations`, `conflictQuote`. Rewritten in the interrupted batch (see status).
- `lib/smart-crop.ts` — `smartCrop` and `frameSubjects` for 4:5 and 9:16
- `lib/place-text.ts` — `placeText`. Wordmark stays top-left. Headline can move. `safeZone` is for Stories/Reels later.
- `lib/brand-label.ts` — `brandLabel(image, labelMask, name)`. Prints the name on the green label. Separate from the top-left pill. See status.
- `lib/wordmark.ts` — pill and headline overlay
- `lib/composite-ad.ts` — crop, overlay, contact sheets
- `lib/demo.ts` — Danish Coffee Lab copy and the eight ad paths
- `lib/brand-kit.ts` — bag, palette, photo style
- `public/demo/` — final ads, raw photos, masks, candidates, redo stills, `manifest.json`
- `docs/m3/prompts.md` — photo prompts. `docs/m3/final-ads.png` is the 8-ad sheet.
- `data/cache/` — committed model results. Filenames are hashes. No API keys.
- `data/spend.json` — snapshot of tracked spend (same number as `.data/spend.json`)

There is no database. An analysis stays in the browser until refresh. Retries: `retryCharged` and `withOneRetry` allow at most 2 attempts.

## Exact status

### Done (M0–M4 and the fixes that landed before this stop)

- M0–M1: one-page app, demo brand, mock analysis, coverage map, budget cap, access code, hourly limit.
- M2: live Muse Spark, SAM 3.1, and Muse Image, with cache.
- M3: eight visually different ads. Scenes: 1 bold price still, 2 three bags, 3 woman in a café with the bag, 4 doorstep, 5 gooseneck pour with the bag, 6 phone notification with the bag, 7 person in a kitchen with the bag, 8 Aarhus roastery with the bag. Wordmark pill is top-left, except ad 6, where it sits bottom-left so it clears the phone. Headlines use the same left inset as the pill and a full-width soft gradient. Ad 6 has a coded lock-screen card.
- M4: matrix columns are execution styles. Delivery is a badge. Muse Spark extracts exclusions and focus points. Ads 1 and 2 conflict with a discount exclusion. Summary bar counts motivations from the classifications. Why list is on the page. Empty cells have no "EMPTY" label.

### Done since the handoff

- Merged Codex `920c246` (`codex-920c246`, based on `4eb3588`). Kept the generalized ranking rules, the office-furniture regression in `scripts/validate-gaps.ts`, `scripts/audit-demo-cache.ts`, the `PLACE_ONLY` path in `scripts/m3-place.ts`, and `docs/review/cached-demo.md`. Kept the refreshed cache, the headline design, and the M5 files.
- The demo cache matches the current eight finals, the website text, and the brief. `npm run check:safety` passes. `scripts/refresh-demo-cache.ts` is the refresh. A headline restyle required a second refresh; both are committed.
- The lockup rebuild classified ad 7 as `Quality/performance` × `Lifestyle scene` again, so `Emotion/ritual` is an empty cell once more. The fixture in `check:gaps` still expects Emotion/ritual, Safety/trust, and Belonging as the top three.
- M5 briefs were rewritten so each motivation leads. The testimonial is labelled `Illustrative testimonial: replace with a real customer quote before use` in `docs/m5/briefs.md` and on the Safety/trust × Testimonial cell. A shared headline opening, or Aarhus/ristedato in more than one headline, is rejected by `lib/brief-rules.ts`.
- New stills are `public/demo/m5/1a.png` through `3c.png`. Mads picked **1a**, **2a**, and **3b**. The picks sheet is `docs/m5/contact-sheet-picks.png`. Waiting for design approval of the lockup. No persona, no 9:16 build, no before/after page.
- `renderLockup` in `lib/lockup.ts` draws one deep-green lockup for the 8 ads and the M5 mockups. The numbers are in `lib/lockup-config.ts`, including the 9:16 band (top 14%, bottom 35%). `SAM` phrase `hands` is the one that matches; `hand` is the fallback. `1b` has no clear corner. Ad 8, 2a, 2c, 3a, 3b, and 3c use the top-left. Ad 1, 2b, and 3c needed another crop. Layout QA is on the per-ad view and in `lib/layout-qa.json`. `npm run check:layout` checks it.

### Still open

- Ranking rewrite is in `lib/gaps.ts` and `lib/taxonomy.ts`. `components/coverage-map.tsx` leaves one-ad cells uncoloured. These were not re-checked in the browser after the stop.
- Mads picked M5 candidates **1a**, **2a**, and **3b**.
- `BRAND_LABEL_ENABLED` in `lib/brand-label.ts` is false. Nothing calls `brandLabel`. Every bag keeps the plain green block. The old rule that ads 3, 4, 5, 7, and 8 keep a printed name is gone.

### Left

Finish the interrupted ranking if a fresh `npm run check:gaps` or the live page disagrees with the rules below, then the rest of the plan.

Ranking rules (the intended behavior of `lib/gaps.ts`):

- At most one gap per motivation in the top 3.
- Prefer motivations with zero ads over a new execution of a motivation that already has ads.
- Boost a motivation when an extracted focus point matches it. "Ritual" maps to `Emotion/ritual` (renamed from `Emotion/nostalgia`).
- Off-brand motivations stay out of the gap list (`Status/identity` when exclusions mention status; `Fear of missing out` when they mention limited drops, scarcity, or FOMO).
- Execution for a gap comes from `EXECUTION_FIT` in `lib/taxonomy.ts` (first fitting style whose cell is empty), not from Danish Coffee Lab special cases.
- Each reason starts with `Hypothesis:` and must not predict performance.

Also left:

- Quiet one-ad cells are coded; confirm them in the browser.
- The printed bag name stays off (`BRAND_LABEL_ENABLED` is false).
- Hardcoding audit: conflict flags, off-brand rows, ranking, and the summary sentence must be driven by the brief, the website text, and model output. Demo files (`lib/demo.ts`, fixtures) may stay brand-specific. `lib/gaps.ts` still has general keyword rules (discount language, ritual → Emotion/ritual). Re-read those before calling the audit done.
- M5 after the picks: lock a, b, or c; Feed 4:5 and Reels 9:16; one AI persona whose images are labelled `AI-generated persona, fictional`; a before/after view; MD/PDF export.
- M6: deploy that serves the cached demo with no mock banner, plus passcode-gated uploads; README with the Andromeda link above and the no-performance-prediction principle; a submission checklist; a 2-minute click path; make the repo public only when asked.
- Generality test: run the same flow on a second brand and confirm nothing Danish Coffee Lab-specific is required for ranking, flags, or the summary sentence.

## Known issues

- `words` and `background` still miss elements that are visibly present on some ads. `green label` is not safe on ad 6.
- On ads 3 and 7 the wordmark stays top-left even when that corner meets hair. Ad 6's wordmark is bottom-left, under the headline, clear of the phone.
- The phone notification is axis-aligned. The phone in the photo is slightly tilted.
- Ad 6's latest classification calls the still Video, because of the phone. Delivery is only a badge.
- `scripts/validate-safety.ts` assigns the literal strings `test-key-not-used` and `owner-secret` as fake env values for tests. They are not credentials.

## Costs so far

Tracked spend in `.data/spend.json` and `data/spend.json`: **$4.5935105** of the $120 cap. The lockup pass spent about $0.25 on hands/face/head/bag masks and about $0.18 refreshing the eight final ads. Origin is the `origin` remote.
