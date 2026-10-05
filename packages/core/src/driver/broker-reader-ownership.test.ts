import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempRoots, withStateDir } from '../../../cli/src/testing/fixtures.js';
import {
   getActiveDriverSession,
   screenReader,
   startDriverSession,
   stopDriverSession,
} from '../index.js';

const TIMEOUT_MS = 60_000;
const SIGN_UP_HTML =
   '<h1>Sign up</h1><label>Email <input></label><button>Create account</button>';
const tempRoots: string[] = [];
afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

describe('broker reader ownership', () => {
   it(
      'refuses replacement adoption and leaves its replacement alive on disposal',
      async () => {
         await withStateDir(tempRoots, async () => {
            const sr = await screenReader({ mode: 'broker', html: SIGN_UP_HTML });
            try {
               const replacement = await startDriverSession({
                  target: 'virtual',
                  mode: 'broker',
               });
               await expect(sr.type('Do not deliver')).rejects.toMatchObject({
                  code: 'session-replaced',
               });
               await expect(sr.activate()).rejects.toMatchObject({
                  code: 'session-replaced',
               });
               await expect(
                  sr.open({ html: '<h1>Do not attach</h1>' }),
               ).rejects.toMatchObject({ code: 'session-replaced' });
               await expect(sr.state()).rejects.toMatchObject({
                  code: 'session-replaced',
               });
               await sr[Symbol.asyncDispose]();

               const active = await getActiveDriverSession();

               expect(active?.sessionId).toBe(replacement.session.sessionId);
            } finally {
               await sr.stop();
               await stopDriverSession();
            }
         });
      },
      TIMEOUT_MS,
   );
});
