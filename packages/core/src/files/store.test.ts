import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   LOCK_CONFIG,
   appendLine,
   attemptArtifactPath,
   getCanonicalPath,
   withDirectoryCommit,
   withLockedFile,
   writeAtomic,
} from './store.js';

vi.mock('node:fs/promises', { spy: true });

const TEN_SECONDS_MS = 10_000;
const ATTEMPT_NUMBER = 3;
const BYTE_H = 72;
const BYTE_I = 105;
const NUM_TWO = 2;
const NUM_THREE = 3;

async function freshDir(prefix: string): Promise<string> {
   const dir = join(tmpdir(), `${prefix}-${randomUUID()}`);
   await fs.mkdir(dir, { recursive: true });
   return dir;
}

afterEach(() => {
   vi.restoreAllMocks();
});

describe('LOCK_CONFIG', () => {
   it('enables a retry budget >= 10 seconds', () => {
      let totalWaitMs = 0;
      for (
         let attemptIndex = 0;
         attemptIndex < LOCK_CONFIG.retries.retries;
         attemptIndex += 1
      ) {
         const wait = Math.min(
            LOCK_CONFIG.retries.maxTimeout,
            LOCK_CONFIG.retries.minTimeout * LOCK_CONFIG.retries.factor ** attemptIndex,
         );
         totalWaitMs += wait;
      }
      expect(totalWaitMs).toBeGreaterThanOrEqual(TEN_SECONDS_MS);
   });
});

describe('attemptArtifactPath', () => {
   it('sanitizes invalid characters and strips leading dots from extension', () => {
      const path = attemptArtifactPath('.', 'check#ID!', ATTEMPT_NUMBER, '.png');
      expect(path).toBe(`${resolve('.')}/check-ID-.attempt-3.png`);
   });

   it('passes through safe strings unchanged', () => {
      const path = attemptArtifactPath('.', 'run', '1', 'json');
      expect(path).toBe(`${resolve('.')}/run.attempt-1.json`);
   });
});

describe('writeAtomic', () => {
   let baseDir = '';

   beforeEach(async () => {
      baseDir = await freshDir('a11ied-store-atomic');
   });

   afterEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
   });

   it('writes text, bytes, and JSON objects atomically without leaving .tmp files', async () => {
      const textPath = `${baseDir}/text.txt`;
      await writeAtomic(textPath, 'hello world');
      expect(await fs.readFile(textPath, 'utf8')).toBe('hello world');

      const bytesPath = `${baseDir}/bytes.bin`;
      await writeAtomic(bytesPath, new Uint8Array([BYTE_H, BYTE_I]));
      expect([...(await fs.readFile(bytesPath))]).toEqual([BYTE_H, BYTE_I]);

      const jsonPath = `${baseDir}/data.json`;
      await writeAtomic(jsonPath, { alpha: 1, beta: [NUM_TWO, NUM_THREE] });
      expect(JSON.parse(await fs.readFile(jsonPath, 'utf8'))).toEqual({
         alpha: 1,
         beta: [NUM_TWO, NUM_THREE],
      });

      const files = await fs.readdir(baseDir);
      expect(files.some((file) => file.includes('.tmp'))).toBe(false);
   });

   it('does not overwrite an existing file when overwrite is false', async () => {
      const path = `${baseDir}/keep.txt`;
      await writeAtomic(path, 'first');
      await expect(writeAtomic(path, 'second', { overwrite: false })).rejects.toThrow(
         'EEXIST',
      );
      expect(await fs.readFile(path, 'utf8')).toBe('first');
   });
});

describe('withPathLock / withLockedFile', () => {
   let baseDir = '';

   beforeEach(async () => {
      baseDir = await freshDir('a11ied-store-lock');
   });

   afterEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
   });

   it('serializes concurrent read-modify-write without lost updates', async () => {
      const path = `${baseDir}/counter.json`;
      await writeAtomic(path, { count: 0 });

      const increments = Array.from({ length: 10 }, () =>
         withLockedFile<{ count: number }, string>(
            path,
            {
               parse: (raw) =>
                  raw ? (JSON.parse(raw) as { count: number }) : { count: 0 },
               serialize: (state) => state,
            },
            (state) => ({
               state: { count: state.count + 1 },
               result: 'ok',
            }),
         ),
      );

      const results = await Promise.all(increments);
      expect(results).toHaveLength(10);

      const final = JSON.parse(await fs.readFile(path, 'utf8')) as { count: number };
      expect(final.count).toBe(10);
   });
});

describe('appendLine', () => {
   let baseDir = '';

   beforeEach(async () => {
      baseDir = await freshDir('a11ied-store-append');
   });

   afterEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
   });

   it('appends 10 concurrent JSONL lines, each a valid record', async () => {
      const path = `${baseDir}/evidence.jsonl`;
      const records = Array.from({ length: 10 }, (_unused, seqIndex) => ({
         seq: seqIndex,
      }));
      await Promise.all(records.map((record) => appendLine(path, record)));

      const content = await fs.readFile(path, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(10);
      for (const line of lines) {
         expect(() => JSON.parse(line)).not.toThrow();
      }
   });
});

