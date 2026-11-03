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

- The eight ads, the three picked concepts, and Sofie use one deep-green lockup (`lib/lockup.ts`, numbers in `lib/lockup-config.ts`). Brand labels stay off (`BRAND_LABEL_ENABLED` is false).
- Ad 7 is pinned to Emotion/ritual × Lifestyle scene × Static in `lib/pinned-classification.ts`, so the summary stays at 4 of 10 motivations.
- Concept 2 is **The one thing we agree on**. The headline is “We argue about everything. Except the coffee.” The picked still is `v2-b` (`public/demo/m5/2a.png`). `c2-a` remains the fallback with “We share everything. Except this.”
- Real 9:16 generations, not crops of the 4:5 stills: `1a-916`, `2a-916`, `3b-916`, and `persona-916`. The bag sits in the middle. The lockup sits above it, outside the top 14% and the bottom 35%.
- Sofie is the fictional persona. Every surface that shows her says `AI-generated persona, fictional`. Her script is in `docs/m5/persona.json`.
- `npm run check:layout` reads `lib/layout-qa.json`, requires the 8 ads, the 3 concepts at 4:5, the 3 concepts at 9:16, and the persona, and also checks every other saved record. A 9:16 bag, face, head, hand, or cup mask fails when more than 2% of that mask is in the bottom 35%. The command prints a pass table.
- The before/after view and `docs/m5/export.md` use the new concept 2. The click path is `docs/demo-click-path.md`.

### Still open

- `BRAND_LABEL_ENABLED` stays false. Do not print a name on the bag.
- One-ad cells on the coverage map are uncoloured. Confirm that in the browser if the ranking display is touched again.

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
- M5 picks, 9:16 frames, the persona, the before/after view, and the Markdown export are in the repo.
- M6: deploy that serves the cached demo with no mock banner, plus passcode-gated uploads. The README, the Andromeda link, and `docs/demo-click-path.md` are already in the repo. Make the repo public only when asked.
- Generality test: run the same flow on a second brand and confirm nothing Danish Coffee Lab-specific is required for ranking, flags, or the summary sentence.

## Known issues

- `words` and `background` still miss elements that are visibly present on some ads. `green label` is not safe on ad 6.
- On ads 3 and 7 the wordmark stays top-left even when that corner meets hair. Ad 6's wordmark is bottom-left, under the headline, clear of the phone.
- Ad 6's notification follows the tilted screen. Its classification is pinned to Convenience/time × Lifestyle scene × Static.
- `scripts/validate-safety.ts` assigns the literal strings `test-key-not-used` and `owner-secret` as fake env values for tests. They are not credentials.

## Costs so far

Tracked spend in `.data/spend.json` and `data/spend.json`: **$6.27232725** of the $120 cap. That figure is the sum of the calls made to build the demo. On 9:16 only the bag and the lockup must stay out of the bottom 35%, and the lockup must stay out of the top 14%. Hands and the table may enter the lower band. Concept 2 uses the same inner padding as the other lockups. At 5% type and a 72% box the first sentence wraps, so the 4:5 lockup reads “We argue / about everything. / Except the coffee.” Twelve new vertical candidates put the bag into the bottom 35%, so the published 9:16 frames stay the ones that pass. Ad 7 is pinned to Emotion/ritual. Ad 6 is pinned to Convenience/time. The click path is `docs/demo-click-path.md`. Origin is the `origin` remote.

## Remaining for Mads

1. Make the repo public when you want it public.
2. On Vercel, set `MODEL_API_KEY` (secret), `USE_MOCK=false` for live mode, `LIVE_ACCESS_CODE` to a passcode you choose, `BUDGET_LIMIT_USD=120`, and `LIVE_RUNS_PER_HOUR=10`. With no key, the cached demo still serves.
3. Deploy.
4. Submit.

Vercel, with no key, serves the cached demo. For live mode set `MODEL_API_KEY` (secret), `USE_MOCK=false`, `LIVE_ACCESS_CODE` (a passcode you choose), `BUDGET_LIMIT_USD=120`, and `LIVE_RUNS_PER_HOUR=10`.
