# a11ied Vitest command queue: Implementation Plan (v0.2.0 – 2026-09-09)

## Summary

Today every screen reader call in a test needs its own `await`. This plan adds a
command queue to `@a11ied/core` so a test queues calls and awaits only when it
needs a value. `a11ied/test` exports `queuedScreenReader` for any runner, and
`a11ied/vitest` gives an `sr` fixture that is already queued, so a Vitest test
writes `sr.press('Tab')` with no `await` at all. The queue depends on no test
runner, so a later `a11ied/jest` entry point reuses it without a change.

A command that fails without an `await` fails the test from inside the test
body. The Vitest fixture pushes each command's settled promise onto
`task.promises`, the same array Vitest uses for its own unawaited async work.

## Objectives & Scope

In scope:

- A `CommandQueue` class in `packages/core/src/driver/command-queue.ts`, with a
  `track` option and a `signal` option.
- A `QueuedScreenReader` wrapper over `ScreenReader`, plus `queueScreenReader` and
  `queuedScreenReader`, in `packages/core/src/driver/queued-screen-reader.ts`.
- Two assertion methods on `ScreenReader`: `expectOn` and `expectSpokenInOrder`.
- New exports from `packages/core/src/index.ts` and
  `packages/cli/src/test/index.ts`, each with a JSDoc block.
- One shared Vitest fixture factory used by `a11ied/vitest` and `a11ied/browser`,
  with `sr` typed as `QueuedScreenReader`.
- Matcher types that accept a `QueuedScreenReader`.
- A raise of `peerDependencies.vitest` in `packages/cli/package.json` to
  `>=4.0.0`.
- Docs, README, and acceptance spec updates for the queued style.

Out of scope:

- A new import path. `a11ied/vitest` already separates the Vitest layer.
- A Jest entry point. The design is proved here and built later.
- Any change to the transport, the broker, or the simulated screen reader.
- Removing the `expect` matchers. They stay for arrays of phrases and for tests
  that prefer `expect`.

## Assumptions & Open Questions

Assumptions:

- The published package version is 0.1.0, so this work goes out as 0.2.0.
- The installed Vitest is 4.1.11. The declared peer range becomes
  `vitest >=4.0.0`, because the runner behavior this plan depends on was read
  from 4.1.11.
- TypeScript target ES2023 with lib `ESNext.Disposable`, so `await using` and
  `Symbol.asyncDispose` compile in both packages.
- `ScreenReaderOptions.timeoutMs` bounds each single screen reader command
  unless a call passes its own timeout. The queue adds no second timeout. The
  whole batch of queued commands runs under Vitest's `testTimeout`, which the
  root `vitest.config.ts` sets to 30000 ms at line 60 and which Vitest defaults
  to 5000 ms.
- Root `vitest.config.ts` includes `packages/*/src/**/*.test.ts`, so a fixture
  test file under `packages/cli/test/fixtures/` stays out of the root run, and
  the spawned run over it needs a config of its own.

Open Questions:

- Should the queued reader replace the `sr` fixture type, or be a second
  fixture? Answer: replace it. The package is 0.1.0, awaiting a `Queued<T>`
  gives the same value the old fixture gave, and every existing test keeps
  passing. A second `qsr` fixture would leave two ways to do one thing.
- Should `expect(sr).toHaveSpoken()` work without `await`? Answer: no.
  `recordAsyncExpect` in `node_modules/@vitest/expect/dist/index.js` at line
  1081 runs for `resolves` and `rejects` only, at lines 1741 and 1782, and for
  file snapshots. `JestExtendPlugin` at line 1868 returns the thenable of a
  custom async matcher and records nothing, so an unawaited custom matcher
  produces no warning. Its rejection arrives as an unhandled rejection with no
  link to the test. The `expect` matchers stay awaited, which is what Vitest's
  guide for extending matchers requires for async matchers. `sr.expectSpoken`,
  `sr.expectSpokenInOrder`, and `sr.expectOn` are the assertions that need no
  `await`.
- Which Vitest versions does this support? Answer: 4.0.0 and later. The runner
  behavior this plan relies on was read from the installed 4.1.11, and the
  maintainer chose to support 4 and later only.
- What is this plan's version? Answer: v0.2.0, the next minor after the
  published 0.1.0. Change the title if the release plan says otherwise.
- Should `queuedScreenReader(options)` start the reader inside the queue, so
  even the first `await` goes away? Answer: no. `session` would stop being a
  synchronous getter, and `await using` needs a value at the declaration. One
  `await` at the start under a plain runner is accepted. The Vitest fixture
  removes it.

Resolved Decisions:

- The queue lives in `@a11ied/core` and is re-exported from `a11ied/test`,
  because it imports nothing from a test runner.
- `queueScreenReader` lists every async `ScreenReader` method by hand, typed by a mapped
  type derived from `ScreenReader`. A `Proxy` was rejected during implementation, because
  its return value cannot be typed as `QueuedScreenReader` without an `as` cast, which
  this repo forbids. A method added to `ScreenReader` fails to compile until it gets a
  line in `queuedMethods`.
- `session` stays a synchronous getter, because the reader starts before the
  wrapper exists.
- The failure a nobody-awaited command throws reaches the test through
  `task.promises`. The Vitest fixture passes a `track` function to the queue,
  and `track` pushes the command's settled promise onto `task.promises`.
  `withAwaitAsyncAssertions` in
  `node_modules/@vitest/runner/dist/chunk-artifact.js` at line 1901 awaits the
  test function, then runs `Promise.allSettled(task.promises)` and throws the
  array of rejections. The runner registers that wrapper inside the test timeout
  at line 1787, so the failure is the test's own failure and it arrives before
  `afterEach`. `failTask` at line 3056 accepts an array and pushes each error
  through `processError`, so each error gets its own code frame from its own
  `stack`.
