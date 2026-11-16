# Review facade: implemented boundaries

This replaces the earlier target design with the behavior verified during the November 11
soundness recovery. Closed design beads did not establish the original audit outcome.

- CLI and MCP collect registered states through the core browser adapter. Raw TypeScript
  review calls need a caller-owned browser or observer for fresh collection.
- `start` registers states and collects observations. It does not crawl or discover journeys.
- `run` starts, writes a draft, and claims a packet. It does not execute claimed procedures.
- `next` claims one state for one agent, with expiring ownership and recovery after expiry.
- `observe` reads cached slices; browser-adapter refresh or setup collects fresh evidence.
- `judge` admits individually supported procedure assessments. A batch validates before
  appending; partial valid writes after interruption are recovered through status/reassessment.
- `report` renders HTML, JSON and Markdown. Completeness is checked independently of labels;
  excluded scope and known scope gaps remain disclosed. No EARL/SARIF export is promised here.
- Template members remain independent. Judgment reuse is disabled. Optimize collection and
  transport only after measuring equivalent workloads and unchanged accepted coverage.
- Older screenshots, verdicts and receipts are historical. Never manufacture newer receipts
  to reinstate them. Current collector version changes require fresh collection.

The executable contracts live in contracts, review, verdict and report packages. The shipped
`a11ied` skill documents the supported flags and the assessment workflow. The soundness
regressions cover actual CLI/MCP browser collection, admission rejection, and finalization.
