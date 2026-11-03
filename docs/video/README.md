# Corrected design-refresh recordings

The inspector is non-sticky. All five section headings were checked with an ad inspector open; each is unobscured (section-validation.json).

Capture: system Chromium, Playwright viewport 1280×720, deviceScaleFactor 1.5, explicit Emulation.setDeviceMetricsOverride with the same dimensions/density. The exact Page.startScreencast request (maxWidth 1920/maxHeight 1080) still returned 1280×720, so recording uses a fresh browser context and a page.screenshot loop targeted at 15 fps. No screencast surface or custom screenshot clip is active during recording. Each clip waits for document.fonts.ready and image load/decode first. Native 1920×1080 captures are verified and normalized if needed. Uniform blank captures are discarded. Frame timestamps determine durations; delays hold the preceding valid frame. System ffmpeg encodes H.264 / CRF 18 / veryfast / 30 fps / yuv420p / faststart. Clip F has a final still hold exceeding three seconds.

Production analysis returned eight cached ads with a blank access code and no model key. No live calls, creative changes or Layout QA changes were made.

| Clip | Duration |
| --- | ---: |
| clip-A | 17.10s |
| clip-B | 32.97s |
| clip-C | 20.10s |
| clip-D | 22.73s |
| clip-E | 22.07s |
| clip-F | 17.03s |

Validation: 132 full-resolution frames were extracted at one-second intervals across all six clips. Every sample passed size (1920×1080), background (<95%) and content-width (≥80%) checks. Actual minimum content width is 94.37%; maximum background fraction is 85.55%. See frame-validation.json and contact-sheet.png. Background fraction measures the modal background RGB within ±2; content bounds use pixels differing substantially from paper (ignoring the faint grid). Lint and the production build pass.

Five refreshed key screenshots: summary-bar.png, coverage-map.png (full native-resolution table), sam-view.png, briefs.png and before-after.png. Reusable capture and validation scripts are in tools/. They use the production server at http://127.0.0.1:3170. Source frames are retained locally at /tmp/design-refresh-fixed-frames; per-clip timestamps are in capture-timing/.
