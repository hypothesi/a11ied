# `@a11ied/compat`

Programmatic screen reader and assistive technology compatibility engine for VS Code
extensions, ESLint/oxlint plugins, and bundlers.

Accepts standard Browserslist queries and element/attribute usages and reports failing RFC
2119 requirements (`MUST`, `SHOULD`, `MAY`), severe or moderate side effects, and exact
tested environment tuples (screen reader + version, browser + version, OS + version,
device).

```ts
import { checkCompatibility } from '@a11ied/compat';

const report = checkCompatibility({
   browserslist: 'defaults',
   usages: [
      {
         type: 'aria',
         feature: 'aria-live',
         element: '<div aria-live="polite">',
         location: { file: 'src/toast.tsx', line: 12, column: 8 },
      },
      'aria:alert',
      '@checked',
   ],
});

for (const diagnostic of report.diagnostics) {
   console.log(diagnostic.severity, diagnostic.code, diagnostic.message);
}
```