- `task.promises` is a declared field on the test task in
  `node_modules/@vitest/runner/dist/tasks.d-DEYaIMIu.d.ts` at line 541, with the
  doc comment "Store promises (from async expects) to wait for them before
  finishing the test". `context.annotate()` uses it through
  `recordAsyncOperation` at line 3413 of `chunk-artifact.js`. It is not
  documented on vitest.dev. If a Vitest release removes it, the fixture drops
  `track` and a failure falls back to the teardown drain, with the same message
  and the same stack, reported after `afterEach`.
- Fixture teardown errors still go through `failTask`, which is why `stop()` is
  safe to call from teardown. With `track` set, teardown reports nothing new.

## Requirements

### Functional Requirements

- FR-1: `CommandQueue` runs queued commands one at a time, in the order the test
  queued them, on one promise chain.
- FR-2: `Queued<T>` has a `then`. Awaiting it runs every command queued before
  it, then that command, and resolves with that command's value.
- FR-3: When a command throws and the test had called `then` on its `Queued`
  before it settled, the rejection goes to that await and the queue continues
  with the next command.
- FR-4: When a command throws and nothing awaited it, the queue records the
  failure. Every later command is skipped and rejects with the same error.
- FR-5: One failure is reported exactly once, by the first of these that
  applies: the await that observed it, the `track` function when one is set, or
  `drain()` when no `track` function is set. With `track` set, `drain()` and
  `stop()` resolve without rethrowing.
- FR-6: A thrown error keeps its class, `message`, `expected`, `phrases`, and
  `exitCode`. Its `stack` is replaced by `<name>: <message>` plus the frames
  captured at the call site with `Error.captureStackTrace(callSite, method)`.
  That function exists on V8 only, so in Node and Chromium. Where it is missing,
  the queue keeps the frames of a plain `new Error()` made at the call site. The
  original stack goes on `cause`.
- FR-7: The queue raises no unhandled rejection. Every internal promise has a
  rejection handler, and only a `then` from test code sees a rejection. The
  queue attaches a no-op rejection handler to each settled promise before it
  hands that promise to `track`, so Node reports nothing and
  `Promise.allSettled` still sees the rejection.
- FR-8: `CommandQueue` takes `{ track?, signal? }`. For every enqueued command
  it makes a settled promise that resolves when the command passes or when its
  failure went to an await, and rejects only when the failure went to no await.
  It passes that promise to `track`.
- FR-9: When `signal` aborts, the queue skips every command it has not started
  and rejects each of them with `signal.reason`. The command already running
  finishes on its own.
- FR-10: `queueScreenReader(reader, queue?)` returns an object that exposes
  every async `ScreenReader` method as a queued call, plus `session`, `reader`,
  `drain`, `stop`, and `Symbol.asyncDispose`. Its second parameter is a
  `CommandQueueOptions`.
- FR-11: `queuedScreenReader(options, queue?)` starts a reader and returns it
  wrapped. `session` is readable without an `await`. Its second parameter is a
  `CommandQueueOptions`.
- FR-12: `stop()` drains first, stops the reader in a `finally` even when the
  drain failed, then rethrows the drain failure.
- FR-13: `ScreenReader` gets `expectOn(wanted)` and
  `expectSpokenInOrder(matches, options)`. Both throw
  `ScreenReaderAssertionError` with an `expected` string and the checked
  phrases.
- FR-14: `packages/core/src/index.ts` and `packages/cli/src/test/index.ts`
  export `CommandQueue`, `CommandQueueOptions`, `queueScreenReader`,
  `queuedScreenReader`, `Queued`, and `QueuedScreenReader`, each with a JSDoc
  block.
- FR-15: The `sr` fixture in `a11ied/vitest` and in `a11ied/browser` is a
  `QueuedScreenReader`, built by one shared factory. That factory reads `task`
  and `signal` from the fixture context and passes both to the queue.
- FR-16: A queued command that fails without an await fails the Vitest test from
  inside the test body, under `testTimeout`, before `afterEach` runs. The
  reporter prints the assertion message and a code frame at the test line that
  queued the command.
- FR-17: `SpokenReceived` and `ItemReceived` in
  `packages/cli/src/vitest/matchers.ts` accept a `QueuedScreenReader`.
- FR-18: Nothing in `@a11ied/core` or `packages/cli/src/test/index.ts` imports
  from `vitest`.
- FR-19: `peerDependencies.vitest` in `packages/cli/package.json` is `>=4.0.0`.
- FR-20: The docs site and the README show the queued style.
- FR-21: Every row maps to scenarios in
  `internal-docs/specs/gherkin/17-test-command-queue.feature`, to automated
  tests, and to a recorded manual run.

### Non-Functional Requirements

- NFR-1 (Performance): The queue adds one promise link and one captured stack
  per command. It starts no timer and does no polling. Command duration stays
  bounded by `ScreenReaderOptions.timeoutMs`, and the batch stays bounded by
  Vitest's `testTimeout`.
- NFR-2 (Security): The queue opens no file, no socket, and no process. It
  reorders calls the test already makes.
- NFR-3 (Privacy): Not applicable. The queue keeps command names and stack
  traces in memory for the length of one test and writes nothing to disk.
- NFR-4 (Accessibility): Not applicable to the runtime code. The docs pages
  changed in VQ-05 keep the existing heading order, section ids, and table of
  contents entries.
- NFR-5 (Observability): A failure message states the assertion text, and the
  replaced stack starts at the test line that queued the command. The failure is
  attached to the test itself, not to a hook, so the reporter prints it under
  the test name.
- NFR-6 (i18n): Not applicable. Error text is American English developer text,
  the same as the rest of the package.
- NFR-7 (Reliability): A failing command never leaves a reader running, because
  `stop()` calls the underlying `reader.stop()` in a `finally`. A test timeout
  or a cancelled run aborts the context signal, and the queue then skips every
  command it has not started. `test.concurrent` is safe, because each test gets
  its own fixture, its own queue, and its own task.
