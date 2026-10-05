import { createHash, randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReportBundle } from './runtime.js';
import * as pdf from './render-pdf.js';
import { manifestSchema } from './bundle-integrity.js';
import { writeReportTestDraft } from './test-fixtures.js';

vi.mock('node:fs/promises', async (importOriginal) => {
   const original = await importOriginal<typeof filesystem>();
   return { ...original, rename: vi.fn(original.rename), rm: vi.fn(original.rm) };
});

const nativeFilesystem = await vi.importActual<typeof filesystem>('node:fs/promises');

let directory = '',
   inventoryPath = '',
   outDir = '',
   resultsDir = '';

function restoreFilesystem(): void {
   vi.mocked(filesystem.rename).mockImplementation(nativeFilesystem.rename);
   vi.mocked(filesystem.rm).mockImplementation(nativeFilesystem.rm);
}

beforeEach(async () => {
   directory = await filesystem.mkdtemp(join(tmpdir(), 'a11ied-publication-'));
   directory = await filesystem.realpath(directory);
   ({ inventoryPath, resultsDir } = await writeReportTestDraft(directory));
   outDir = join(directory, 'report');
});

afterEach(async () => {
   vi.restoreAllMocks();
   restoreFilesystem();
   await filesystem.rm(directory, { recursive: true, force: true });
});

async function build(
   title: string,
   formats: ('json' | 'html' | 'pdf' | 'earl')[] = ['json'],
): Promise<void> {
   await buildReportBundle({
      inventoryPath,
      resultsDir,
      outDir,
      title,
      formats,
      draft: true,
      version: '0.1.0',
   });
}

async function getManifest(): Promise<ReturnType<typeof manifestSchema.parse>> {
   return manifestSchema.parse(
      JSON.parse(await filesystem.readFile(join(outDir, 'report.manifest.json'), 'utf8')),
   );
}

async function assertTitle(title: string): Promise<void> {
   const model = JSON.parse(
      await filesystem.readFile(join(outDir, 'report.json'), 'utf8'),
   );

   expect(model.title).toStrictEqual(title);
}

function failPdf(): void {
   vi.spyOn(pdf, 'renderPdfReport').mockRejectedValue(new Error('PDF interrupted'));
}

describe('report bundle publication', () => {
   it('hashes files without claiming assessment completion', async () => {
      await build('First report', ['html', 'earl']);
      const manifest = await getManifest();
      await Promise.all(
         manifest.files.map(async (file) => {
            const bytes = await filesystem.readFile(join(outDir, file.path));

            expect(createHash('sha256').update(bytes).digest('hex')).toStrictEqual(
               file.sha256,
            );
         }),
      );

      expect(manifest.assessmentComplete).toStrictEqual(false);
      expect(manifest.reportStatus).toStrictEqual('draft');
      expect(manifest.formats).to.eql(['json', 'html', 'earl']);
   });

   it('keeps the previous whole bundle when PDF rendering fails', async () => {
      await build('Previous report', ['html', 'earl']);
      const manifest = await getManifest(),
         previous = await filesystem.readFile(join(outDir, 'report.html'), 'utf8');
      failPdf();

      await expect(build('Interrupted report', ['pdf'])).rejects.toThrow(
         'PDF interrupted',
      );
      expect(await getManifest()).to.eql(manifest);
      expect(
         await filesystem.readFile(join(outDir, 'report.html'), 'utf8'),
      ).toStrictEqual(previous);
      await assertTitle('Previous report');
   });

   it('retains unrelated files and removes omitted formats', async () => {
      await build('Old report', ['html', 'earl']);
      await filesystem.mkdir(join(outDir, 'artifacts'));
      await filesystem.writeFile(join(outDir, 'notes.txt'), 'Keep my notes');
      await filesystem.writeFile(
         join(outDir, 'artifacts', 'previous.json'),
         'Keep old PDF links',
      );
      await build('New report');

      expect(await filesystem.readFile(join(outDir, 'notes.txt'), 'utf8')).toStrictEqual(
         'Keep my notes',
      );
      expect(
         await filesystem.readFile(join(outDir, 'artifacts', 'previous.json'), 'utf8'),
      ).toStrictEqual('Keep old PDF links');
      await expect(filesystem.access(join(outDir, 'report.html'))).rejects.toThrow();
      await expect(filesystem.access(join(outDir, 'report.earl.json'))).rejects.toThrow();
      await assertTitle('New report');
   });
});

