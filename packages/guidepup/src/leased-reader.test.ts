import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDriverAdapter } from './adapters.js';
import { acquireDesktopLease, type DesktopLease } from './desktop-lease.js';
import { createLeasedReader, withReaderOwnership } from './leased-reader.js';
import { isRealReaderStopped } from './reader-status.js';
import { nvda, voiceOver } from './upstream.js';
import { createFixture } from './test-fixtures.js';

vi.mock('./desktop-lease.js', () => ({ acquireDesktopLease: vi.fn() }));
vi.mock('./reader-status.js', () => ({ isRealReaderStopped: vi.fn() }));

afterEach(() => {
   vi.restoreAllMocks();
   vi.clearAllMocks();
});

describe('unverified native input', () => {
   it.each(['voiceover', 'nvda'] as const)(
      'refuses %s input before invoking the upstream reader',
      async (target) => {
         createFixture(target);
         const nativeReader = target === 'voiceover' ? voiceOver : nvda,
            reader = createLeasedReader(nativeReader, target, 'require-binding');
         await reader.start();
         try {
            await expect(reader.type('Must not reach the desktop')).rejects.toMatchObject(
               {
                  code: 'native-target-binding-unavailable',
               },
            );
            await expect(reader.press('Enter')).rejects.toMatchObject({
               code: 'native-target-binding-unavailable',
            });
            await expect(reader.act()).rejects.toMatchObject({
               code: 'native-target-binding-unavailable',
            });

            expect(nativeReader.type).not.toHaveBeenCalled();
            expect(nativeReader.press).not.toHaveBeenCalled();
            expect(nativeReader.act).not.toHaveBeenCalled();
         } finally {
            await reader.stop();
         }
      },
   );

   it('refuses compound and raw adapter input without using focus properties as proof', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', {
         nativeInput: 'require-binding',
      });
      await adapter.start();
      try {
         await expect(adapter.press(['Tab', 'Enter'])).rejects.toMatchObject({
            code: 'native-target-binding-unavailable',
         });
         await expect(adapter.findText('Fixture')).rejects.toMatchObject({
            code: 'native-target-binding-unavailable',
         });
         await expect(adapter.performPortable('activate')).rejects.toMatchObject({
            code: 'native-target-binding-unavailable',
         });
         await expect(
            adapter.navigate({ direction: 'next', kind: 'heading' }),
         ).rejects.toMatchObject({
            code: 'native-target-binding-unavailable',
         });

         expect(voiceOver.press).not.toHaveBeenCalled();
         expect(voiceOver.perform).not.toHaveBeenCalled();
         expect(voiceOver.act).not.toHaveBeenCalled();
      } finally {
         await adapter.stop();
      }
   });
});

describe('owned external desktop effects', () => {
   it('blocks browser or recording callbacks after ownership is lost', async () => {
      const { lease } = createFixture(),
         adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         effect = vi.fn(async () => 'opened');
      await adapter.start();
      vi.mocked(lease.assertOwned).mockRejectedValueOnce(new Error('Ownership lost'));

      await expect(adapter.runOwned(effect)).rejects.toThrow('Ownership lost');

      expect(effect).not.toHaveBeenCalled();
      await adapter.stop();
   });
});

describe('real reader ownership at input boundaries', () => {
   it('acquires ownership before starting the reader and rejects inactive input', async () => {
      const { lease, reader } = createFixture(),
         events: string[] = [];
      vi.mocked(acquireDesktopLease).mockImplementation(async () => {
         events.push('lease');
         return lease;
      });
      vi.mocked(voiceOver.start).mockImplementation(async () => {
         events.push('start');
      });
      await expect(reader.press('Tab')).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });
      await reader.start();

      expect(events).to.eql(['lease', 'start']);
      expect(voiceOver.press).not.toHaveBeenCalled();
      await reader.stop();
   });

   it('checks every public adapter chord, including ownership loss between chords', async () => {
      const { lease } = createFixture(),
         adapter = createDriverAdapter('voiceover', { nativeInput: 'development' });
      await adapter.start();
      vi.mocked(lease.assertOwned)
         .mockResolvedValueOnce()
         .mockRejectedValueOnce(new Error('Ownership lost'));
      await expect(adapter.press(['Tab', 'Enter'])).rejects.toThrow('Ownership lost');

      expect(voiceOver.press).toHaveBeenCalledTimes(1);
      await adapter.stop();
   });
});

