---
'a11ied': patch
---

`a1` commands start about three times faster. `a1 sr next` and the other session commands went from about 0.6 seconds to 0.2 seconds, because the CLI now loads Playwright, jsdom, axe-core, and pngjs only when a command uses them.
