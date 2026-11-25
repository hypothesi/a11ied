---
'a11ied': patch
---

`a1 doctor` now says how to fix a missing ffmpeg for Windows recording. When npm skipped
the `ffmpeg-static` install script, for example with `--ignore-scripts`, the check names
`npm approve-scripts ffmpeg-static` and `npm rebuild ffmpeg-static`.
