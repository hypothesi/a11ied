import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryIfAppleEventTimeout } from '@guidepup/guidepup/lib/macOS/retryIfAppleEventTimeout.js';
import { ERR_APPLE_SCRIPT_TIMED_OUT } from '@guidepup/guidepup/lib/constants.js';
import type { DriverStateSnapshot } from '@a11ied/contracts';
import { createDriverAdapter } from './adapters.js';
import { queryFocusedAxProperties } from './ax-properties-mac.js';
import * as speech from './speech.js';
import { createFixture } from './test-fixtures.js';
import { nvda, voiceOver } from './upstream.js';
import * as focus from './window-focus.js';

vi.mock('./desktop-lease.js', () => ({ acquireDesktopLease: vi.fn() }));
vi.mock('./reader-status.js', () => ({ isRealReaderStopped: vi.fn() }));
vi.mock('./ax-properties-mac.js', () => ({ queryFocusedAxProperties: vi.fn() }));

afterEach(() => {
   vi.restoreAllMocks();
   vi.clearAllMocks();
});

describe('uncertain native delivery', () => {
   it('does not replay an activation after an AppleEvent timeout', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         dispatch = vi.fn(async () => {
            throw new Error(ERR_APPLE_SCRIPT_TIMED_OUT);
         });
      vi.mocked(voiceOver.act).mockImplementation(async (options) => {
         await retryIfAppleEventTimeout(dispatch, options);
      });
      await adapter.start();
      try {
         await expect(adapter.performPortable('activate')).rejects.toThrow(
            ERR_APPLE_SCRIPT_TIMED_OUT,
         );

         expect(dispatch).toHaveBeenCalledTimes(1);
      } finally {
         await adapter.stop();
      }
   });
});

function mockReaderObservations(reader: typeof voiceOver | typeof nvda): void {
   createFixture();
   if (reader === nvda) {
      vi.spyOn(nvda, 'start').mockResolvedValue();
      vi.spyOn(nvda, 'stop').mockResolvedValue();
   }
   vi.spyOn(reader, 'lastSpokenPhrase').mockResolvedValue('Save, button');
   vi.spyOn(reader, 'itemText').mockResolvedValue('Save');
   vi.spyOn(reader, 'spokenPhraseLog').mockResolvedValue(['Save, button']);
   vi.spyOn(reader, 'itemTextLog').mockResolvedValue(['Save']);
}

async function readNativeState(
   target: 'voiceover' | 'nvda' = 'voiceover',
): Promise<DriverStateSnapshot> {
   const adapter = createDriverAdapter(target, { nativeInput: 'development' });
   await adapter.start();
   try {
      return await adapter.readState([]);
   } finally {
      await adapter.stop();
   }
}

describe('native foreground availability', () => {
   it('validates feedback for the actual parser output from an application without metadata', async () => {
      mockReaderObservations(voiceOver);
      const pid = 717;
      const foreground = focus.parseMacFrontmostOutput(
         `\u001E\u001E${String(pid)}\u001E`,
      );
      vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(foreground);
      const state = await readNativeState();

      expect(state.foreground?.pid).toBe(pid);
      expect(state.observations?.targetIdentity.status).toBe('observed');
   });
   it('reports a locked desktop without presenting stale focus as an input target', async () => {
      mockReaderObservations(voiceOver);
      vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue({
         appName: 'loginwindow',
         bundleId: 'com.apple.loginwindow',
         pid: 404,
      });
      const state = await readNativeState();

      expect(state.foreground?.appName).toBe('loginwindow');
      expect(state.observations?.targetIdentity).toMatchObject({
         status: 'unavailable',
         reason: 'The desktop is locked.',
      });
   });
   it.each([{}, { appName: ' ' }])(
      'reports empty foreground records as unavailable: %j',
      async (foreground) => {
         mockReaderObservations(voiceOver);
         vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(foreground);
         const state = await readNativeState();

         expect(state.observations?.targetIdentity.status).toBe('unavailable');
      },
   );
});

