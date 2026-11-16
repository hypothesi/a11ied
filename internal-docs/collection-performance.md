# Collection performance measurement

The existing real-browser collector test measured the same local state cold and through
its cache, using collector `observe-3`. This is one local sample, not a production
latency guarantee or a comparison of full audit durations.

| Operation                     | Milliseconds | Additional page requests |
| ----------------------------- | -----------: | -----------------------: |
| Cold collection               |      5344.94 |                        1 |
| Equivalent cached bundle read |         2.92 |                        0 |

Both reads returned fingerprint `76934de24e19782fdd52d0c1e141da7a2bc8b15ce6ff1855faafeab53353a5e8` and identical scored observations.
The test asserts identical verdict proposals, one navigation, and cache reuse. It does
not reuse or expand any accepted judgment. A cached capture is historical evidence,
not proof that a live target has not changed. Explicit refresh collects again.

Retain independent collection for each state and template member, and independent
criterion assessment. Existing bounded parallel collection, cached slice reads and
batch submission reduce browser/transport work. No generic equivalence framework,
judgment reuse, browser pool or database was added. Current measurements support
using the existing cache for repeated inspection; they do not justify judgment reuse.

Reproduce with the collector test named `measures cold collection and equivalent cache
reads without expanding judgments` through `npm test -- packages/core/src/observe/collector.test.ts`.
Raw measurement: `internal-docs/validation/collection-benchmark.json`.
