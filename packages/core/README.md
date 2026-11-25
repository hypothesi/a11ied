# @a11ied/core

`@a11ied/core` is the orchestration layer for the a11ied toolkit. It provides WCAG lookup, browser target resolution, screen reader session management, axe-core scanning, and doctor reports.

## internal package

This is an internal package of [`a11ied`](https://www.npmjs.com/package/a11ied). It is published because `a11ied` depends on it, and its API can change in any release. Install `a11ied` instead.

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
