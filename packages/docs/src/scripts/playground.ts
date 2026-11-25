/**
 * Runs the playground page. A standalone test case loads in the frame, and this script
 * adds a11ied's simulated screen reader to that frame from outside, then drives it. The
 * reader is the same script `a1 sr --sr virtual` adds to a page, so the phrases match.
 */
import type { VirtualRuntime } from '@a11ied/guidepup/browser';
import type { TranscriptEntry } from '@a11ied/support-data/types';

import {
   evaluateTestRun,
   type GradedTestCase,
} from '../../../../scripts/sr-runner/evaluate.mjs';

type EntryKind = 'item' | 'live' | 'edge' | 'mark';

interface LogEntry {
   readonly command: string;
   readonly phrase: string;
   readonly kind: EntryKind;
   /** A short label shown before the text: the role, or the kind of live region. */
   readonly tag: string;
   readonly text: string;
   /** The role of the item under the cursor, when this phrase is that item's. */
   readonly role?: string | undefined;
}

interface Parts {
   readonly root: HTMLElement;
   readonly caseButtons: readonly HTMLButtonElement[];
   readonly filter: HTMLInputElement;
   readonly jumpSelect: HTMLSelectElement;
   readonly frame: HTMLIFrameElement;
   readonly cursor: HTMLElement;
   readonly log: HTMLElement;
   readonly commands: HTMLElement;
   readonly checkList: HTMLElement;
   readonly rowTemplate: HTMLTemplateElement;
   readonly checkTemplate: HTMLTemplateElement;
}

const JUMP_KINDS = ['heading', 'link', 'button', 'form-field', 'landmark'] as const;

type JumpKind = (typeof JUMP_KINDS)[number];

const LIVE_PATTERN = /^(polite|assertive): /;

const EDGE_PHRASES = new Set(['document', 'end of document']);

/** Time for the page's own script, and any live region, to react to an action. */
const SETTLE_MS = 300;

const READ_STEP_MS = 90;

const MAX_STEPS = 60;

const STATUS_RESET_MS = 2500;

const CASE_PARAM = 'case';

const CHECKPOINT = 'before';

/** The width of the outline drawn around the element under the cursor, in pixels. */
const CURSOR_BORDER = 3;

const state: {
   slug: string;
   runtime: VirtualRuntime | undefined;
   entries: LogEntry[];
   commands: string[];
   spokenCount: number;
   /** Where in the log the first activation happened, for cases that need one. */
   activatedAt: number | undefined;
   /** Whether the cursor has been on the last item of the page. */
   hasReachedEnd: boolean;
   isBusy: boolean;
   loadCount: number;
} = {
   slug: '',
   runtime: undefined,
   entries: [],
   commands: [],
   spokenCount: 0,
   activatedAt: undefined,
   hasReachedEnd: false,
   isBusy: false,
   loadCount: 0,
};

function isVirtualRuntime(value: unknown): value is VirtualRuntime {
   return (
      typeof value === 'object' &&
      value !== null &&
      'start' in value &&
      typeof value.start === 'function' &&
      'runPortable' in value &&
      typeof value.runPortable === 'function'
   );
}

function isJumpKind(value: string): value is JumpKind {
   return JUMP_KINDS.some((kind) => kind === value);
}

function isGradedTestCase(value: unknown): value is GradedTestCase {
   return (
      typeof value === 'object' &&
      value !== null &&
      'slug' in value &&
      typeof value.slug === 'string' &&
      'evaluation' in value &&
      typeof value.evaluation === 'object' &&
      value.evaluation !== null &&
      'expectedPhrases' in value.evaluation
   );
}

function wait(ms: number): Promise<void> {
   return new Promise((resolve) => {
      globalThis.setTimeout(resolve, ms);
   });
}

