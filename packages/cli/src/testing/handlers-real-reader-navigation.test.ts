import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeOpenAction } from '../commands/drive-session.js';
import { executeStartAction } from '../commands/drive-start.js';
import { createMockDriveSession } from './recording-fixtures.js';

const mocks = vi.hoisted(() => ({
   attach: vi.fn(),
   getSession: vi.fn(),
   open: vi.fn(),
   run: vi.fn(),
   start: vi.fn(),
   wait: vi.fn(),
}));

vi.mock('#core', async () => {
   const actual = await vi.importActual('#core');
   return {
      ...actual,
      attachDocumentToDriverSession: mocks.attach,
      getActiveDriverSession: mocks.getSession,
      openUrlInBrowser: mocks.open,
      runDriverSessionAction: mocks.run,
      startDriverSession: mocks.start,
      waitForWindowFocus: mocks.wait,
   };
});

afterEach(() => {
   for (const mock of Object.values(mocks)) {
      mock.mockReset();
   }
   vi.restoreAllMocks();
});

describe('native input policy', () => {
   it.each(['require-binding', 'development'])(
      'forwards the %s native input policy before starting a session',
      async (nativeInput) => {
         const session = createMockDriveSession('/tmp/a11ied-test');
         mocks.start.mockResolvedValue({ session });
         await executeStartAction(undefined, { sr: 'voiceover', nativeInput });

         expect(mocks.start).toHaveBeenCalledWith(
            expect.objectContaining({ nativeInput }),
         );
      },
   );

   it('rejects an unknown policy before starting or replacing a session', async () => {
      await expect(
         executeStartAction(undefined, { sr: 'voiceover', nativeInput: 'unknown' }),
      ).rejects.toMatchObject({
         code: 'validation-error',
         exitCode: 2,
      });

      expect(mocks.start).not.toHaveBeenCalled();
   });
});

describe('real screen reader navigation', () => {
   it('starts without an anonymous fetch of a protected or error page', async () => {
      const fetch = vi
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('Unexpected anonymous fetch')),
         session = createMockDriveSession('/tmp/a11ied-test'),
         url = 'https://example.test/protected';
      mocks.open.mockResolvedValue({ focusTarget: undefined });
      mocks.start.mockResolvedValue({ session });
      await executeStartAction(url, { sr: 'voiceover' });

      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.start).toHaveBeenCalledWith(
         expect.objectContaining({ url, browser: undefined }),
      );
      expect(mocks.attach).not.toHaveBeenCalled();
   });

   it('opens error pages in the authenticated session browser without fetching HTML', async () => {
      const app = { appName: 'Safari' },
         fetch = vi
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('Unexpected anonymous fetch')),
         session = {
            ...createMockDriveSession('/tmp/a11ied-test'),
            app,
            url: 'https://example.test/login',
         },
         url = 'https://example.test/missing';
      mocks.getSession.mockResolvedValue(session);
      mocks.open.mockResolvedValue({ focusTarget: app });
      mocks.wait.mockResolvedValue({ focused: true });
      mocks.attach.mockResolvedValue({ session });
      mocks.run.mockResolvedValue({ session });
      await executeOpenAction(url, {});

      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.attach).toHaveBeenCalledWith(
         { html: '', url },
         { timeoutMs: undefined },
      );
   });
});