describe('native keyboard focus availability', () => {
   it('preserves optional AX errors while retaining reader speech', async () => {
      mockReaderObservations(voiceOver);
      vi.mocked(queryFocusedAxProperties).mockRejectedValue(
         new Error('Accessibility permission denied'),
      );

      const state = await readNativeState();

      expect(state.lastSpokenPhrase).toBe('Save, button');
      expect(state.axFocusedElement).toBeUndefined();
      expect(state.observations?.keyboardFocus).to.eql({
         status: 'unavailable',
         source: 'macos-ax',
         code: 'keyboard-focus-query-failed',
         reason: 'Accessibility permission denied',
      });
      expect(state.observations?.readerCursorIdentity.status).toBe('unsupported');
      expect(state.observations?.targetIdentity.status).toBe('observed');
   });

   it('distinguishes observed focus properties from verified cursor identity', async () => {
      mockReaderObservations(voiceOver);
      vi.mocked(queryFocusedAxProperties).mockResolvedValue({
         role: 'AXButton',
         title: 'Cancel',
      });

      const state = await readNativeState();

      expect(state.axFocusedElement?.title).toBe('Cancel');
      expect(state.currentItem?.name).toBe('Save');
      expect(state.observations?.keyboardFocus.status).toBe('observed');
      expect(state.observations?.readerCursorIdentity.status).toBe('unsupported');
   });

   it('discloses absent focus separately from a failed focus query', async () => {
      mockReaderObservations(voiceOver);
      vi.mocked(queryFocusedAxProperties).mockReset();

      const state = await readNativeState();

      expect(state.observations?.keyboardFocus).to.eql({
         status: 'unavailable',
         source: 'macos-ax',
         reason: 'No keyboard-focus properties were returned.',
      });
   });
});

describe('NVDA observation availability', () => {
   it('reports unsupported native observations without running a macOS query', async () => {
      mockReaderObservations(nvda);

      const state = await readNativeState('nvda');

      expect(queryFocusedAxProperties).not.toHaveBeenCalled();
      expect(state.observations?.keyboardFocus.status).toBe('unsupported');
      expect(state.lastSpokenPhrase).toBe('Save, button');
   });
});

describe('native cursor position availability', () => {
   it('omits a cursor position when only speech and item text are available', async () => {
      mockReaderObservations(voiceOver);
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' });
      await adapter.start();
      const current = await adapter.readCurrentItem();

      expect(current.item.name).toBe('Save');
      expect(current).not.toHaveProperty('position');
      await adapter.stop();
   });
});

describe('native heading search uncertainty', () => {
   it('continues through duplicate announcements instead of assuming the cursor stopped', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' });
      vi.spyOn(speech, 'waitForSpeechStabilization').mockResolvedValue();
      const duplicateSteps = 3,
         nextHeading = vi.spyOn(voiceOver, 'nextHeading').mockResolvedValue();
      vi.spyOn(voiceOver, 'lastSpokenPhrase')
         .mockResolvedValueOnce('Same, heading level 1')
         .mockResolvedValueOnce('Same, heading level 1')
         .mockResolvedValue('Destination, heading level 2');
      await adapter.start();
      await adapter.navigate({ direction: 'next', kind: 'heading', level: 2 });

      expect(nextHeading).toHaveBeenCalledTimes(duplicateSteps);
      await adapter.stop();
   });

   it.each(['Même titre, en-tête niveau 1', 'heading level 2, en-tête niveau 1'])(
      'reports an unresolved search for unrecognized announcement %s',
      async (phrase) => {
         createFixture();
         const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' });
         vi.spyOn(speech, 'waitForSpeechStabilization').mockResolvedValue();
         vi.spyOn(voiceOver, 'nextHeading').mockResolvedValue();
         vi.spyOn(voiceOver, 'lastSpokenPhrase').mockResolvedValue(phrase);
         await adapter.start();

         await expect(
            adapter.navigate({ direction: 'next', kind: 'heading', level: 2 }),
         ).rejects.toMatchObject({
            code: 'reader-navigation-unconfirmed',
            details: { limit: 100 },
         });
         await adapter.stop();
      },
   );
});

