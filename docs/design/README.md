# Creative Intelligence Lab — design refresh

The tool now has its own paper/ink/ultramarine palette, Instrument Serif editorial headings, IBM Plex Mono instrumentation, and a compact three-font wordmark. A faint grid, hairline rules, flat buttons and 2px corners replace the warm coffee palette and soft cards. Content uses a 1280px maximum width; the recording viewport fills that width. Coverage thumbnails are larger and the table has precise cell borders and quiet empty cells.

Sections are numbered 01 Input, 02 Analysis, 03 Coverage map, 04 Concepts, 05 Before / after. The existing concept creatives are also presented in a separate gallery with Feed 4:5 given more space than Reels 9:16. No creative assets, cached results, analysis/model code or Layout QA contents/calculations were changed. QA text is rendered in mono.

`before/` captures unchanged main; `after/` captures the refresh. Both use Chromium at viewport 1280×720 and device scale 1.5. `comparison.png` shows the header/input captures side by side at native resolution. `full-map.png` additionally preserves the complete table.

Validation: lint, check:mock, check:budget, check:safety, check:crop, check:text, check:gaps, check:phone, check:layout and production build pass. No live model calls were made. Primary white-on-ultramarine and near-black/grey text on paper are chosen for WCAG AA contrast; visible keyboard focus is retained.