describe('real reader shutdown ordering', () => {
   it('finishes running input, refuses later input, and stops once across callers', async () => {
      const { reader } = createFixture(),
         events: string[] = [];
      const release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolvePromise) => {
         release.mockImplementation(resolvePromise);
      });
      vi.mocked(voiceOver.type).mockImplementation(async () => {
         events.push('input');
         await blocked;
         events.push('finished');
      });
      await reader.start();
      const input = reader.type('Fixture');
      await vi.waitFor(() => expect(events).to.eql(['input']));
      const first = reader.stop(),
         second = reader.stop();
      const rejected = expect(reader.press('Tab')).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });

      expect(voiceOver.stop).not.toHaveBeenCalled();
      release();
      await Promise.all([input, first, second, rejected]);

      expect(events).to.eql(['input', 'finished']);
      expect(voiceOver.stop).toHaveBeenCalledTimes(1);
      expect(voiceOver.press).not.toHaveBeenCalled();
   });

   it('retries lease release without repeating successful reader shutdown', async () => {
      const { lease, reader } = createFixture();
      await reader.start();
      vi.mocked(lease.release).mockRejectedValueOnce(new Error('Owner record busy'));
      await expect(reader.stop()).rejects.toThrow('Owner record busy');
      await expect(reader.type('Fixture')).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });
      await reader.stop();

      expect(voiceOver.stop).toHaveBeenCalledTimes(1);
      expect(vi.mocked(lease.release).mock.calls).to.eql([[], []]);
   });
});

describe('real reader startup and ownership recovery', () => {
   it('cancels pending startup before any reader operation', async () => {
      const { lease, reader } = createFixture();
      const release = vi.fn<(lease: DesktopLease) => void>();
      vi.mocked(acquireDesktopLease).mockImplementation(
         () =>
            new Promise<DesktopLease>((resolvePromise) => {
               release.mockImplementation(resolvePromise);
            }),
      );
      const started = expect(reader.start()).rejects.toMatchObject({
            code: 'reader-start-cancelled',
         }),
         stopped = reader.stop();
      release(lease);
      await Promise.all([started, stopped]);

      expect(voiceOver.start).not.toHaveBeenCalled();
      expect(voiceOver.stop).not.toHaveBeenCalled();
      expect(lease.release).toHaveBeenCalledTimes(1);
   });

   it('cleans up failed startup and refuses shutdown after ownership changes', async () => {
      const { lease, reader } = createFixture();
      vi.mocked(voiceOver.start).mockRejectedValueOnce(
         new Error('Reader startup failed'),
      );
      await expect(reader.start()).rejects.toThrow('Reader startup failed');

      expect(voiceOver.stop).toHaveBeenCalledTimes(1);
      expect(lease.release).toHaveBeenCalledTimes(1);
      await reader.start();
      vi.mocked(lease.assertOwned).mockRejectedValue(
         new Error('Replacement owns desktop'),
      );
      await expect(reader.stop()).rejects.toThrow('Replacement owns desktop');

      expect(voiceOver.stop).toHaveBeenCalledTimes(1);
   });
});

describe('OS actions under reader ownership', () => {
   it('queues OS actions before shutdown and refuses them after stop begins', async () => {
      const { reader } = createFixture();
      const release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolvePromise) => {
         release.mockImplementation(resolvePromise);
      });
      const action = vi.fn(async () => {
         await blocked;
         return 'focused';
      });
      await reader.start();
      const focused = withReaderOwnership(reader, action);
      await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      const stopped = reader.stop();
      const rejected = expect(withReaderOwnership(reader, action)).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });

      expect(voiceOver.stop).not.toHaveBeenCalled();
      release();
      await Promise.all([focused, stopped, rejected]);

      expect(action).toHaveBeenCalledTimes(1);
      expect(voiceOver.stop).toHaveBeenCalledTimes(1);
   });
});