- NFR-8 (Maintainability): `QueuedMethods` derives from `ScreenReader`, so a new
  async method there is a compile error in the wrapper until it gets a line.
  `public-api-docs.test.ts` fails when a new public export has no JSDoc block.

## Architecture & Design Overview

Three layers. Only the middle one knows about Vitest.

```text
  test file
     |  sr.press('Tab')                 no await
     v
  QueuedScreenReader  (wrapper over ScreenReader)
     |  enqueue(name, run, callSite)
     v
  CommandQueue        (one promise chain, first in first out)
     |  reader.press('Tab')             track(settled), signal
     v
  ScreenReader        (@a11ied/core)
     |
     v
  transport: in-process page, broker process, or mounted browser page


  a11ied/test     -> CommandQueue, queueScreenReader, queuedScreenReader
  a11ied/vitest   -> createScreenReaderFixture: track onto task.promises,
                     pass signal, matchers
  a11ied/browser  -> createScreenReaderFixture over the mounted page
  a11ied/jest     -> later: queuedScreenReader in beforeEach, stop() in
                     afterEach, no track
```

### Data flow

Here is a Vitest test today.

```ts
import { describe, it } from 'vitest';
import { screenReader } from 'a11ied/test';

describe('combobox component', () => {
   it('announces active option and expanded state', async () => {
      await using sr = await screenReader({
         url: 'http://localhost:3000/components/combobox',
      });

      await sr.press('Tab');
      await sr.expectSpoken('combobox, Select country, collapsed');

      await sr.press('ArrowDown');
      await sr.expectSpoken('combobox, Select country, expanded');
      await sr.expectSpoken('option, Canada, 1 of 3');
   });
});
```

After this plan the same test has no `await`.

```ts
import { describe } from 'vitest';
import { test } from 'a11ied/vitest';

const combobox = test.extend({
   srOptions: { url: 'http://localhost:3000/components/combobox' },
});

describe('combobox component', () => {
   combobox('announces active option and expanded state', ({ sr }) => {
      sr.press('Tab');
      sr.expectSpoken('combobox, Select country, collapsed');

      sr.press('ArrowDown');
      sr.expectSpoken('combobox, Select country, expanded');
      sr.expectSpoken('option, Canada, 1 of 3');
   });
});
```

Under any other runner, one `await` starts the reader and the rest is queued.

```ts
import { queuedScreenReader } from 'a11ied/test';

it('announces active option and expanded state', async () => {
   await using sr = await queuedScreenReader({
      url: 'http://localhost:3000/components/combobox',
   });

   sr.press('Tab');
   sr.expectSpoken('combobox, Select country, collapsed');
});
```

A test that needs a value awaits that one call. The await runs everything queued
before it, in order, and then that call.

```ts
combobox('reads the selected option', async ({ sr }) => {
   sr.press('Tab', 'ArrowDown');
   const item = await sr.read();

   expect(item).toMatchObject({ role: 'option', name: 'Canada' });
});
```

A test that expects a command to fail awaits it and asserts on the rejection.
The queue continues after an awaited failure.

```ts
combobox('rejects an unspoken phrase', async ({ sr }) => {
   sr.press('Tab');

   await expect(sr.expectSpoken('Refund')).rejects.toThrow(/Refund/);
});
```

A test that waits for a phrase the page speaks later uses `expect.poll`.
`createExpectPoll` in `node_modules/vitest/dist/chunks/test.DNmyFkvJ.js` awaits
the callback, then calls the installed chai method for any matcher name,
including the matchers this package adds, and repeats until its timeout.

```ts
combobox('waits for the save announcement', async ({ sr }) => {
   sr.press('Control+s');

   await expect.poll(() => sr.transcript()).toHaveSpoken('Draft saved');
});
```

### Key interfaces

`packages/core/src/driver/command-queue.ts`:

```ts
/**
 * A queued command. Awaiting it runs every command queued before it, then
 * this one.
 */
export interface Queued<T> extends PromiseLike<T> {}

export interface CommandQueueOptions {
   /**
    * Receives one promise per command. It resolves when the command passes or
    * when its failure went to an await, and rejects only when the failure
    * went to no await.
    */
   track?: (settled: Promise<void>) => void;
   /** Skips every command not yet started once it aborts. */
   signal?: AbortSignal;
}

export class CommandQueue {
   constructor(options: CommandQueueOptions = {});
   enqueue<T>(name: string, run: () => Promise<T>, callSite: Error): Queued<T>;
   /**
    * Waits for every queued command. Rejects with the first failure nobody
    * awaited, unless a `track` function already reported it.
    */
   drain(): Promise<void>;
}
```

`packages/core/src/driver/queued-screen-reader.ts`:

```ts
type QueuedMethods = {
   [
      K in keyof ScreenReader as ScreenReader[K] extends (
         ...args: never[]
      ) => Promise<unknown>
         ? K
         : never
   ]: ScreenReader[K] extends (...args: infer A) => Promise<infer R>
      ? (...args: A) => Queued<R>
      : never;
};

export interface QueuedScreenReader extends Omit<QueuedMethods, 'stop'>, AsyncDisposable {
   /** Which reader this is, where it runs, and the page it last opened. */
   readonly session: ScreenReaderSession;
   /** The reader under the queue, for a call that must run at once. */
   readonly reader: ScreenReader;
   /**
    * Waits for every queued command. Rejects with the first failure nobody
    * awaited, unless a `track` function already reported it.
    */
   drain(): Promise<void>;
   /**
    * Drains, stops the reader even when the drain failed, then rethrows that
    * failure.
    */
   stop(): Promise<void>;
}

export function queueScreenReader(
   reader: ScreenReader,
   queue?: CommandQueueOptions,
): QueuedScreenReader;
```

