import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { assertPrivacySafe } from './privacy.mjs';

const FALLBACK_SORT_ORDER = 9999;
const JSON_INDENT = 3;

export function getResultFilePath(repoRoot, fileSlug) {
   return resolve(
      repoRoot,
      'packages',
      'support-data',
      'data',
      'results',
      `${fileSlug}.json`,
   );
}

export function readExistingRuns(filePath) {
   if (!existsSync(filePath)) {
      return [];
   }
   const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
   return Array.isArray(parsed.runs) ? parsed.runs : [];
}

export function writeEnvironmentResultFile({
   repoRoot,
   fileSlug,
   environmentKey,
   environment,
   newRuns,
   testOrder,
   mergeExisting = false,
   statusOverride,
   statusNote,
}) {
   const filePath = getResultFilePath(repoRoot, fileSlug);
   mkdirSync(dirname(filePath), { recursive: true });

   const orderIndex = new Map(testOrder.map((slug, index) => [slug, index]));
   const runBySlug = new Map();

   if (mergeExisting) {
      for (const existing of readExistingRuns(filePath)) {
         if (orderIndex.has(existing.testSlug)) {
            runBySlug.set(existing.testSlug, existing);
         }
      }
   }
   for (const run of newRuns) {
      runBySlug.set(run.testSlug, run);
   }

   const sortedRuns = [...runBySlug.values()].toSorted(
      (left, right) =>
         (orderIndex.get(left.testSlug) ?? FALLBACK_SORT_ORDER) -
         (orderIndex.get(right.testSlug) ?? FALLBACK_SORT_ORDER),
   );

   const payload = {
      schemaVersion: 1,
      environmentKey,
      environment,
      status: statusOverride ?? (sortedRuns.length > 0 ? 'tested' : 'untested'),
      ...(statusNote ? { statusNote } : {}),
      runs: sortedRuns,
   };

   assertPrivacySafe(payload, fileSlug);
   writeFileSync(
      filePath,
      `${JSON.stringify(payload, undefined, JSON_INDENT)}\n`,
      'utf8',
   );
   return filePath;
}
