import type {
   DriverActionRequestInput,
   DriverCurrentItem,
   DriverFocusTarget,
   DriverLoopItem,
   DriverNavigationKind,
   DriverStateSnapshot,
   DriverTableMove,
   DriverTranscriptEntry,
} from '@a11ied/contracts';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import type { WantedItem } from './broker-loops.js';
import { ScreenReaderAssertionError } from './screen-reader-errors.js';
import {
   buildWaitPayload,
   currentItemOf,
   describeMatch,
   describeWanted,
   loopItemsSchema,
   pickMax,
   pickMove,
   readString,
   transcriptPhrasesOf,
   type LoopOptions,
   type NavigateOptions,
   type WaitOptions,
} from './screen-reader-payloads.js';
import type {
   ScreenReaderDocument,
   ScreenReaderRunOptions,
   ScreenReaderSession,
   ScreenReaderStep,
   ScreenReaderTransport,
} from './screen-reader-transport.js';
import {
   assertCheckPassed,
   checkCurrentItem,
   checkSpoken,
   checkSpokenInOrder,
   type SpokenMatch,
   type SpokenOptions,
} from './spoken-matchers.js';
import {
   selectTranscriptEntries,
   type TranscriptSelection,
} from './transcript-recorder.js';

export type {
   LoopOptions,
   NavigateOptions,
   WaitOptions,
} from './screen-reader-payloads.js';

/**
 * One screen reader session as a test drives it. Every navigation method returns the
 * phrase it produced, `read` returns the item under the cursor, and the checks throw a
 * `ScreenReaderAssertionError` that says what was expected and what was said instead.
 * `await using` disposes it. Runners without explicit resource management call `stop`.
 */
export class ScreenReader implements AsyncDisposable {
   private readonly transport: ScreenReaderTransport;
   private stopped = false;

   constructor(transport: ScreenReaderTransport) {
      this.transport = transport;
   }

   /** Which reader this is, where it runs, and the page it last opened. */
   get session(): ScreenReaderSession {
      return { ...this.transport.session };
   }

   private assertRunning(): void {
      if (this.stopped) {
         throw new CliEnvironmentError(
            'session-stopped',
            'This screen reader was stopped. Start another with screenReader().',
         );
      }
   }

   private async step(
      request: DriverActionRequestInput,
      options?: ScreenReaderRunOptions,
   ): Promise<ScreenReaderStep> {
      this.assertRunning();
      return this.transport.run(request, options);
   }

   private async phrase(
      request: DriverActionRequestInput,
      options?: ScreenReaderRunOptions,
   ): Promise<string> {
      const step = await this.step(request, options);
      return step.state.lastSpokenPhrase ?? '';
   }

   private async loop(
      request: DriverActionRequestInput,
      options?: ScreenReaderRunOptions,
   ): Promise<DriverLoopItem[]> {
      const step = await this.step(request, options);
      return loopItemsSchema.parse(step.details?.items ?? []);
   }

   /** Moves one item, or jumps to the next element of `kind`, and returns the phrase. */
   next(
      kind: DriverNavigationKind = 'item',
      options: NavigateOptions = {},
   ): Promise<string> {
      return this.phrase(
         { action: 'next', payload: { kind, ...pickMove(options) } },
         options,
      );
   }

   previous(
      kind: DriverNavigationKind = 'item',
      options: NavigateOptions = {},
   ): Promise<string> {
      return this.phrase(
         { action: 'previous', payload: { kind, ...pickMove(options) } },
         options,
      );
   }

   /**
    * Presses key chords in order, one chord per argument, such as `press('Tab',
    * 'Enter')`.
    */
   press(...chords: string[]): Promise<string> {
      return this.phrase({ action: 'press', payload: { keys: chords } });
   }

   type(text: string): Promise<string> {
      return this.phrase({ action: 'type', payload: { text } });
   }

   interact(): Promise<string> {
      return this.phrase({ action: 'interact' });
   }

   stopInteracting(): Promise<string> {
      return this.phrase({ action: 'stop-interacting' });
   }

   activate(): Promise<string> {
      return this.phrase({ action: 'activate' });
   }

   top(): Promise<string> {
      return this.phrase({ action: 'top' });
   }

   bottom(): Promise<string> {
      return this.phrase({ action: 'bottom' });
   }

   escape(): Promise<string> {
      return this.phrase({ action: 'escape' });
   }

   /** Runs a named command from `a1 sr list`, such as a VoiceOver Commander phrase. */
   perform(command: string, commandSet?: string): Promise<string> {
      const payload = commandSet === undefined ? { command } : { command, commandSet };
      return this.phrase({ action: 'perform', payload });
   }

   /** The item under the cursor without moving: role, name, value, states, phrase, source. */
   async read(): Promise<DriverCurrentItem> {
      const { state } = await this.step({ action: 'read' });
      return currentItemOf(state);
   }

   /** The full reader state after the last action, including the transcript. */
   async state(): Promise<DriverStateSnapshot> {
      this.assertRunning();
      const step = await this.transport.status();
      return step.state;
   }

   /** The page title, or the window summary on VoiceOver and NVDA. */
   async title(): Promise<string> {
      const step = await this.step({ action: 'title' });
      return readString(step.details, 'title');
   }

   /**
    * Moves the cursor to the next place `text` appears, and throws when it is not on the
    * page.
    */
   async find(text: string): Promise<string> {
      const step = await this.step({ action: 'find', payload: { text } });
      if (step.details?.found !== true) {
         throw new ScreenReaderAssertionError(
            `"${text}" is not on the page: the cursor came back around without finding it.`,
            { expected: text, phrases: transcriptPhrasesOf(step.state) },
         );
      }
      return step.state.lastSpokenPhrase ?? '';
   }

