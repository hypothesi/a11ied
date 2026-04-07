# wcag data sources, coverage, and what they imply

Checked on 2026-04-06.

## The short version

There is enough structured source data to build a real WCAG-aware engine without scraping half the web.

The key sources are:

- the official WAI `wcag.json` export for structured principles, guidelines, success criteria, techniques, and failures
- W3C's `act-mapping.json` for criterion-to-ACT coverage
- axe-core's rule metadata and criterion tags for automation coverage
- the Quickref tag taxonomy for "what kind of UI is this criterion about?"
- the WCAG understanding pages for richer explanatory text and manual-test context

The bigger lesson is coverage. A lot of the criteria people actually struggle with in component and app work are not fully covered by axe-core or ACT mappings. So the product cannot stop at `axe.run()` and call that compliance.

## Recommended source stack

### 1. Canonical structured WCAG data

Use `https://www.w3.org/WAI/WCAG22/wcag.json` as the main machine-readable source.

It already includes:

- principles
- guidelines
- success criteria
- levels
- details and notes
- sufficient techniques
- advisory techniques
- failures

This is much better than scraping rendered HTML.

Important wrinkle: I could fetch `WCAG21/wcag.json`, but `WCAG20/wcag.json` returned 404 on 2026-04-06. If we need 2.0 support, we should derive it from the 2.1 or 2.2 export plus version fields instead of assuming a dedicated 2.0 JSON endpoint exists.

### 2. ACT mapping

Use `https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json`.

This gives us:

- ACT rule ids
- criterion mappings
- stronger or weaker-than-conformance notes
- input aspects like DOM tree or accessibility tree

That last bit matters. It tells us what kind of evidence the rule even cares about.

### 3. Quickref taxonomy

Use the Quickref repo for its category data, especially `_data/tags-sc.yml`.

Those tags are surprisingly practical. They map criteria to things like:

- forms
- drag-and-drop
- focus
- sticky and fixed positioning
- video
- mobile
- errors
- navigation

That is exactly the kind of hint we need for "which criteria are probably relevant to this page or component?"

### 4. Understanding pages

The `w3c/wcag` repo includes `understanding/` pages with brief summaries, intent sections, examples, and resources. They are not as neat as `wcag.json`, but they are useful for agent guidance and manual test runbooks.

Example: `understanding/22/focus-not-obscured-minimum.html` has the sort of practical explanation an agent can use to design a real test instead of just paraphrasing the criterion title.

### 5. axe-core rule metadata

axe-core already gives us two important dimensions:

- standards tags like `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`
- criterion tags like `wcag111`, `wcag412`, `wcag258`

That means a11lied can map a criterion or target level to actual axe rules without hand-maintaining a giant rule list.

## Coverage findings

### ACT coverage is useful, not complete

Using WCAG 2.2 criteria and the current `act-mapping.json`, I found:

- Level A: 21 criteria with ACT mappings, 10 without
- Level AA: 9 criteria with ACT mappings, 15 without
- Level AAA: 7 criteria with ACT mappings, 24 without

So ACT is helpful, but it is nowhere near "all of WCAG."

### axe criterion coverage is also partial

Using the current axe rule descriptions and criterion tags, I found:

- Level A: 16 criteria with at least one mapped axe rule, 15 without
- Level AA: 6 criteria with at least one mapped axe rule, 18 without
- Level AAA: 5 criteria with at least one mapped axe rule, 26 without

That is the blunt reality. If we want the agent to talk about criterion-level compliance, it needs a coverage model, not just a scanner.

### Representative criteria

Here are a few criteria that show why the product needs hybrid verification:

| Criterion | Level | axe coverage | ACT coverage | What it means |
| --- | --- | --- | --- | --- |
| 2.4.3 Focus Order | A | none found | none found | Needs a real interaction procedure, not just static analysis. |
| 2.4.7 Focus Visible | AA | none found | one ACT rule | Needs visual and interaction evidence. |
| 2.4.11 Focus Not Obscured (Minimum) | AA | none found | none found | Purely hybrid or manual. |
| 2.5.8 Target Size (Minimum) | AA | one axe rule | none found | Good example of targeted automated coverage. |
| 3.2.6 Consistent Help | A | none found | none found | Cross-page procedure, probably with site-wide reasoning. |
| 3.3.7 Redundant Entry | A | none found | none found | Flow-based procedure, often form-journey specific. |
| 3.3.8 Accessible Authentication (Minimum) | AA | none found | none found | Needs explicit product-aware runbooks. |
| 4.1.3 Status Messages | AA | none found | none found | Great Guidepup target because the question is whether assistive tech gets the message without focus. |

## What I would do with repo dependencies

I would not make the full `w3c/wcag` repo a runtime dependency.

I would create a build-time sync pipeline that snapshots the parts we actually need into a local package, something like `packages/wcag-data`.

That package should own:

- a normalized `criteria.json`
- an `act-coverage.json`
- an `axe-coverage.json`
- a `tags.json` built from Quickref taxonomy
- optional extracted understanding summaries

That gives us repeatable offline behavior, pinned data, fast tests, and clean MCP responses.

## Search: why I would not start with Tantivy

I checked the size of the likely corpus:

- `act-mapping.json`: about 148 KB
- Quickref `wcag22.json`: about 307 KB
- Quickref `wcag21.json`: about 363 KB
- full Quickref `_data/`: about 936 KB
- `w3c/wcag` `understanding/`: about 6.1 MB

That is not a big corpus.

I would keep search behind an interface, but I would start with a simple in-process index or lightweight local FTS layer. Tantivy feels like extra surface area before we have evidence we need it.

## Product consequences

- The tool needs a first-class notion of coverage: automated, hybrid, manual, or unknown.
- The tool needs criterion-level procedures, not just rule mappings.
- The agent skill must know when to stop saying "pass" and start saying "needs more evidence."
- WCAG knowledge should be a proper local data package, not a pile of runtime fetches.

## Sources

- WAI WCAG 2.2 JSON: [https://www.w3.org/WAI/WCAG22/wcag.json](https://www.w3.org/WAI/WCAG22/wcag.json)
- W3C WCAG repo: [https://github.com/w3c/wcag](https://github.com/w3c/wcag)
- W3C ACT mapping JSON: [https://github.com/w3c/wcag/blob/main/guidelines/act-mapping.json](https://github.com/w3c/wcag/blob/main/guidelines/act-mapping.json)
- WAI Quickref repo: [https://github.com/w3c/wai-wcag-quickref](https://github.com/w3c/wai-wcag-quickref)
- axe-core API docs: [https://github.com/dequelabs/axe-core/blob/develop/doc/API.md](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)
- axe-core rule descriptions: [https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
