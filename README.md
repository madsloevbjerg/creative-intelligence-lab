# Creative Intelligence Lab

A small web app for advertisers. It shows which creative ideas are already in a Meta ad portfolio, and which motivation-and-format combinations are missing.

It maps coverage. It does not predict results, scores, or click-through.

This repository is milestone 1: the input form, a demo brand, a mock analysis (no API key), and the coverage map. Concept briefs, image mockups, and export come later.

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
2. Click **Load demo data**. That fills in the fictional coffee brand Bønne & Co: website text, a campaign brief, and 8 ads.
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
- `BUDGET_LIMIT_USD` caps estimated live spend. Leave it blank for $100. The running total is stored in `.data/spend.json`, which is gitignored.
- `LIVE_ACCESS_CODE` is the passcode for live model calls. If it is empty, live mode is off. Visitors can still use the demo. The code is checked only on the server.
- `LIVE_RUNS_PER_HOUR` limits how many live analysis runs the server may start per hour. Blank means 10. Mock runs do not count.
- A run accepts at most 20 images, 5 MB each, and at most 5 concept briefs and 5 mockups.

## How to test the cost line and the budget cap

Mock calls cost $0. After you analyze the demo, the page shows a line like:

`Estimated API cost this run: $0.00 · total: $0.00 of $100 budget`

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
4. A run can make 5 briefs and 5 mockups. The sixth is refused. An image over 5 MB is over the limit. The default budget is still $100.

To try the field yourself once a key is configured: leave the code blank and confirm the note says mock data was used. Then enter the wrong code and confirm it still does not call the models. Then enter the real code. If the hour already has 10 live runs, the page says live analysis is paused and tells you the demo still works with a blank code. Delete `.data/live-runs.json` to clear that hourly log.

## What is in the repo

- `app/page.tsx` — the one page
- `components/lab-app.tsx` — the form and the results
- `components/coverage-map.tsx` — the motivation × format grid
- `app/api/analyze/route.ts` — the server route that runs an analysis
- `lib/taxonomy.ts` — the only list of motivations, formats, and segment phrases
- `lib/schemas.ts` — the zod checks for every model response
- `lib/meta.ts` — the only place that can call Meta’s models, plus the price list and budget cap
- `lib/mock.ts` — fake but checked results for demos without a key
- `lib/demo.ts` — Bønne & Co copy
- `public/demo/` — original SVG ad placeholders (drawn for this project)
- `scripts/validate-mock.ts` — checks the demo labels

There is no database. The analysis stays in the browser until you refresh the page.
