# Auditing a mobile app

The audit workflow is the same as for the web: pages, units, workers, findings, report. Two
things differ. There is no automated scan, so every outcome comes from a worker operating the
app. And a1 does not drive devices, so workers use the platform's own tools.

## Setup

```bash
a1 audit init "Acme iOS 4.2 (build 1187)" --platform ios \
   --access "Simulator: iPhone 16, iOS 18. Test account in 1Password: Acme QA" \
   --rule "Do not complete a purchase"
a1 audit page add "Launch > Sign in" --name "Sign in"
a1 audit page add "Tab bar > Search" --name "Search"
a1 audit page add "Search > result > Add to cart > Checkout" --kind flow --name "Checkout" \
   --notes "Stop at the payment sheet."
```

Put the exact build in the target. A page locator is the path a worker follows to reach the
screen. List every distinct screen, the important states (empty, error, loading), and the flows.

Give each worker its own simulator, emulator, or device, and say which one in its prompt. Two
workers on one device corrupt each other's state.

## Driving the app

Use whatever is available, in this order of preference:

1. A device automation tool or MCP server the session already has (Appium, Maestro, a mobile
   MCP).
2. iOS simulator: `xcrun simctl` to boot, install, launch, set appearance and content size, and
   take screenshots (`xcrun simctl io booted screenshot <file>`). Accessibility Inspector, or
   `idb ui describe-all` when idb is installed, lists elements with labels, traits, and frames.
3. Android emulator or device: `adb` to install, launch, and capture
   (`adb exec-out screencap -p > <file>`). `adb shell uiautomator dump` lists the view
   hierarchy with content descriptions, roles, and bounds. `adb shell settings put system
   font_scale 2.0` sets the text size.

When no tool can operate the app, block the unit with what is missing. Do not judge from source
code or screenshots alone when the criterion is about behavior.

## What each pass needs

- **semantics**: the element list with labels, roles, and states, then a real pass with
  VoiceOver or TalkBack when the tooling allows it. Otherwise record what the element list
  shows and mark behavior you could not hear as `cannot-tell`.
- **keyboard**: a hardware keyboard or Switch Control and Switch Access. Many apps fail here
  completely. Record that as findings, not as not-applicable.
- **visual**: screenshots at the default and largest text size, in both orientations, in light
  and dark appearance. Measure contrast from the pixels.
- **pointer**: element frames give target sizes. 24 by 24 points is the WCAG minimum; note
  targets under the platform's 44 or 48.
- **forms**: keyboard types, autofill content types, visible and announced labels, and errors.
- **media**: captions, transcripts, Reduce Motion, and auto-playing content.

`a1 wcag <id>` prints how each criterion applies to a mobile app, from the W3C's guidance on
applying WCAG 2.2 to mobile. Read it when a criterion's web wording does not map cleanly, such
as 1.4.10 Reflow or 2.4.2 Page Titled.
