# Run state and decisions

The runtime schemas are the field-level source of truth:

- `packages/contracts/src/schemas/discovery.ts`
- `packages/contracts/src/schemas/report.ts`

This resource covers values the agent decides and the branches around them.

## Inventory example

```json
{
   "version": "1",
   "startUrl": "https://example.test/",
   "generatedAt": "2026-09-16T14:00:00.000Z",
   "run": {
      "runId": "9e90b4f0-e34e-4d86-afeb-d831067ffd0f",
      "originKey": "example-test-a1b2c3d4",
      "phase": "template-review",
      "startedAt": "2026-09-16T13:45:00.000Z",
      "updatedAt": "2026-09-16T14:00:00.000Z",
      "scope": "site",
      "optionsChosen": {
         "auditMode": "sampled",
         "probeErrorPages": false,
         "parallelAutomatedAudit": true,
         "capturePageArtifacts": false
      }
   },
   "discovery": {
      "complete": true,
      "maxPages": 2000,
      "maxSitemaps": 50,
      "sources": ["https://example.test/sitemap.xml"],
      "failures": []
   },
   "pages": [],
   "templates": [
      {
         "templateId": "article",
         "representativePageId": "news-a1b2c3d4",
         "memberPageIds": ["news-a1b2c3d4", "updates-b2c3d4e5"]
      }
   ]
}
```

## Decisions

Ask in this order for a new run:

1. Page, section, or site scope.
2. Artifact consent. Ask again with authenticated content in mind if login is needed.
3. For more than 50 pages, complete or template-sampled audit.
4. If subagents exist, serial or parallel axe-only page audits.

Before those questions, look for an incomplete inventory. Ask whether to resume or start
a separate run. A resumed run uses its recorded choices.

Use this sampling explanation:

> A template-sampled audit checks a representative page for each shared layout and the
> structural or state variants I observed. It does not test every URL. Pages not opened
> remain marked not tested, even when they share a template with an audited page.

## Resume by phase

- `discovering`: rerun `a1 audit discover --resume-from <inventory>`. Resolved URLs keep
  their page ids and are not resolved again.
- `template-review`: keep the discovered pages. Finish the agent's template judgment.
- `auditing`: clean up a stale screen reader session. Skip audited pages. Continue an
  in-progress page with `a1 audit pending <url>`.
- `report-building`: keep all page files. Rerun `a1 report build`.
- `complete`: do not resume. Start a new run if the user wants a fresh audit.

## Authentication handoff

Use Playwright's local storage-state file. The user signs in inside the headed browser.
The agent passes only the file path. Do not read, print, copy, or put the file in the run
directory. Delete it after the audit unless the user asks to retain it.

For real screen reader checks, pause while the user signs in in the controlled browser.
Continue in that same session.

## Hints

The skill owns this small file. Runtime commands do not consume it.

```json
{
   "version": "1",
   "origin": "https://example.test",
   "entries": [
      {
         "kind": "template",
         "note": "News and updates used the article template during this run.",
         "status": "active",
         "recordedAt": "2026-09-16T15:00:00.000Z",
         "runId": "9e90b4f0-e34e-4d86-afeb-d831067ffd0f"
      }
   ]
}
```

Allowed statuses are `active` and `invalid`. A later run checks every active entry. It
updates a changed observation or marks it invalid with a new timestamp and run id.