`packages/core/src/driver/screen-reader-node.ts` adds:

```ts
export async function queuedScreenReader(
   options: ScreenReaderOptions = {},
   queue?: CommandQueueOptions,
): Promise<QueuedScreenReader>;
```

`packages/core/src/driver/screen-reader.ts` adds two methods next to
`expectSpoken`:

```ts
expectOn(wanted: WantedItem): Promise<void>;
expectSpokenInOrder(
   matches: readonly SpokenMatch[],
   options?: Pick<SpokenOptions, 'since'>,
): Promise<void>;
```

`packages/cli/src/vitest/fixture.ts`:

```ts
import type { RunnerTestCase } from 'vitest';

export function createScreenReaderFixture<Options>(
   start: (options: Options) => Promise<ScreenReader>,
): (
   context: {
      srOptions: Options;
      task: Readonly<RunnerTestCase>;
      signal: AbortSignal;
   },
   use: (sr: QueuedScreenReader) => Promise<void>,
) => Promise<void>;

/**
 * Records a command promise on the test task, so the runner waits for it and
 * reports its rejection as an error of the test itself.
 */
export function recordOnTask(
   task: Readonly<RunnerTestCase>,
   promise: Promise<void>,
): void;
```

`TestContext` in `node_modules/@vitest/runner/dist/tasks.d-DEYaIMIu.d.ts`
gives a test-scoped fixture `readonly task: Readonly<RunnerTestCase>` and
`readonly signal: AbortSignal`, and a fixture function receives that context as
its first argument. So the fixture is written
`async ({ srOptions, task, signal }, use) => ...`.

### Decisions and trade-offs

- An explicit method list plus a mapped type instead of a `Proxy`. A `Proxy`
  cannot be returned as `QueuedScreenReader` without an `as` cast. The mapped
  type turns a method added to `ScreenReader` into a compile error here, so the
  list cannot fall behind.
- The `sr` fixture type changes instead of a second fixture being added. Every
  existing test keeps passing, because `await sr.next('heading')` awaits a
  `Queued<string>` and gets the same string.
- Assertions are methods on the reader instead of unawaited `expect` calls.
  `JestExtendPlugin` in `node_modules/@vitest/expect/dist/index.js` at line 1868
  returns the thenable of a custom async matcher and records nothing, so an
  unawaited custom matcher produces no warning and its rejection arrives as an
  unhandled rejection with no link to the test. The `expect` matchers stay
  awaited, which is what Vitest's guide for extending matchers requires for
  async matchers.
- Failures without an await are reported through `task.promises`, not from the
  fixture teardown. The runner drains that array inside the test body's own
  timeout and before `afterEach`, so the reporter prints the failure under the
  test name with a code frame at the test line. The teardown drain stays as the
  fallback and reports nothing new.
- This adds one dependency on a field that vitest.dev does not document.
  `task.promises` is declared with a doc comment and `context.annotate()` uses
  it, so it is unlikely to disappear. If a Vitest release removes it, the
  fixture drops `track` and the failure falls back to the teardown drain, with
  the same message and the same stack, reported after `afterEach`.
- The failure keeps the original error object and replaces only `stack`. Test
  code that reads `error.expected` or `error.phrases` keeps working.

## Completion gate

Every row in this plan is incomplete until all of the following are true:

1. The row is mapped to one or more scenarios in
   `internal-docs/specs/gherkin/17-test-command-queue.feature`.
2. Automated implementation tests exist for the mapped scenarios.
3. An AI agent has run a manual acceptance pass from the same feature file and
   recorded it under `internal-docs/specs/manual-runs/<task-id>/`. If the row
   changes a user-facing API or docs page, the manual run must exercise that API
   or page itself.
4. `npm run standards` passes.

## Task Grid

<!-- markdownlint-disable MD013 -->

| Status | ID    | Task                                                        | Priority | Depends On   | Acceptance Criteria                                                                                                                                                                                                                                 |
| ------ | ----- | ----------------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [✓]    | VQ-01 | Add `CommandQueue` to `@a11ied/core`                        | H        | none         | Queue runs commands first in first out, awaited failures continue, unawaited failures stop the queue, `track` gets one promise per command, an aborted `signal` skips pending commands, stacks start at the call site, no unhandled rejection fires |
| [✓]    | VQ-02 | Add `QueuedScreenReader` and its two factories              | H        | VQ-01        | Every async `ScreenReader` method is reachable through the wrapper, both factories pass `track` and `signal` through, `session` is synchronous, `await using` drains then stops, `stop()` stops the reader after a failed drain, exports have JSDoc |
| [✓]    | VQ-03 | Add `expectOn` and `expectSpokenInOrder` to `ScreenReader`  | M        | none         | Both pass on a match, both throw `ScreenReaderAssertionError` with `expected` and `phrases` on a miss, tests live beside the existing `expectSpoken` tests                                                                                          |
| [✓]    | VQ-04 | Switch the Vitest and browser fixtures to the queued reader | H        | VQ-02, VQ-03 | One shared fixture factory, `sr` typed `QueuedScreenReader`, matchers accept it, existing tests stay green, an unawaited failure fails the spawned test itself with a code frame at the test line, peer range raised to `>=4.0.0`                   |
| [✓]    | VQ-05 | Update the docs site and the README                         | H        | VQ-04        | `testing.astro`, `api.astro`, `README.md`, and `ci.astro` describe the queued style, `expect.poll`, `testTimeout`, and the abort behavior, `npm run prose` passes                                                                                   |
| [✓]    | VQ-06 | Add the feature file, traceability rows, and manual runs    | M        | VQ-04        | `17-test-command-queue.feature` covers each behavior above, `traceability.md` has a row per task, manual runs exist under `internal-docs/specs/manual-runs/VQ-0n/`                                                                                  |

<!-- markdownlint-enable MD013 -->

## Task Details

### VQ-01 - Add CommandQueue to @a11ied/core

