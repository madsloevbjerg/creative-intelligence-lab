# Creative Intelligence Lab

A small web app for advertisers. It shows which creative ideas are already in a Meta ad portfolio, and which motivation-and-format combinations are missing.

It maps coverage. It does not predict results, scores, or click-through.

Meta's next-gen Andromeda scores every eligible ad and encodes ad content together with its serving context, while the pool of ads keeps growing with generative AI. Variations of the same idea compete in a crowded pool. This tool maps which distinct ideas are missing.

Source: [Meta Engineering, Andromeda](https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/)

The cached demo runs with no API key. Live mode is optional and passcode-gated.

## Run it locally

You need Node.js 22, or at least 20.17. The `.nvmrc` file says `22`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No API key is required. If `MODEL_API_KEY` is missing, the app stays in mock mode and still runs.

To check that the project builds:

```bash
npm run build
```

To check that the demo labels match the expected format:

```bash
npm run check:mock
```

## Try milestone 1

1. Start the app with `npm run dev`.
2. Click **Load demo data**. That fills in the fictional coffee brand Danish Coffee Lab: website text, a campaign brief, and 8 ads.
3. Click **Analyze coverage**.
4. Read the brand summary. The “Why” line says what the summary was taken from.
5. Look at the grid. Rows are motivations, columns are formats. Empty cells have no ad. Thin cells have one. The 8 demo ads sit in only three motivations, so most of the grid is empty.
6. Hover or click an ad thumbnail. The panel above the grid shows why that ad was placed there.

You can also paste your own website text, or enter a public website URL, and upload 5 to 20 ad images with a headline and primary text.

## Mock mode and a real key

Copy `.env.example` to `.env.local` if you want to set variables. `.env.local` is gitignored.

- Leave `MODEL_API_KEY` empty to use mock data.
- `USE_MOCK=true` forces mock data even if a key is present.
- A live call happens only when a key is set and `USE_MOCK` is not true. Milestone 1 does not require that, and the demo does not make a live call.
- `BUDGET_LIMIT_USD` caps estimated live spend. Leave it blank for $120. The running total is stored in `.data/spend.json`, which is gitignored. Cache hits cost $0. Saved demo results live in `data/cache/`, which is committed and contains no secrets.
- `LIVE_ACCESS_CODE` is the passcode for live model calls. If it is empty, live mode is off. Visitors can still use the demo. The code is checked only on the server.
- `LIVE_RUNS_PER_HOUR` limits how many live analysis runs the server may start per hour. Blank means 10. Mock runs do not count.
- A run accepts at most 20 images, 5 MB each, and at most 5 concept briefs and 5 mockups.

## How to test the cost line and the budget cap

Mock calls cost $0. After you analyze the demo, the page shows a line like:

`Estimated API cost this run: $0.00 · from cache: $0.00 · total: $0.00 of $120 budget`

Under it: “Estimate based on Meta's list prices.”

The prices in `lib/meta.ts` are Muse Spark $1.25 per 1M input tokens and $4.25 per 1M output tokens, SAM 3.1 $2.50 per 1,000 images ($0.0025 per call), and Muse Image $0.01 per image. Spark’s real charge uses the `usage` field from the response. Before that response arrives, the cap checks a rough token estimate so a call that would not fit is refused and not sent.

To check the math and the cap without a model key:

```bash
npm run check:budget
```

To see the refusal in the app, put a tiny cap in `.env.local`, set a real `MODEL_API_KEY`, set `USE_MOCK=false`, and set `LIVE_ACCESS_CODE` to a private passcode. Restart `npm run dev`. Type that code in **Enter access code for live mode**, then analyze. The next live call that would pass the cap stops, and the page shows the budget error. Delete `.data/spend.json` to reset the total. With no key, or with the code left blank, the demo stays at $0.

## How to test the public-link safeguards

The page has a field labeled **Enter access code for live mode**. Leave it blank and analyze the demo. The result stays in mock mode.

```bash
npm run check:safety
```

That checks four rules without calling a model:

1. With no `LIVE_ACCESS_CODE`, live mode stays off even if a key and a code are present.
2. A blank or wrong code stays on mock data. The matching code is the only one that unlocks live mode, and the check does not print the code.
3. With `LIVE_RUNS_PER_HOUR=2`, the third live run is refused and the log still has two runs.
4. A run can make 5 briefs and 5 mockups. The sixth is refused. An image over 5 MB is over the limit. The default budget is still $120.

To try the field yourself once a key is configured: leave the code blank and confirm the note says mock data was used. Then enter the wrong code and confirm it still does not call the models. Then enter the real code. If the hour already has 10 live runs, the page says live analysis is paused and tells you the demo still works with a blank code. Delete `.data/live-runs.json` to clear that hourly log.

## M2 smoke test

When `MODEL_API_KEY` is set, this makes one SAM call (`coffee bag` on demo ad 1), one Muse Spark classification, one Muse Spark brand summary, and one Muse Image test frame. A second run should be cache hits at $0.

```bash
npm run m2:smoke
```

If the key is missing, the command stops and does not call the API.

## What it does

It places each ad on a motivation-by-execution grid, names the empty cells, and shows three new concepts for the biggest gaps. The before/after view compares the eight existing ads with those concepts, in Feed 4:5 and Reels 9:16. Concept 2 is “The one thing we agree on,” with the headline “We argue about everything. Except the coffee.” Sofie’s still is labelled AI-generated persona, fictional. Nothing on the page is a forecast.

## How the Meta models are used

- Muse Spark writes the brand summary, the constraints, the classification, and the concept briefs.
- SAM 3.1 finds the bag, the person, the face, the head, and the hands. Those masks drive smartCrop, the lockup position, and layout QA.
- Muse Image makes the ad photographs and the concept mockups, including the fictional creator still.

## Design rules and layout QA

`lib/lockup-config.ts` holds the lockup: one deep-green rounded rectangle, a small uppercase wordmark, and the headline. The headline is at least 5% of the image width. The wordmark is at least 2.2%. The box stays within 6% of the edges, at most 72% wide, and off the face, head, hands, and bag. On 9:16 the lockup stays out of the top 14% and the bottom 35%, and the bag stays out of the bottom 35%. Hands, people, the table, and the background may enter that lower band. This follows Meta's guidance to keep text and key information out of the Reels interface zones. Lines break after a sentence when there is one, prefer two lines, and do not leave a single word alone. `npm run check:layout` checks every demo creative and fails if one breaks a rule. The per-ad view shows a Layout QA line.

## Cost of a full run

The tracked total in `data/spend.json` is the sum of the real calls made while building this demo, not a quote for a future run. Cache hits are $0. List prices in `lib/meta.ts` are Muse Spark $1.25 per 1M input tokens and $4.25 per 1M output tokens, SAM 3.1 $0.0025 per image, and Muse Image $0.01 per image.

## Copy language

`lib/copy-language.ts` sets the demo to English (`en`). Danish (`da`) strings for the three concepts are in the same file. The eight existing ad headlines stay in English and keep kr.

## Classifications

Classifications are cached so the demo replays the same labels. A borderline ad can be classified differently if the pixels change and the call is made again. Ad 7 is pinned to Emotion/ritual so the gaps the concepts were built from do not move. Every ad has a why line for that reason.

## What is in the repo

- `app/page.tsx` — the one page
- `components/lab-app.tsx` — the form and the results
- `components/coverage-map.tsx` — the motivation × format grid
- `app/api/analyze/route.ts` — the server route that runs an analysis
- `lib/taxonomy.ts` — the only list of motivations, formats, and segment phrases
- `lib/schemas.ts` — the zod checks for every model response
- `lib/meta.ts` — the only place that can call Meta’s models, plus prices, cache, and the budget cap
- `lib/mock.ts` — fake but checked results for demos without a key
- `lib/demo.ts` — Danish Coffee Lab copy
- `lib/brand-kit.ts` — bag, palette, and photo style for the demo photographs
- `data/cache/` — saved real model results for the demo, replayed at $0
- `public/demo/` — original SVG ad placeholders, plus 24 candidate photographs in `candidates/`
- `docs/m3/` — contact sheets and the full prompt for each candidate. A pick per ad is still open.
- `scripts/validate-mock.ts` — checks the demo labels

There is no database. The analysis stays in the browser until you refresh the page.
