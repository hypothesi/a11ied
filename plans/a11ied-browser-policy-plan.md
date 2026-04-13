# a11ied system-browser-first Playwright policy: implementation plan (v0.1.0 - 2026-04-11)

## Summary

Change browser-backed automation so a11ied prefers Chromium-family browsers already present on the machine, falls back to Playwright's bundled Chromium when available, and only asks the user to install a Playwright browser when no usable browser is found.

## Objectives & scope

- In scope: browser detection, Playwright launch policy, doctor output, docs updates, automated tests, manual CLI exercise, and bead tracking.
- Out of scope: adding Firefox or WebKit parity for this policy, changing VoiceOver or NVDA driver behavior, or making Playwright browser selection a public CLI option in this slice.

## Assumptions & open questions

- Assumptions: a Chromium-family browser is enough for the current browser-backed runtime features; Playwright-managed Firefox and WebKit remain explicit follow-up work; Chrome and Edge should use Playwright channels when available.
- Open questions: none.

## Requirements

### Functional

- FR-1: Browser-backed runtime code must prefer existing system-installed Chromium-family browsers before trying Playwright-managed Chromium.
- FR-2: Browser detection must recognize common Chrome, Edge, Brave, and Chromium installs on macOS, Linux, and Windows.
- FR-3: Browser detection must recognize an existing Playwright-managed Chromium install before asking the user to install anything.
- FR-4: If no usable browser is found, runtime failures must tell the user to run `npx playwright install chromium`.
- FR-5: `doctor` must report the browser automation policy, detected browser candidates, the preferred launch target, and the fallback install command.
- FR-6: Docs must explain the new policy in plain language and show the exact fallback install command.

### Non-functional

- NFR-1 (Performance): Browser detection should be cheap enough to run on every browser-backed command without becoming the main source of latency.
- NFR-2 (Security): Detection must stay local. Do not phone home or mutate system browser installs.
- NFR-3 (Observability): Tests must pin launch-order behavior, failure messages, and doctor output.
- NFR-4 (Maintainability): The launch policy must live in one shared browser module instead of being duplicated across axe and pattern code.

## Architecture & design overview

- Keep Playwright as the browser automation layer.
- Add one browser-policy module under `packages/core/src/browser/` that:
   - detects installed browsers
   - chooses the preferred Chromium-family launch target
   - returns a concrete Playwright launch config
   - returns structured doctor data
- Prefer launch order:
   1. installed Chrome via Playwright `channel: 'chrome'`
   2. installed Edge via Playwright `channel: 'msedge'`
   3. installed Brave via `executablePath`
   4. installed Chromium via `executablePath`
   5. Playwright-managed Chromium if already installed
   6. fail with a clear install message
- Update the shared browser helper so all current browser-backed runtime paths inherit the policy automatically.
- Extend the doctor report schema so CLI and docs can surface the same browser policy details.

## Task grid

| Status | ID    | Task                                          | Priority | Depends On | Acceptance Criteria                                                                                                                                   |
| ------ | ----- | --------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [✓]    | BR-01 | Implement browser detection and launch policy | H        | —          | Shared browser runtime prefers installed browsers, falls back correctly, tests exist, manual CLI exercise is recorded, and `npm run standards` passes |
| [✓]    | BR-02 | Surface the policy in doctor, help, and docs  | H        | BR-01      | Doctor output and docs explain the policy and install fallback, tests exist, built surfaces are manually exercised, and `npm run standards` passes    |
| [✓]    | BR-03 | Reconcile plan, tracker, and release truth    | M        | BR-02      | Plan docs, traceability, manual evidence, and tracker state agree on what shipped, and `npm run standards` passes                                     |

## Task details

### BR-01 - Implement browser detection and launch policy

**Goal:** Make every browser-backed command prefer existing local browsers before asking for a Playwright download.

**Step-by-step instructions:**

1. Add a shared browser-policy module under `packages/core/src/browser/`.
2. Detect common Chrome, Edge, Brave, and Chromium installs on macOS, Linux, and Windows using stable local path checks and path lookup where appropriate.
3. Detect whether Playwright-managed Chromium is already installed.
4. Return one preferred launch target using the defined launch order.
5. Update the shared Playwright helper so axe and browser-backed pattern probes all use the new policy automatically.
6. Fail with a deterministic environment error when no usable browser is found, and include `npx playwright install chromium` in the error details.
7. Add automated tests for detection, launch selection, and the no-browser failure path.
8. Manually exercise the built CLI against a real local URL and record the commands and observations under `specs/manual-runs/BR-01/`.
9. Run `npm run standards`.

### BR-02 - Surface the policy in doctor, help, and docs

**Goal:** Make the new browser policy visible and understandable from shipped user-facing surfaces.

**Step-by-step instructions:**

1. Extend the doctor report contract to include browser policy details.
2. Update plain-text and JSON doctor output to show:
   - the policy name
   - detected browser candidates
   - the preferred launch target
   - the fallback install command
3. Update the relevant docs pages so they explain the system-browser-first policy and the exact fallback install command.
4. Update help fixtures or CLI docs if the public behavior description changed.
5. Add automated tests for doctor output and the updated docs assertions.
6. Manually exercise the built CLI doctor surface and the built docs surface, then record the commands and observations under `specs/manual-runs/BR-02/`.
7. Run `npm run standards`.

### BR-03 - Reconcile plan, tracker, and release truth

**Goal:** Close the slice honestly instead of letting the code get ahead of the docs or tracker.

**Step-by-step instructions:**

1. Update `specs/gherkin/traceability.md` with the new task-to-test mapping.
2. Verify the new manual evidence clearly states which built surfaces were exercised.
3. Update any release or reference docs that would otherwise imply the old Playwright-browser assumption.
4. Close only the beads created for this slice, and only after the implementation, docs, and manual evidence are all in place.
5. Run `npm run standards`.

## New code

- `plans/a11ied-browser-policy-plan.md`: source plan for this slice.
- `specs/gherkin/16-browser-policy.feature`: acceptance spec for browser detection, doctor output, and install fallback.
- `packages/core/src/browser/*`: shared browser detection and launch policy.
- `packages/core/src/index.ts` and related tests: doctor contract and rendering updates.
- `packages/cli/*` and `apps/docs/src/pages/*`: public-facing text updates where the browser policy appears.
- `specs/manual-runs/BR-01/*` and `specs/manual-runs/BR-02/*`: manual evidence for the changed built surfaces.

## Tests

- Add unit tests for browser detection and launch selection.
- Add regression coverage for the no-browser failure message and install command.
- Update doctor tests to assert the new browser policy data.
- Update docs assertions so the shipped docs mention the current policy and install fallback.

## Review checklist

[x] Have all outstanding questions been answered?
[x] Are there any ambiguities that need to resolved?