**Goal:** Give the package a runner-agnostic queue that runs commands in order
and reports one failure once.

**Step-by-step instructions:**

1. Create `packages/core/src/driver/command-queue.ts` with the `Queued<T>`
   interface, the `CommandQueueOptions` interface, and the `CommandQueue` class
   from the interface listing above. The constructor signature is
   `constructor(options: CommandQueueOptions = {})`.
2. Keep one promise chain inside the class. `enqueue` appends `run` to the
   chain and returns an object with a `then` that resolves with that command's
   value.
3. Track whether test code called `then` on a `Queued` before it settled. Use
   that to decide whether a rejection was awaited.
4. On an awaited failure, reject that await and let the chain continue with the
   next command.
5. On a failure nobody awaited, record the error, skip every later command, and
   reject each of them with the same error.
6. For every enqueued command, make a settled promise that resolves when the
   command passes or when its failure went to an await, and rejects only when
   the failure went to no await. Attach a no-op rejection handler to that
   promise, then hand it to `options.track`. The no-op handler stops Node from
   reporting an unhandled rejection, and `Promise.allSettled` in the caller
   still sees the rejection.
7. Report one failure exactly once, by the first of these that applies: the
   await that observed it, `options.track` when it is set, or `drain()` when it
   is not. So `drain()` resolves after an unawaited failure whenever `track` is
   set.
8. When `options.signal` aborts, skip every command the queue has not started
   and reject each of them with `signal.reason`. Let the command already running
   finish on its own.
9. Replace `stack` on the thrown error with `<name>: <message>` plus the frames
   from the `callSite` error. Assign the original stack to `cause`. Keep the
   error object, its class, and its other fields.
10.   Attach a rejection handler to every internal promise, so Node never reports
      an unhandled rejection.
11.   Add a JSDoc block to `Queued`, `CommandQueueOptions`, `CommandQueue`,
      `enqueue`, and `drain`.
12.   Create `packages/core/src/driver/command-queue.test.ts` with fake async
      commands. Cover: order, awaiting a `Queued`, an awaited failure, an
      unawaited failure, the error class and fields staying the same, the replaced
      stack starting at the call site, and no `unhandledRejection` event firing.
      For the last one, add a listener on `process` for the test and assert it was
      not called. That test covers the tracked promise too.
13.   Add these cases to the same file for the new options: `track` receives one
      promise per command, that promise resolves on success, it resolves on an
      awaited failure, it rejects on an unawaited failure, `drain()` resolves
      after an unawaited failure when `track` is set, `drain()` rejects after an
      unawaited failure when `track` is not set, and an aborted `signal` skips
      every pending command and rejects each with `signal.reason`.
14.   Run the tests.

```sh
cd /Users/mluedke/code/personal/a11ied
npx -y vitest run packages/core/src/driver/command-queue.test.ts
```

### VQ-02 - Add QueuedScreenReader and its two factories

**Goal:** Wrap a `ScreenReader` so every async method queues instead of running
at once.

**Step-by-step instructions:**

1. Create `packages/core/src/driver/queued-screen-reader.ts` with
   `QueuedMethods`, `QueuedScreenReader`, and `queueScreenReader` from the
   interface listing above. `queueScreenReader` takes a second parameter
   `queue?: CommandQueueOptions` and passes it to the `CommandQueue`
   constructor.
2. Build the wrapper as an object literal: one entry per async `ScreenReader`
   method, bound to the reader, plus `session`, `reader`, `drain`, `stop`, and
   `Symbol.asyncDispose`. Type the method entries as `QueuedMethods`.
3. Each entry is a function that creates a `callSite` error with `new Error()`,
   calls `Error.captureStackTrace(callSite, wrapper)` when that function exists,
   and then enqueues the bound method with its arguments. The check matters in
   browser mode: Firefox and WebKit have no `captureStackTrace`, and there the
   wrapper frame stays in the stack, which is acceptable.
4. Implement `stop()` as: drain, then stop the reader in a `finally`, then
   rethrow the drain failure. With `track` set the drain resolves, so `stop()`
   rethrows nothing and the runner reports the failure on its own.
5. Implement `[Symbol.asyncDispose]` as a call to `stop()`.
6. Add `queuedScreenReader` to
   `packages/core/src/driver/screen-reader-node.ts` with the signature from the
   interface listing above. Return
   `queueScreenReader(await screenReader(options), queue)`.
7. Export `CommandQueue`, `CommandQueueOptions`, `queueScreenReader`,
   `queuedScreenReader`, `Queued`, and `QueuedScreenReader` from
   `packages/core/src/index.ts`, beside the existing `ScreenReader` exports
   around lines 269 to 299.
8. Re-export the same six from `packages/cli/src/test/index.ts`.
9. Add a JSDoc block to every new export, because
   `packages/core/src/public-api-docs.test.ts` fails without one.
10.   Create `packages/core/src/driver/queued-screen-reader.test.ts` using inline
      `html`, so the jsdom engine runs and no browser is needed. Prove that every
      async `ScreenReader` method is reachable through the wrapper, that `session`
      is readable without an `await`, that `await using` drains and then stops,
      that `stop()` stops the reader even when the drain failed, and that both
      factories pass `track` and `signal` through to the queue.
11.   Run the tests and the public API docs test.

```sh
cd /Users/mluedke/code/personal/a11ied
npx -y vitest run packages/core/src/driver/queued-screen-reader.test.ts \
   packages/core/src/public-api-docs.test.ts
```

### VQ-03 - Add expectOn and expectSpokenInOrder to ScreenReader

**Goal:** Give the queued style two more assertions that need no `expect` call.

**Step-by-step instructions:**

1. Open `packages/core/src/driver/screen-reader.ts` and add both methods next to
   `expectSpoken`, which ends at line 307.
