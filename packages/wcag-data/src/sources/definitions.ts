import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { isRecord } from '../shared/utils.js';
import type { RawSourceDefinition, WcagDataDirectories } from '../shared/types.js';

const packageRoot = resolve(import.meta.dirname, '../..');
const esmRequire = createRequire(import.meta.url);
export const axeCorePackage = esmRequire('axe-core/package.json') as { version: string };
export const wcagVersions = ['2.2', '2.1'] as const;

function validateWcagPayload(payload: unknown): void {
   const hasTerms = isRecord(payload) && 'terms' in payload;
   let termsValue: unknown = undefined;
   if (hasTerms) {
      termsValue = payload.terms as unknown;
   }

   if (
      !isRecord(payload) ||
      !Array.isArray(payload.principles) ||
      (!Array.isArray(termsValue) && !isRecord(termsValue))
   ) {
      throw new Error('expected top-level object with principles[] and terms');
   }
}

function validateActMappingPayload(payload: unknown): void {
   if (!isRecord(payload) || !Array.isArray(payload['act-rules'])) {
      throw new Error('expected top-level object with act-rules[]');
   }
}

function validateQuickrefTagsPayload(payload: unknown): void {
   if (!isRecord(payload) || Object.keys(payload).length === 0) {
      throw new Error('expected a non-empty object keyed by success criterion slug');
   }

   const sampleValue = payload[Object.keys(payload)[0] ?? ''];
   if (!isRecord(sampleValue)) {
      throw new Error('expected each quickref tag entry to be an object');
   }
}

export function validateAxeRulesPayload(payload: unknown): void {
   if (!Array.isArray(payload)) {
      throw new TypeError('expected an array of axe rules');
   }

   const sample = payload[0];
   if (
      sample !== undefined &&
      (!isRecord(sample) ||
         typeof sample.ruleId !== 'string' ||
         !Array.isArray(sample.tags))
   ) {
      throw new Error('expected each axe rule entry to include ruleId and tags[]');
   }
}

export const rawSourceDefinitions: RawSourceDefinition[] = [
   {
      id: 'wcag22',
      fileName: 'wcag.2.2.json',
      format: 'json',
      primaryUrl: 'https://www.w3.org/WAI/WCAG22/wcag.json',
      upstreamVersion: '2.2',
      validate: validateWcagPayload,
   },
   {
      id: 'wcag21',
      fileName: 'wcag.2.1.json',
      format: 'json',
      primaryUrl: 'https://www.w3.org/WAI/WCAG21/wcag.json',
      upstreamVersion: '2.1',
      validate: validateWcagPayload,
   },
   {
      id: 'act-mapping',
      fileName: 'act-mapping.json',
      format: 'json',
      primaryUrl:
         'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json',
      validate: validateActMappingPayload,
   },
   {
      id: 'quickref-tags',
      fileName: 'quickref-tags.yml',
      format: 'yaml',
      primaryUrl:
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      fallbackUrls: [
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/gh-pages/_data/tags-sc.yml',
      ],
      validate: validateQuickrefTagsPayload,
   },
];

/** Returns the directory layout used by the WCAG data package. */
export function getWcagDataDirectories(): WcagDataDirectories {
   return {
      packageRoot,
      raw: join(packageRoot, 'data', 'raw'),
      generated: join(packageRoot, 'data', 'generated'),
      scripts: join(packageRoot, 'scripts'),
      test: join(packageRoot, 'test'),
   };
}

export async function ensureDataDirectories(
   directories: WcagDataDirectories,
): Promise<void> {
   await Promise.all([
      mkdir(directories.raw, { recursive: true }),
      mkdir(directories.generated, { recursive: true }),
      mkdir(directories.scripts, { recursive: true }),
      mkdir(directories.test, { recursive: true }),
   ]);
}

/** Creates the WCAG data directory layout when it does not exist yet. */
export async function ensureWcagDataDirectories(): Promise<WcagDataDirectories> {
   const directories = getWcagDataDirectories();
   await ensureDataDirectories(directories);
   return directories;
}

/** Lists the approved upstream URLs this package syncs from. */
export function listApprovedUpstreamSourceUrls(): string[] {
   return rawSourceDefinitions.map((definition) => definition.primaryUrl);
}

/** Lists the raw source definitions used by the sync pipeline. */
export function listRawSourceDefinitions(): RawSourceDefinition[] {
   return [...rawSourceDefinitions];
}
