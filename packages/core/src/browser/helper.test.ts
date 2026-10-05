import { ChildProcess } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openUrlOnMac } from './helper.js';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', async () => {
   const actual = await vi.importActual('node:child_process');
   return { ...actual, spawn: mocks.spawn };
});

afterEach(() => {
   mocks.spawn.mockReset();
});

describe('macOS browser opening', () => {
   it('fails instead of opening another browser when the requested browser cannot open', async () => {
      mocks.spawn.mockImplementation((command: string) => {
         const child = new ChildProcess();
         if (command !== 'xattr') {
            queueMicrotask(() => {
               child.emit('exit', 1);
            });
         }
         return child;
      });
      const url = 'https://example.test/';

      await expect(
         openUrlOnMac(
            {
               id: 'chrome',
               label: 'Google Chrome',
               source: 'system',
               launchMode: 'channel',
            },
            url,
         ),
      ).rejects.toThrow('exited with code 1');
      expect(mocks.spawn).toHaveBeenCalledWith(
         'open',
         ['-b', 'com.google.Chrome', url],
         expect.anything(),
      );
      expect(mocks.spawn).not.toHaveBeenCalledWith('open', [url], expect.anything());
   });
});
