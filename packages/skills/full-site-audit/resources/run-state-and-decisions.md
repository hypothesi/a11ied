# Run state and decisions

The installed CLI help and MCP schemas define supported inputs. In the repository,
field contracts live under `packages/contracts/src/schemas/`: `audit-run.ts`,
`audit-assessment.ts`, `assessment.ts`, `evidence.ts`, and `discovery.ts`.

## Environment and start inputs

Environment JSON records observations. This minimal example declares no capability
until the host agent verifies it:

```json
{
   "environmentId": "desktop-browser",
   "platform": "voiceover",
   "os": "macOS",
   "browser": "Chrome",
   "capabilities": [],
   "limitations": ["Reader and browser capabilities have not been verified."]
}
```

Use `voiceover`, `nvda`, or `virtual` for `platform`. Capability values include
`rendered-ui`, `keyboard`, `real-reader`, `dom`, `native-tree`, `screenshot`,
`speech`, `audio`, `product-context`, `pointer`, `viewport`, `style-overrides`,
`measurement`, `markup-validation`, and `motion-input`. Declare only verified values.
An existing environment cannot be replaced. If capability observations change,
start a distinct run rather than editing its environment or claiming unsupported
work passed.

`audit run` accepts `--environment`, `--scope`, `--wcag`, `--level`, `--inventory`,
`--run`, `--id`, and `--policy`. Web defaults are WCAG 2.2 AA and site scope.
App scope defaults to `app`. Use `--scope` consistently with discovery.
Environment or policy input can use stdin `-`; two inputs cannot both consume stdin.

With an inventory, omit `--id` unless it matches discovery's run ID. Startup links
the inventory and creates or recovers its compatible coordinator. Conflicting
profile, environment, target, policy, or ownership inputs fail without replacing
an existing run. Do not use startup to change authorization on a saved coordinator.

CLI JSON responses wrap the assessment under `result`. MCP `audit_assessment`
returns the equivalent structured result. Record its `file`, `evidenceFile`, and
`artifactsDir`; do not reconstruct paths from a timestamp or run ID.

## State and journey inputs

Example state input, filled from an actual observation:

```json
{
   "stateId": "home-menu-open",
   "target": { "kind": "url", "value": "https://createdbyfireside.com/" },
   "label": "Home with navigation menu open",
   "fingerprint": "<hash-of-current-observed-structure-and-state>",
   "environmentId": "desktop-browser",
   "artifacts": ["artifacts/home-menu-observation.json"],
   "setup": ["Open the homepage.", "Activate the navigation trigger."]
}
```

Do not copy the fingerprint placeholder into a real run. The runtime assigns
`revision` and `observedAt`; callers omit them. A fingerprint must distinguish
materially different control/content states. Preserve URL hash routes when they
identify different screens.

Journey input contains `journeyId`, `label`, ordered `stateIds`, and `status`:
`discovered`, `completed`, or `blocked`. A blocked journey includes a specific
`reason`. Use one environment per journey. Observe every step; a completed label
alone cannot satisfy its procedure obligations.

Discovered and blocked journeys remain incomplete even when their checks are
evaluated. A changed constituent state revokes completed traversal. Changing the
ordered steps also resets an incoming completed label to discovered. After saving
the changed steps, traverse them before registering completion again. An identical
state observation preserves completion; a state change preserves blocked reasons
until explicit recovery.

State/journey/queue responses return mutation identities even outside the first
status page. Status defaults to 20 entries and allows limits up to 100. Follow
`nextOffset` through states, journeys, progress, and issues. For a site check,
collect every state in its environment. For other checks, preserve the check's
ordered `stateIds`.

## Evidence and acceptance

Always pass the returned evidence path explicitly. `--run` alone does not select
the run's evidence file; otherwise recording defaults to the global evidence log.

```bash
a1 audit record https://createdbyfireside.com/ --run <run-file> \
   --results <evidence-file> --wcag 2.2 --criterion <criterion-id> \
   --procedure <procedure-id> --outcome <outcome> --mode semiAutomatic \
   --provenance <provenance-file> --by <agent-name> --json
a1 audit evaluate <run-file> --check <check-id> --outcome <outcome> \
   --evidence <saved-evidence-id> --json
```

MCP uses `record_result` with `runFile`, `resultsFile`, structured `provenance`, and
optional `finding`. Then use `audit_assessment` with `action: "evaluate"`, `file`,
`checkId`, `outcome`, and `evidenceIds`.

