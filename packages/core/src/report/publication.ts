import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { z } from 'zod';
import type { ReportModel } from '@a11ied/contracts';
import { getCanonicalPath, withFileLock, writeJsonAtomic } from '../files/atomic-json.js';
import { CliUsageError } from '../errors/cli-errors.js';
import {
   getIdentity,
   journalSchema,
   manifestSchema,
   readOptionalJson,
   verifyBundle,
} from './bundle-integrity.js';

const REPORT_NAMES = [
   'report.json',
   'report.html',
   'report.pdf',
   'report.earl.json',
   'report.manifest.json',
];
function getTransactionPaths(
   outDir: string,
   generation: string,
): { stage: string; backup: string; journal: string } {
   return {
      stage: `${outDir}.stage-${generation}`,
      backup: `${outDir}.backup-${generation}`,
      journal: `${outDir}.publication.json`,
   };
}

async function assertOwnedStage(
   outDir: string,
   journal: z.infer<typeof journalSchema>,
): Promise<void> {
   const paths = getTransactionPaths(outDir, journal.generation);
   if (
      !journal.stageIdentity ||
      (await getIdentity(paths.stage)) !== journal.stageIdentity
   ) {
      throw new Error(
         'The publication stage changed. Preserve its files and resolve the conflict before rebuilding.',
      );
   }
}

async function discardStage(
   outDir: string,
   journal: z.infer<typeof journalSchema>,
): Promise<void> {
   const paths = getTransactionPaths(outDir, journal.generation);
   const identity = await getIdentity(paths.stage);
   if (identity) {
      if (journal.stageIdentity) {
         await assertOwnedStage(outDir, journal);
         await rm(paths.stage, { recursive: true });
      } else {
         await rmdir(paths.stage);
      }
   }
}

async function discardPublicationStage(
   outDir: string,
   journal: z.infer<typeof journalSchema>,
): Promise<void> {
   const paths = getTransactionPaths(outDir, journal.generation);
   await discardStage(outDir, journal);
   await rm(paths.journal);
}

async function promoteMissingDirectory(
   outDir: string,
   journal: z.infer<typeof journalSchema>,
): Promise<void> {
   const paths = getTransactionPaths(outDir, journal.generation);
   const backup = await getIdentity(paths.backup);
   try {
      await assertOwnedStage(outDir, journal);
      await verifyBundle(paths.stage, journal.generation);
   } catch (error) {
      if (backup) {
         await rename(paths.backup, outDir);
      }
      await discardPublicationStage(outDir, journal);
      throw error;
   }
   if (journal.previousIdentity && !backup) {
      throw new Error(
         'The previous report directory is missing. Preserve the staged bundle and resolve the conflict.',
      );
   }
   await rename(paths.stage, outDir);
}

async function finishPublication(
   outDir: string,
   journal: z.infer<typeof journalSchema>,
): Promise<void> {
   const paths = getTransactionPaths(outDir, journal.generation);
   const backup = await getIdentity(paths.backup),
      current = await getIdentity(outDir);
   if (backup && backup !== journal.previousIdentity) {
      throw new Error(
         'The publication backup changed. Preserve it and resolve the conflict before rebuilding.',
      );
   }
   if (current && current === journal.previousIdentity) {
      if (backup) {
         throw new Error(
            'Both previous report directories exist. Resolve the publication conflict before rebuilding.',
         );
      }
      await assertOwnedStage(outDir, journal);
      await verifyBundle(paths.stage, journal.generation);
      await rename(outDir, paths.backup);
      await rename(paths.stage, outDir);
   } else if (!current) {
      await promoteMissingDirectory(outDir, journal);
   }
   await verifyBundle(outDir, journal.generation);
   await rm(paths.backup, { recursive: true, force: true });
   await discardPublicationStage(outDir, journal);
}

async function prepareStage(
   outDir: string,
   stage: string,
   previousIdentity?: string,
): Promise<void> {
   if (previousIdentity) {
      await cp(outDir, stage, { recursive: true, dereference: false });
   }
   await Promise.all(
      REPORT_NAMES.map((name) => rm(resolve(stage, name), { force: true })),
   );
   const artifacts = resolve(stage, 'artifacts');
   await getIdentity(artifacts);
}