describe('interrupted report publication', () => {
   it.each(['before-backup', 'after-backup', 'after-promotion'])(
      'recovers a swap interrupted %s',
      async (boundary) => {
         await build('Previous report');
         const { rename, rm: remove } = nativeFilesystem;
         if (boundary === 'after-promotion') {
            vi.spyOn(filesystem, 'rm').mockImplementation(async (path, options) => {
               if (String(path).includes('.backup-')) {
                  throw new Error('Publication interrupted');
               }
               return remove(path, options);
            });
         } else {
            vi.spyOn(filesystem, 'rename').mockImplementation(
               async (source, destination) => {
                  if (
                     (boundary === 'before-backup' && String(source) === outDir) ||
                     (boundary === 'after-backup' &&
                        String(source).includes('.stage-') &&
                        String(destination) === outDir)
                  ) {
                     throw new Error('Publication interrupted');
                  }
                  return rename(source, destination);
               },
            );
         }

         await expect(build('Recovered report')).rejects.toThrow(
            'Publication interrupted',
         );
         vi.restoreAllMocks();
         restoreFilesystem();
         failPdf();
         await expect(build('Next incomplete report', ['pdf'])).rejects.toThrow(
            'PDF interrupted',
         );
         await assertTitle('Recovered report');
         await expect(filesystem.access(`${outDir}.publication.json`)).rejects.toThrow();
         const names = await filesystem.readdir(directory);

         expect(names.some((name) => name.includes('.backup-'))).toStrictEqual(false);
      },
   );
});

describe('corrupted report publication', () => {
   it('restores the previous bundle when an interrupted stage fails verification', async () => {
      await build('Previous report');
      const { rename } = nativeFilesystem;
      vi.spyOn(filesystem, 'rename').mockImplementation(async (source, destination) => {
         if (String(source).includes('.stage-') && String(destination) === outDir) {
            throw new Error('Publication interrupted');
         }
         return rename(source, destination);
      });
      await expect(build('Corrupted report')).rejects.toThrow('Publication interrupted');
      vi.restoreAllMocks();
      restoreFilesystem();
      const journal = JSON.parse(
         await filesystem.readFile(`${outDir}.publication.json`, 'utf8'),
      );
      await filesystem.writeFile(
         `${outDir}.stage-${journal.generation}/report.json`,
         'corrupted',
      );

      await expect(build('Next report')).rejects.toThrow('digest check');
      await assertTitle('Previous report');
      await build('Next report');
      await assertTitle('Next report');
   });
});

describe('report publication isolation', () => {
   it('serializes competing report builds', async () => {
      await Promise.all([
         build('First concurrent report', ['html']),
         build('Second concurrent report', ['earl']),
      ]);
      const manifest = await getManifest(),
         model = JSON.parse(
            await filesystem.readFile(join(outDir, 'report.json'), 'utf8'),
         );
      const isSecond = model.title === 'Second concurrent report';

      expect(['First concurrent report', 'Second concurrent report']).toContain(
         model.title,
      );
      expect(manifest.formats).to.eql(isSecond ? ['json', 'earl'] : ['json', 'html']);
      await expect(
         filesystem.access(join(outDir, isSecond ? 'report.html' : 'report.earl.json')),
      ).rejects.toThrow();
   });

   it('preserves files at unsafe publication targets', async () => {
      const actual = join(directory, 'actual-report'),
         savedInventory = await filesystem.readFile(inventoryPath, 'utf8');
      await filesystem.mkdir(actual);
      await filesystem.symlink(actual, outDir);

      await expect(build('Unsafe target')).rejects.toThrow('regular directory');
      outDir = directory;
      await expect(build('Unsafe target')).rejects.toThrow(
         'must not contain audit input',
      );
      outDir = resolve('/');
      await expect(build('Unsafe target')).rejects.toThrow('filesystem root');
      expect(await filesystem.readFile(inventoryPath, 'utf8')).toStrictEqual(
         savedInventory,
      );
   });
});