describe('matching heading navigation', () => {
   it('moves once per request even when the current announcement already matches', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         moveCount = 2;
      vi.spyOn(speech, 'waitForSpeechStabilization').mockResolvedValue();
      const nextHeading = vi.spyOn(voiceOver, 'nextHeading').mockResolvedValue();
      vi.spyOn(voiceOver, 'lastSpokenPhrase').mockResolvedValue('Same, heading level 2');
      await adapter.start();
      await adapter.navigate({
         direction: 'next',
         kind: 'heading',
         level: 2,
         times: moveCount,
      });

      expect(nextHeading).toHaveBeenCalledTimes(moveCount);
      await adapter.stop();
   });

   it('matches the spoken role segment rather than text inside the heading name', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         moveCount = 2;
      vi.spyOn(speech, 'waitForSpeechStabilization').mockResolvedValue();
      const previousHeading = vi.spyOn(voiceOver, 'previousHeading').mockResolvedValue();
      vi.spyOn(voiceOver, 'lastSpokenPhrase')
         .mockResolvedValueOnce('heading level 2 help, heading level 1')
         .mockResolvedValue('Destination, heading level 2');
      await adapter.start();
      await adapter.navigate({ direction: 'previous', kind: 'heading', level: 2 });

      expect(previousHeading).toHaveBeenCalledTimes(moveCount);
      await adapter.stop();
   });
});

describe('public real adapter serialization', () => {
   it('keeps compound keypresses together when another caller types', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         events: string[] = [],
         release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolve) => {
         release.mockImplementation(resolve);
      });
      vi.mocked(voiceOver.press).mockImplementation(async (keys) => {
         events.push(String(keys));
         if (events.length === 1) {
            await blocked;
         }
      });
      vi.mocked(voiceOver.type).mockImplementation(async () => {
         events.push('type');
      });
      await adapter.start();
      const pressing = adapter.press(['Tab', 'Enter']);
      await vi.waitFor(() => expect(events).to.eql(['Tab']));
      const typing = adapter.type('Fixture');
      release();
      await Promise.all([pressing, typing]);

      expect(events).to.eql(['Tab', 'Enter', 'type']);
      await adapter.stop();
   });
});

describe('public real adapter restart', () => {
   it('drains a paused compound action and rejects queued input before restart', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolve) => {
            release.mockImplementation(resolve);
         }),
         pause = vi.spyOn(speech, 'waitForSpeechStabilization').mockReturnValue(blocked);
      await adapter.start();
      const finding = adapter.findText('Old query'),
         rejectedFind = expect(finding).rejects.toMatchObject({
            code: 'reader-session-inactive',
         });
      await vi.waitFor(() => expect(pause).toHaveBeenCalled());
      const queuedInput = adapter.type('Old input'),
         rejectedType = expect(queuedInput).rejects.toMatchObject({
            code: 'reader-session-inactive',
         });
      const lifecycle = Promise.all([adapter.stop(), adapter.start()]);
      await vi.waitFor(() => expect(voiceOver.stop).toHaveBeenCalled());

      expect(voiceOver.start).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([rejectedFind, rejectedType, lifecycle]);

      expect(voiceOver.type).not.toHaveBeenCalled();
      expect(vi.mocked(voiceOver.start).mock.calls).to.eql([
         [{ timeout: 15_000 }],
         [{ timeout: 15_000 }],
      ]);
      await adapter.stop();
   });
});

describe('public real adapter startup', () => {
   it('cancels startup when stopped before native startup begins', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         starting = adapter.start();
      const rejected = expect(starting).rejects.toMatchObject({
         code: 'reader-start-cancelled',
      });
      await Promise.all([rejected, adapter.stop()]);

      expect(voiceOver.start).not.toHaveBeenCalled();
      await expect(adapter.type('Fixture')).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });
   });
});
