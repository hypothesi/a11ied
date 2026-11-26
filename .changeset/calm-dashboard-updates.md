---
'a11ied': minor
---

`a1 audit dashboard` has a new layout: a status badge, one bar for done, working, blocked,
and queued units, findings by severity, criteria by result, and done counts per page and
per test pass. It updates in place every five seconds instead of reloading, so selected
text, focus, and scroll position are kept, and **Pause updates** stops it. When the server
stops, the page keeps the last update on screen and says the connection was lost.
