# Hackathon screen captures

Recorded from main commit `dec9ec37a31b212e4875403c33af5c34517f4f86` using the production build (`npm ci`, `npm run build`, `npm start -- --port 3100`). Analysis returned HTTP 200, mode `cached`, eight ads. The access code was blank; the production server had MODEL_API_KEY and LIVE_ACCESS_CODE cleared. No app code was changed and no live model calls were made.

Browser: existing `/usr/bin/chromium`, Chromium 154.0.8037.57. Playwright viewport 1920×1080, device scale factor 1. No browser download was attempted. Playwright recordVideo could not start because its ffmpeg-1011 binary was absent. Used CDP Page.startScreencast (JPEG quality 95, full 1920×1080), acknowledged frames with timestamps, then system ffmpeg 7.1.5: H.264, CRF 18, preset veryfast, 30 fps, yuv420p, faststart. Raw frames, timestamp manifests and concat input lists are retained under frames/.

| Clip | Duration | Content |
| --- | ---: | --- |
| A | 17.20 s | Intro and eased scroll to inputs |
| B | 32.20 s | Load demo, website, brief, eight ads, cached analysis |
| C | 20.20 s | Summary, coverage map/off-brand rows, conflict flags |
| D | 21.30 s | Ad 3, final/SAM toggles, crop frame and Layout QA |
| E | 22.20 s | Top gaps, three concept cards/creatives, brief Sofie focus |
| F | 17.27 s | Before/after section, final still longer than 3 s |

An 18 px dark cursor dot with a soft shadow was injected only into the recording browser. Pointer movement precedes clicks; scrolling uses cubic easing. Ad inspection shifts under hover; keyboard activation of the same thumbnail was used to pin it reliably. No application fix was needed.

Limitations: current main has three concept cards, not a separate text-brief section. `briefs.png` captures those cards. Feed 4:5 and Reels 9:16 are rendered side by side; recording preserves that layout, so the Reels versions remain visible with Feed instead of being limited to three seconds. Sofie receives only a brief dedicated focus. Clip B runs longer than its target to show all eight ads.

Screenshots: summary-bar.png, coverage-map.png (complete native-resolution table), sam-view.png, briefs.png, before-after.png; before-after-full.png additionally captures the complete section at native resolution. Viewport screenshots are 1920×1080. Full-section screenshots retain their native dimensions without downsampling.

`media-validation.json` records ffprobe checks for all six MP4s. No audio was recorded.
