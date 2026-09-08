# Third-party notices

The files under `data/generated/` include material copied from or derived from the
following W3C documents:

- Web Content Accessibility Guidelines (WCAG) 2.2, https://www.w3.org/TR/WCAG22/, and
  its machine-readable form, https://www.w3.org/WAI/WCAG22/wcag.json
- Web Content Accessibility Guidelines (WCAG) 2.1, https://www.w3.org/TR/WCAG21/, and
  its machine-readable form, https://www.w3.org/WAI/WCAG21/wcag.json
- The Understanding documents for WCAG 2.2 and 2.1,
  https://www.w3.org/WAI/WCAG22/Understanding/ and
  https://www.w3.org/WAI/WCAG21/Understanding/
- The WCAG 2.2 and 2.1 technique and failure pages,
  https://www.w3.org/WAI/WCAG22/Techniques/ and https://www.w3.org/WAI/WCAG21/Techniques/
- The ACT rules mapping from the `w3c/wcag` repository,
  https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json
- The WCAG quick reference tag data from the `w3c/wai-wcag-quickref` repository,
  https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml
- Guidance on Applying WCAG 2.2 to Mobile Applications (WCAG2Mobile),
  https://w3c.github.io/matf/, from its source files in the `w3c/matf` repository,
  https://github.com/w3c/matf/tree/main/comments
- The ARIA Authoring Practices Guide (APG), https://www.w3.org/WAI/ARIA/apg/, its example
  index, https://www.w3.org/WAI/ARIA/apg/example-index/, and its pattern index,
  https://www.w3.org/WAI/ARIA/apg/patterns/
- The APG example source files in the `w3c/aria-practices` repository,
  https://github.com/w3c/aria-practices/tree/main/content/patterns

Copyright (c) World Wide Web Consortium. This software or document includes material
copied from or derived from the documents listed above. The material is used under the
W3C Document License, https://www.w3.org/copyright/document-license/.

The criterion identifiers, titles, levels, and normative text are copied verbatim, under
the license's first grant (permission to copy and distribute the contents of the
document). The Understanding documents and technique bodies are converted from HTML to
Markdown before storage. That conversion is a derivative work made to help
implementation, permitted under the license's second grant. a11ied is a testing tool, not
a republication of the W3C document as a technical specification, so this use falls
within that grant.

Copyright © 2023 W3C®. This software or document includes material copied from or
derived from the WCAG 2.2 and WCAG 2.1 Understanding documents
(https://www.w3.org/WAI/WCAG22/Understanding/, https://www.w3.org/WAI/WCAG21/Understanding/)
and the WCAG 2.2 and WCAG 2.1 techniques
(https://www.w3.org/WAI/WCAG22/Techniques/, https://www.w3.org/WAI/WCAG21/Techniques/).

Every stored Understanding document and technique body carries its own title, source
URL, and status alongside the converted text, in `understanding.<version>.json` and
`technique-bodies.<version>.json`. The converted bodies live in
`documents-content.json`, deduplicated by content hash so a document byte-identical
across WCAG 2.1 and 2.2 is stored once. The `a1 wcag understanding`, `a1 wcag show`, and
`a1 wcag <technique-id>` commands print a line naming the source document and its URL
whenever they print this material, because terminal output is a copy too.

The `act-rules.<version>.json` files list each ACT rule's identifier, name, page URL, and
process status, taken from `act-mapping.json`, alongside the criteria the rule maps to.
Only the name and the link are stored, so a command that prints one of these entries
prints a pointer to the rule rather than a copy of it. The rule's own text stays on the
W3C site.

The `mobile-guidance.json` file holds WCAG2Mobile's per-criterion guidance, copied from
the editor's draft's source files. Each entry keeps the document's prose, notes, and
examples as written, and carries its own section title, URL, and status, so a command that
prints any of it prints the attribution with it. WCAG2Mobile is a W3C Editor's Draft:
informative guidance that has not been published as a Recommendation, and a criterion the
Mobile Accessibility Task Force has not written up yet is stored with a `placeholder`
state and a link to the issue tracking it.

The `apg-patterns.json` file holds the ARIA Authoring Practices Guide's keyboard support
tables and its role, property, state, and tabindex tables, one entry per example, together
with the example titles and the role and attribute indexes the APG's own example index
publishes. Each entry keeps the example's title and its page URL, so a command that prints
any of it prints the attribution with it. The APG is a W3C WAI resource: informative guidance
that is not a W3C Recommendation and does not define conformance requirements.

The `w3c/aria-practices` repository is licensed under the W3C Software and Document License,
https://www.w3.org/Consortium/Legal/copyright-software, rather than the W3C Document License
that covers the WCAG material above. That license grants copying, modification, and
redistribution with the notice attached, so it permits both the stored tables and the
vendored example files described next.

The files under `packages/wcag-data/test/apg/` are unmodified copies of APG pages, kept as
inputs for the parser tests. The files under `packages/cli/test/fixtures/apg/` are copies of
APG examples used as known-good pages to test a11ied against. Those keep the upstream
directory layout, so the paths inside them resolve unchanged, and two things are removed from
each page's head: the stylesheet hosted on w3.org, so the tests need no network, and the four
scripts that run the guide's own documentation chrome. Nothing else in those files is
changed.

The `axe-rules.<version>.json` files list rule identifiers, tags, and ACT rule identifiers
read from the installed `axe-core` package (https://github.com/dequelabs/axe-core,
Mozilla Public License 2.0). No axe-core rule text is copied.

The HTML-to-Markdown conversion uses `turndown` (https://github.com/mixmark-io/turndown,
MIT License) and `jsdom` (https://github.com/jsdom/jsdom, MIT License).
