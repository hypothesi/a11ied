import { afterEach, describe, expect, it } from 'vitest';
import { DriverCommandError } from '@a11ied/guidepup';
import { cleanupTempRoots, withStateDir } from '../../../cli/src/testing/fixtures.js';
import {
   recordBrokerStartupError,
   throwIfBrokerStartupFailed,
} from './broker-startup.js';
import { waitForBroker } from './broker-client.js';
import { startDriverSession } from './runtime.js';

const roots: string[] = [];
afterEach(async () => {
   await cleanupTempRoots(roots);
});

describe('detached broker startup diagnostics', () => {
   it('rejects invalid library app identifiers before launching a child', async () => {
      await expect(
         startDriverSession({ target: 'virtual', app: { pid: 0 } }),
      ).rejects.toMatchObject({
         name: 'ZodError',
         issues: [{ path: ['pid'] }],
      });
   });
   it('returns the original failure before waiting for readiness and consumes its receipt', async () => {
      await withStateDir(roots, async () => {
         const details = {
               expected: { appName: 'Safari' },
               foreground: { appName: 'Other' },
            },
            sessionId = 'test_startup_failure';
         await recordBrokerStartupError(
            sessionId,
            new DriverCommandError('native-target-changed', 'Focus changed.', details),
         );

         await expect(
            waitForBroker({
               sessionId,
               timeoutMs: 0,
               readSession: async () => {
                  throw new Error('Startup failure must precede metadata reads.');
               },
            }),
         ).rejects.toMatchObject({
            code: 'native-target-changed',
            message: 'Focus changed.',
            details: { ...details, sessionId },
         });
         await expect(throwIfBrokerStartupFailed(sessionId)).resolves.toBeUndefined();
      });
   });

   it('keeps another starter failure available to its owner', async () => {
      await withStateDir(roots, async () => {
         await recordBrokerStartupError('test_other', new Error('Startup failed.'));

         await expect(
            throwIfBrokerStartupFailed('test_current'),
         ).resolves.toBeUndefined();
         await expect(throwIfBrokerStartupFailed('test_other')).rejects.toThrow(
            'Startup failed.',
         );
      });
   });
});
