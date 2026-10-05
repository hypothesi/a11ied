import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as nodeOS from 'node:os';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { acquireDesktopLease } from './desktop-lease.js';

const fixture = await vi.hoisted(async () => {
   const { mkdtemp } = await import('node:fs/promises'),
      { tmpdir } = await import('node:os'),
      { join: joinPath } = await import('node:path');
   return { home: await mkdtemp(joinPath(tmpdir(), 'a11ied-desktop-lease-')) };
});

vi.mock('node:os', async (importOriginal) => {
   const original = await importOriginal<typeof nodeOS>();
   return {
      ...original,
      userInfo: (): ReturnType<typeof nodeOS.userInfo> => ({
         ...original.userInfo(),
         homedir: fixture.home,
      }),
   };
});

const ownerPath = join(fixture.home, '.a11ied', 'desktop-owner.json');
afterEach(async () => {
   vi.restoreAllMocks();
   vi.unstubAllEnvs();
   await rm(join(fixture.home, '.a11ied'), { recursive: true, force: true });
});
afterAll(async () => {
   await rm(fixture.home, { recursive: true, force: true });
});

describe('desktop ownership', () => {
   it('rejects another live owner despite state directory and HOME overrides', async () => {
      vi.stubEnv('A11IED_STATE_DIR', '/first-state-root');
      const lease = await acquireDesktopLease();
      vi.stubEnv('A11IED_STATE_DIR', '/second-state-root');
      vi.stubEnv('HOME', '/different-home');

      await expect(acquireDesktopLease()).rejects.toMatchObject({
         code: 'desktop-in-use',
      });
      await lease.assertOwned();
      await lease.release();
      const next = await acquireDesktopLease();
      await next.release();
   });

   it('allows only one concurrent acquisition', async () => {
      const attempts = await Promise.allSettled([
         acquireDesktopLease(),
         acquireDesktopLease(),
      ]);

      expect(attempts.map((attempt) => attempt.status).toSorted()).to.eql([
         'fulfilled',
         'rejected',
      ]);
      await Promise.all(
         attempts.map(async (attempt) => {
            if (attempt.status === 'fulfilled') {
               await attempt.value.release();
            }
         }),
      );
   });

   it('blocks input after ownership changes and preserves the replacement on release', async () => {
      const lease = await acquireDesktopLease(),
         replacement = { pid: process.pid, token: randomUUID() };
      await writeFile(ownerPath, JSON.stringify(replacement));

      await expect(lease.assertOwned()).rejects.toMatchObject({
         code: 'desktop-ownership-lost',
      });
      await lease.release();

      expect(JSON.parse(await readFile(ownerPath, 'utf8'))).to.eql(replacement);
   });
});

describe('desktop owner recovery', () => {
   it('recovers a dead owner and retains a live owner on permission errors', async () => {
      const first = await acquireDesktopLease();
      await first.release();
      await writeFile(
         ownerPath,
         JSON.stringify({ pid: process.ppid, token: randomUUID() }),
      );
      const check = vi.spyOn(process, 'kill').mockImplementation(() => {
         throw Object.assign(new Error('Permission denied'), { code: 'EPERM' });
      });

      await expect(acquireDesktopLease()).rejects.toMatchObject({
         code: 'desktop-in-use',
      });
      check.mockImplementation(() => {
         throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
      });
      const recovered = await acquireDesktopLease();
      await recovered.assertOwned();
      await recovered.release();
   });

   it('refuses to overwrite corrupt ownership records', async () => {
      const lease = await acquireDesktopLease();
      await writeFile(ownerPath, '{corrupt');

      await expect(lease.assertOwned()).rejects.toMatchObject({
         code: 'desktop-owner-unreadable',
      });
      await expect(acquireDesktopLease()).rejects.toMatchObject({
         code: 'desktop-owner-unreadable',
      });

      expect(await readFile(ownerPath, 'utf8')).toStrictEqual('{corrupt');
   });
});
