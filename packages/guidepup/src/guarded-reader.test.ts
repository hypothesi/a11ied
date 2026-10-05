import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLeasedReader, setReaderFocusTarget } from './leased-reader.js';
import { createFixture } from './test-fixtures.js';
import { voiceOver } from './upstream.js';
import * as focus from './window-focus.js';

vi.mock('./desktop-lease.js', () => ({ acquireDesktopLease: vi.fn() }));
vi.mock('./reader-status.js', () => ({ isRealReaderStopped: vi.fn() }));

beforeEach(() => {
   vi.spyOn(focus, 'waitForWindowFocus').mockResolvedValue({
      focused: true,
      waitedMs: 0,
   });
});

afterEach(() => {
   vi.restoreAllMocks();
   vi.clearAllMocks();
});

const SAFARI = { appName: 'Safari', bundleId: 'com.apple.Safari', pid: 100 };

describe('adaptive native input', () => {
   it('supports observed PID identity without bundle metadata', async () => {
      createFixture();
      vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue({ pid: 100 });
      const reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         await reader.act();

         expect(voiceOver.act).toHaveBeenCalledTimes(1);
      } finally {
         await reader.stop();
      }
   });
   it('refuses input on a locked desktop even when the OS returns its process identity', async () => {
      createFixture();
      vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue({
         appName: 'loginwindow',
         bundleId: 'com.apple.loginwindow',
         pid: 404,
      });
      const reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         await expect(reader.type('secret')).rejects.toMatchObject({
            code: 'native-target-unavailable',
         });

         expect(voiceOver.type).not.toHaveBeenCalled();
      } finally {
         await reader.stop();
      }
   });
   it('allows reader navigation and activation in the observed target by default', async () => {
      createFixture();
      vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(SAFARI);
      const reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         await reader.next();
         await reader.act();

         expect(voiceOver.next).toHaveBeenCalledTimes(1);
         expect(voiceOver.act).toHaveBeenCalledTimes(1);
      } finally {
         await reader.stop();
      }
   });
});

describe('observed target recovery', () => {
   it('waits for asynchronous app activation before establishing its target', async () => {
      createFixture();
      const foreground = vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(SAFARI),
         reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         foreground.mockResolvedValue({ appName: 'Other', pid: 200 });
         vi.mocked(focus.waitForWindowFocus).mockImplementation(async () => {
            foreground.mockResolvedValue(SAFARI);
            return { focused: true, waitedMs: 100 };
         });
         await setReaderFocusTarget(reader, SAFARI);
         await reader.act();

         expect(voiceOver.act).toHaveBeenCalledTimes(1);
         expect(focus.waitForWindowFocus).toHaveBeenCalledWith(SAFARI);
      } finally {
         await reader.stop();
      }
   });
});

describe('missing target recovery', () => {
   it('permits observation and explicit recovery when startup foreground is unavailable', async () => {
      createFixture();
      const foreground = vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue({}),
         reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         await reader.lastSpokenPhrase();
         await expect(reader.act()).rejects.toMatchObject({
            code: 'native-target-unavailable',
         });
         foreground.mockResolvedValue(SAFARI);
         await expect(reader.act()).rejects.toMatchObject({
            code: 'native-target-unavailable',
         });
         await setReaderFocusTarget(reader, SAFARI);
         await reader.act();

         expect(voiceOver.act).toHaveBeenCalledTimes(1);
      } finally {
         await reader.stop();
      }
   });

   it('allows deliberate retargeting after another app receives focus', async () => {
      createFixture();
      const foreground = vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(SAFARI),
         other = { appName: 'Other', pid: 200 },
         reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         foreground.mockResolvedValue(other);
         await expect(reader.act()).rejects.toMatchObject({
            code: 'native-target-changed',
         });
         await setReaderFocusTarget(reader, other);
         await reader.act();

         expect(voiceOver.act).toHaveBeenCalledTimes(1);
      } finally {
         await reader.stop();
      }
   });
});

describe('observed target interruption', () => {
   it('refuses input when foreground observation fails or another app takes focus', async () => {
      createFixture();
      const foreground = vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(SAFARI),
         reader = createLeasedReader(voiceOver, 'voiceover');
      await reader.start();
      try {
         foreground.mockResolvedValue({ appName: 'Other', pid: 200 });

         await expect(reader.press('Enter')).rejects.toMatchObject({
            code: 'native-target-changed',
         });
         foreground.mockResolvedValue({});

         await expect(reader.act()).rejects.toMatchObject({
            code: 'native-target-unavailable',
         });
         expect(voiceOver.press).not.toHaveBeenCalled();
         expect(voiceOver.act).not.toHaveBeenCalled();
      } finally {
         await reader.stop();
      }
   });

   it('stops remaining characters after focus changes and reports partial delivery', async () => {
      createFixture();
      const foreground = vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue(SAFARI),
         reader = createLeasedReader(voiceOver, 'voiceover');
      vi.mocked(voiceOver.type).mockImplementation(async () => {
         foreground.mockResolvedValue({ appName: 'Other', pid: 200 });
      });
      await reader.start();
      try {
         await expect(reader.type('ab')).rejects.toMatchObject({
            code: 'native-target-changed',
            details: { charactersCompleted: 1 },
         });

         expect(voiceOver.type).toHaveBeenCalledTimes(1);
         expect(voiceOver.type).toHaveBeenCalledWith('a', { retries: 1, capture: false });
      } finally {
         await reader.stop();
      }
   });
});
