/**
 * Runs the playground page. A page loads in the frame: a standalone test case, or any
 * page whose address the visitor types. a11ied's simulated screen reader is added to the
 * frame along with a small relay script, and this script drives the reader by sending the
 * relay messages. The reader is the same script `a1 sr --sr virtual` adds to a page, so
 * the phrases match.
 */
import type { TranscriptEntry } from '@a11ied/support-data/types';

import {
   evaluateTestRun,
   type GradedTestCase,
} from '../../../../scripts/sr-runner/evaluate.mjs';
import { toEntry, toTranscriptEntry, type LogEntry } from './playground/log';
import { findParts, setShown, setText, type Parts } from './playground/parts';
import {
   isRecord,
   listenToRelay,
   mountByAddress,
   mountFetched,
   readState,
   request,
   surveyItems,
   type CursorBox,
   type ReaderState,
} from './playground/relay';

type Mode = 'cases' | 'explore';

interface StepOptions {
   readonly command: string;
   readonly cli: string;
   readonly method: 'runPortable' | 'navigate' | 'press';
   readonly argument: unknown;
   /** The action can change the page, so wait for it to react and count its items again. */
   readonly changesPage?: boolean;
}

const JUMP_KINDS = ['heading', 'link', 'button', 'form-field', 'landmark'] as const;

type JumpKind = (typeof JUMP_KINDS)[number];

/** Time for the page's own script, and any live region, to react to an action. */
const SETTLE_MS = 300;

const READ_STEP_MS = 90;

/** The most items counted on one page. A longer page shows its count with a plus sign. */
const MAX_ITEMS = 300;

const STATUS_RESET_MS = 2500;

const CHECKPOINT = 'before';

const LOADING_NOTE = 'Loading the page and starting the screen reader...';

/** The width of the outline drawn around the element under the cursor, in pixels. */
const CURSOR_BORDER = 3;

const state: {
   mode: Mode;
   slug: string;
   pageURL: string;
   entries: LogEntry[];
   commands: string[];
   spokenCount: number;
   /** Where in the log the first activation happened, for cases that need one. */
   activatedAt: number | undefined;
   hasReachedEnd: boolean;
   isBusy: boolean;
   isReady: boolean;
   loadCount: number;
   tokens: readonly string[];
   isCapped: boolean;
   /** The cursor's place among the page's items, when it is known. */
   index: number | undefined;
   atEnd: boolean;
   canActivate: boolean;
} = {
   mode: 'cases',
   slug: '',
   pageURL: '',
   entries: [],
   commands: [],
   spokenCount: 0,
   activatedAt: undefined,
   hasReachedEnd: false,
   isBusy: false,
   isReady: false,
   loadCount: 0,
   tokens: [],
   isCapped: false,
   index: undefined,
   atEnd: false,
   canActivate: false,
};

function isJumpKind(value: string): value is JumpKind {
   return JUMP_KINDS.some((kind) => kind === value);
}

function isGradedTestCase(value: unknown): value is GradedTestCase {
   return (
      isRecord(value) &&
      typeof value.slug === 'string' &&
      isRecord(value.evaluation) &&
      'expectedPhrases' in value.evaluation
   );
}

function wait(ms: number): Promise<void> {
   return new Promise((resolve) => {
      globalThis.setTimeout(resolve, ms);
   });
}