describe('unfinished report generation', () => {
   it('discards an interrupted building stage before rendering a replacement', async () => {
      await build('Previous report');
      const generation = randomUUID(),
         stat = await filesystem.lstat(outDir, { bigint: true });
      const stage = `${outDir}.stage-${generation}`;
      await filesystem.mkdir(stage);
      const stageStat = await filesystem.lstat(stage, { bigint: true });
      await filesystem.writeFile(join(stage, 'report.json'), 'incomplete');
      await filesystem.writeFile(
         `${outDir}.publication.json`,
         JSON.stringify({
            schemaVersion: '1',
            generation,
            previousIdentity: `${stat.dev}:${stat.ino}`,
            stageIdentity: `${stageStat.dev}:${stageStat.ino}`,
            phase: 'building',
         }),
      );
      await build('Replacement report');

      await assertTitle('Replacement report');
      await expect(filesystem.access(stage)).rejects.toThrow();
      await expect(filesystem.access(`${outDir}.publication.json`)).rejects.toThrow();
   });

   it('rejects an unexpected directory instead of overwriting it during recovery', async () => {
      await build('Previous report');
      const generation = randomUUID();
      await filesystem.writeFile(
         `${outDir}.publication.json`,
         JSON.stringify({
            schemaVersion: '1',
            generation,
            previousIdentity: 'unexpected',
            phase: 'building',
         }),
      );

      await expect(build('Replacement report')).rejects.toThrow(
         'changed during generation',
      );
      await assertTitle('Previous report');
      await expect(
         filesystem.access(`${outDir}.publication.json`),
      ).resolves.toBeUndefined();
   });
});

async function createInterruptedStage(): Promise<string> {
   await build('Previous report');
   vi.spyOn(filesystem, 'rename').mockImplementation(async (source, destination) => {
      if (String(source).includes('.stage-') && String(destination) === outDir) {
         throw new Error('Publication interrupted');
      }
      return nativeFilesystem.rename(source, destination);
   });

   await expect(build('Candidate report')).rejects.toThrow('Publication interrupted');
   restoreFilesystem();
   const journal = JSON.parse(
      await filesystem.readFile(`${outDir}.publication.json`, 'utf8'),
   );
   return `${outDir}.stage-${journal.generation}`;
}

describe('report publication path protection', () => {
   it('preserves the current working directory', async () => {
      await build('Previous report');
      vi.spyOn(process, 'cwd').mockReturnValue(outDir);

      await expect(build('Unsafe replacement')).rejects.toThrow(
         'current working directory',
      );
      await assertTitle('Previous report');
   });
   it.each(['symlink', 'replacement'])(
      'preserves an unexpected %s at a staged directory path',
      async (kind) => {
         const stage = await createInterruptedStage();
         const moved = `${stage}.original`;
         await filesystem.rename(stage, moved);
         await (kind === 'symlink'
            ? filesystem.symlink(moved, stage)
            : filesystem.cp(moved, stage, { recursive: true }));
         const before = await filesystem.readFile(join(stage, 'report.json'), 'utf8');

         await expect(build('Unsafe replacement')).rejects.toThrow();
         await assertTitle('Previous report');
         expect(
            await filesystem.readFile(join(stage, 'report.json'), 'utf8'),
         ).toStrictEqual(before);
         expect(
            await filesystem.readFile(join(moved, 'report.json'), 'utf8'),
         ).toStrictEqual(before);
         await expect(
            filesystem.access(`${outDir}.publication.json`),
         ).resolves.toBeUndefined();
      },
   );
});
