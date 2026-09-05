import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   cleanupTempRoots,
   createTestServer,
   withStateDir,
} from '../../../cli/src/testing/fixtures.js';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   runDriverSessionAction,
   selectTranscriptEntries,
   startDriverSession,
   stopDriverSession,
} from '../index.js';

const TIMEOUT_MS = 60_000;
const tempRoots: string[] = [];
const testServer = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

async function openPage(path: string): Promise<string> {
   const url = `${testServer.getBaseUrl()}${path}`;
   await startDriverSession({ target: 'virtual', mode: 'in-process', url });
   await attachDocumentToDriverSession({ html: '', url });
   return url;
}

async function assertPageScriptsRun(): Promise<void> {
   await openPage('/status-message.html');
   const status = await getDriverSessionStatus();
   expect(status.session.engine).toBe('browser');

   await runDriverSessionAction({
      action: 'goto',
      payload: { role: 'button', name: 'Save' },
   });
   await runDriverSessionAction({
      action: 'checkpoint',
      payload: { label: 'before save' },
   });
   const activated = await runDriverSessionAction({ action: 'activate' });
   const announced = selectTranscriptEntries(activated.state.transcript, {
      since: 'before save',
   }).map((entry) => entry.phrase);

   expect(announced).toContain('polite: Profile saved successfully.');
   await stopDriverSession();
}

describe('virtual engine choice', () => {
   it(
      'runs a page with a URL in the browser engine, where the page scripts run',
      () => withStateDir(tempRoots, assertPageScriptsRun),
      TIMEOUT_MS,
   );

   it(
      'uses jsdom for a session without a page and reports it in the metadata',
      () =>
         withStateDir(tempRoots, async () => {
            const started = await startDriverSession({
               target: 'virtual',
               mode: 'in-process',
            });
            expect(started.session.engine).toBe('jsdom');

            const stepped = await runDriverSessionAction({
               action: 'next',
               payload: { kind: 'heading' },
            });
            expect(stepped.state.lastSpokenPhrase).toBe(
               'heading, a11ied virtual target, level 1',
            );
            await stopDriverSession();
         }),
      TIMEOUT_MS,
   );

   it(
      'honors an explicit jsdom engine for a page with a URL',
      () =>
         withStateDir(tempRoots, async () => {
            const url = `${testServer.getBaseUrl()}/status-message.html`;
            const started = await startDriverSession({
               target: 'virtual',
               mode: 'in-process',
               url,
               engine: 'jsdom',
            });
            expect(started.session.engine).toBe('jsdom');
            await stopDriverSession();
         }),
      TIMEOUT_MS,
   );
});
