# @a11ied/core

`@a11ied/core` is the orchestration layer for the a11ied toolkit. It provides WCAG lookup, browser target resolution, screen reader session management, axe-core scanning, and doctor reports.

## install

```sh
npm install @a11ied/core
```

Most consumers should import from the top-level `a11ied` package instead. Use `@a11ied/core` directly when you need the full API surface without the CLI.

## API highlights

```ts
import {
   listWcagCriteria,
   showWcagCriterion,
   searchWcagCriteria,
   inspectCriterionUrl,
   runAxe,
   startDriverSession,
   runDriverSessionAction,
   stopDriverSession,
   createDoctorReport,
   renderDoctorText,
} from '@a11ied/core';
```

## targets

Resolves browser and screen reader targets automatically. Override with `resolveDefaultTarget` or `resolveDocumentTarget`.