function describe(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

function showStatus(parts: Parts, message: string): void {
   setText(parts, '[data-pg-status]', message);
   globalThis.setTimeout(() => {
      setText(parts, '[data-pg-status]', '');
   }, STATUS_RESET_MS);
}

/** A control is off while the reader is busy, and whenever pressing it would do nothing. */
function renderAvailability(parts: Parts): void {
   const isIdle = state.isReady && !state.isBusy;
   const allowed: Record<string, boolean> = {
      previous: state.index !== 0,
      next: !state.atEnd,
      'read-all': !state.atEnd,
      activate: state.canActivate,
   };

   for (const control of parts.root.querySelectorAll('[data-pg-action]')) {
      if (control instanceof HTMLButtonElement) {
         const action = control.dataset.pgAction ?? '',
            isAlwaysOn = action.startsWith('copy-');

         control.disabled = !isAlwaysOn && !(isIdle && (allowed[action] ?? true));
      }
   }
}

function setBusy(parts: Parts, isBusy: boolean): void {
   state.isBusy = isBusy;
   renderAvailability(parts);
}

/** Says where the cursor is among the page's items. */
function renderPosition(parts: Parts): void {
   const { index, isCapped, tokens } = state;

   if (index === undefined || tokens.length === 0) {
      setText(parts, '[data-pg-position]', '');
      return;
   }
   setText(
      parts,
      '[data-pg-position]',
      `${String(index + 1)} of ${String(tokens.length)}${isCapped ? '+' : ''}`,
   );
}

/** Finds the cursor among the counted items, preferring the place nearest the last one. */
function locate(position: string, near: number | undefined): number | undefined {
   const matches = state.tokens.flatMap((token, index) =>
      token === position ? [index] : [],
   );
   let [best] = matches;

   if (best === undefined || near === undefined) {
      return best;
   }
   for (const index of matches) {
      if (Math.abs(index - near) < Math.abs(best - near)) {
         best = index;
      }
   }
   return best;
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
      testCase = state.mode === 'cases' ? readTestCase(parts, state.slug) : undefined;

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
function renderPanels(parts: Parts): void {
   const hasSpoken = state.entries.length > 0;

   setShown(parts, '[data-pg-log-empty]', !hasSpoken);
   setShown(parts, '[data-pg-now]', hasSpoken);
   setShown(parts, '[data-pg-checks]', hasSpoken && state.mode === 'cases');
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
   renderPanels(parts);
   renderChecks(parts);
}

/** Outlines the element under the reader's cursor, drawn over the frame from outside. */
function showCursor(parts: Parts, box: CursorBox | undefined): void {
   if (!box) {
      parts.cursor.hidden = true;
      return;
   }
   const widest = parts.frame.clientWidth - CURSOR_BORDER - CURSOR_BORDER;

   parts.cursor.hidden = false;
   parts.cursor.style.left = `${String(Math.max(box.left - CURSOR_BORDER, 0))}px`;
   parts.cursor.style.top = `${String(Math.max(box.top - CURSOR_BORDER, 0))}px`;
   parts.cursor.style.width = `${String(Math.min(box.width, widest))}px`;
   parts.cursor.style.height = `${String(box.height)}px`;
}

/** Counts the page's items again, then puts the cursor back where it was. */
async function countItems(parts: Parts, keepIndex: number | undefined): Promise<void> {
   const survey = await surveyItems(parts.frame, MAX_ITEMS);

   if (!survey) {
      return;
   }
   state.tokens = survey.tokens;
   state.isCapped = survey.isCapped;
   state.index = Math.min(keepIndex ?? 0, Math.max(survey.tokens.length - 1, 0));
   await request(parts.frame, 'seek', state.index);
   // Counting made the reader repeat phrases that are already in the log.
   const after = await readState(parts.frame);

   state.spokenCount = after.phrases.length;
   state.atEnd = after.atEnd;
   state.canActivate = after.canActivate;
   showCursor(parts, state.index === 0 ? undefined : after.box);
}

/**
 * Reads what the reader has said since the last look and adds it to the log.
 *
 * @returns What the reader reported
 */
async function sync(
   parts: Parts,
   command: string,
   moved: -1 | 0 | 1 = 0,
): Promise<ReaderState> {
   const reader = await readState(parts.frame);
   const fresh = reader.phrases.slice(state.spokenCount);
   const { item } = reader;

   state.spokenCount = reader.phrases.length;
   state.atEnd = reader.atEnd;
   state.canActivate = reader.canActivate;
   state.hasReachedEnd ||= reader.atEnd;
   /*
    * An action can change what the item says, and with it the name of its position. The
    * cursor has not moved then, so its place is kept.
    */
   const located = locate(reader.position, state.index) ?? state.index;

   state.index =
      moved !== 0 && state.index !== undefined
         ? Math.max(state.index + moved, 0)
         : located;
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
   showCursor(parts, reader.box);
   renderPosition(parts);
   return reader;
}

/** Runs one reader action, then logs what it made the reader say. */
async function step(parts: Parts, options: StepOptions): Promise<ReaderState> {
   const moves: Record<string, -1 | 1> = { next: 1, previous: -1 };
   const moved =
      options.method === 'runPortable' ? (moves[String(options.argument)] ?? 0) : 0;

   await request(parts.frame, options.method, options.argument);
   if (options.changesPage) {
      await wait(SETTLE_MS);
   }
   state.commands.push(options.cli);
   const reader = await sync(parts, options.command, moved);

   if (options.changesPage && reader.hasChanged) {
      await countItems(parts, state.index);
      renderPosition(parts);
   }
   return reader;
}

/** The reader's script, then the relay's, as full addresses. */
function getScriptURLs(parts: Parts): string[] {
   return [parts.root.dataset.runtimeSrc ?? '', parts.root.dataset.bridgeSrc ?? ''].map(
      (source) => new URL(source, globalThis.location.href).href,
   );
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
         const group = button.closest('[data-pg-group]');

         if (group instanceof HTMLDetailsElement) {
            group.open = true;
         }
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
      if (group instanceof HTMLDetailsElement) {
         const hasMatch =
            group.querySelector('[data-pg-case-item]:not([hidden])') !== null;

         group.hidden = !hasMatch;
         // A match inside a closed group would otherwise stay out of sight.
         if (query !== '' && hasMatch) {
            group.open = true;
         }
      }
   }
   setShown(
      parts,
      '[data-pg-none]',
      !parts.root.querySelector('[data-pg-case-item]:not([hidden])'),
   );
}

/** Clears the log and what is known about the page in the frame. */
function resetSession(parts: Parts): void {
   state.entries = [];
   state.commands = [];
   state.spokenCount = 0;
   state.activatedAt = undefined;
   state.hasReachedEnd = false;
   state.isReady = false;
   state.tokens = [];
   state.isCapped = false;
   state.index = undefined;
   state.atEnd = false;
   state.canActivate = false;
   parts.log.replaceChildren();
   parts.cursor.hidden = true;
   setShown(parts, '[data-pg-blocked]', false);
   setText(parts, '[data-pg-now]', '');
   renderPanels(parts);
   renderChecks(parts);
   renderPosition(parts);
}

function rememberInAddress(mode: Mode, key: 'case' | 'url', value: string): void {
   const url = new URL(globalThis.location.href);

   url.searchParams.delete('case');
   url.searchParams.delete('url');
   url.searchParams.set('mode', mode);
   url.searchParams.set(key, value);
   globalThis.history.replaceState({}, '', url);
}

/** Starts the reader on the page now in the frame and counts the page's items. */
async function beginSession(parts: Parts, address: string): Promise<void> {
   await request(parts.frame, 'start');
   state.commands = [`a1 sr start --sr virtual ${address}`];
   state.isReady = true;
   await countItems(parts, 0);
   renderPanels(parts);
   renderPosition(parts);
}

/** Explains why a page would not load here, and how to test it with the CLI. */
function showBlocked(parts: Parts, url: string, error: unknown): void {
   // A refused request arrives as a TypeError with no useful text. Other errors say why.
   const reason =
      error instanceof TypeError
         ? 'A browser lets one site read another only when that site allows it, and this one does not.'
         : describe(error);

   setText(
      parts,
      '[data-pg-blocked-text]',
      `This page could not be loaded here. ${reason} The a1 command has no such limit:`,
   );
   setText(
      parts,
      '[data-pg-blocked-commands]',
      [`a1 sr start --sr virtual ${url}`, 'a1 sr walk', 'a1 sr stop'].join('\n'),
   );
   setShown(parts, '[data-pg-blocked]', true);
}

/** Loads a test case into the frame and starts the reader on it. */
async function loadCase(parts: Parts, slug: string): Promise<void> {
   const href = getCaseHref(parts, slug),
      loadID = state.loadCount + 1;

   state.loadCount = loadID;
   state.slug = slug;
   resetSession(parts);
   showCase(parts, slug);
   rememberInAddress('cases', 'case', slug);
   setBusy(parts, true);
   setText(parts, '[data-pg-status]', LOADING_NOTE);
   try {
      await mountByAddress(parts.frame, href, getScriptURLs(parts));
      if (state.loadCount === loadID) {
         await beginSession(parts, new URL(href, globalThis.location.href).href);
      }
   } catch (error) {
      showStatus(parts, describe(error));
   } finally {
      if (state.loadCount === loadID) {
         setText(parts, '[data-pg-status]', '');
         setBusy(parts, false);
      }
   }
}

/** Reads what the visitor typed as an address, adding the scheme when it is left out. */
function toPageURL(typed: string): URL | undefined {
   const text = typed.trim();

   if (text === '') {
      return undefined;
   }
   const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text),
      isLocalPath = text.startsWith('/');

   try {
      const url = new URL(
         hasScheme || isLocalPath ? text : `https://${text}`,
         globalThis.location.href,
      );

      return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
   } catch {
      return undefined;
   }
}

