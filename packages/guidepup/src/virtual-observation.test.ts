import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsdomVirtualHost, loadVirtualReader } from './virtual-dom.js';
import { createDriverAdapter } from './adapters.js';
import { waitForSpeechStabilization } from './speech.js';
import { voiceOver } from './upstream.js';

afterEach(() => {
   vi.restoreAllMocks();
});

describe('reader observation failures', () => {
   it.each(['lastSpokenPhrase', 'itemText', 'spokenPhraseLog', 'itemTextLog'] as const)(
      'propagates virtual %s failures',
      async (method) => {
         const host = createJsdomVirtualHost();
         await host.attachDocument({
            html: '<main>Fixture</main>',
            url: 'about:fixture',
         });
         const reader = await loadVirtualReader();
         vi.spyOn(reader, method).mockRejectedValue(
            new Error('Virtual reader unavailable'),
         );

         await expect(host.readSpeech()).rejects.toThrow('Virtual reader unavailable');
         await host.dispose();
      },
   );

   it('does not turn a failed virtual position query into a cursor token', async () => {
      const host = createJsdomVirtualHost();
      await host.attachDocument({ html: '<main>Fixture</main>', url: 'about:fixture' });
      const reader = await loadVirtualReader();
      vi.spyOn(reader, 'lastSpokenPhrase').mockRejectedValue(
         new Error('Position query failed'),
      );

      await expect(host.readCurrentItem()).rejects.toThrow('Position query failed');
      await host.dispose();
   });

   it('propagates native speech polling failures immediately', async () => {
      vi.spyOn(voiceOver, 'lastSpokenPhrase').mockRejectedValue(
         new Error('Reader disconnected'),
      );

      await expect(waitForSpeechStabilization(voiceOver)).rejects.toThrow(
         'Reader disconnected',
      );
   });

   it('discloses the unavailable virtual cursor identity', async () => {
      const adapter = createDriverAdapter('virtual');
      await adapter.start();
      const state = await adapter.readState([]);

      expect(state.observations?.readerCursorIdentity).toMatchObject({
         status: 'unavailable',
         source: 'virtual-model',
      });
      await adapter.stop();
   });
});
