import { afterEach, describe, expect, it, vi } from 'vitest';
import {
   DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
   driverActionRequestSchema,
   driverStateSnapshotSchema,
   type DriverStateSnapshot,
   type DriverTranscriptEntry,
} from '@a11ied/contracts';
import type { DriverAdapter } from '@a11ied/guidepup';

import { runContextAction } from './context-action.js';
import { createContextTransport } from './screen-reader-context.js';
import { ScreenReader } from './screen-reader.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import {
   buildDriverTranscript,
   formatTranscriptMarkdown,
   TranscriptRecorder,
} from './transcript.js';

const adapters: DriverAdapter[] = [];
const STARTED_AT = '2026-10-01T00:00:00.000Z';
const SESSION_ENTRY_COUNT = 4;
const LAST_SESSION_INDEX = SESSION_ENTRY_COUNT - 1;
const CHECKPOINT_COUNT = DEFAULT_DRIVER_TRANSCRIPT_LIMIT + 1;

function stopAdapter(adapter: DriverAdapter): Promise<void> {
   return adapter.stop();
}

function getPhrase(entry: DriverTranscriptEntry): string {
   return entry.phrase;
}

afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(
      adapters.splice(0).map(function stopReader(adapter) {
         return stopAdapter(adapter);
      }),
   );
});

function getState(phrases: string[]): DriverStateSnapshot {
   return driverStateSnapshotSchema.parse({
      spokenPhraseLog: phrases,
      itemTextLog: phrases,
      logCursor: phrases.length,
      checkpoints: [],
   });
}

function assertTranscriptPagination(): void {
   const raw = getState(['Save, button', 'Save, button']),
      recorder = new TranscriptRecorder();
   recorder.capture(raw);
   for (let index = 0; index < CHECKPOINT_COUNT; index += 1) {
      recorder.addCheckpoint(`checkpoint-${String(index)}`, STARTED_AT);
   }
   const first = recorder.attach(raw, { afterIndex: -1 }),
      second = recorder.attach(raw, {
         afterIndex: first.transcriptWindow?.nextAfterIndex,
      });

   expect(first.transcript).toHaveLength(DEFAULT_DRIVER_TRANSCRIPT_LIMIT);
   expect(
      first.transcript
         .slice(0, raw.spokenPhraseLog.length)
         .map(function readPhrase(entry) {
            return getPhrase(entry);
         }),
   ).to.eql(['Save, button', 'Save, button']);
   expect(first.transcriptWindow).toMatchObject({
      hasMore: true,
      complete: false,
      rawLogsIncluded: false,
      returnedEntries: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
   });
   expect(first.spokenPhraseLog).to.eql([]);
   expect(first.itemTextLog).to.eql([]);
   expect(first.checkpoints).toHaveLength(
      DEFAULT_DRIVER_TRANSCRIPT_LIMIT - raw.spokenPhraseLog.length,
   );
   expect([...first.transcript, ...second.transcript]).to.eql(recorder.entries);
   expect(second.transcriptWindow).toMatchObject({
      hasMore: false,
      omittedEntries: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
   });
   expect(recorder.attach(raw).spokenPhraseLog).to.eql(raw.spokenPhraseLog);
   expect(recorder.attach(raw).transcript).to.eql(recorder.entries);
}

function assertExportDisclosure(): void {
   const recorder = new TranscriptRecorder();
   const raw = getState(['one', 'two', 'three']);
   recorder.capture(raw);
   const state = recorder.attach(raw, { limit: 1 }),
      transcript = buildDriverTranscript(
         { target: 'virtual', startedAt: STARTED_AT },
         state.transcript,
         state.transcriptWindow,
      );

   expect(transcript.window).toMatchObject({
      selectedEntries: 3,
      returnedEntries: 1,
      omittedEntries: 2,
      nextAfterIndex: 0,
   });
   expect(formatTranscriptMarkdown(transcript)).toContain(
      'Selected 1 of 3 session entries.',
   );
   expect(formatTranscriptMarkdown(transcript)).toContain(
      'More selected entries are available after index 0.',
   );
   expect(() => {
      recorder.attach(raw, { afterIndex: 3 });
   }).toThrow('cursor is ahead');
   const selectedAll = recorder.attach(raw, {});
   selectedAll.transcript.length = 0;

   expect(recorder.entries).toHaveLength(raw.spokenPhraseLog.length);
}

