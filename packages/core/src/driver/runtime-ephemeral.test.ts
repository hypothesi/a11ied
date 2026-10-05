import { afterEach, describe, expect, it, vi } from 'vitest';
import * as runtime from './runtime.js';
import * as brokerRuntime from './broker-runtime.js';
import { runEphemeralAction } from './runtime-ephemeral.js';
import { handleBrokerRequest } from './broker-handlers.js';
import { parseBrokerActionResult } from './runtime-support.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import { listFailureDetails, toBrokerError } from './broker-errors.js';
import type { DriverAdapter } from '@a11ied/guidepup';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const DIAGNOSTIC_PAYLOAD_LENGTH = 5000,
   FAILURE_COUNT = 20,
   FAILURE_MESSAGE_LENGTH = 2000,
   LONG_FAILURE_INDEX = 2,
   LONG_FAILURE_LENGTH = 5000;
const adapters: DriverAdapter[] = [];
afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
});

async function createBrokerFixture(): Promise<
   Awaited<ReturnType<typeof createVirtualContextFixture>>
> {
   const fixture = await createVirtualContextFixture('drv_native_ephemeral');
   adapters.push(fixture.adapter);
   const handled = await handleBrokerRequest(fixture.context, { command: 'status' });
   const response = handled.response,
      stopped = parseBrokerActionResult({
         response,
         actionErrorMessage: 'Fixture status failed',
      });
   vi.spyOn(runtime, 'startDriverSession').mockResolvedValue({
      session: fixture.context.session,
   });
   vi.spyOn(runtime, 'stopDriverSession').mockResolvedValue(stopped);
   vi.spyOn(brokerRuntime, 'sendSessionRequest').mockResolvedValue(response);
   return fixture;
}

describe('native ephemeral ownership', () => {
   it('reports terminal recording failures without retrying a closed broker', async () => {
      await createBrokerFixture();
      vi.spyOn(runtime, 'stopDriverSession').mockRejectedValue(
         new CliEnvironmentError('recording-file-missing', 'No recording was produced', {
            cleanupConfirmed: true,
         }),
      );

      await expect(
         runEphemeralAction({ target: 'voiceover', request: { action: 'next' } }),
      ).rejects.toMatchObject({
         code: 'recording-file-missing',
         details: { cleanupConfirmed: true },
      });

      expect(runtime.stopDriverSession).toHaveBeenCalledTimes(1);
   });
});
describe('native ephemeral ownership routing', () => {
   it('routes action and cleanup to its detached owner without resolving active metadata again', async () => {
      const { context } = await createBrokerFixture(),
         action = vi.spyOn(runtime, 'runDriverSessionAction');
      await runEphemeralAction({ target: 'voiceover', request: { action: 'next' } });

      expect(runtime.startDriverSession).toHaveBeenCalledWith({
         target: 'voiceover',
         mode: 'broker',
         replaceActive: false,
         recordingPath: undefined,
      });
      expect(brokerRuntime.sendSessionRequest).toHaveBeenCalledWith(context.session, {
         command: 'action',
         action: 'next',
         payload: undefined,
         timeoutMs: undefined,
      });
      expect(action).not.toHaveBeenCalled();
      expect(runtime.stopDriverSession).toHaveBeenCalledWith({
         sessionId: context.session.sessionId,
         timeoutMs: undefined,
      });
   });

   it('keeps the broker recovery ID and both failure reasons when action and cleanup fail', async () => {
      await createBrokerFixture();
      vi.spyOn(brokerRuntime, 'sendSessionRequest').mockRejectedValue(
         new Error('Action failed'),
      );
      vi.spyOn(runtime, 'stopDriverSession').mockRejectedValue(new Error('Reader busy'));

      await expect(
         runEphemeralAction({ target: 'nvda', request: { action: 'next' } }),
      ).rejects.toMatchObject({
         code: 'session-cleanup-failed',
         details: {
            sessionId: 'drv_native_ephemeral',
            failures: [
               { code: 'broker-error', message: 'Action failed' },
               { code: 'broker-error', message: 'Reader busy' },
            ],
         },
      });
   });
});

describe('confirmed ephemeral failures', () => {
   it('preserves action and terminal artifact failures without a recovery claim', async () => {
      await createBrokerFixture();
      vi.spyOn(brokerRuntime, 'sendSessionRequest').mockRejectedValue(
         new Error('Action failed'),
      );
      vi.spyOn(runtime, 'stopDriverSession').mockRejectedValue(
         new CliEnvironmentError('recording-file-missing', 'No recording was produced', {
            cleanupConfirmed: true,
         }),
      );

      await expect(
         runEphemeralAction({ target: 'voiceover', request: { action: 'next' } }),
      ).rejects.toMatchObject({
         code: 'action-and-cleanup-failed',
         details: {
            cleanupConfirmed: true,
            failures: [
               { code: 'broker-error', message: 'Action failed' },
               { code: 'recording-file-missing', message: 'No recording was produced' },
            ],
         },
      });

      expect(runtime.stopDriverSession).toHaveBeenCalledTimes(1);
   });
});

describe('transport failure diagnostics', () => {
   it('bounds wide, repeated, and cyclic error graphs and long messages', () => {
      const cyclic = new Error('Cyclic'),
         long = new Error('x'.repeat(LONG_FAILURE_LENGTH)),
         shared = new Error('Shared');
      cyclic.cause = cyclic;
      const failures = listFailureDetails(
         new AggregateError(
            [
               cyclic,
               shared,
               shared,
               long,
               ...Array.from({ length: 1000 }, () => new Error('Extra')),
            ],
            'Diagnostic graph',
         ),
      );

      expect(failures).toHaveLength(FAILURE_COUNT);
      expect(failures.filter((failure) => failure.message === 'Shared')).toHaveLength(1);
      expect(failures.at(LONG_FAILURE_INDEX)?.message).toHaveLength(
         FAILURE_MESSAGE_LENGTH,
      );
      expect(JSON.stringify(failures).length).toBeLessThan(DIAGNOSTIC_PAYLOAD_LENGTH);
   });

   it('preserves aggregate stop failure reasons in a JSON transport response', () => {
      const error = new AggregateError(
         [new Error('Recording artifact missing'), new Error('Reader busy')],
         'Session cleanup could not complete',
      );
      const serialized = JSON.stringify(toBrokerError(error));
      const response: unknown = JSON.parse(serialized);

      expect(response).toMatchObject({
         code: 'broker-error',
         details: {
            failures: [
               { code: 'broker-error', message: 'Recording artifact missing' },
               { code: 'broker-error', message: 'Reader busy' },
            ],
         },
      });
   });
});
