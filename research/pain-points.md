# automated accessibility testing pain points

Checked on 2026-04-06.

## The hard truth

The biggest pain point is not a missing rule. It is the gap between "the tool says this looks fine" and "the screen reader experience is still wrong."

W3C still says the quiet part out loud: some checks cannot be automated, some tools produce inaccurate results, and nobody should lean on tool output harder than they lean on actual user experience. That matches what the existing ecosystem shows in practice.

## The pain points that keep showing up

### 1. Rule engines stop before the user experience starts

Pa11y and axe-core are useful, but they are not built to tell you whether focus order feels coherent, whether live region timing is understandable, or whether a particular VoiceOver or NVDA announcement is confusing in context.

### 2. Storybook is great for speed and bad for final truth

Storybook add-ons are good at giving developers immediate feedback while they are building components. They are not good enough for sign-off. Even the screen-reader simulation add-ons say so. They cannot access the OS accessibility tree, they do not model browse mode, and they do not claim parity with VoiceOver.

### 3. Real screen reader automation has setup friction

Guidepup is powerful, but it is not plug-and-play in the way most frontend tooling is.

- macOS runs need permissions and TCC-related setup.
- Windows runs need NVDA provisioning and foreground-window tuning.
- CI setup is different from local setup.
- Failures can be environmental instead of product-related.

If the tool does not help users separate "your app is wrong" from "your machine is not ready," it becomes exhausting fast.

### 4. The workflow is split across too many abstractions

Teams end up with one tool for lint-like accessibility scans, another for component tests, another for browser automation, another for CI reporting, and now potentially another for MCP or agent use. That is a lot of context switching for one job.

### 5. Results are often too technical or too vague

Developers need both:

- machine-friendly output for CI, IDEs, and agents
- human-friendly output that explains what happened in a way somebody can act on

Too many tools skew hard in one direction.

### 6. Teams blur simulation and reality

The virtual screen reader story is genuinely useful. It is also easy to oversell. If a tool does not draw a bright line between "fast simulation" and "real assistive technology run," people will make bad calls with too much confidence.

## What a11lied should do about it

- Put setup health first with `doctor`.
- Separate infra failures from accessibility findings through clear exit codes.
- Make virtual, VoiceOver, and NVDA targets explicit in both config and output.
- Keep one execution engine, then expose it through CLI, Storybook, and MCP.
- Default to concise summaries, but always keep the raw spoken phrase log available.

## Sources

- W3C evaluation tools overview: https://www.w3.org/WAI/test-evaluate/tools/
- Pa11y README: https://github.com/pa11y/pa11y
- Guidepup Setup README: https://www.npmjs.com/package/@guidepup/setup
- Guidepup Virtual Screen Reader README: https://www.npmjs.com/package/@guidepup/virtual-screen-reader
- storybook-screen-reader limitations: https://www.npmjs.com/package/storybook-screen-reader
