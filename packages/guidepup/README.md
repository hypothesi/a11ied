# @a11ied/guidepup

`@a11ied/guidepup` provides platform adapters for screen reader automation in the a11ied toolkit. It wraps [`@guidepup/guidepup`](https://github.com/guidepup/guidepup) and [`@guidepup/virtual-screen-reader`](https://github.com/guidepup/virtual-screen-reader) with a unified interface.

## internal package

This is an internal package of [`a11ied`](https://www.npmjs.com/package/a11ied). It is published because `a11ied` depends on it, and its API can change in any release. Install `a11ied` instead.

## usage

```ts
import { createDriverAdapter, driverCapabilities } from '@a11ied/guidepup';
```

## adapters

- **VoiceOver** — real screen reader on macOS
- **NVDA** — real screen reader on Windows
- **Virtual** — headless virtual screen reader backed by `@guidepup/virtual-screen-reader` and jsdom; suitable for deterministic local tests

Use `driverCapabilities` to check which adapters are available at runtime before starting a session.