describe('withDirectoryCommit', () => {
   let baseDir = '';

   beforeEach(async () => {
      baseDir = await freshDir('a11ied-store-commit');
   });

   afterEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
   });

   it('populates staging then swaps into targetDir atomically and rolls back on failure', async () => {
      const targetDir = `${baseDir}/run`;
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(`${targetDir}/old.txt`, 'old');

      const result = await withDirectoryCommit(targetDir, async (stage) => {
         await fs.writeFile(`${stage}/manifest.json`, 'staged content');
         return { staged: true };
      });
      expect(result).toEqual({ staged: true });
      expect(await fs.readdir(targetDir)).toEqual(['manifest.json']);

      await expect(
         withDirectoryCommit(targetDir, async () => {
            throw new Error('populate failed');
         }),
      ).rejects.toThrow('populate failed');
      expect(await fs.readFile(`${targetDir}/manifest.json`, 'utf8')).toBe(
         'staged content',
      );
   });
});

const ROOT_CALLS = 1;
const NUM_WAY = 8;

describe('getCanonicalPath', () => {
   it('stops at an unavailable filesystem root instead of recursing forever', async () => {
      const error = Object.assign(new Error('Unavailable filesystem root'), {
            code: 'ENOENT',
         }),
         root = parse(resolve('.')).root;
      const spy = vi.spyOn(fs, 'realpath');
      spy.mockClear();
      spy.mockRejectedValueOnce(error);

      await expect(getCanonicalPath(root)).rejects.toStrictEqual(error);
      expect(spy).toHaveBeenCalledTimes(ROOT_CALLS);
   });
});

describe('contention', () => {
   let baseDir = '';

   beforeEach(async () => {
      baseDir = await freshDir('a11ied-store-contention');
   });

   afterEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
   });

   it('serializes 8 concurrent withLockedFile increments without lost updates', async () => {
      const counterPath = `${baseDir}/counter.json`;
      await writeAtomic(counterPath, { count: 0 });

      const increments = Array.from({ length: NUM_WAY }, () =>
         withLockedFile<{ count: number }, string>(
            counterPath,
            {
               parse: (raw) =>
                  raw ? (JSON.parse(raw) as { count: number }) : { count: 0 },
               serialize: (state) => state,
            },
            (state) => ({
               state: { count: state.count + 1 },
               result: 'ok',
            }),
         ),
      );
      const results = await Promise.all(increments);
      expect(results).toHaveLength(NUM_WAY);

      const final = JSON.parse(await fs.readFile(counterPath, 'utf8')) as {
         count: number;
      };
      expect(final.count).toBe(NUM_WAY);
   });

   it('appends 8 valid JSONL lines through concurrent appendLine calls', async () => {
      const evidencePath = `${baseDir}/evidence.jsonl`;
      await Promise.all(
         Array.from({ length: NUM_WAY }, (_unused, seqIndex) =>
            appendLine(evidencePath, { seq: seqIndex }),
         ),
      );

      const content = await fs.readFile(evidencePath, 'utf8');
      const records = content.trim().split('\n');
      expect(records).toHaveLength(NUM_WAY);
      for (const record of records) {
         expect(() => JSON.parse(record)).not.toThrow();
      }
   });
});

describe('crash-mid-write', () => {
   let baseDir = '';

   beforeEach(async () => {
      baseDir = await freshDir('a11ied-store-crash');
   });

   afterEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
   });

   it('reverts the target on overwrite=false rejection and removes the temporary file', async () => {
      const path = `${baseDir}/crash-target.json`;
      await writeAtomic(path, { count: 1 });

      await expect(writeAtomic(path, { count: 2 }, { overwrite: false })).rejects.toThrow(
         'EEXIST',
      );
      const back = JSON.parse(await fs.readFile(path, 'utf8')) as { count: number };
      expect(back.count).toBe(1);
      expect(
         await fs
            .readdir(baseDir)
            .then((files) => files.filter((file) => file.includes('.tmp'))),
      ).toEqual([]);
   });

   it('discards the partial write and removes the temporary file when rename fails mid-commit', async () => {
      const path = `${baseDir}/crash-rename.json`;
      await writeAtomic(path, { count: 1 });

      const renameSpy = vi
         .spyOn(fs, 'rename')
         .mockRejectedValueOnce(new Error('rename failed'));
      await expect(writeAtomic(path, { count: 2 })).rejects.toThrow('rename failed');
      const back = JSON.parse(await fs.readFile(path, 'utf8')) as { count: number };
      expect(back.count).toBe(1);
      renameSpy.mockRestore();
      expect(
         await fs
            .readdir(baseDir)
            .then((files) => files.filter((file) => file.includes('.tmp'))),
      ).toEqual([]);
   });
});