2. Implement `expectOn(wanted: WantedItem): Promise<void>` with
   `checkCurrentItem(await this.read(), wanted)`. On a failed check, throw
   `new ScreenReaderAssertionError(check.failure, { expected:
describeWanted(wanted), phrases: check.phrases })`.
3. Implement `expectSpokenInOrder`. Its first parameter is
   `matches: readonly SpokenMatch[]` and its second is
   `options: Pick<SpokenOptions, 'since'> = {}`. Call
   `checkSpokenInOrder(await this.transcript(), matches, options)`. On a
   failed check, throw `ScreenReaderAssertionError` with `expected` set to
   `matches.map(describeMatch).join(', then ')` and `phrases` from the check.
4. Import `checkCurrentItem`, `checkSpokenInOrder`, and `describeWanted` from
   the modules that already provide them:
   `packages/core/src/driver/spoken-matchers.ts` and
   `packages/core/src/driver/screen-reader-payloads.ts`.
5. Add a JSDoc block to each method.
6. Find the file that tests `expectSpoken` and add cases there for both new
   methods: a pass, and a failure that throws `ScreenReaderAssertionError` with
   the right `expected` and `phrases`.

   ```sh
   cd /Users/mluedke/code/personal/a11ied
   grep -rn "expectSpoken" --include=*.test.ts packages
   ```

7. Run the file you changed.

```sh
cd /Users/mluedke/code/personal/a11ied
npx -y vitest run packages/core/src/driver
```

### VQ-04 - Switch the Vitest and browser fixtures to the queued reader

**Goal:** Make the `sr` fixture queued in both Vitest entry points, from one
shared factory, and report an unawaited failure on the test itself.

**Step-by-step instructions:**

1. Create `packages/cli/src/vitest/fixture.ts` with `recordOnTask` and
   `createScreenReaderFixture` from the interface listing above.
2. Write `recordOnTask(task, promise)` to do what `recordAsyncOperation` at line
   3413 of `node_modules/@vitest/runner/dist/chunk-artifact.js` does. That
   function is not exported, so this file needs its own copy. Chain a `finally`
   that removes the entry from `task.promises` once it settles, create the array
   with `Object.defineProperty` when it is missing, because `task` is typed
   `Readonly<RunnerTestCase>` and this repo forbids `as` casts, then push the chained
   promise onto the array.
3. Write the fixture body as
   `async ({ srOptions, task, signal }, use) => { const sr =
queueScreenReader(await start(srOptions), { track: (settled) =>
recordOnTask(task, settled), signal }); try { await use(sr); } finally
{ await sr.stop(); } }`.
4. Change `packages/cli/src/vitest/index.ts` so `ScreenReaderFixtures.sr` is
   `QueuedScreenReader` and the `sr` fixture is
   `createScreenReaderFixture(screenReader)`.
5. Change `packages/cli/src/browser/index.ts` the same way.
   `BrowserScreenReaderFixtures.sr` becomes `QueuedScreenReader` and the fixture
   is `createScreenReaderFixture(screenReader)` with its own browser
   `screenReader`.
6. In `packages/cli/src/vitest/matchers.ts`, add `QueuedScreenReader` to
   `SpokenReceived` and to `ItemReceived`. Wrap `received.transcript()` and
   `received.read()` in `Promise.resolve(...)`, because they may return a
   `Queued` rather than a `Promise`. Leave `isScreenReader` alone. The wrapper
   exposes `transcript`, `read`, and `expectSpoken`, so the structural check
   still passes.
7. Leave `packages/cli/src/vitest/extend.ts` alone. `Matchers<T = any>` at line
   181 of `node_modules/@vitest/expect/dist/index.d.ts` is the interface Vitest
   4.1 augments, and that file already augments it.
8. Change `peerDependencies.vitest` in `packages/cli/package.json` from
   `>=3.0.0` to `>=4.0.0`. The fixture depends on Vitest 4 runner behavior.
9. Update the JSDoc example on `test` in `packages/cli/src/vitest/index.ts` to
   the queued style.
10.   Fix any type error the change causes in
      `packages/cli/src/vitest/index.test.ts`,
      `packages/cli/src/vitest/screen-reader-interaction.test.ts`,
      `packages/cli/src/vitest/screen-reader-structure.test.ts`,
      `packages/cli/src/vitest/console-app.test.ts`, and
      `packages/cli/src/browser/index.browser.test.ts`. Keep their assertions.
11.   Create `packages/cli/src/vitest/queued.test.ts` with three cases: a test in
      the no-await style that passes, a mixed test where one `await sr.read()`
      returns the value in queue order, and the spawned failure run below.
12.   For the spawned run, add `packages/cli/test/fixtures/queued-failure.test.ts`
      with three tests. The first has an unawaited `sr.expectSpoken` that cannot
      match. The second awaits a rejecting command inside
      `await expect(sr.expectSpoken('Refund')).rejects.toThrow(/Refund/)` and
      passes. The third throws its own error from the test body while commands are
      still queued.
13.   That fixture path is outside the root `include` pattern, so the root run
      ignores it. A positional file argument only narrows the files `include`
      already matched, so the spawned run needs its own config. Add
      `vitest.queued-failure.config.ts` at the repo root, beside
      `vitest.browser.config.ts`. Build it with `mergeConfig` from `vitest/config`
      over the root config, so the `@a11ied/*` aliases stay, and set
      `test.include` to `['packages/cli/test/fixtures/*.test.ts']` and
      `test.coverage.enabled` to `false`. From `queued.test.ts`, spawn the command
      below and assert on the JSON result.
14.   Assert three things about that JSON result. The first test's
      `assertionResults` entry has `status: "failed"` and the assertion message,
      so the failure is on the test itself and not on a hook. Its stack shows the
      line in `packages/cli/test/fixtures/queued-failure.test.ts` that queued the
      command. The second test has `status: "passed"`. The third test reports one
      error only, which proves the teardown reported nothing a second time.

      ```sh
      cd /Users/mluedke/code/personal/a11ied
      npx -y vitest run --config vitest.queued-failure.config.ts --reporter=json
      ```

