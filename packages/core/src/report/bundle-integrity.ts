import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { reportFormatSchema } from '@a11ied/contracts';
import { CliUsageError } from '../errors/cli-errors.js';

/** Restrict generated paths so recovery cannot read files outside its report bundle. */
export const manifestSchema = z
   .object({
      schemaVersion: z.literal('1'),
      generation: z.string().uuid(),
      assessmentRevision: z.number().int().nonnegative().optional(),
      assessmentComplete: z.boolean(),
      reportStatus: z.enum(['draft', 'final']),
      formats: z.array(reportFormatSchema).min(1),
      files: z
         .array(
            z.object({
               path: z
                  .string()
                  .regex(
                     /^(?:report\.(?:json|html|pdf|earl\.json)|artifacts\/[a-f0-9]{64}\.(?:json|png))$/,
                  ),
               sha256: z.string().regex(/^[a-f0-9]{64}$/),
            }),
         )
         .min(1),
   })
   .refine((manifest) => {
      const files = manifest.files.map((file) => file.path),
         names = manifest.formats.map(
            (format) => `report.${format === 'earl' ? 'earl.json' : format}`,
         );
      return (
         names.includes('report.json') &&
         new Set(manifest.formats).size === manifest.formats.length &&
         new Set(files).size === files.length &&
         names.every((name) => files.includes(name)) &&
         files.every((file) => file.startsWith('artifacts/') || names.includes(file))
      );
   }, 'The report manifest must describe every selected format and the JSON model.');
/** Record filesystem identities rather than accepting arbitrary recovery paths. */
export const journalSchema = z.object({
   schemaVersion: z.literal('1'),
   generation: z.string().uuid(),
   previousIdentity: z.string().optional(),
   stageIdentity: z.string().optional(),
   phase: z.enum(['building', 'ready']),
});

/**
 * Optional metadata may be absent; permission and corruption errors must still stop
 * publication.
 */
export function isMissing(error: unknown): boolean {
   return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Reject links and retain exact filesystem identifiers before replacing or removing
 * directories.
 */
export async function getIdentity(path: string): Promise<string | undefined> {
   try {
      const stat = await lstat(path, { bigint: true });
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
         throw new CliUsageError(
            'report-publication-path',
            `Use a regular directory for report publication: ${path}`,
         );
      }
      return `${stat.dev}:${stat.ino}`;
   } catch (error) {
      if (isMissing(error)) {
         return undefined;
      }
      throw error;
   }
}

/** Recovery metadata must be a regular file, so copied links cannot redirect its reads. */
export async function readOptionalJson(path: string): Promise<unknown> {
   try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
         throw new Error(`Report publication metadata must be a regular file: ${path}`);
      }
      return JSON.parse(await readFile(path, 'utf8'));
   } catch (error) {
      if (isMissing(error)) {
         return undefined;
      }
      throw error;
   }
}

/** Gate publication on the expected generation and the exact bytes of each generated file. */
export async function verifyBundle(path: string, generation: string): Promise<void> {
   await getIdentity(path);
   const manifest = manifestSchema.parse(
      await readOptionalJson(resolve(path, 'report.manifest.json')),
   );
   if (manifest.generation !== generation) {
      throw new Error('The report bundle belongs to a different publication.');
   }
   const root = await realpath(path);
   await Promise.all(
      manifest.files.map(async (file) => {
         const filePath = resolve(path, file.path);
         const actualPath = await realpath(filePath),
            expectedPath = resolve(root, file.path),
            stat = await lstat(filePath);
         if (actualPath !== expectedPath || !stat.isFile() || stat.isSymbolicLink()) {
            throw new Error(
               `Report bundle file is not a contained regular file: ${file.path}`,
            );
         }
         const bytes = await readFile(filePath);
         if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
            throw new Error(`Report bundle file failed its digest check: ${file.path}`);
         }
      }),
   );
}
