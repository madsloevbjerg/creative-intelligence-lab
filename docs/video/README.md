# Design refresh recordings

System Chromium + Playwright; viewport 1280×720, device scale 1.5. CDP screencast events trigger native 1.5-scale CDP screenshot frames (verified 1920×1080). System ffmpeg encodes H.264, CRF 18, preset veryfast, 30 fps, yuv420p and faststart. Capture timestamps are in capture-timing/; raw frames are retained locally at /tmp/design-refresh-source-frames. No browser or ffmpeg download was needed.

Production build served with no model key and blank access code; analysis returned eight cached ads. Cursor dot, eased scrolling and pauses retained. Clip F ends with a still hold longer than three seconds. Clip B runs longer to show all eight ads. The separate Concepts gallery prioritizes Feed 4:5; existing 9:16 creatives remain alongside it. No live model calls were made.

| Clip | Duration |
| --- | ---: |
| clip-A | 17.233333 s |
| clip-B | 33.700000 s |
| clip-C | 20.200000 s |
| clip-D | 21.200000 s |
| clip-E | 22.233333 s |
| clip-F | 17.233333 s |

Key screenshots: summary-bar.png, coverage-map.png (complete native-resolution table), sam-view.png, briefs.png and before-after.png. Before/after design captures and comparison are in ../design/.
