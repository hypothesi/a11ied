# @a11ied/contracts

`@a11ied/contracts` is the shared schema and result-shape layer for the a11ied toolkit. It exports Zod schemas and inferred TypeScript types used across all a11ied packages.

## internal package

This is an internal package of [`a11ied`](https://www.npmjs.com/package/a11ied). It is published because `a11ied` depends on it, and its API can change in any release. Install `a11ied` instead.

## usage

```ts
import {
   AxeResultSchema,
   DriverSessionSchema,
   WcagCriterionSchema,
} from '@a11ied/contracts';
```

All schemas are validated with [zod](https://zod.dev). Infer types with `z.infer<typeof Schema>`.

## scope

This package defines result shapes for:

- axe-core scan results
- driver session and action results
- WCAG criterion, level, and test method records
- relevance and query results