function findParts(): Parts | undefined {
   const root = document.querySelector('[data-playground]');

   if (!(root instanceof HTMLElement)) {
      return undefined;
   }
   const caseButtons = [...root.querySelectorAll('[data-pg-case-button]')].filter(
      (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
   );
   const checkList = root.querySelector('[data-pg-check-list]'),
      checkTemplate = root.querySelector('[data-pg-check-template]'),
      commands = root.querySelector('[data-pg-commands]'),
      cursor = root.querySelector('[data-pg-cursor]'),
      filter = root.querySelector('[data-pg-filter]'),
      frame = root.querySelector('[data-pg-frame]'),
      jumpSelect = root.querySelector('[data-pg-jump]'),
      log = root.querySelector('[data-pg-log]'),
      rowTemplate = root.querySelector('[data-pg-row-template]');

   if (
      !(filter instanceof HTMLInputElement) ||
      !(jumpSelect instanceof HTMLSelectElement) ||
      !(frame instanceof HTMLIFrameElement) ||
      !(cursor instanceof HTMLElement) ||
      !(log instanceof HTMLElement) ||
      !(commands instanceof HTMLElement) ||
      !(checkList instanceof HTMLElement) ||
      !(rowTemplate instanceof HTMLTemplateElement) ||
      !(checkTemplate instanceof HTMLTemplateElement)
   ) {
      return undefined;
   }
   return {
      root,
      caseButtons,
      filter,
      jumpSelect,
      frame,
      cursor,
      log,
      commands,
      checkList,
      rowTemplate,
      checkTemplate,
   };
}

function setText(parts: Parts, selector: string, text: string): void {
   const element = parts.root.querySelector(selector);

   if (element) {
      element.textContent = text;
   }
}

function showStatus(parts: Parts, message: string): void {
   setText(parts, '[data-pg-status]', message);
   globalThis.setTimeout(() => {
      setText(parts, '[data-pg-status]', '');
   }, STATUS_RESET_MS);
}

function setBusy(parts: Parts, isBusy: boolean): void {
   state.isBusy = isBusy;
   for (const control of parts.root.querySelectorAll('[data-pg-action]')) {
      if (control instanceof HTMLButtonElement) {
         control.disabled = isBusy;
      }
   }
}

/** The test case as a11ied's runner grades it, read from the page. */
function readTestCase(parts: Parts, slug: string): GradedTestCase | undefined {
   const about = parts.root.querySelector(`[data-pg-about="${CSS.escape(slug)}"]`),
      raw = about instanceof HTMLElement ? about.dataset.test : undefined;
   const parsed: unknown = raw === undefined ? undefined : JSON.parse(raw);

   return isGradedTestCase(parsed) ? parsed : undefined;
}

function getCaseHref(parts: Parts, slug: string): string {
   return `${parts.root.dataset.basePath ?? '/'}compatibility/cases/${slug}/`;
}

/** Turns one spoken phrase into a log entry, using the cursor's role when it applies. */
function toEntry(command: string, phrase: string, role: string | undefined): LogEntry {
   const live = LIVE_PATTERN.exec(phrase);

   if (live) {
      return {
         command,
         phrase,
         kind: 'live',
         tag: `live: ${live[1] ?? ''}`,
         text: phrase.slice(live[0].length),
      };
   }
   if (EDGE_PHRASES.has(phrase)) {
      return { command, phrase, kind: 'edge', tag: '', text: phrase };
   }
   const rolePrefix = `${role ?? ''}, `;

   if (role && phrase.startsWith(rolePrefix)) {
      return {
         command,
         phrase,
         kind: 'item',
         tag: role,
         text: phrase.slice(rolePrefix.length),
         role,
      };
   }
   return { command, phrase, kind: 'item', tag: '', text: phrase, role };
}

function renderRow(parts: Parts, entry: LogEntry, position: number): void {
   const row = parts.rowTemplate.content.firstElementChild?.cloneNode(true);

   if (!(row instanceof HTMLElement)) {
      return;
   }
   const tag = row.querySelector('[data-row-tag]');

   const cells: ReadonlyArray<readonly [selector: string, text: string]> = [
      ['[data-row-step]', entry.kind === 'mark' ? '' : String(position)],
      ['[data-row-command]', entry.command],
      ['[data-row-text]', entry.text],
   ];

   row.classList.add(`ws-row--${entry.kind}`);
   for (const [selector, text] of cells) {
      const cell = row.querySelector(selector);

      if (cell) {
         cell.textContent = text;
      }
   }
   if (tag instanceof HTMLElement && entry.tag !== '') {
      tag.textContent = entry.tag;
      tag.hidden = false;
   }
   parts.log.append(row);
   parts.log.scrollTop = parts.log.scrollHeight;
}

function toTranscriptEntry(entry: LogEntry, index: number): TranscriptEntry {
   const base = { step: index + 1, command: entry.command, phrase: entry.phrase };

   // The runner grades by the role the reader reported, so the same role goes with each line.
   return entry.role === undefined ? base : { ...base, role: entry.role };
}

/** The log in the form a11ied's runner grades, and where the activation falls in it. */
function getTranscript(): { entries: TranscriptEntry[]; activatedAt: number } {
   const marksBefore = state.entries
         .slice(0, state.activatedAt ?? state.entries.length)
         .filter((entry) => entry.kind === 'mark').length,
      spoken = state.entries.filter((entry) => entry.kind !== 'mark');

   return {
      entries: spoken.map((entry, index) => toTranscriptEntry(entry, index)),
      activatedAt: (state.activatedAt ?? state.entries.length) - marksBefore,
   };
}

/** Grades the log so far with the checks a11ied's runner uses for this case. */
function renderChecks(parts: Parts): void {
   const result = parts.root.querySelector('[data-pg-result]'),
      testCase = readTestCase(parts, state.slug);

   if (!testCase) {
      parts.checkList.replaceChildren();
      return;
   }
   const isInteractive = testCase.evaluation.mode === 'interact',
      transcript = getTranscript();
   const graded = evaluateTestRun(
      testCase,
      transcript.entries,
      isInteractive ? transcript.activatedAt : 0,
   );
   // A check that has not passed is only a failure once the whole case has been heard.
   const isComplete =
      state.hasReachedEnd && (!isInteractive || state.activatedAt !== undefined);

   if (result instanceof HTMLElement) {
      result.textContent = isComplete ? `Result: ${graded.outcome}` : '';
      result.className = `ws-result ws-result--${graded.outcome}`;
   }
   parts.checkList.replaceChildren(
      ...graded.assertionResults.flatMap((check) => {
         const node = parts.checkTemplate.content.firstElementChild?.cloneNode(true);

         if (!(node instanceof HTMLElement)) {
            return [];
         }
         const isFailed = check.verdict === 'fail' && isComplete,
            isMet = check.verdict === 'pass';
         /*
          * Only a failed MUST or SHOULD counts against the case. A MAY that was not
          * conveyed is reported as unsupported, which is not a failure.
          */
         const failedLabel = isComplete ? 'Not met' : 'Not yet',
            unmetLabel = check.verdict === 'fail' ? failedLabel : 'Not said';
         const cells: ReadonlyArray<readonly [selector: string, text: string]> = [
            ['[data-check-state]', isMet ? 'Met' : unmetLabel],
            ['[data-check-priority]', check.priority],
            ['[data-check-statement]', check.statement],
         ];

         if (isMet) {
            node.classList.add('ws-check--met');
         } else if (isFailed) {
            node.classList.add('ws-check--failed');
         }
         for (const [selector, text] of cells) {
            const cell = node.querySelector(selector);

            if (cell) {
               cell.textContent = text;
            }
         }
         return [node];
      }),
   );
}

/** Shows the empty hint before anything is said, and the cursor line and checks after. */
function renderCounts(parts: Parts): void {
   const hasSpoken = state.entries.length > 0;
   const shownWhen: ReadonlyArray<readonly [selector: string, isShown: boolean]> = [
      ['[data-pg-log-empty]', !hasSpoken],
      ['[data-pg-now]', hasSpoken],
      ['[data-pg-checks]', hasSpoken],
   ];

   for (const [selector, isShown] of shownWhen) {
      const element = parts.root.querySelector(selector);

      if (element instanceof HTMLElement) {
         element.hidden = !isShown;
      }
   }
   parts.commands.textContent = state.commands.join('\n');
}

function addEntries(parts: Parts, entries: readonly LogEntry[]): void {
   for (const entry of entries) {
      state.entries.push(entry);
      renderRow(
         parts,
         entry,
         state.entries.filter((each) => each.kind !== 'mark').length,
      );
   }
   renderCounts(parts);
   renderChecks(parts);
}

/** Outlines the element under the reader's cursor, drawn over the frame from outside. */
async function showCursor(parts: Parts, runtime: VirtualRuntime): Promise<void> {
   const inner = parts.frame.contentDocument,
      node = await runtime.readActivationNode();

   if (!node || !inner || node === inner.body || node === inner.documentElement) {
      parts.cursor.hidden = true;
      return;
   }
   node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
   const box = node.getBoundingClientRect();

   parts.cursor.hidden = false;
   const widest = parts.frame.clientWidth - CURSOR_BORDER - CURSOR_BORDER;

   parts.cursor.style.left = `${String(Math.max(box.left - CURSOR_BORDER, 0))}px`;
   parts.cursor.style.top = `${String(Math.max(box.top - CURSOR_BORDER, 0))}px`;
   parts.cursor.style.width = `${String(Math.min(box.width, widest))}px`;
   parts.cursor.style.height = `${String(box.height)}px`;
}

/**
 * Reads what the reader has said since the last look and adds it to the log.
 *
 * @returns Whether the cursor is on the last item of the page
 */
async function collect(
   parts: Parts,
   runtime: VirtualRuntime,
   command: string,
): Promise<boolean> {
   const [speech, current] = await Promise.all([
      runtime.readSpeech(),
      runtime.readCurrentItem(),
   ]);
   const fresh = speech.spokenPhraseLog.slice(state.spokenCount);
   const { item } = current;

   state.spokenCount = speech.spokenPhraseLog.length;
   state.hasReachedEnd ||= current.atEnd;
   addEntries(
      parts,
      fresh.map((phrase) =>
         toEntry(command, phrase, phrase === item.phrase ? item.role : undefined),
      ),
   );
   if (fresh.length === 0) {
      showStatus(parts, 'Nothing new was announced.');
   }
   const name = item.name ? ` "${item.name}"` : '',
      states = item.states.length > 0 ? ` (${item.states.join(', ')})` : '';

   setText(parts, '[data-pg-now]', `Cursor: ${item.role ?? 'item'}${name}${states}`);
   await showCursor(parts, runtime);
   return current.atEnd;
}

function addRuntime(parts: Parts): Promise<VirtualRuntime> {
   const inner = parts.frame.contentDocument,
      source = parts.root.dataset.runtimeSrc ?? '';
   const read = (): unknown =>
      parts.frame.contentWindow
         ? Reflect.get(parts.frame.contentWindow, 'a11iedVirtualRuntime')
         : undefined;

   return new Promise((resolve, reject) => {
      const existing = read();

      if (isVirtualRuntime(existing)) {
         resolve(existing);
         return;
      }
      if (!inner) {
         reject(new Error('The test case did not load.'));
         return;
      }
      const tag = inner.createElement('script');

      tag.src = source;
      tag.addEventListener('load', () => {
         const loaded = read();

         if (isVirtualRuntime(loaded)) {
            resolve(loaded);
         } else {
            reject(new Error('The screen reader script did not start.'));
         }
      });
      tag.addEventListener('error', () => {
         reject(new Error('The screen reader script did not load.'));
      });
      inner.head.append(tag);
   });
}

function showCase(parts: Parts, slug: string): void {
   const href = getCaseHref(parts, slug),
      open = parts.root.querySelector('[data-pg-open]');

   for (const block of parts.root.querySelectorAll('[data-pg-about], [data-pg-real]')) {
      if (block instanceof HTMLElement) {
         block.hidden = (block.dataset.pgAbout ?? block.dataset.pgReal) !== slug;
      }
   }
   for (const button of parts.caseButtons) {
      const isCurrent = button.dataset.pgCaseButton === slug;

      if (isCurrent) {
         button.setAttribute('aria-current', 'true');
         button.scrollIntoView({ block: 'nearest' });
         setText(parts, '[data-pg-title]', button.dataset.title ?? '');
         parts.frame.title = `Test case: ${button.dataset.title ?? slug}`;
      } else {
         button.removeAttribute('aria-current');
      }
   }
   if (open instanceof HTMLAnchorElement) {
      open.href = href;
   }
   setText(parts, '[data-pg-url]', new URL(href, globalThis.location.href).href);
}

/** Shows only the cases whose title, attribute, or group contains the typed text. */
function filterCases(parts: Parts): void {
   const query = parts.filter.value.trim().toLowerCase();

   for (const item of parts.root.querySelectorAll('[data-pg-case-item]')) {
      if (item instanceof HTMLElement) {
         item.hidden = !(item.dataset.search ?? '').includes(query);
      }
   }
   for (const group of parts.root.querySelectorAll('[data-pg-group]')) {
      if (group instanceof HTMLElement) {
         group.hidden = !group.querySelector('[data-pg-case-item]:not([hidden])');
      }
   }
   const none = parts.root.querySelector('[data-pg-none]');

   if (none instanceof HTMLElement) {
      none.hidden = Boolean(
         parts.root.querySelector('[data-pg-case-item]:not([hidden])'),
      );
   }
}

/** Clears the log and the reader state, and shows the chosen case's details. */
function resetFor(parts: Parts, slug: string): void {
   const url = new URL(globalThis.location.href);

   state.slug = slug;
   state.runtime = undefined;
   state.entries = [];
   state.commands = [];
   state.spokenCount = 0;
   state.activatedAt = undefined;
   state.hasReachedEnd = false;
   parts.log.replaceChildren();
   parts.cursor.hidden = true;
   showCase(parts, slug);
   renderCounts(parts);
   renderChecks(parts);
   setText(parts, '[data-pg-now]', '');
   url.searchParams.set(CASE_PARAM, slug);
   globalThis.history.replaceState({}, '', url);
}

function loadFrame(frame: HTMLIFrameElement, href: string): Promise<void> {
   return new Promise((resolve) => {
      frame.addEventListener(
         'load',
         () => {
            resolve();
         },
         { once: true },
      );
      frame.src = href;
   });
}

/** Loads a case into the frame and starts the reader on it. */
async function loadCase(parts: Parts, slug: string): Promise<void> {
   const href = getCaseHref(parts, slug),
      loadID = state.loadCount + 1;

   state.loadCount = loadID;
   resetFor(parts, slug);
   setBusy(parts, true);

   try {
      await loadFrame(parts.frame, href);
      const runtime = await addRuntime(parts);

      // A newer load has taken over the frame.
      if (state.loadCount !== loadID) {
         return;
      }
      await runtime.start();
      state.runtime = runtime;
      state.commands = [
         `a1 sr start --sr virtual ${new URL(href, globalThis.location.href).href}`,
      ];
      // Starting says "document". The log stays empty until the visitor does something.
      const speech = await runtime.readSpeech();

      state.spokenCount = speech.spokenPhraseLog.length;
      renderCounts(parts);
      parts.frame.contentWindow?.addEventListener('scroll', async () => {
         await showCursor(parts, runtime);
      });
   } catch (error) {
      showStatus(parts, error instanceof Error ? error.message : String(error));
   } finally {
      if (state.loadCount === loadID) {
         setBusy(parts, false);
      }
   }
}

/** Runs one reader action, then logs what it made the reader say. */
async function step(
   parts: Parts,
   options: {
      command: string;
      cli: string;
      run: (runtime: VirtualRuntime) => Promise<unknown>;
      /** Wait for the page to react before reading what was said. */
      settles?: boolean;
   },
): Promise<boolean> {
   const { runtime } = state;

   if (!runtime) {
      return true;
   }
   await options.run(runtime);
   if (options.settles) {
      await wait(SETTLE_MS);
   }
   state.commands.push(options.cli);
   return collect(parts, runtime, options.command);
}

/** Moves forward one item at a time until the end of the page, at a readable pace. */
async function readOn(parts: Parts, remaining: number): Promise<void> {
   const { runtime } = state;

   if (!runtime || remaining === 0) {
      return;
   }
   await runtime.runPortable('next');
   const isAtEnd = await collect(parts, runtime, 'read all');

   if (isAtEnd) {
      return;
   }
   await wait(READ_STEP_MS);
   await readOn(parts, remaining - 1);
}

/** Moves forward until the cursor is on the named button. */
async function goToButton(
   parts: Parts,
   name: string,
   remaining: number,
): Promise<boolean> {
   const { runtime } = state;

   if (!runtime || remaining === 0) {
      return false;
   }
   await runtime.runPortable('next');
   await collect(parts, runtime, 'go to');
   const { item } = await runtime.readCurrentItem();

   if (item.role === 'button' && item.name === name) {
      return true;
   }
   return goToButton(parts, name, remaining - 1);
}

function markActivation(parts: Parts): void {
   if (state.activatedAt === undefined) {
      state.activatedAt = state.entries.length;
      renderChecks(parts);
   }
}

/** Does what a11ied's own runner does for this case: read it all, then act if it has to. */
async function runWholeTest(parts: Parts): Promise<void> {
   const rule = readTestCase(parts, state.slug)?.evaluation;
   const activateName = rule?.activateButtonText ?? '',
      isInteractive = rule?.mode === 'interact';
   const [firstExpected] = rule?.expectedPhrases ?? [];

   await loadCase(parts, state.slug);
   setBusy(parts, true);
   await readOn(parts, MAX_STEPS);
   state.commands.push('a1 sr read-all');
   if (isInteractive && activateName !== '' && state.runtime) {
      await state.runtime.runPortable('top');
      // Going back to the top repeats phrases already in the log, so they are not added.
      const speech = await state.runtime.readSpeech();

      state.spokenCount = speech.spokenPhraseLog.length;
      const isFound = await goToButton(parts, activateName, MAX_STEPS);

      state.commands.push(
         'a1 sr top',
         `a1 sr goto --role button --name "${activateName}"`,
         `a1 sr checkpoint ${CHECKPOINT}`,
      );
      if (isFound) {
         addEntries(parts, [
            {
               command: 'checkpoint',
               phrase: '',
               kind: 'mark',
               tag: '',
               text: `Checkpoint "${CHECKPOINT}"`,
            },
         ]);
         markActivation(parts);
         await step(parts, {
            command: 'activate',
            cli: 'a1 sr activate',
            run: (runtime) => runtime.runPortable('activate'),
            settles: true,
         });
      }
   }
   if (firstExpected !== undefined) {
      state.commands.push(
         isInteractive
            ? `a1 sr expect "${firstExpected}" --since ${CHECKPOINT}`
            : `a1 sr expect "${firstExpected}"`,
      );
   }
   state.commands.push('a1 sr stop');
   renderCounts(parts);
}

async function copyText(parts: Parts, text: string, done: string): Promise<void> {
   try {
      await navigator.clipboard.writeText(text);
      showStatus(parts, done);
   } catch {
      showStatus(parts, 'Copying is not allowed in this browser.');
   }
}

function getLogText(): string {
   return state.entries
      .filter((entry) => entry.kind !== 'mark')
      .map((entry, index) => `${String(index + 1)}. ${entry.phrase}`)
      .join('\n');
}

async function jumpToNext(parts: Parts): Promise<void> {
   const kind = parts.jumpSelect.value;

   if (!isJumpKind(kind)) {
      return;
   }
   await step(parts, {
      command: `next ${kind}`,
      cli: `a1 sr next ${kind}`,
      run: async (runtime) => {
         const outcome = await runtime.navigate({ kind, direction: 'next' });

         if (!outcome.moved) {
            showStatus(parts, `There is no next ${kind.replace('-', ' ')}.`);
         }
      },
   });
}

/** What each control does to the reader. */
function getReaderActions(parts: Parts): Record<string, () => Promise<unknown>> {
   const press = (command: string, chord: string): Promise<boolean> =>
      step(parts, {
         command,
         cli: `a1 sr press ${chord}`,
         run: (runtime) => runtime.press([chord]),
         settles: true,
      });

   return {
      restart: () => loadCase(parts, state.slug),
      'run-test': () => runWholeTest(parts),
      'read-all': async () => {
         state.commands.push('a1 sr read-all');
         await readOn(parts, MAX_STEPS);
      },
      next: () =>
         step(parts, {
            command: 'next',
            cli: 'a1 sr next',
            run: (runtime) => runtime.runPortable('next'),
         }),
      previous: () =>
         step(parts, {
            command: 'previous',
            cli: 'a1 sr previous',
            run: (runtime) => runtime.runPortable('previous'),
         }),
      activate: () => {
         markActivation(parts);
         return step(parts, {
            command: 'activate',
            cli: 'a1 sr activate',
            run: (runtime) => runtime.runPortable('activate'),
            settles: true,
         });
      },
      tab: () => press('Tab', 'Tab'),
      'shift-tab': () => press('Shift+Tab', 'Shift+Tab'),
      escape: () =>
         step(parts, {
            command: 'Escape',
            cli: 'a1 sr escape',
            run: (runtime) => runtime.runPortable('escape'),
            settles: true,
         }),
      jump: () => jumpToNext(parts),
   };
}

async function runReaderAction(parts: Parts, action: string): Promise<void> {
   const run = getReaderActions(parts)[action];

   if (!run || state.isBusy) {
      return;
   }
   setBusy(parts, true);
   try {
      await run();
   } catch (error) {
      showStatus(parts, error instanceof Error ? error.message : String(error));
   } finally {
      renderCounts(parts);
      setBusy(parts, false);
   }
}

async function runAction(parts: Parts, action: string): Promise<void> {
   if (action === 'copy-log') {
      await copyText(parts, getLogText(), 'Copied the log.');
      return;
   }
   if (action === 'copy-commands') {
      await copyText(parts, state.commands.join('\n'), 'Copied the commands.');
      return;
   }
   await runReaderAction(parts, action);
}

function start(): void {
   const parts = findParts();

   if (!parts) {
      return;
   }
   const requested = new URL(globalThis.location.href).searchParams.get(CASE_PARAM),
      slugs = parts.caseButtons.map((button) => button.dataset.pgCaseButton ?? '');
   const first = requested !== null && slugs.includes(requested) ? requested : slugs[0];

   parts.root.addEventListener('click', async (event) => {
      const button =
         event.target instanceof Element
            ? event.target.closest('[data-pg-action], [data-pg-case-button]')
            : undefined;

      if (!(button instanceof HTMLElement)) {
         return;
      }
      if (button.dataset.pgAction !== undefined) {
         await runAction(parts, button.dataset.pgAction);
         return;
      }
      if (button.dataset.pgCaseButton !== undefined) {
         await loadCase(parts, button.dataset.pgCaseButton);
      }
   });
   parts.filter.addEventListener('input', () => {
      filterCases(parts);
   });
   if (first !== undefined) {
      loadCase(parts, first).catch((error: unknown) => {
         showStatus(parts, error instanceof Error ? error.message : String(error));
      });
   }
}

start();
