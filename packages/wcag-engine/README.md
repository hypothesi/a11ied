# @a11ied/wcag-engine

`@a11ied/wcag-engine` is the lookup, search, test method, and relevance layer for the a11ied toolkit. It queries the normalized WCAG artifacts from `@a11ied/wcag-data`.

## install

```sh
npm install @a11ied/wcag-engine
```

## usage

```ts
import {
   getCriterion,
   listCriteriaByLevel,
   searchCriteria,
   getTestMethod,
   getCriterionRelevance,
} from '@a11ied/wcag-engine';
```

Most consumers should import through the top-level `a11ied` package, which re-exports the full public surface.

## data

This package reads pre-generated artifacts from `@a11ied/wcag-data`. Data covers WCAG 2.1 and 2.2, ACT mapping, axe-core rule mapping, and Quickref tagging.
