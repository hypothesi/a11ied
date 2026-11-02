import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeOutputFile } from './write-output-file.js';

describe('writeOutputFile', () => {
   let directory = '';

   beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'a11ied-output-'));
   });

   afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
   });

   it('creates missing parent directories', async () => {
      const path = join(directory, 'pages', 'home', 'audit.json');

      await writeOutputFile(path, '{}\n');

      expect(await readFile(path, 'utf8')).toStrictEqual('{}\n');
   });

   it('overwrites an existing file', async () => {
      const path = join(directory, 'audit.json');
      await writeOutputFile(path, 'old');

      await writeOutputFile(path, 'new');

      expect(await readFile(path, 'utf8')).toStrictEqual('new');
   });
});