15.   Run the full test suite and the standards script.

```sh
cd /Users/mluedke/code/personal/a11ied
npm test
npm run test:browser
npm run standards
```

### VQ-05 - Update the docs site and the README

**Goal:** Show the queued style everywhere the old style appears.

**Step-by-step instructions:**

1. Open `packages/docs/src/pages/guides/testing.astro`. Astro escapes braces in
   code samples as `{'{'}` and `{'}'}`, so keep that in every sample you edit.
2. Update the three `route-row` entries in the `install` section. Say that
   `a11ied/test` exports `queuedScreenReader` as well as `screenReader`, and
   that `a11ied/vitest` gives a queued `sr` fixture.
3. Add `queuedScreenReader` to the `session` section as the way to get the
   queued reader under a runner other than Vitest.
4. Rewrite the `vitest` section. Rename its title and its `toc` entry from
   "Vitest matchers and fixture" to a title that says the fixture is queued.
   Cover: the no-await style, awaiting a call when the test needs a value,
   awaiting a call the test expects to fail and the queue continuing after it,
   `sr.expectOn`, and `sr.expectSpokenInOrder`.
5. Add one sentence to the same section about timeouts. Queued commands run
   under Vitest's `testTimeout`, which is 30000 ms in this repo's root config
   and 5000 ms by Vitest default, and `ScreenReaderOptions.timeoutMs` bounds
   each single command.
6. Add one sentence about the abort behavior. When Vitest aborts the test, on a
   timeout or a cancelled run, the queue skips every command it has not started
   and the command already running finishes on its own.
7. Add `expect.poll` beside `sr.wait` in the section on assertions. Show
   `await expect.poll(() => sr.transcript()).toHaveSpoken('Draft saved')` and
   say it retries the matcher until its timeout, so it fits a phrase the page
   speaks later.
8. Replace the `example` section with the combobox test from this plan.
9. Update the `browser` section example to the queued style.
10.   Update the page `summary` prop to match the new content.
11.   Update `packages/docs/src/pages/reference/api.astro` lines 20, 33, 54, 65,
      66, and 265 where they describe the entry points and their exports.
12.   Update the `a11ied/test` snippet in `README.md` lines 28 to 38.
13.   Update `packages/docs/src/pages/guides/ci.astro` line 120 if the wording
      about the two entry points changed.
14.   Run the prose check and the standards script.

```sh
cd /Users/mluedke/code/personal/a11ied
npm run prose
npm run standards
```

### VQ-06 - Add the feature file, traceability rows, and manual runs

**Goal:** Record what the queue promises, and the evidence for it.

**Step-by-step instructions:**

1. Create `internal-docs/specs/gherkin/17-test-command-queue.feature`. Follow
   the style of `internal-docs/specs/gherkin/16-browser-policy.feature`.
2. Write one scenario per behavior: order, awaiting for a value, an awaited
   failure continuing the queue, an unawaited failure stopping it, one report
   per failure, the call-site stack, an aborted signal skipping pending
   commands, the queued Vitest fixture, the browser fixture, `expectOn`,
   `expectSpokenInOrder`, and the docs updates.

   ```gherkin
   Scenario: An unawaited failure fails the Vitest test
      Given a test queues three screen reader commands without awaiting them
      And the second command is an assertion that cannot match
      When the test body finishes
      Then the test fails with that assertion's message before afterEach runs
      And the third command never runs
      And the reported stack starts at the line that queued the second command
   ```

3. Add one row per task to `internal-docs/specs/gherkin/traceability.md`, with
   the same six columns the file already uses: Task ID, Source plan, Gherkin
   reference, Automated evidence, Manual evidence, Notes.
4. Run a manual acceptance pass for each task from the feature file and record
   it under `internal-docs/specs/manual-runs/VQ-01/` through
   `internal-docs/specs/manual-runs/VQ-06/`. For VQ-04 and VQ-05, exercise the
   fixture and the docs pages themselves.
5. Run the standards script.

```sh
cd /Users/mluedke/code/personal/a11ied
npm run standards
```

## New Code

- `packages/core/src/driver/command-queue.ts`
   - New. The runner-agnostic queue.
   - `Queued<T>`: a queued command that a test can await.
   - `CommandQueueOptions`: the `track` function and the `AbortSignal`.
   - `CommandQueue`: runs queued commands one at a time.
   - `CommandQueue.enqueue`: appends a command and returns its `Queued`.
   - `CommandQueue.drain`: waits for everything queued and reports the first
     failure nobody awaited, unless `track` already reported it.
- `packages/core/src/driver/command-queue.test.ts`
   - New. Unit tests for the queue over fake async commands.
- `packages/core/src/driver/queued-screen-reader.ts`
   - New. The queued wrapper over `ScreenReader`.
   - `QueuedMethods`: a mapped type that turns each async `ScreenReader` method
     into one that returns `Queued`. The wrapper's method list is typed by it.
   - `QueuedScreenReader`: the queued reader, with `session`, `reader`, `drain`,
     `stop`, and `Symbol.asyncDispose`.
   - `queueScreenReader`: wraps an existing reader, with optional queue options.
- `packages/core/src/driver/queued-screen-reader.test.ts`
   - New. Tests over inline HTML with the jsdom engine.
- `packages/core/src/driver/screen-reader-node.ts`
   - Changed. Adds `queuedScreenReader`, which starts a reader and wraps it.
- `packages/core/src/driver/screen-reader.ts`
   - Changed. Adds `ScreenReader.expectOn` and
     `ScreenReader.expectSpokenInOrder`.
- `packages/core/src/index.ts`
   - Changed. Exports the queue, its options, the two factories, and the two
     types.