/** Loads any page into the frame and starts the reader on it. */
async function loadPage(parts: Parts, typed: string): Promise<void> {
   const loadID = state.loadCount + 1,
      url = toPageURL(typed);

   if (!url) {
      showStatus(parts, 'Type a web address, such as example.com.');
      return;
   }
   state.loadCount = loadID;
   state.pageURL = url.href;
   resetSession(parts);
   parts.urlInput.value = url.href;
   parts.frame.title = `Page under test: ${url.href}`;
   rememberInAddress('explore', 'url', url.href);
   setBusy(parts, true);
   setText(parts, '[data-pg-status]', LOADING_NOTE);
   try {
      await mountFetched(parts.frame, url.href, getScriptURLs(parts));
      if (state.loadCount === loadID) {
         await beginSession(parts, url.href);
      }
   } catch (error) {
      if (state.loadCount === loadID) {
         parts.frame.removeAttribute('srcdoc');
         showBlocked(parts, url.href, error);
      }
   } finally {
      if (state.loadCount === loadID) {
         setText(parts, '[data-pg-status]', '');
         setBusy(parts, false);
      }
   }
}

function setMode(parts: Parts, mode: Mode): void {
   state.mode = mode;
   parts.root.dataset.mode = mode;
   for (const button of parts.root.querySelectorAll('[data-pg-mode]')) {
      if (button instanceof HTMLElement) {
         button.setAttribute('aria-pressed', String(button.dataset.pgMode === mode));
      }
   }
   // Moving around is the whole point of the open mode, so its extra keys start open.
   for (const more of parts.root.querySelectorAll('[data-pg-more]')) {
      if (more instanceof HTMLDetailsElement) {
         more.open = mode === 'explore';
      }
   }
}

