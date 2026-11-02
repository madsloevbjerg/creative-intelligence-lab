# Cached demo review

No live Meta calls were made. All model-dependent checks used committed cache or mock data.

## Validation

`lint`, `check:mock`, `check:budget`, `check:crop`, `check:text`, `check:gaps`, `build`, and `tsc --noEmit` pass. `check:safety` runs but fails exactly its complete committed-demo replay assertion. Completing that assertion needs the calls below, so that repair was skipped rather than fabricating results or weakening the assertion. The other safety assertions pass.

## Placement

Ads 1, 2 and 6 were regenerated without printed labels. Ad 1 uses its clean approved candidate; ad 2 uses its clean raw photograph from commit 8a9f248 (before label printing); ad 6 uses its clean approved phone candidate and cached phone mask. Raw photos and finals are updated. Ads 3, 4, 5, 7 and 8 remain byte-for-byte unchanged. The contact sheet was regenerated and visually checked.

`PLACE_ONLY=1` now bypasses all model calls even if a key is injected, only rebuilds the three rejected label placements, and preserves the other five finals. It no longer writes to a machine-specific /opt path. Run from the repository root:

```sh
PLACE_ONLY=1 USE_MOCK=true npx tsx --tsconfig scripts/tsconfig.budget.json scripts/m3-place.ts
```

## Hardcoding audit

Coverage counts and shares come from displayed classifications; removed the unverified assertion that every uploaded ad is visually different. Conflict and off-brand decisions use extracted exclusions, and ranking uses extracted focus points and classifications. No demo exclusions are merged into live constraints. Keyword mapping remains a general, limited heuristic, not semantic understanding: it can miss synonyms and cannot resolve arbitrary negation inside copy. Currency/free-offer matching treats explicit price promotions conservatively when discount offers are excluded.

Removed coffee-specific roast terminology and “free bag” matching from the shared rules. Quality mapping now includes durability and craftsmanship; the explanation quotes the actual extracted focus. Added office-furniture regression checks for quality focus, free-product exclusions and absent exclusions.

Top gaps remain Emotion/ritual × Lifestyle scene, Safety/trust × Testimonial, Belonging/social proof × Person/UGC. The rules give unused motivations 100 points and focus matches 40, exclude off-brand motivations, select the first unoccupied EXECUTION_FIT execution, and allow one result per motivation. Taxonomy order breaks ties; reasons remain hypotheses without performance predictions.

## Pending live calls

Read-only, repeatable audit (does not invoke model adapters):

```sh
npx tsx --tsconfig scripts/tsconfig.budget.json scripts/audit-demo-cache.ts
```

For **each of dcl-03, dcl-04, dcl-05, dcl-07, dcl-08**:

- SAM 3.1: `bag`, `person`, `words`, `background`, `green logo` (25 calls total).
- Muse Spark `classifyAd` after those masks return (up to 5 calls; exact cache keys depend on the returned masks).

Also Muse Spark `summarizeBrand` and `extractConstraints`, each once for the current website text and brief. No image generation, green-label segmentation, or calls for ads 1, 2 and 6 are needed. Do not rekey old results onto changed image bytes.

Estimated cost: SAM is exactly $0.0625 for 25 successful calls. Budget approximately $0.05 for seven Spark calls assuming 2,000 input tokens and 1,000 output tokens each ($0.04725 at the repository rates), or about **$0.11 total**, excluding retries. Actual Spark image/token usage can differ; allow $0.15 provisionally rather than treating this as a cap or quote. No spend was incurred in this task.