- `packages/cli/src/test/index.ts`
   - Changed. Re-exports the same six from `a11ied/test`.
- `packages/cli/src/vitest/fixture.ts`
   - New. `createScreenReaderFixture`: builds the `sr` fixture body from a
     `screenReader` function, and passes `track` and `signal` to the queue.
   - New. `recordOnTask`: pushes a command promise onto `task.promises` and
     removes it once it settles.
- `packages/cli/src/vitest/index.ts`
   - Changed. `sr` becomes a `QueuedScreenReader` from the shared factory.
- `packages/cli/src/vitest/matchers.ts`
   - Changed. `SpokenReceived` and `ItemReceived` accept a `QueuedScreenReader`.
- `packages/cli/src/vitest/queued.test.ts`
   - New. Tests for the queued fixture, including the spawned failure run.
- `packages/cli/test/fixtures/queued-failure.test.ts`
   - New. Three tests spawned by `queued.test.ts`: an unawaited failure, an
     awaited rejection that passes, and a test body error raised while commands
     are still queued.
- `vitest.queued-failure.config.ts`
   - New. The root config plus an `include` for the fixture directory, used only
     by that spawned run.
- `packages/cli/src/browser/index.ts`
   - Changed. `sr` becomes a `QueuedScreenReader` from the shared factory.
- `packages/cli/package.json`
   - Changed. `peerDependencies.vitest` becomes `>=4.0.0`.
- `packages/docs/src/pages/guides/testing.astro`
   - Changed. Install rows, `session`, `vitest`, `example`, and `browser`
     sections, plus the `toc` array and the page `summary`. Adds `expect.poll`,
     the `testTimeout` sentence, and the abort sentence.
- `packages/docs/src/pages/guides/vitest.astro`
   - New. The Vitest guide: install, the `sr` fixture, the command queue, timeouts,
     matchers, the example test file, browser mode, and other runners. Linked from
     `packages/docs/src/lib/nav.ts`. The testing guide keeps the runner-agnostic API.
- `packages/docs/src/pages/index.astro`
   - Changed. The code sample and the component testing card use the fixture.
- `packages/docs/src/pages/reference/api.astro`
   - Changed. Entry point rows for the new exports.
- `packages/docs/src/pages/guides/ci.astro`
   - Changed. Line 120, if the entry point wording changed.
- `README.md`
   - Changed. The `a11ied/test` snippet at lines 28 to 38.
- `internal-docs/specs/gherkin/17-test-command-queue.feature`
   - New. Acceptance scenarios for the queue and the fixtures.
- `internal-docs/specs/gherkin/traceability.md`
   - Changed. One row per VQ task.
- `internal-docs/specs/manual-runs/VQ-01/` through `VQ-06/`
   - New. Recorded manual acceptance passes.

## Tests

- `packages/core/src/driver/command-queue.test.ts` proves the queue rules with
  fake async commands: commands run first in first out, awaiting a `Queued`
  runs everything before it and returns the value, an awaited failure rejects
  that await and the queue continues, an unawaited failure skips every later
  command, the thrown error keeps its class and fields, the replaced stack
  starts at the call site, and no `unhandledRejection` event fires. That last
  case covers the tracked promise too.
- The same file proves the options: `track` receives one promise per command,
  that promise resolves on success and on an awaited failure, it rejects on an
  unawaited failure, `drain()` resolves after an unawaited failure when `track`
  is set, `drain()` rejects after an unawaited failure when `track` is not set,
  and an aborted `signal` skips every pending command and rejects each with
  `signal.reason`.
- `packages/core/src/driver/queued-screen-reader.test.ts` proves the wrapper over
  a real reader started from inline HTML: every async `ScreenReader` method is
  reachable, `session` needs no `await`, `await using` drains and then stops,
  `stop()` stops the reader even when the drain failed, and both factories pass
  `track` and `signal` through.
- The file that already tests `expectSpoken` proves `expectOn` and
  `expectSpokenInOrder` pass on a match and throw `ScreenReaderAssertionError`
  with the right `expected` and `phrases` on a miss.
- `packages/cli/src/vitest/queued.test.ts` proves the fixture: a no-await test
  passes, a mixed test gets the value from `await sr.read()` in queue order, and
  a spawned Vitest run over `packages/cli/test/fixtures/queued-failure.test.ts`
  produces the JSON result described below.
- That JSON result proves three things. The unawaited failure has
  `status: "failed"` on its own `assertionResults` entry with the assertion
  message, and its stack shows the line in the fixture test file that queued the
  command. The test that awaits a rejecting command inside
  `await expect(...).rejects.toThrow(...)` has `status: "passed"`. The test that
  throws its own error while commands are still queued reports that one error
  only, so the teardown reported nothing a second time.
- `packages/cli/src/vitest/index.test.ts`,
  `packages/cli/src/vitest/screen-reader-interaction.test.ts`,
  `packages/cli/src/vitest/screen-reader-structure.test.ts`, and
  `packages/cli/src/vitest/console-app.test.ts` prove the type change did not
  break the old style. They keep awaiting each call.
- `packages/cli/src/browser/index.browser.test.ts` proves the same for browser
  mode. It runs under `npm run test:browser`, not the root run.
- `packages/core/src/public-api-docs.test.ts` proves every new public export has
  a JSDoc block.

## Review Checklist

- [ ] Every outstanding question in this plan is answered in place.
- [ ] No ambiguity is left for the implementing agent to guess at.
- [ ] Every row maps to one or more scenarios in
      `internal-docs/specs/gherkin/17-test-command-queue.feature`.
- [ ] Automated implementation tests exist for the mapped scenarios.
- [ ] An AI agent ran a manual acceptance pass from the same feature file and
      recorded it under `internal-docs/specs/manual-runs/<task-id>/`. A row that
      changes a user-facing API or docs page exercised that API or page itself.
- [ ] `npm run standards` passes.
