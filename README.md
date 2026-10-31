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

## What is in the repo

- `app/page.tsx` — the one page
- `components/lab-app.tsx` — the form and the results
- `components/coverage-map.tsx` — the motivation × format grid
- `app/api/analyze/route.ts` — the server route that runs an analysis
- `lib/taxonomy.ts` — the only list of motivations, formats, and segment phrases
- `lib/schemas.ts` — the zod checks for every model response
- `lib/meta.ts` — the only place that can call Meta’s models
- `lib/mock.ts` — fake but checked results for demos without a key
- `lib/demo.ts` — Bønne & Co copy
- `public/demo/` — original SVG ad placeholders (drawn for this project)
- `scripts/validate-mock.ts` — checks the demo labels

There is no database. The analysis stays in the browser until you refresh the page.