describe('reader startup cleanup confirmation', () => {
   it('retains ownership when a successful stop leaves the reader running', async () => {
      const { lease, reader } = createFixture();
      await reader.start();
      vi.mocked(isRealReaderStopped).mockResolvedValue(false);
      await expect(reader.stop()).rejects.toMatchObject({
         code: 'reader-stop-unconfirmed',
      });
      await expect(reader.type('Fixture')).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });

      expect(lease.release).not.toHaveBeenCalled();
      vi.mocked(isRealReaderStopped).mockResolvedValue(true);
      await reader.stop();

      expect(lease.release).toHaveBeenCalledTimes(1);
   });
   it('releases ownership after failed startup when the reader is confirmed stopped', async () => {
      const { lease, reader } = createFixture();
      vi.mocked(voiceOver.start).mockRejectedValueOnce(
         new Error('Reader startup failed'),
      );
      vi.mocked(voiceOver.stop).mockRejectedValue(new Error('VoiceOver not running'));
      await expect(reader.start()).rejects.toThrow('Reader startup failed');

      expect(isRealReaderStopped).toHaveBeenCalledWith('voiceover');
      expect(lease.release).toHaveBeenCalledTimes(1);
      await reader.start();
      await reader.stop();
   });

   it('keeps ownership and blocks input until uncertain shutdown can be verified', async () => {
      const { lease, reader } = createFixture();
      vi.mocked(isRealReaderStopped).mockResolvedValue(false);
      vi.mocked(voiceOver.start).mockRejectedValueOnce(
         new Error('Reader startup failed'),
      );
      vi.mocked(voiceOver.stop).mockRejectedValue(new Error('VoiceOver not running'));
      await expect(reader.start()).rejects.toThrow('Reader startup failed');
      await expect(reader.start()).rejects.toMatchObject({
         code: 'reader-already-started',
      });
      await expect(reader.press('Tab')).rejects.toMatchObject({
         code: 'reader-session-inactive',
      });

      expect(lease.release).not.toHaveBeenCalled();
      vi.mocked(isRealReaderStopped).mockResolvedValue(true);
      await reader.stop();

      expect(lease.release).toHaveBeenCalledTimes(1);
   });
});

describe('cursor screenshot ownership', () => {
   it('refuses public adapter screenshots without active ownership', async () => {
      const { lease } = createFixture(),
         adapter = createDriverAdapter('voiceover', { nativeInput: 'development' });
      await expect(
         adapter.captureCursorScreenshot('/unused-fixture.png'),
      ).rejects.toMatchObject({ code: 'reader-session-inactive' });
      await adapter.start();
      vi.mocked(lease.assertOwned).mockRejectedValueOnce(new Error('Ownership lost'));
      await expect(
         adapter.captureCursorScreenshot('/unused-fixture.png'),
      ).rejects.toThrow('Ownership lost');

      expect(voiceOver.takeCursorScreenshot).not.toHaveBeenCalled();
      await adapter.stop();
   });

   it('waits for an active screenshot command before stopping the reader', async () => {
      createFixture();
      const adapter = createDriverAdapter('voiceover', { nativeInput: 'development' }),
         release = vi.fn<() => void>();
      const blocked = new Promise<void>((resolvePromise) => {
         release.mockImplementation(resolvePromise);
      });
      vi.mocked(voiceOver.takeCursorScreenshot).mockImplementation(async () => {
         await blocked;
         throw new Error('Fixture capture failed');
      });
      await adapter.start();
      const captured = expect(
         adapter.captureCursorScreenshot('/unused-fixture.png'),
      ).rejects.toThrow('Fixture capture failed');
      await vi.waitFor(() =>
         expect(voiceOver.takeCursorScreenshot).toHaveBeenCalledTimes(1),
      );
      const stopped = adapter.stop();

      expect(voiceOver.stop).not.toHaveBeenCalled();
      release();
      await Promise.all([captured, stopped]);

      expect(voiceOver.stop).toHaveBeenCalledTimes(1);
   });
});