   /** Steps forward until the item has the role, the name, or both. Throws when none does. */
   async goTo(wanted: WantedItem, options: LoopOptions = {}): Promise<string> {
      const payload = { ...wanted, ...pickMax(options) };
      const step = await this.step({ action: 'goto', payload }, options);
      if (step.details?.found !== true) {
         const want = describeWanted(wanted);
         throw new ScreenReaderAssertionError(
            `No ${want} is on the page after ${String(step.details?.steps ?? 0)} steps; stopped at ${String(step.details?.stoppedAt)}.`,
            { expected: want, phrases: transcriptPhrasesOf(step.state) },
         );
      }
      return step.state.lastSpokenPhrase ?? '';
   }

   /** The rotor: every element of one kind from the top of the page, as announced. */
   elements(
      kind: Exclude<DriverNavigationKind, 'item'>,
      options: LoopOptions = {},
   ): Promise<DriverLoopItem[]> {
      return this.loop(
         { action: 'elements', payload: { kind, ...pickMax(options) } },
         options,
      );
   }

   /** Say-all from the cursor to the end of the page, one item per entry. */
   readAll(options: LoopOptions = {}): Promise<DriverLoopItem[]> {
      return this.loop({ action: 'read-all', payload: pickMax(options) }, options);
   }

   /** Moves to the top, then reads the whole page. */
   async walk(options: LoopOptions = {}): Promise<DriverLoopItem[]> {
      await this.top();
      return this.readAll(options);
   }

   /**
    * Pauses for `ms`, or polls the transcript until a phrase spoken after the call
    * matches `for` and returns it. Throws at `timeoutMs`, which defaults to 5000.
    */
   async wait(options: WaitOptions): Promise<string> {
      const payload = buildWaitPayload(options);
      const step = await this.step({ action: 'wait', payload }, options);
      if (options.for !== undefined && step.details?.matched !== true) {
         throw new ScreenReaderAssertionError(
            `${describeMatch(options.for)} was not announced within ${String(step.details?.waitedMs)} ms of the wait.`,
            {
               expected: describeMatch(options.for),
               phrases: transcriptPhrasesOf(step.state),
            },
         );
      }
      return readString(step.details, 'phrase');
   }

   /** Marks a point in the transcript that `since` options refer back to. */
   async checkpoint(label: string): Promise<void> {
      await this.step({ action: 'checkpoint', payload: { label } });
   }

   /** The timestamped transcript, narrowed by `since` and `tail` when given. */
   async transcript(
      selection: TranscriptSelection = {},
   ): Promise<DriverTranscriptEntry[]> {
      const step = await this.step({ action: 'transcript' });
      return selectTranscriptEntries(step.state.transcript, selection);
   }

   /** Opens a page in the same session: a URL, or `{ html }` for inline markup. */
   async open(document: string | ScreenReaderDocument): Promise<void> {
      this.assertRunning();
      await this.transport.open(
         typeof document === 'string' ? { url: document } : document,
      );
   }

   /** Moves between cells of the table the cursor is in, or reads a header without moving. */
   async table(move: DriverTableMove): Promise<string> {
      const step = await this.step({ action: 'table', payload: { move } });
      const header = step.details?.header;
      return typeof header === 'string' ? header : (step.state.lastSpokenPhrase ?? '');
   }

   /** Saves what the VoiceOver cursor is on to `path` and returns that path. */
   async screenshot(path: string): Promise<string> {
      const step = await this.step({ action: 'screenshot', payload: { path } });
      return readString(step.details, 'screenshot');
   }

   /**
    * Brings a window to the front on VoiceOver and NVDA. The session's own app by
    * default.
    */
   async focus(target?: DriverFocusTarget): Promise<void> {
      await this.step(
         target ? { action: 'focus', payload: target } : { action: 'focus' },
      );
   }

   /**
    * Checks the transcript for a phrase and throws when the check fails. The error says
    * what was expected, how many phrases were checked, and what the reader said.
    */
   async expectSpoken(match: SpokenMatch, options: SpokenOptions = {}): Promise<void> {
      const check = checkSpoken(await this.transcript(), match, options);
      assertCheckPassed(check, describeMatch(match));
   }

   /**
    * Checks that the item under the cursor has the role, the name, or both, and throws
    * when it does not. The error says which item the cursor is on.
    */
   async expectOn(wanted: WantedItem): Promise<void> {
      assertCheckPassed(
         checkCurrentItem(await this.read(), wanted),
         describeWanted(wanted),
      );
   }

   /**
    * Checks that each match was announced after the previous one, with any phrases
    * between, and throws when one is missing. The error says which match it did not
    * find.
    */
   async expectSpokenInOrder(
      matches: readonly SpokenMatch[],
      options: Pick<SpokenOptions, 'since'> = {},
   ): Promise<void> {
      const check = checkSpokenInOrder(await this.transcript(), matches, options);
      assertCheckPassed(
         check,
         matches.map((match) => describeMatch(match)).join(', then '),
      );
   }

   /** Stops the reader and releases its browser or broker. Safe to call twice. */
   async stop(): Promise<void> {
      if (this.stopped) {
         return;
      }
      this.stopped = true;
      await this.transport.stop();
   }

   async [Symbol.asyncDispose](): Promise<void> {
      await this.stop();
   }
}
