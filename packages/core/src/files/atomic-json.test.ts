import * as filesystem from 'node:fs/promises';
import { parse, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCanonicalPath } from './atomic-json.js';

vi.mock('node:fs/promises', { spy: true });

afterEach(() => {
   vi.restoreAllMocks();
});

describe('canonical file paths', () => {
   it('stops at an unavailable filesystem root instead of recursing forever', async () => {
      const error = Object.assign(new Error('Unavailable filesystem root'), {
            code: 'ENOENT',
         }),
         root = parse(resolve('.')).root;
      const canonical = vi.spyOn(filesystem, 'realpath').mockRejectedValue(error);

      await expect(getCanonicalPath(root)).rejects.toStrictEqual(error);
      expect(canonical).toHaveBeenCalledTimes(1);
   });
});
