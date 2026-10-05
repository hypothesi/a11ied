import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestServer } from '../../../cli/src/testing/fixtures.js';
import { createPlaywrightVirtualHost } from './virtual-playwright-host.js';

const server = createTestServer(),
   timeoutMs = 30_000;

beforeAll(async () => {
   await server.start();
});

afterAll(async () => {
   await server.stop();
});

describe('owned browser reader initialization', () => {
   it(
      'initializes an injected runtime after deferred application navigation',
      async () => {
         const host = await createPlaywrightVirtualHost();
         try {
            await host.attachDocument({
               html: '',
               url: `${server.getBaseUrl()}/delayed-navigation.html`,
            });
            await host.navigate({ direction: 'next', kind: 'button' });
            await host.runPortable('activate');
            await vi.waitFor(async () => {
               const title = await host.readTitle();

               expect(title.title).toBe('Basic page');
            });
            const current = await host.readCurrentItem(),
               moved = await host.navigate({ direction: 'next', kind: 'heading' });

            expect(current.item.role).toBe('document');
            expect(moved.moved).toStrictEqual(true);
            expect(await host.readSpeech()).toMatchObject({
               lastSpokenPhrase: 'heading, Basic content page, level 1',
            });
         } finally {
            await host.dispose();
         }
      },
      timeoutMs,
   );
});