async function getOutputDirectory(
   outDir: string,
   protectedPaths: string[],
): Promise<string> {
   const output = resolve(outDir);
   if (dirname(output) === output) {
      throw new CliUsageError(
         'report-publication-path',
         'Use a dedicated report directory, not a filesystem root.',
      );
   }
   await mkdir(dirname(output), { recursive: true });
   const canonical = resolve(await realpath(dirname(output)), basename(output));
   await getIdentity(canonical);
   await Promise.all(
      [...protectedPaths, process.cwd()].map(async (input) => {
         const entry = resolve(
               await getCanonicalPath(dirname(resolve(input))),
               basename(input),
            ),
            target = await getCanonicalPath(input);
         const isContained = [entry, target].some((path) => {
            const inside = relative(canonical, path);
            return (
               !inside.startsWith(`..${sep}`) && inside !== '..' && !isAbsolute(inside)
            );
         });
         if (isContained) {
            throw new CliUsageError(
               'report-publication-path',
               'The report directory must not contain audit input files or the current working directory.',
            );
         }
      }),
   );
   return canonical;
}

async function writeManifest(
   stage: string,
   generation: string,
   result: {
      model: ReportModel;
      outputFiles: string[];
   },
): Promise<z.infer<typeof manifestSchema>> {
   const files = await Promise.all(
      [...new Set(result.outputFiles)].map(async (file) => ({
         path: relative(stage, file).split('\\').join('/'),
         sha256: createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
      })),
   );
   const manifest = manifestSchema.parse({
      schemaVersion: '1',
      generation,
      assessmentRevision: result.model.assessment?.revision,
      assessmentComplete: result.model.assessment?.complete ?? false,
      reportStatus: result.model.status,
      formats: ['json', 'html', 'pdf', 'earl'].filter((format) =>
         files.some(
            (file) => file.path === `report.${format === 'earl' ? 'earl.json' : format}`,
         ),
      ),
      files,
   });
   await writeJsonAtomic(manifest, resolve(stage, 'report.manifest.json'));
   return manifest;
}

async function recoverPublication(outDir: string): Promise<void> {
   const saved = await readOptionalJson(`${outDir}.publication.json`);
   if (saved !== undefined) {
      const journal = journalSchema.parse(saved);
      if (journal.phase === 'building') {
         const paths = getTransactionPaths(outDir, journal.generation);
         if (
            (await getIdentity(outDir)) !== journal.previousIdentity ||
            (await getIdentity(paths.backup))
         ) {
            throw new Error(
               'The report directory changed during generation. Preserve its files and resolve the publication conflict.',
            );
         }
         await discardPublicationStage(outDir, journal);
      } else {
         await finishPublication(outDir, journal);
      }
   }
}

async function beginPublication(
   outDir: string,
   generation: string,
): Promise<z.infer<typeof journalSchema>> {
   const paths = getTransactionPaths(outDir, generation);
   const journal = journalSchema.parse({
      schemaVersion: '1',
      generation,
      previousIdentity: await getIdentity(outDir),
      phase: 'building',
   });
   await writeJsonAtomic(journal, paths.journal, false);
   await mkdir(paths.stage);
   const owned = { ...journal, stageIdentity: await getIdentity(paths.stage) };
   await writeJsonAtomic(owned, paths.journal);
   return owned;
}

/** Publish complete generations under one lock; the journal repairs interrupted swaps. */
export async function publishReportBundle(input: {
   outDir: string;
   protectedPaths: string[];
   build: (
      stage: string,
      finalDirectory: string,
   ) => Promise<{ model: ReportModel; outputFiles: string[] }>;
}): Promise<{ model: ReportModel; outputFiles: string[] }> {
   const outDir = await getOutputDirectory(input.outDir, input.protectedPaths);
   return withFileLock(`${outDir}.publication`, async () => {
      await recoverPublication(outDir);
      const generation = randomUUID(),
         paths = getTransactionPaths(outDir, generation);
      const journal = await beginPublication(outDir, generation);
      let ready = false;
      try {
         await prepareStage(outDir, paths.stage, journal.previousIdentity);
         const result = await input.build(paths.stage, resolve(input.outDir));
         const manifest = await writeManifest(paths.stage, generation, result);
         await verifyBundle(paths.stage, generation);
         ready = true;
         await writeJsonAtomic({ ...journal, phase: 'ready' }, paths.journal);
         await finishPublication(outDir, journal);
         return {
            model: result.model,
            outputFiles: [
               ...manifest.files.map((file) => resolve(input.outDir, file.path)),
               resolve(input.outDir, 'report.manifest.json'),
            ],
         };
      } finally {
         if (!ready) {
            await discardPublicationStage(outDir, journal);
         }
      }
   });
}
