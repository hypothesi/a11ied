import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
   CliEnvironmentError} from './index.js';
import {
   cleanupStaleDriverSessions,
   getDriverSessionMetadataPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   startDriverSession,
   stopDriverSession,
} from './index.js';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11lied-driver-'));
   tempRoots.push(root);
   return root;
}

afterEach(async () => {
   while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
         await rm(root, { recursive: true, force: true });
      }
   }
});

describe('driver runtime', () => {
   it('starts, reports, and stops a virtual session', async () => {
      const cwd = await createTempRoot();
      const session = await startDriverSession('virtual', cwd);

      expect(session.target).toBe('virtual');
      expect(session.sessionId).toMatch(/^drv_/);
      expect(session.metadataFile).toBe(
         getDriverSessionMetadataPath(session.sessionId, cwd),
      );

      const status = await getDriverSessionStatus(session.sessionId, cwd);
      expect(status.action).toBe('status');
      expect(status.session.sessionId).toBe(session.sessionId);
      expect(status.state.logCursor).toBeGreaterThan(0);

      const stopped = await stopDriverSession(session.sessionId, cwd);
      expect(stopped.action).toBe('stop');

      await expect(getDriverSessionStatus(session.sessionId, cwd)).rejects.toMatchObject({
         code: 'session-not-found',
      } satisfies Partial<CliEnvironmentError>);
   }, 15_000);

   it('fails cleanly for an unknown session', async () => {
      const cwd = await createTempRoot();

      await expect(getDriverSessionStatus('missing-session', cwd)).rejects.toMatchObject({
         code: 'session-not-found',
      } satisfies Partial<CliEnvironmentError>);
   });

   it('cleans up stale session metadata for dead brokers', async () => {
      const cwd = await createTempRoot();
      const session = await startDriverSession('virtual', cwd);
      const stopped = await stopDriverSession(session.sessionId, cwd);

      expect(stopped.session.sessionId).toBe(session.sessionId);
      expect(await cleanupStaleDriverSessions(cwd)).toEqual([]);
   }, 15_000);

   it('runs persistent and ephemeral driver actions against the virtual target', async () => {
      const cwd = await createTempRoot();
      const session = await startDriverSession('virtual', cwd);

      const stepped = await runDriverSessionAction(
         session.sessionId,
         'next',
         undefined,
         cwd,
      );
      expect(stepped.action).toBe('next');
      expect(stepped.state.logCursor).toBeGreaterThanOrEqual(1);

      const cleared = await runDriverSessionAction(
         session.sessionId,
         'clear-logs',
         undefined,
         cwd,
      );
      expect(cleared.state.spokenPhraseLog).toEqual([]);

      const logged = await runDriverSessionAction(
         session.sessionId,
         'logs',
         undefined,
         cwd,
      );
      expect(logged.state.spokenPhraseLog).toEqual([]);

      const ephemeral = await runEphemeralDriverAction('virtual', 'next', undefined, cwd);
      expect(ephemeral.action).toBe('next');
      expect(ephemeral.session.sessionId).toMatch(/^ephemeral_/);

      await stopDriverSession(session.sessionId, cwd);
   }, 15_000);
});
