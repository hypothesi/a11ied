# Automated rule evidence boundaries

The public scorer inventories all 55 WCAG 2.2 A/AA criteria. Only a matching axe violation
is an automatic terminal failure. Every other probe result is an unresolved observation,
including apparent passes, failures, and absence. Authorized scope exclusions are separate.
This matches the shared admission boundary and prevents narrow probes becoming conformance.

Agent judgments require the versioned criterion procedure, actual action observations,
required capabilities and evidence kinds, current collector receipts, and any required
measurements. The following applicability boundaries come from the curated procedure
catalog; none is established merely by an empty array, missing fact, or successful scan.

| Criterion | Applicability requiring assessment                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| 1.1.1     | All non-text content, including controls, charts, CAPTCHA, decoration, and media previews.                      |
| 1.2.1     | Prerecorded audio-only or video-only media, excluding clearly labeled alternatives to text.                     |
| 1.2.2     | Prerecorded synchronized media with audio, excluding clearly labeled alternatives to text.                      |
| 1.2.3     | Prerecorded synchronized media with visual information, excluding labeled alternatives to text.                 |
| 1.2.4     | Live synchronized media with audio.                                                                             |
| 1.2.5     | Prerecorded synchronized media containing video.                                                                |
| 1.3.1     | Information, structure, or relationships conveyed through presentation.                                         |
| 1.3.2     | Content whose sequence affects meaning.                                                                         |
| 1.3.3     | Instructions for understanding or operating content.                                                            |
| 1.3.4     | Rendered desktop content capable of portrait and landscape layouts.                                             |
| 1.3.5     | User-information inputs matching the WCAG Input Purposes list in technologies supporting identification.        |
| 1.4.1     | Color conveying information, action, response, or a distinction.                                                |
| 1.4.2     | Audio playing automatically for more than three seconds.                                                        |
| 1.4.3     | Text and images of text, except logos, incidental content, and inactive controls.                               |
| 1.4.4     | Text, excluding captions and images of text.                                                                    |
| 1.4.5     | Images of text where the technology can provide the intended presentation using text.                           |
| 1.4.10    | Content except parts requiring two-dimensional layout for usage or meaning.                                     |
| 1.4.11    | Visual information needed to identify active controls, states, or meaningful graphical objects.                 |
| 1.4.12    | Markup-language content supporting text spacing properties.                                                     |
| 1.4.13    | Additional content triggered and dismissed by pointer hover or keyboard focus.                                  |
| 2.1.1     | All functionality except input whose underlying function requires a movement path.                              |
| 2.1.2     | Components that receive keyboard focus.                                                                         |
| 2.1.4     | Shortcuts using only letters, punctuation, numbers, or symbols.                                                 |
| 2.2.1     | Time limits set by content, including session expiry and temporary responses.                                   |
| 2.2.2     | Automatic moving, blinking, scrolling, or updating information presented alongside other content.               |
| 2.3.1     | Flashing content, including video, animation, and state transitions.                                            |
| 2.4.1     | Blocks repeated across a set of pages.                                                                          |
| 2.4.2     | Every scoped web page, including routes with changed purpose.                                                   |
| 2.4.3     | Sequential focus navigation where order affects meaning or operation.                                           |
| 2.4.4     | Links in each observed state.                                                                                   |
| 2.4.5     | Pages within a set, except results of or steps in a process.                                                    |
| 2.4.6     | Headings and labels that are present.                                                                           |
| 2.4.7     | Keyboard-operable user interfaces.                                                                              |
| 2.4.11    | Components receiving keyboard focus in author-created content.                                                  |
| 2.5.1     | Multipoint or path-based gestures, excluding essential gestures and user-agent functionality.                   |
| 2.5.2     | Functions operated with a single pointer.                                                                       |
| 2.5.3     | Controls with visible text or images of text as labels.                                                         |
| 2.5.4     | Functions activated by device or user motion.                                                                   |
| 2.5.7     | Author-defined functions using dragging, excluding essential dragging.                                          |
| 2.5.8     | Targets for pointer input.                                                                                      |
| 3.1.1     | Human language of each page.                                                                                    |
| 3.1.2     | Passages or phrases in a language different from the page's default.                                            |
| 3.2.1     | Components that receive focus.                                                                                  |
| 3.2.2     | Changes to the setting of a user-interface component.                                                           |
| 3.2.3     | Navigation mechanisms repeated within a set of pages.                                                           |
| 3.2.4     | Components with the same functionality within a set of pages.                                                   |
| 3.2.6     | Repeated human contact, contact details, self-help, or automated contact mechanisms.                            |
| 3.3.1     | Input errors automatically detected by the content.                                                             |
| 3.3.2     | Content requiring user input.                                                                                   |
| 3.3.3     | Automatically detected input errors with known correction suggestions.                                          |
| 3.3.4     | Legal/financial commitments, changes/deletions to user-controlled stored data, or submission of test responses. |
| 3.3.7     | Information entered by or provided to the user that is requested again within the same process.                 |
| 3.3.8     | Every authentication step, including recovery and multifactor branches.                                         |
| 4.1.2     | All user-interface components, including custom and dynamically changed controls.                               |
| 4.1.3     | Status messages that do not constitute a change of context.                                                     |

## Collector limits

- `observe-3` records requested, loaded and observed URLs, HTTP status, frame URLs,
  immutable snapshots and collector receipts. Redirected/error-page evidence cannot
  certify the original target. Register the resolved target for separate assessment.
- Virtual DOM reading covers the observed document. Frames and shadow content need
  independent coverage; native VoiceOver/NVDA behavior is unsupported by this collector.
- The forward tab sample is capped at 120 presses. It does not enter every component
  or establish escape behavior, logical focus order, focus visibility, or context changes.
- Contrast is capped at 40 candidates and sampled interaction states. Images, gradients,
  generated content, transitions and unobserved states require further review. An empty
  sample is recorded as absent sampling, not inapplicability of the criterion.
- Text enlargement applies baseline font sizes and pixel line heights at factor two,
  verifies resulting computed sizes, captures a screenshot, and restores inline styles.
  It does not prove all content or controls remain usable. The old `zoom200` viewport
  field is only a 640px observation and is never a resize-text measurement.
- Reflow, orientation, target size, clipping and listener inventories are bounded probes.
  Their measurements guide assessment but do not independently establish a whole criterion.
- Operation receipts distinguish completed, truncated and absent samples. Exceptions
  persist a failed capture record and rethrow; no empty successful bundle is substituted.
  Unsupported native/site/journey proofs remain unresolved rather than fabricated.
- A complete media inventory can establish media absence in the legacy coordinator;
  missing instrumentation or uninspected trees keep it unresolved. Other absence
  assessments require their actual procedure and contextual evidence.

## Reproducible verification

The core verdict tests exercise every criterion against both bounded and missing facts.
Collector tests use real browsers for target identity, enlargement/restoration, setup,
immutable receipts, refresh failures and cache equivalence. Admission and report tests
reject stale/copied/forged evidence, incomplete procedures, scope rebinding, and forced
finalization. These tests establish the boundaries above, not completion of a site audit.
