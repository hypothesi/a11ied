import { vi } from 'vitest';
import { acquireDesktopLease, type DesktopLease } from './desktop-lease.js';
import { createLeasedReader } from './leased-reader.js';
import type { ScreenReaderLike } from './readiness.js';
import { isRealReaderStopped } from './reader-status.js';
import { nvda, voiceOver } from './upstream.js';
import * as focus from './window-focus.js';
import type { RealTarget } from './real-steps.js';

/** Mock every native input used by ownership and adapter lifecycle regressions. */
export function createFixture(target: RealTarget = 'voiceover'): {
   lease: DesktopLease;
   reader: ScreenReaderLike;
} {
   vi.spyOn(focus, 'readFrontmostWindow').mockResolvedValue({
      appName: 'Safari',
      pid: 100,
   });
   const nativeReader = target === 'voiceover' ? voiceOver : nvda;
   const lease: DesktopLease = {
      assertOwned: vi.fn<DesktopLease['assertOwned']>().mockResolvedValue(),
      release: vi.fn<DesktopLease['release']>().mockResolvedValue(),
   };
   vi.mocked(acquireDesktopLease).mockResolvedValue(lease);
   for (const method of [
      'start',
      'stop',
      'press',
      'type',
      'perform',
      'next',
      'previous',
      'act',
      'interact',
      'stopInteracting',
      'nextHeading',
      'previousHeading',
      'nextLink',
      'previousLink',
      'nextLandmark',
      'previousLandmark',
   ] as const) {
      vi.spyOn(nativeReader, method).mockResolvedValue();
   }
   vi.spyOn(nativeReader, 'lastSpokenPhrase').mockResolvedValue('Fixture, button');
   vi.spyOn(nativeReader, 'itemText').mockResolvedValue('Fixture');
   vi.spyOn(nativeReader, 'spokenPhraseLog').mockResolvedValue([]);
   vi.spyOn(nativeReader, 'itemTextLog').mockResolvedValue([]);
   if (target === 'voiceover') {
      vi.spyOn(voiceOver, 'takeCursorScreenshot').mockResolvedValue(
         '/unused-fixture.png',
      );
   }
   vi.mocked(isRealReaderStopped).mockResolvedValue(true);
   return { lease, reader: createLeasedReader(nativeReader, target, 'development') };
}