Provenance requires version `1`, run/check IDs, the claimed `attempt`, WCAG/procedure versions,
environment ID, ordered current state references, actor, source, artifacts, and
rationale. Copy `attempt` from the claimed check's `attempts` value, not a guessed counter. A state reference contains `stateId`, `revision`, and `fingerprint`.
An agent actor uses `{ "kind": "agent", "name": "<agent-name>" }` and evidence
mode `semiAutomatic`.

Collection sources are `browser`, `native`, `real-reader`, `virtual`, and `user`.
Use actual session identity for reader evidence. Virtual output cannot satisfy a
procedure requiring `real-reader`. A note alone remains unverified.

Each artifact contains its kind, path relative to the run directory, SHA-256 hash,
and actual capture timestamp. Register paths on the observed states. Capture after
both the current state observation and the current attempt start. Artifact bytes
must match their hash. Do not fabricate dates to make older evidence pass.

Non-image artifacts use a version `1` envelope with matching run, environment,
source, session, state references, claimed `attempt`, capture time, kind, and typed `content`:

- `observation`, `product-context`: nonempty text or `{ "text": "..." }`.
- `speech`: nonempty text for other sources. For `real-reader`, use
  `{ "text": "...", "transcript": { ... } }`. Preserve the driver export session ID,
  native reader target, URL, timestamps, and relevant entries. Text must match the
  non-checkpoint phrases joined with newlines.

* `measurement`: values with units and measurement methods.
* `media`: a transcript and source.
* `action-trace`: ordered action receipts with index, action, time, and state ID.

Action receipts must cover the declared inclusive `actions.start`/`end` range.
A checkpoint must appear inside that range. Preserve typed driver `request`
receipts when available; APG keyboard checks require a documented keypress.
Screenshots are actual PNG bytes, not JSON envelopes. A raw CLI transcript export
is not automatically an assessment artifact; preserve its original data and wrap
its relevant observed content with current identity metadata.

The host agent creates these artifacts from actual tool observations. Runtime
validation checks identity, freshness, structure, and completeness of references.
Old evidence records and non-image envelopes cannot satisfy a different attempt.
A raw screenshot has no embedded attempt identity; current provenance and required
non-image artifacts establish its collection context. Saved provenance without an
attempt generation needs reassessment. Never relabel older proof with the new
attempt number. Imported receipts depend on the collector reporting actual observations. Validation
checks correlation, but does not prove collector honesty or correct WCAG judgment.

For a failure, add `--finding <file>` or MCP `finding` with `title` and `userImpact`.
Include remediation and severity only when supported. Omitted severity appears as
not assessed. An accepted behavioral failure remains visible even if a scan is
missing; missing coverage still blocks completion.

## Recovery

```bash
a1 audit status <run-file> --offset 0 --limit 20 --json
a1 audit block <run-file> --check <check-id> --reason '<specific blocker>'
a1 audit resume <run-file> --json
a1 audit resume <run-file> --retry <check-id> --json
```

Inspect the UI and restore a safe state before the explicit retry. The first
resume preserves an interrupted active check as blocked. A completed valid check
cannot be retried. A changed state requires fresh observation and evidence.

If native focus or speech belongs to another window, stop sending input. Restore
the intended target and verify it before retrying. Use the procedure's recovery
instructions; do not infer success from empty speech or an unrelated screenshot.

## Authentication and private artifacts

Reuse previously granted artifact consent. If private content needs capture and
consent is missing, explain what the files contain and request that decision.
If authentication is required, use an existing authorized session or a user login
inside the controlled browser. Never request passwords, cookies, or tokens in chat.

For storage-state capture, use Playwright's headed codegen and pass only the local
path to discovery and page scans. Do not print its contents. Storage state does
not include session storage or authenticate a separate native reader browser.
Keep a user-signed-in reader session open across the relevant pages. Delete only
credential artifacts created by this task unless retention was requested.

Site hints, if present, are hypotheses to recheck. They do not replace current
observations. Do not add a separate skill-owned progress database.

## Reports and completion

`audit finalize` validates complete coverage. `--partial` retains unresolved work
and leaves the run active. `cantTell`, unsupported capabilities, and discovery gaps
cannot be converted into completion by draining the queue.

`report build --draft` publishes available website results with unresolved coverage.
Without `--draft`, report building requires completed validated assessment data.
Use a dedicated output directory outside audit inputs. The manifest records file
hashes and assessment completion separately. Retry interrupted publication with the
same command; never change the inventory to force publication.

Native app report publication has no inventory-free bundle path. Preserve its run
and evidence, disclose the limitation, and retain the outstanding publication work.