async function assertSharedSelection(): Promise<void> {
   const { context, adapter } = await createVirtualContextFixture('transcript-page');
   adapters.push(adapter);
   const after = getState(['old', 'new', 'new']),
      before = getState(['document']);
   context.transcript.capture(before);
   context.transcript.addCheckpoint('tested', STARTED_AT);
   vi.spyOn(adapter, 'readState').mockResolvedValue(after);
   const selected = await runContextAction(
         context,
         driverActionRequestSchema.parse({
            action: 'transcript',
            payload: { since: 'tested', limit: 1 },
         }),
      ),
      sr = new ScreenReader(
         createContextTransport({
            context,
            session: { sr: 'virtual', mode: 'in-process' },
            async load() {
               return { html: '', url: '' };
            },
            stop: adapter.stop.bind(adapter),
         }),
      );
   const delta = await sr.state({
         afterIndex: selected.state.transcriptWindow?.nextAfterIndex,
         limit: 1,
      }),
      entries = await sr.transcript({ since: 'tested', tail: 1 }),
      full = await runContextAction(context, { action: 'transcript' });

   expect(
      selected.state.transcript.map(function readPhrase(entry) {
         return getPhrase(entry);
      }),
   ).to.eql(['new']);
   expect(selected.state.transcriptWindow).toMatchObject({
      totalEntries: 4,
      hasMore: true,
      nextAfterIndex: 2,
   });
   expect(entries).toHaveLength(1);
   expect(entries[0]?.index).toStrictEqual(LAST_SESSION_INDEX);
   expect(delta.transcriptWindow).toMatchObject({
      returnedEntries: 1,
      hasMore: false,
      latestIndex: 3,
   });
   expect(full.state.transcript).toHaveLength(SESSION_ENTRY_COUNT);
   expect(full.state.spokenPhraseLog).to.eql(after.spokenPhraseLog);
}

function assertPageValidation(): void {
   for (const payload of [
      { afterIndex: -2 },
      { afterIndex: 1.5 },
      { limit: 0 },
      { limit: 1001 },
   ]) {
      expect(
         driverActionRequestSchema.safeParse({ action: 'transcript', payload }).success,
      ).toStrictEqual(false);
   }
}

describe('bounded transcript observations', () => {
   it('keeps the latest entries when a tail includes many checkpoints', () => {
      const recorder = new TranscriptRecorder(),
         state = getState(['old', 'new']);
      recorder.capture(getState(['old']));
      for (let index = 0; index < CHECKPOINT_COUNT; index += 1) {
         recorder.addCheckpoint(`checkpoint-${String(index)}`, STARTED_AT);
      }
      recorder.capture(state);
      const result = recorder.attach(state, {
         tail: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
         limit: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
      });

      expect(result.transcript).toHaveLength(DEFAULT_DRIVER_TRANSCRIPT_LIMIT);
      expect(result.transcript.at(-1)?.phrase).toBe('new');
      expect(result.transcriptWindow?.hasMore).toStrictEqual(false);
      expect(result.transcriptWindow?.nextAfterIndex).toBe(
         recorder.entries.at(-1)?.index,
      );
   });

   it('returns only fresh feedback for ordinary actions and retains explicit history', async () => {
      const { context, adapter } = await createVirtualContextFixture('transcript-page');
      adapters.push(adapter);
      context.transcript.capture(getState(['document']));
      vi.spyOn(adapter, 'readState').mockResolvedValue(getState(['document', 'new']));
      const result = await runContextAction(context, { action: 'read' });
      const history = await runContextAction(context, { action: 'transcript' });

      expect(result.state.transcript.map(getPhrase)).to.eql(['new']);
      expect(result.state.spokenPhraseLog).to.eql([]);
      expect(result.state.transcriptWindow).toMatchObject({
         latestIndex: 1,
         nextAfterIndex: 1,
         complete: false,
      });
      expect(history.state.transcript.map(getPhrase)).to.eql(['document', 'new']);
   });
   it(
      'pages checkpoints and duplicate speech without changing the retained transcript',
      assertTranscriptPagination,
   );
   it(
      'preserves selection disclosure in exported JSON and Markdown',
      assertExportDisclosure,
   );
   it(
      'selects inside the shared action path and does not apply checkpoint selection twice',
      assertSharedSelection,
   );
   it('rejects invalid page bounds at the action boundary', assertPageValidation);
});