/** Moves forward one item at a time until the end of the page, at a readable pace. */
async function readOn(parts: Parts, remaining: number): Promise<void> {
   if (remaining === 0 || state.atEnd) {
      return;
   }
   await request(parts.frame, 'runPortable', 'next');
   await sync(parts, 'read all', 1);
   await wait(READ_STEP_MS);
   await readOn(parts, remaining - 1);
}

/** Moves forward until the cursor is on the named button. */
async function goToButton(
   parts: Parts,
   name: string,
   remaining: number,
): Promise<boolean> {
   if (remaining === 0) {
      return false;
   }
   await request(parts.frame, 'runPortable', 'next');
   const { item } = await sync(parts, 'go to', 1);

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

function activate(parts: Parts): Promise<ReaderState> {
   markActivation(parts);
   return step(parts, {
      command: 'activate',
      cli: 'a1 sr activate',
      method: 'runPortable',
      argument: 'activate',
      changesPage: true,
   });
}

/** Does what a11ied's own runner does for this case: read it all, then act if it has to. */
async function runWholeTest(parts: Parts): Promise<void> {
   const rule = readTestCase(parts, state.slug)?.evaluation;
   const activateName = rule?.activateButtonText ?? '',
      isInteractive = rule?.mode === 'interact';
   const [firstExpected] = rule?.expectedPhrases ?? [];

   await loadCase(parts, state.slug);
   setBusy(parts, true);
   await readOn(parts, MAX_ITEMS);
   state.commands.push('a1 sr read-all');
   if (isInteractive && activateName !== '') {
      await request(parts.frame, 'runPortable', 'top');
      // Going back to the top repeats phrases already in the log, so they are not added.
      const atTop = await readState(parts.frame);

      state.spokenCount = atTop.phrases.length;
      state.index = 0;
      state.commands.push(
         'a1 sr top',
         `a1 sr goto --role button --name "${activateName}"`,
         `a1 sr checkpoint ${CHECKPOINT}`,
      );
      if (await goToButton(parts, activateName, MAX_ITEMS)) {
         addEntries(parts, [
            {
               command: 'checkpoint',
               phrase: '',
               kind: 'mark',
               tag: '',
               text: `Checkpoint "${CHECKPOINT}"`,
            },
         ]);
         await activate(parts);
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
   const before = state.spokenCount;

   await step(parts, {
      command: `next ${kind}`,
      cli: `a1 sr next ${kind}`,
      method: 'navigate',
      argument: { kind, direction: 'next' },
   });
   if (state.spokenCount === before) {
      showStatus(parts, `There is no next ${kind.replace('-', ' ')}.`);
   }
}

/** What each control does to the reader. */
function getReaderActions(parts: Parts): Record<string, () => Promise<unknown>> {
   const press = (chord: string): Promise<ReaderState> =>
      step(parts, {
         command: chord,
         cli: `a1 sr press ${chord}`,
         method: 'press',
         argument: [chord],
         changesPage: true,
      });
   const move = (verb: 'next' | 'previous'): Promise<ReaderState> =>
      step(parts, {
         command: verb,
         cli: `a1 sr ${verb}`,
         method: 'runPortable',
         argument: verb,
      });

   return {
      restart: () =>
         state.mode === 'cases'
            ? loadCase(parts, state.slug)
            : loadPage(parts, state.pageURL),
      'run-test': () => runWholeTest(parts),
      'read-all': async () => {
         state.commands.push('a1 sr read-all');
         await readOn(parts, MAX_ITEMS);
      },
      next: () => move('next'),
      previous: () => move('previous'),
      activate: () => activate(parts),
      tab: () => press('Tab'),
      'shift-tab': () => press('Shift+Tab'),
      escape: () =>
         step(parts, {
            command: 'Escape',
            cli: 'a1 sr escape',
            method: 'runPortable',
            argument: 'escape',
            changesPage: true,
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
      showStatus(parts, describe(error));
   } finally {
      renderPanels(parts);
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

/** Opens a mode, loading the last page used in it or the one to start with. */
async function openMode(parts: Parts, mode: Mode, target?: string): Promise<void> {
   setMode(parts, mode);
   if (mode === 'cases') {
      const [first] = parts.caseButtons;

      await loadCase(
         parts,
         target ?? (state.slug || (first?.dataset.pgCaseButton ?? '')),
      );
      return;
   }
   const practice = parts.root.querySelector('[data-pg-load]');
   const fallback =
      practice instanceof HTMLElement ? (practice.dataset.pgLoad ?? '') : '';

   await loadPage(parts, target ?? (state.pageURL || fallback));
}

async function handleClick(parts: Parts, target: EventTarget | null): Promise<void> {
   const button =
      target instanceof Element
         ? target.closest(
              '[data-pg-action], [data-pg-case-button], [data-pg-mode], [data-pg-load]',
           )
         : undefined;

   if (!(button instanceof HTMLElement)) {
      return;
   }
   const { pgAction, pgCaseButton, pgLoad, pgMode } = button.dataset;

   if (pgAction !== undefined) {
      await runAction(parts, pgAction);
   } else if (pgCaseButton !== undefined) {
      await loadCase(parts, pgCaseButton);
   } else if (pgMode === 'cases' || pgMode === 'explore') {
      await openMode(parts, pgMode);
   } else if (pgLoad !== undefined) {
      await loadPage(parts, pgLoad);
   }
}

function start(): void {
   const parts = findParts();

   if (!parts) {
      return;
   }
   const params = new URL(globalThis.location.href).searchParams;
   const isExplore = params.get('mode') === 'explore',
      requestedCase = params.get('case') ?? undefined,
      requestedURL = params.get('url') ?? undefined;
   const hasCase = parts.caseButtons.some(
      (button) => button.dataset.pgCaseButton === requestedCase,
   );
   const report = (error: unknown): void => {
      showStatus(parts, describe(error));
   };

   listenToRelay(parts.frame, {
      onNavigate: (url) => {
         if (state.mode === 'explore') {
            loadPage(parts, url).catch(report);
         } else {
            showStatus(parts, 'A test case does not follow links.');
         }
      },
   });
   parts.root.addEventListener('click', (event) => {
      handleClick(parts, event.target).catch(report);
   });
   parts.filter.addEventListener('input', () => {
      filterCases(parts);
   });
   parts.root.querySelector('[data-pg-address]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      loadPage(parts, parts.urlInput.value).catch(report);
   });
   if (isExplore) {
      openMode(parts, 'explore', requestedURL).catch(report);
   } else {
      openMode(parts, 'cases', hasCase ? requestedCase : undefined).catch(report);
   }
}

start();
