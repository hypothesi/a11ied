import {
   coverageArtifactSchema,
   coverageSummaryArtifactSchema,
   criteriaByLevelArtifactSchema,
   failureIndexArtifactSchema,
   normalizedCriteriaArtifactSchema,
   normalizedCriterionSchema,
   normalizedTechniqueSchema,
   preferredEvidenceModeSchema,
   slugIndexArtifactSchema,
   strategyArtifactSchema,
   tagIndexArtifactSchema,
   techniqueIndexArtifactSchema,
   type CoverageArtifact,
   type CoverageState,
   type CoverageSummaryArtifact,
   type CriteriaByLevelArtifact,
   type FailureIndexArtifact,
   type NormalizedCriteriaArtifact,
   type NormalizedTechnique,
   type PreferredEvidenceMode,
   type SlugIndexArtifact,
   type StrategyArtifact,
   type TagIndexArtifact,
   type TechniqueIndexArtifact,
   type WcagVersion,
} from '@a11lied/contracts';
import axeCore from 'axe-core';

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(import.meta.url);
const axeCorePackage = require('axe-core/package.json') as { version: string };
const wcagVersions = ['2.2', '2.1'] as const;

export interface WcagDataDirectories {
   packageRoot: string;
   raw: string;
   generated: string;
   scripts: string;
   test: string;
}

type SourceFormat = 'json' | 'yaml' | 'derived-json';
type JsonRecord = Record<string, unknown>;
type TechniqueKind = 'sufficient' | 'advisory' | 'failure';

type RemoteSourceId = 'wcag22' | 'wcag21' | 'act-mapping' | 'quickref-tags';
type LocalSourceId = 'axe-rules';
type RawSourceId = RemoteSourceId | LocalSourceId;

type FetchLike = typeof fetch;

interface RawSourceDefinition {
   id: RawSourceId;
   fileName: string;
   format: SourceFormat;
   primaryUrl: string;
   fallbackUrls?: string[];
   upstreamVersion?: string;
   validate: (payload: unknown) => void;
}

interface CriterionPayload {
   id: string;
   num: string;
   alt_id?: string[];
   content: string;
   handle: string;
   title: string;
   versions: string[];
   level: 'A' | 'AA' | 'AAA';
   details?: unknown[];
   techniques?: {
      sufficient?: TechniqueGroupPayload[];
      advisory?: TechniqueGroupPayload[];
      failure?: TechniquePayload[];
   };
}

interface GuidelinePayload {
   id: string;
   num: string;
   handle: string;
   title: string;
   successcriteria: CriterionPayload[];
}

interface PrinciplePayload {
   id: string;
   num: string;
   handle: string;
   title: string;
   guidelines: GuidelinePayload[];
}

interface TechniqueGroupPayload {
   title?: string;
   note?: string;
   techniques?: TechniquePayload[];
}

interface TechniquePayload {
   id?: string;
   title: string;
   technology?: string;
   suffix?: string;
   using?: TechniquePayload[];
   and?: TechniquePayload[];
}

type QuickrefTagsPayload = Record<string, Record<string, string>>;
interface WcagPayload {
   principles: PrinciplePayload[];
   terms: unknown;
}

interface ActAccessibilityRequirementPayload {
   secondary?: string;
}

interface ActRulePayload {
   title: string;
   permalink?: string;
   successCriteria?: string[];
   wcagTechniques?: string[];
   deprecated?: boolean;
   proposed?: boolean;
   frontmatter?: {
      id?: string;
      accessibility_requirements?: Record<string, ActAccessibilityRequirementPayload>;
   };
}

interface ActMappingPayload {
   'act-rules': ActRulePayload[];
}

export interface RawSourceProvenance {
   sourceId: RawSourceId;
   sourceUrl: string;
   resolvedUrl: string;
   syncedAt: string;
   upstreamVersion?: string;
   sha256: string;
   contentType: SourceFormat;
   etag?: string;
   lastModified?: string;
   fallbackUsed: boolean;
}

export interface RawArtifactWriteResult {
   sourceId: RawSourceId;
   fileName: string;
   filePath: string;
   provenancePath: string;
   provenance: RawSourceProvenance;
}

export interface SyncRawSourcesResult {
   fetchList: string[];
   artifacts: RawArtifactWriteResult[];
   axeRuleCount: number;
}

interface PendingArtifact {
   sourceId: RawSourceId;
   fileName: string;
   body: string;
   provenance: RawSourceProvenance;
}

export interface GeneratedArtifactWriteResult {
   fileName: string;
   filePath: string;
}

export interface NormalizedArtifactsResult {
   generatedArtifacts: GeneratedArtifactWriteResult[];
   criteriaCountByVersion: Record<WcagVersion, number>;
   coverageCountsByVersion: Record<WcagVersion, Record<CoverageState, number>>;
}

export interface GeneratedArtifactProvenance {
   fileName: string;
   sha256: string;
   wcagVersion?: WcagVersion;
   sourceFileNames: string[];
   sourceUrls: string[];
}

export interface GeneratedProvenanceManifest {
   generatedAt: string;
   rawSources: Array<RawSourceProvenance & { fileName: string }>;
   artifacts: GeneratedArtifactProvenance[];
}

export class SyncValidationError extends Error {
   readonly exitCode = 3;
   readonly sourceId: RawSourceId;
   readonly sourceUrl: string;

   constructor(sourceId: RawSourceId, sourceUrl: string, message: string) {
      super(message);
      this.name = 'SyncValidationError';
      this.sourceId = sourceId;
      this.sourceUrl = sourceUrl;
   }
}

function isRecord(value: unknown): value is JsonRecord {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateWcagPayload(payload: unknown): void {
   const hasTerms = isRecord(payload) && 'terms' in payload;
   const termsValue = hasTerms ? (payload.terms as unknown) : undefined;

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

function validateAxeRulesPayload(payload: unknown): void {
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

const rawSourceDefinitions: RawSourceDefinition[] = [
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

export function getWcagDataDirectories(): WcagDataDirectories {
   return {
      packageRoot,
      raw: join(packageRoot, 'data', 'raw'),
      generated: join(packageRoot, 'data', 'generated'),
      scripts: join(packageRoot, 'scripts'),
      test: join(packageRoot, 'test'),
   };
}

export async function ensureWcagDataDirectories(): Promise<WcagDataDirectories> {
   const directories = getWcagDataDirectories();
   await ensureDataDirectories(directories);
   return directories;
}

async function ensureDataDirectories(directories: WcagDataDirectories): Promise<void> {
   await Promise.all([
      mkdir(directories.raw, { recursive: true }),
      mkdir(directories.generated, { recursive: true }),
      mkdir(directories.scripts, { recursive: true }),
      mkdir(directories.test, { recursive: true }),
   ]);
}

export function listApprovedUpstreamSourceUrls(): string[] {
   return rawSourceDefinitions.map((definition) => definition.primaryUrl);
}

export function listRawSourceDefinitions(): RawSourceDefinition[] {
   return [...rawSourceDefinitions];
}

function sha256(content: string): string {
   return createHash('sha256').update(content).digest('hex');
}

function withOptionalStringProperties<T extends Record<string, unknown>>(
   target: T,
   values: Record<string, string | undefined>,
): T {
   const nextTarget = { ...target } as Record<string, unknown>;

   for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) {
         nextTarget[key] = value;
      }
   }

   return nextTarget as T;
}

function parseSourcePayload(format: SourceFormat, sourceText: string): unknown {
   if (format === 'json') {
      return JSON.parse(sourceText) as unknown;
   }

   if (format === 'yaml') {
      return parseYaml(sourceText);
   }

   return JSON.parse(sourceText) as unknown;
}

function toJsonString(value: unknown): string {
   return `${JSON.stringify(value, null, 2)}\n`;
}

async function fetchRemoteSource(
   definition: RawSourceDefinition,
   fetchImpl: FetchLike,
   syncedAt: string,
): Promise<PendingArtifact> {
   let lastFailure: { url: string; status: number; statusText: string } | undefined;

   for (const [index, candidateUrl] of [
      definition.primaryUrl,
      ...(definition.fallbackUrls ?? []),
   ].entries()) {
      const response = await fetchImpl(candidateUrl);

      if (!response.ok) {
         lastFailure = {
            url: candidateUrl,
            status: response.status,
            statusText: response.statusText,
         };

         if (
            response.status === 404 &&
            index < (definition.fallbackUrls?.length ?? 0) + 1
         ) {
            continue;
         }

         throw new SyncValidationError(
            definition.id,
            candidateUrl,
            `Rejected source URL ${candidateUrl}: HTTP ${response.status} ${response.statusText}`,
         );
      }

      const sourceText = await response.text();
      let payload: unknown;

      try {
         payload = parseSourcePayload(definition.format, sourceText);
      } catch (error) {
         const message = error instanceof Error ? error.message : 'unknown parse error';

         throw new SyncValidationError(
            definition.id,
            candidateUrl,
            `Rejected source URL ${candidateUrl}: failed to parse ${definition.format} payload (${message})`,
         );
      }

      try {
         definition.validate(payload);
      } catch (error) {
         const message =
            error instanceof Error ? error.message : 'unknown validation error';

         throw new SyncValidationError(
            definition.id,
            candidateUrl,
            `Rejected source URL ${candidateUrl}: ${message}`,
         );
      }

      return {
         sourceId: definition.id,
         fileName: definition.fileName,
         body: sourceText,
         provenance: withOptionalStringProperties<RawSourceProvenance>(
            {
               sourceId: definition.id,
               sourceUrl: definition.primaryUrl,
               resolvedUrl: candidateUrl,
               syncedAt,
               sha256: sha256(sourceText),
               contentType: definition.format,
               fallbackUsed: candidateUrl !== definition.primaryUrl,
            },
            {
               upstreamVersion: definition.upstreamVersion,
               etag: response.headers.get('etag') ?? undefined,
               lastModified: response.headers.get('last-modified') ?? undefined,
            },
         ),
      };
   }

   throw new SyncValidationError(
      definition.id,
      definition.primaryUrl,
      `Rejected source URL ${lastFailure?.url ?? definition.primaryUrl}: HTTP ${lastFailure?.status ?? 0} ${lastFailure?.statusText ?? 'unknown'}`,
   );
}

export interface DerivedAxeRule {
   ruleId: string;
   description: string;
   help: string;
   helpUrl: string;
   tags: string[];
   actIds: string[];
}

export function deriveAxeRuleMetadata(): DerivedAxeRule[] {
   const rules = axeCore.getRules().map((rule) => ({
      ruleId: rule.ruleId,
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: [...rule.tags].toSorted(),
      actIds: [...(rule.actIds ?? [])].toSorted(),
   }));

   validateAxeRulesPayload(rules);

   return rules.toSorted((left, right) => left.ruleId.localeCompare(right.ruleId));
}

async function buildAxeArtifact(syncedAt: string): Promise<PendingArtifact> {
   const rules = deriveAxeRuleMetadata();
   const body = toJsonString(rules);

   return {
      sourceId: 'axe-rules',
      fileName: 'axe-rules.json',
      body,
      provenance: withOptionalStringProperties<RawSourceProvenance>(
         {
            sourceId: 'axe-rules',
            sourceUrl: 'npm:axe-core',
            resolvedUrl: 'npm:axe-core',
            syncedAt,
            sha256: sha256(body),
            contentType: 'derived-json',
            fallbackUsed: false,
         },
         {
            upstreamVersion: axeCorePackage.version,
         },
      ),
   };
}

function provenanceFileName(fileName: string): string {
   const extensionIndex = fileName.lastIndexOf('.');

   if (extensionIndex === -1) {
      return `${fileName}.provenance.json`;
   }

   return `${fileName.slice(0, extensionIndex)}.provenance.json`;
}

async function writePendingArtifact(
   directories: WcagDataDirectories,
   artifact: PendingArtifact,
): Promise<RawArtifactWriteResult> {
   const filePath = join(directories.raw, artifact.fileName);
   const provenancePath = join(directories.raw, provenanceFileName(artifact.fileName));

   await writeFile(filePath, artifact.body, 'utf8');
   await writeFile(provenancePath, toJsonString(artifact.provenance), 'utf8');

   return {
      sourceId: artifact.sourceId,
      fileName: artifact.fileName,
      filePath,
      provenancePath,
      provenance: artifact.provenance,
   };
}

async function loadRawJson<T>(
   directories: WcagDataDirectories,
   fileName: string,
): Promise<T> {
   return JSON.parse(await readFile(join(directories.raw, fileName), 'utf8')) as T;
}

async function loadQuickrefTags(
   directories: WcagDataDirectories,
): Promise<QuickrefTagsPayload> {
   return parseYaml(
      await readFile(join(directories.raw, 'quickref-tags.yml'), 'utf8'),
   ) as QuickrefTagsPayload;
}

async function loadRawProvenanceEntries(
   directories: WcagDataDirectories,
): Promise<Array<RawSourceProvenance & { fileName: string }>> {
   const fileNames = [
      ...rawSourceDefinitions.map((definition) => definition.fileName),
      'axe-rules.json',
   ];

   return Promise.all(
      fileNames.map(async (fileName) => {
         const provenancePath = join(directories.raw, provenanceFileName(fileName));
         return Object.assign({fileName}, JSON.parse(await readFile(provenancePath,`utf8`)) as RawSourceProvenance);
      }),
   );
}

function understandingUrl(version: WcagVersion, slug: string): string {
   const versionToken = version === '2.2' ? 'WCAG22' : 'WCAG21';
   return `https://www.w3.org/WAI/${versionToken}/Understanding/${slug}`;
}

function normalizeTags(tagPayload: Record<string, string> | undefined): string[] {
   if (!tagPayload) {
      return [];
   }

   return [
      ...new Set(
         Object.values(tagPayload)
            .flatMap((value) => value.split(/\s+/))
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
      ),
   ].toSorted((left, right) => left.localeCompare(right));
}

function extractDetailText(value: unknown): string[] {
   if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized ? [normalized] : [];
   }

   if (Array.isArray(value)) {
      return value.flatMap((entry) => extractDetailText(entry));
   }

   if (!isRecord(value)) {
      return [];
   }

   const handle = typeof value.handle === 'string' ? value.handle.trim() : undefined;
   const text = typeof value.text === 'string' ? value.text.trim() : undefined;

   if (handle && text) {
      return [`${handle}: ${text}`];
   }

   if (text) {
      return [text];
   }

   return Object.values(value).flatMap((entry) => extractDetailText(entry));
}

function normalizeDetails(details: unknown[] | undefined): string[] {
   if (!details) {
      return [];
   }

   return [...new Set(details.flatMap((detail) => extractDetailText(detail)))];
}

function techniqueKey(
   criterionId: string,
   kind: TechniqueKind,
   technique: TechniquePayload,
   lineage: number[],
): string {
   if (technique.id) {
      return technique.id;
   }

   const normalizedTitle = (technique.title ?? 'synthetic')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/(^-|-$)/g, '');
   return `${criterionId}:${kind}:${normalizedTitle || 'synthetic'}:${lineage.join('.')}`;
}

function normalizeTechniqueTree(
   technique: TechniquePayload,
   kind: TechniqueKind,
   criterionId: string,
   groupTitle: string | undefined,
   groupNote: string | undefined,
   lineage: number[],
): NormalizedTechnique[] {
   const key = techniqueKey(criterionId, kind, technique, lineage);
   const children = [
      ...(technique.using ?? []).flatMap((child, index) =>
         normalizeTechniqueTree(child, kind, criterionId, groupTitle, groupNote, [
            ...lineage,
            index,
         ]),
      ),
      ...(technique.and ?? []).flatMap((child, index) =>
         normalizeTechniqueTree(child, kind, criterionId, groupTitle, groupNote, [
            ...lineage,
            index,
         ]),
      ),
   ];

   if (!technique.id && !technique.title && !technique.suffix && !technique.technology) {
      return children;
   }

   const normalized = normalizedTechniqueSchema.parse({
      key,
      id: technique.id,
      title: technique.title,
      technology: technique.technology,
      kind,
      groupTitle,
      groupNote,
      suffix: technique.suffix,
      relatedKeys: children
         .map((child) => child.key)
         .toSorted((left, right) => left.localeCompare(right)),
      isSynthetic: !technique.id,
   });

   return [normalized, ...children];
}

function normalizeTechniqueGroups(
   criterionId: string,
   kind: Extract<TechniqueKind, 'sufficient' | 'advisory'>,
   groups: TechniqueGroupPayload[] | undefined,
): NormalizedTechnique[] {
   if (!groups) {
      return [];
   }

   return groups.flatMap((group, groupIndex) =>
      (group.techniques ?? []).flatMap((technique, techniqueIndex) =>
         normalizeTechniqueTree(technique, kind, criterionId, group.title, group.note, [
            groupIndex,
            techniqueIndex,
         ]),
      ),
   );
}

function normalizeFailureTechniques(
   criterionId: string,
   techniques: TechniquePayload[] | undefined,
): NormalizedTechnique[] {
   if (!techniques) {
      return [];
   }

   return techniques.flatMap((technique, index) =>
      normalizeTechniqueTree(technique, 'failure', criterionId, undefined, undefined, [
         index,
      ]),
   );
}

function sortTechniques(techniques: NormalizedTechnique[]): NormalizedTechnique[] {
   return [...techniques].toSorted((left, right) => left.key.localeCompare(right.key));
}

export function normalizeCriteriaArtifacts(input: {
   version: WcagVersion;
   wcag: WcagPayload;
   quickrefTags: QuickrefTagsPayload;
}): {
   criteriaArtifact: NormalizedCriteriaArtifact;
   criteriaByLevelArtifact: CriteriaByLevelArtifact;
   slugIndexArtifact: SlugIndexArtifact;
   techniqueIndexArtifact: TechniqueIndexArtifact;
   failureIndexArtifact: FailureIndexArtifact;
   tagIndexArtifact: TagIndexArtifact;
} {
   const criteriaEntries = input.wcag.principles.flatMap((principle) =>
      principle.guidelines.flatMap((guideline) =>
         guideline.successcriteria
            .filter((criterion) => criterion.versions.includes(input.version))
            .map((criterion) => {
               const techniques = sortTechniques(
                  normalizeTechniqueGroups(
                     criterion.num,
                     'sufficient',
                     criterion.techniques?.sufficient,
                  ),
               );
               const advisoryTechniques = sortTechniques(
                  normalizeTechniqueGroups(
                     criterion.num,
                     'advisory',
                     criterion.techniques?.advisory,
                  ),
               );
               const failures = sortTechniques(
                  normalizeFailureTechniques(
                     criterion.num,
                     criterion.techniques?.failure,
                  ),
               );

               const normalizedCriterion = normalizedCriterionSchema.parse({
                  id: criterion.num,
                  slug: criterion.id,
                  title: criterion.handle,
                  summary: criterion.title,
                  level: criterion.level,
                  wcagVersion: input.version,
                  normativeText: criterion.content,
                  understandingUrl: understandingUrl(input.version, criterion.id),
                  versions: [...criterion.versions].toSorted((left, right) =>
                     left.localeCompare(right),
                  ),
                  altIds: [...(criterion.alt_id ?? [])].toSorted((left, right) =>
                     left.localeCompare(right),
                  ),
                  details: normalizeDetails(criterion.details),
                  tags: normalizeTags(input.quickrefTags[criterion.id]),
                  principle: {
                     id: principle.id,
                     number: principle.num,
                     title: principle.handle,
                  },
                  guideline: {
                     id: guideline.id,
                     number: guideline.num,
                     title: guideline.handle,
                  },
                  techniques,
                  advisoryTechniques,
                  failures,
               });

               return [criterion.num, normalizedCriterion] as const;
            }),
      ),
   );

   const criteria = Object.fromEntries(
      criteriaEntries.toSorted(([leftId], [rightId]) =>
         leftId.localeCompare(rightId, undefined, { numeric: true }),
      ),
   );

   const levels = {
      A: Object.values(criteria)
         .filter((criterion) => criterion.level === 'A')
         .map((criterion) => criterion.id),
      AA: Object.values(criteria)
         .filter((criterion) => criterion.level === 'AA')
         .map((criterion) => criterion.id),
      AAA: Object.values(criteria)
         .filter((criterion) => criterion.level === 'AAA')
         .map((criterion) => criterion.id),
   };

   const slugs = Object.fromEntries(
      Object.values(criteria)
         .map((criterion) => [criterion.slug, criterion.id] as const)
         .toSorted(([left], [right]) => left.localeCompare(right)),
   );

   const techniqueIndex = new Map<string, TechniqueIndexArtifact['techniques'][string]>();
   const failureIndex = new Map<string, FailureIndexArtifact['failures'][string]>();
   const tagIndex = new Map<string, string[]>();

   for (const criterion of Object.values(criteria)) {
      for (const technique of [
         ...criterion.techniques,
         ...criterion.advisoryTechniques,
      ]) {
         const current = techniqueIndex.get(technique.key);
         techniqueIndex.set(technique.key, {
            key: technique.key,
            id: technique.id,
            title: technique.title,
            technology: technique.technology,
            kind: technique.kind,
            criterionIds: [
               ...new Set([...(current?.criterionIds ?? []), criterion.id]),
            ].toSorted((left, right) =>
               left.localeCompare(right, undefined, { numeric: true }),
            ),
         });
      }

      for (const failure of criterion.failures) {
         const current = failureIndex.get(failure.key);
         failureIndex.set(failure.key, {
            key: failure.key,
            id: failure.id,
            title: failure.title,
            technology: failure.technology,
            kind: failure.kind,
            criterionIds: [
               ...new Set([...(current?.criterionIds ?? []), criterion.id]),
            ].toSorted((left, right) =>
               left.localeCompare(right, undefined, { numeric: true }),
            ),
         });
      }

      for (const tag of criterion.tags) {
         tagIndex.set(
            tag,
            [...new Set([...(tagIndex.get(tag) ?? []), criterion.id])].toSorted(
               (left, right) => left.localeCompare(right, undefined, { numeric: true }),
            ),
         );
      }
   }

   return {
      criteriaArtifact: normalizedCriteriaArtifactSchema.parse({
         version: input.version,
         criteria,
      }),
      criteriaByLevelArtifact: criteriaByLevelArtifactSchema.parse({
         version: input.version,
         levels,
      }),
      slugIndexArtifact: slugIndexArtifactSchema.parse({
         version: input.version,
         slugs,
      }),
      techniqueIndexArtifact: techniqueIndexArtifactSchema.parse({
         version: input.version,
         techniques: Object.fromEntries(
            [...techniqueIndex.entries()].toSorted(([left], [right]) =>
               left.localeCompare(right),
            ),
         ),
      }),
      failureIndexArtifact: failureIndexArtifactSchema.parse({
         version: input.version,
         failures: Object.fromEntries(
            [...failureIndex.entries()].toSorted(([left], [right]) =>
               left.localeCompare(right),
            ),
         ),
      }),
      tagIndexArtifact: tagIndexArtifactSchema.parse({
         version: input.version,
         tags: Object.fromEntries(
            [...tagIndex.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
         ),
      }),
   };
}

interface StrategySeed {
   preferredEvidenceMode: PreferredEvidenceMode;
   procedureIds: string[];
   requiresRealTarget: boolean;
   notes: string[];
}

interface GeneratedCoverageArtifacts {
   coverageArtifact: CoverageArtifact;
   strategyArtifact: StrategyArtifact;
   coverageSummaryArtifact: CoverageSummaryArtifact;
}

function parseActRuleId(rule: ActRulePayload): string | undefined {
   if (
      typeof rule.frontmatter?.id === 'string' &&
      rule.frontmatter.id.trim().length > 0
   ) {
      return rule.frontmatter.id.trim();
   }

   const permalinkMatch = rule.permalink?.match(/\/([a-z0-9]+)\/?$/i);
   return permalinkMatch?.[1];
}

function criterionIdsBySlug(
   criteriaArtifact: NormalizedCriteriaArtifact,
): Map<string, string> {
   return new Map(
      Object.values(criteriaArtifact.criteria).map(
         (criterion) => [criterion.slug, criterion.id] as const,
      ),
   );
}

function criterionIdsByFlatNumber(
   criteriaArtifact: NormalizedCriteriaArtifact,
): Map<string, string> {
   return new Map(
      Object.values(criteriaArtifact.criteria).map(
         (criterion) => [criterion.id.replaceAll('.', ''), criterion.id] as const,
      ),
   );
}

function requirementKeyToCriterionId(
   requirementKey: string,
   criterionIds: Set<string>,
): string | undefined {
   const candidate = requirementKey.split(':').at(-1);
   if (!candidate) {
      return undefined;
   }

   return criterionIds.has(candidate) ? candidate : undefined;
}

function buildActCoverageIndex(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   actMapping: ActMappingPayload;
}): Map<string, string[]> {
   const criterionIds = new Set(Object.keys(input.criteriaArtifact.criteria));
   const slugToId = criterionIdsBySlug(input.criteriaArtifact);
   const index = new Map<string, Set<string>>();

   for (const rule of input.actMapping['act-rules']) {
      if (rule.deprecated || rule.proposed) {
         continue;
      }

      const actRuleId = parseActRuleId(rule);
      if (!actRuleId) {
         continue;
      }

      const mappedCriterionIds = new Set<string>();

      for (const slug of rule.successCriteria ?? []) {
         const criterionId = slugToId.get(slug);
         if (criterionId) {
            mappedCriterionIds.add(criterionId);
         }
      }

      for (const requirementKey of Object.keys(
         rule.frontmatter?.accessibility_requirements ?? {},
      )) {
         const criterionId = requirementKeyToCriterionId(requirementKey, criterionIds);
         if (criterionId) {
            mappedCriterionIds.add(criterionId);
         }
      }

      for (const criterionId of mappedCriterionIds) {
         const current = index.get(criterionId) ?? new Set<string>();
         current.add(actRuleId);
         index.set(criterionId, current);
      }
   }

   return new Map(
      [...index.entries()].map(([criterionId, actRuleIds]) => [
         criterionId,
         [...actRuleIds].toSorted((left, right) => left.localeCompare(right)),
      ]),
   );
}

function buildAxeCoverageIndex(input: {
   criteriaArtifact: NormalizedCriteriaArtifact;
   actCoverageIndex: Map<string, string[]>;
   axeRules: DerivedAxeRule[];
}): Map<string, { ruleIds: string[]; sourceAttribution: string[] }> {
   const criterionIdByFlatNumber = criterionIdsByFlatNumber(input.criteriaArtifact);
   const actRuleToCriteria = new Map<string, Set<string>>();
   const index = new Map<
      string,
      { ruleIds: Set<string>; sourceAttribution: Set<string> }
   >();

   for (const [criterionId, actRuleIds] of input.actCoverageIndex.entries()) {
      for (const actRuleId of actRuleIds) {
         const current = actRuleToCriteria.get(actRuleId) ?? new Set<string>();
         current.add(criterionId);
         actRuleToCriteria.set(actRuleId, current);
      }
   }

   for (const rule of input.axeRules) {
      const mappedCriterionIds = new Set<string>();
      let usedDirectTag = false;
      let usedActJoin = false;

      for (const tag of rule.tags) {
         const match = /^wcag(\d+)$/.exec(tag);
         if (!match) {
            continue;
         }

         const flatCriterionId = match[1];
         if (!flatCriterionId) {
            continue;
         }

         const criterionId = criterionIdByFlatNumber.get(flatCriterionId);
         if (criterionId) {
            mappedCriterionIds.add(criterionId);
            usedDirectTag = true;
         }
      }

      for (const actId of rule.actIds) {
         for (const criterionId of actRuleToCriteria.get(actId) ?? []) {
            mappedCriterionIds.add(criterionId);
            usedActJoin = true;
         }
      }

      for (const criterionId of mappedCriterionIds) {
         const current = index.get(criterionId) ?? {
            ruleIds: new Set<string>(),
            sourceAttribution: new Set<string>(),
         };

         current.ruleIds.add(rule.ruleId);
         if (usedDirectTag) {
            current.sourceAttribution.add('axe-rule-tags');
         }
         if (usedActJoin) {
            current.sourceAttribution.add('axe-act-id-join');
         }

         index.set(criterionId, current);
      }
   }

   return new Map(
      [...index.entries()].map(([criterionId, value]) => [
         criterionId,
         {
            ruleIds: [...value.ruleIds].toSorted((left, right) => left.localeCompare(right)),
            sourceAttribution: [...value.sourceAttribution].toSorted((left, right) =>
               left.localeCompare(right),
            ),
         },
      ]),
   );
}

function strategyOverrideForCriterion(criterionId: string): StrategySeed | undefined {
   const overrides: Record<string, StrategySeed> = {
      '2.4.1': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['landmark_sequence'],
         requiresRealTarget: true,
         notes: [
            'Bypass-block alternatives need structure and navigation evidence on a real target.',
         ],
      },
      '2.4.3': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['focus_order_probe'],
         requiresRealTarget: true,
         notes: ['Focus order depends on interaction flow, not just static structure.'],
      },
      '2.4.7': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['focus_visibility_probe'],
         requiresRealTarget: true,
         notes: [
            'Focus visibility needs visual and interaction evidence beyond static rules.',
         ],
      },
      '2.4.11': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['focus_obscured_probe'],
         requiresRealTarget: true,
         notes: [
            'Focus obscuration requires a real rendered target and movement through the interface.',
         ],
      },
      '2.4.12': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['focus_obscured_probe'],
         requiresRealTarget: true,
         notes: [
            'Focus obscuration requires a real rendered target and movement through the interface.',
         ],
      },
      '2.4.13': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['focus_obscured_probe'],
         requiresRealTarget: true,
         notes: [
            'Focus appearance requires rendered-state evidence, not just static markup inspection.',
         ],
      },
      '3.2.6': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('manual'),
         procedureIds: ['cross_page_consistency_review', 'manual_review'],
         requiresRealTarget: true,
         notes: [
            'Consistent help is cross-page behavior and still needs product-aware manual review.',
         ],
      },
      '3.3.7': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['redundant_entry_probe'],
         requiresRealTarget: true,
         notes: ['Redundant entry is flow-based and needs repeated-journey evidence.'],
      },
      '3.3.8': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('manual'),
         procedureIds: ['auth_flow_probe', 'manual_review'],
         requiresRealTarget: true,
         notes: [
            'Accessible authentication still needs product-aware manual review in v0.3.0.',
         ],
      },
      '3.3.9': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('manual'),
         procedureIds: ['auth_flow_probe', 'manual_review'],
         requiresRealTarget: true,
         notes: [
            'Enhanced authentication requirements still need product-aware manual review in v0.3.0.',
         ],
      },
      '4.1.3': {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['status_message_probe'],
         requiresRealTarget: true,
         notes: [
            'Status messages need announcement evidence from assistive technology without forced focus changes.',
         ],
      },
   };

   return overrides[criterionId];
}

function defaultStrategySeed(hasAxe: boolean, hasAct: boolean): StrategySeed {
   if (hasAxe) {
      return {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('automated'),
         procedureIds: ['axe_scan'],
         requiresRealTarget: false,
         notes: ['Direct axe coverage exists for this criterion.'],
      };
   }

   if (hasAct) {
      return {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['manual_review'],
         requiresRealTarget: true,
         notes: ['ACT mappings exist, but there is no built-in ACT executor in v0.3.0.'],
      };
   }

   return {
      preferredEvidenceMode: preferredEvidenceModeSchema.parse('manual'),
      procedureIds: ['manual_review'],
      requiresRealTarget: true,
      notes: ['No direct axe or ACT mapping was found for this criterion.'],
   };
}

function buildCoverageArtifacts(input: {
   version: WcagVersion;
   criteriaArtifact: NormalizedCriteriaArtifact;
   actMapping: ActMappingPayload;
   axeRules: DerivedAxeRule[];
   updatedAt: string;
}): GeneratedCoverageArtifacts {
   const actCoverageIndex = buildActCoverageIndex({
      criteriaArtifact: input.criteriaArtifact,
      actMapping: input.actMapping,
   });
   const axeCoverageIndex = buildAxeCoverageIndex({
      criteriaArtifact: input.criteriaArtifact,
      actCoverageIndex,
      axeRules: input.axeRules,
   });

   const coverageEntries = Object.values(input.criteriaArtifact.criteria).map(
      (criterion) => {
         const actRuleIds = actCoverageIndex.get(criterion.id) ?? [];
         const axeCoverage = axeCoverageIndex.get(criterion.id);
         const axeRuleIds = axeCoverage?.ruleIds ?? [];
         const override = strategyOverrideForCriterion(criterion.id);
         const defaultStrategy = defaultStrategySeed(
            axeRuleIds.length > 0,
            actRuleIds.length > 0,
         );
         const strategySeed = override ?? defaultStrategy;
         const procedureIds = [
            ...(axeRuleIds.length > 0 && strategySeed.preferredEvidenceMode !== 'manual'
               ? ['axe_scan']
               : []),
            ...strategySeed.procedureIds,
         ].filter((value, index, values) => values.indexOf(value) === index);
         const sourceAttribution = [
            ...(actRuleIds.length > 0 ? ['act-mapping'] : []),
            ...(axeCoverage?.sourceAttribution ?? []),
            ...(override ? ['strategy-heuristic'] : []),
            ...(!override && axeRuleIds.length === 0 && actRuleIds.length === 0
               ? ['manual-fallback']
               : []),
         ].toSorted((left, right) => left.localeCompare(right));
         const notes = [
            ...strategySeed.notes,
            ...(actRuleIds.length > 0
               ? [`Mapped ACT rules: ${actRuleIds.join(', ')}.`]
               : []),
            ...(axeRuleIds.length > 0
               ? [`Mapped axe rules: ${axeRuleIds.join(', ')}.`]
               : []),
         ];
         const coverageState = strategySeed.preferredEvidenceMode as CoverageState;

         return [
            criterion.id,
            {
               criterionId: criterion.id,
               coverageState,
               axeRuleIds,
               actRuleIds,
               sourceAttribution,
               notes,
               updatedAt: input.updatedAt,
            },
            {
               criterionId: criterion.id,
               preferredEvidenceMode: strategySeed.preferredEvidenceMode,
               procedureIds,
               requiresRealTarget: strategySeed.requiresRealTarget,
               notes: strategySeed.notes,
            },
         ] as const;
      },
   );

   const coverage = Object.fromEntries(
      coverageEntries
         .map(([criterionId, coverageEntry]) => [criterionId, coverageEntry] as const)
         .toSorted(([left], [right]) =>
            left.localeCompare(right, undefined, { numeric: true }),
         ),
   );
   const strategies = Object.fromEntries(
      coverageEntries
         .map(([criterionId, , strategyEntry]) => [criterionId, strategyEntry] as const)
         .toSorted(([left], [right]) =>
            left.localeCompare(right, undefined, { numeric: true }),
         ),
   );

   const emptyBucket = () => ({
      criteria: 0,
      automated: 0,
      hybrid: 0,
      manual: 0,
      unknown: 0,
   });

   const totals = emptyBucket();
   const byLevel = {
      A: emptyBucket(),
      AA: emptyBucket(),
      AAA: emptyBucket(),
   };
   const criteriaByState: Record<CoverageState, string[]> = {
      automated: [],
      hybrid: [],
      manual: [],
      unknown: [],
   };
   let criteriaWithAxe = 0;
   let criteriaWithAct = 0;
   let criteriaWithBoth = 0;

   for (const criterion of Object.values(input.criteriaArtifact.criteria)) {
      const coverageEntry = coverage[criterion.id];
      if (!coverageEntry) {
         throw new Error(`missing coverage entry for ${criterion.id}`);
      }

      totals.criteria += 1;
      totals[coverageEntry.coverageState] += 1;
      byLevel[criterion.level].criteria += 1;
      byLevel[criterion.level][coverageEntry.coverageState] += 1;
      criteriaByState[coverageEntry.coverageState].push(criterion.id);

      if (coverageEntry.axeRuleIds.length > 0) {
         criteriaWithAxe += 1;
      }
      if (coverageEntry.actRuleIds.length > 0) {
         criteriaWithAct += 1;
      }
      if (coverageEntry.axeRuleIds.length > 0 && coverageEntry.actRuleIds.length > 0) {
         criteriaWithBoth += 1;
      }
   }

   return {
      coverageArtifact: coverageArtifactSchema.parse({
         version: input.version,
         coverage,
      }),
      strategyArtifact: strategyArtifactSchema.parse({
         version: input.version,
         strategies,
      }),
      coverageSummaryArtifact: coverageSummaryArtifactSchema.parse({
         version: input.version,
         updatedAt: input.updatedAt,
         totals,
         byLevel,
         coverageSources: {
            criteriaWithAxe,
            criteriaWithAct,
            criteriaWithBoth,
         },
         representativeCriterionIds: {
            automated: criteriaByState.automated.slice(0, 5),
            hybrid: criteriaByState.hybrid.slice(0, 5),
            manual: criteriaByState.manual.slice(0, 5),
            unknown: criteriaByState.unknown.slice(0, 5),
         },
      }),
   };
}

async function writeGeneratedArtifact(
   directories: WcagDataDirectories,
   fileName: string,
   body: string,
): Promise<GeneratedArtifactWriteResult> {
   const filePath = join(directories.generated, fileName);
   await writeFile(filePath, body, 'utf8');
   return { fileName, filePath };
}

export async function generateNormalizedArtifacts(
   directories?: WcagDataDirectories,
): Promise<NormalizedArtifactsResult> {
   const resolvedDirectories = directories ?? (await ensureWcagDataDirectories());
   const quickrefTags = await loadQuickrefTags(resolvedDirectories);
   const rawSources = await loadRawProvenanceEntries(resolvedDirectories);
   const actMapping = await loadRawJson<ActMappingPayload>(
      resolvedDirectories,
      'act-mapping.json',
   );
   const axeRules = await loadRawJson<DerivedAxeRule[]>(
      resolvedDirectories,
      'axe-rules.json',
   );
   const generatedArtifacts: GeneratedArtifactWriteResult[] = [];
   const manifestArtifacts: GeneratedArtifactProvenance[] = [];
   const criteriaCountByVersion = {} as Record<WcagVersion, number>;
   const coverageCountsByVersion = {} as Record<
      WcagVersion,
      Record<CoverageState, number>
   >;

   for (const version of wcagVersions) {
      const wcag = await loadRawJson<WcagPayload>(
         resolvedDirectories,
         `wcag.${version}.json`,
      );
      const artifacts = normalizeCriteriaArtifacts({ version, wcag, quickrefTags });
      const coverageArtifacts = buildCoverageArtifacts({
         version,
         criteriaArtifact: artifacts.criteriaArtifact,
         actMapping,
         axeRules,
         updatedAt:
            rawSources
               .map((source) => source.syncedAt)
               .toSorted((left, right) => right.localeCompare(left))[0] ??
            new Date().toISOString(),
      });
      const sourceFileNames = [
         `wcag.${version}.json`,
         'quickref-tags.yml',
         'act-mapping.json',
         'axe-rules.json',
      ];
      const criteriaSourceFileNames = [`wcag.${version}.json`, 'quickref-tags.yml'];
      const sourceUrls = rawSources
         .filter((source) => sourceFileNames.includes(source.fileName))
         .map((source) => source.sourceUrl)
         .toSorted((left, right) => left.localeCompare(right));
      const artifactBodies = [
         {
            fileName: `criteria.${version}.json`,
            body: toJsonString(artifacts.criteriaArtifact),
         },
         {
            fileName: `criteria-by-level.${version}.json`,
            body: toJsonString(artifacts.criteriaByLevelArtifact),
         },
         {
            fileName: `slug-index.${version}.json`,
            body: toJsonString(artifacts.slugIndexArtifact),
         },
         {
            fileName: `technique-index.${version}.json`,
            body: toJsonString(artifacts.techniqueIndexArtifact),
         },
         {
            fileName: `failure-index.${version}.json`,
            body: toJsonString(artifacts.failureIndexArtifact),
         },
         {
            fileName: `tag-index.${version}.json`,
            body: toJsonString(artifacts.tagIndexArtifact),
         },
         {
            fileName: `coverage.${version}.json`,
            body: toJsonString(coverageArtifacts.coverageArtifact),
         },
         {
            fileName: `strategy.${version}.json`,
            body: toJsonString(coverageArtifacts.strategyArtifact),
         },
         {
            fileName: `coverage-summary.${version}.json`,
            body: toJsonString(coverageArtifacts.coverageSummaryArtifact),
         },
      ];

      generatedArtifacts.push(
         ...(await Promise.all(
            artifactBodies.map((artifact) =>
               writeGeneratedArtifact(
                  resolvedDirectories,
                  artifact.fileName,
                  artifact.body,
               ),
            ),
         )),
      );

      manifestArtifacts.push(
         ...artifactBodies.map((artifact) => ({
            fileName: artifact.fileName,
            sha256: sha256(artifact.body),
            wcagVersion: version,
            sourceFileNames:
               artifact.fileName.startsWith('criteria.') ||
               artifact.fileName.startsWith('criteria-by-level.') ||
               artifact.fileName.startsWith('slug-index.') ||
               artifact.fileName.startsWith('technique-index.') ||
               artifact.fileName.startsWith('failure-index.') ||
               artifact.fileName.startsWith('tag-index.')
                  ? [...criteriaSourceFileNames]
                  : [...sourceFileNames],
            sourceUrls:
               artifact.fileName.startsWith('criteria.') ||
               artifact.fileName.startsWith('criteria-by-level.') ||
               artifact.fileName.startsWith('slug-index.') ||
               artifact.fileName.startsWith('technique-index.') ||
               artifact.fileName.startsWith('failure-index.') ||
               artifact.fileName.startsWith('tag-index.')
                  ? rawSources
                       .filter((source) =>
                          criteriaSourceFileNames.includes(source.fileName),
                       )
                       .map((source) => source.sourceUrl)
                       .toSorted((left, right) => left.localeCompare(right))
                  : [...sourceUrls],
         })),
      );
      criteriaCountByVersion[version] = Object.keys(
         artifacts.criteriaArtifact.criteria,
      ).length;
      coverageCountsByVersion[version] = {
         automated: coverageArtifacts.coverageSummaryArtifact.totals.automated,
         hybrid: coverageArtifacts.coverageSummaryArtifact.totals.hybrid,
         manual: coverageArtifacts.coverageSummaryArtifact.totals.manual,
         unknown: coverageArtifacts.coverageSummaryArtifact.totals.unknown,
      };
   }

   const generatedAt =
      rawSources
         .map((source) => source.syncedAt)
         .toSorted((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString();
   const manifest: GeneratedProvenanceManifest = {
      generatedAt,
      rawSources: [...rawSources].toSorted((left, right) =>
         left.sourceId.localeCompare(right.sourceId),
      ),
      artifacts: [...manifestArtifacts].toSorted((left, right) =>
         left.fileName.localeCompare(right.fileName),
      ),
   };

   generatedArtifacts.push(
      await writeGeneratedArtifact(
         resolvedDirectories,
         'generated-provenance.json',
         toJsonString(manifest),
      ),
   );

   return {
      generatedArtifacts: generatedArtifacts.toSorted((left, right) =>
         left.fileName.localeCompare(right.fileName),
      ),
      criteriaCountByVersion,
      coverageCountsByVersion,
   };
}

export async function syncRawSources(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   syncedAt?: string;
}): Promise<SyncRawSourcesResult> {
   const directories = options?.directories ?? (await ensureWcagDataDirectories());
   await ensureDataDirectories(directories);
   const fetchImpl = options?.fetchImpl ?? fetch;
   const syncedAt = options?.syncedAt ?? new Date().toISOString();

   const remoteArtifacts = await Promise.all(
      rawSourceDefinitions.map((definition) =>
         fetchRemoteSource(definition, fetchImpl, syncedAt),
      ),
   );
   const axeArtifact = await buildAxeArtifact(syncedAt);
   const artifacts = await Promise.all(
      [...remoteArtifacts, axeArtifact].map((artifact) =>
         writePendingArtifact(directories, artifact),
      ),
   );

   return {
      fetchList: listApprovedUpstreamSourceUrls(),
      artifacts,
      axeRuleCount: JSON.parse(axeArtifact.body).length as number,
   };
}

export async function runWcagDataSync(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   syncedAt?: string;
}): Promise<{
   fetchList: string[];
   rawArtifacts: RawArtifactWriteResult[];
   axeRuleCount: number;
   generatedArtifacts: GeneratedArtifactWriteResult[];
   criteriaCountByVersion: Record<WcagVersion, number>;
   coverageCountsByVersion: Record<WcagVersion, Record<CoverageState, number>>;
}> {
   const directories = options?.directories ?? (await ensureWcagDataDirectories());
   const rawSync = await syncRawSources({ ...options, directories });
   const normalized = await generateNormalizedArtifacts(directories);

   return {
      fetchList: rawSync.fetchList,
      rawArtifacts: rawSync.artifacts,
      axeRuleCount: rawSync.axeRuleCount,
      generatedArtifacts: normalized.generatedArtifacts,
      criteriaCountByVersion: normalized.criteriaCountByVersion,
      coverageCountsByVersion: normalized.coverageCountsByVersion,
   };
}

export async function validateRawSyncState(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<RawArtifactWriteResult[]> {
   const sourceEntries = await readdir(directories.raw);
   const artifactResults: RawArtifactWriteResult[] = [];

   for (const definition of rawSourceDefinitions) {
      const filePath = join(directories.raw, definition.fileName);
      const provenancePath = join(
         directories.raw,
         provenanceFileName(definition.fileName),
      );

      if (
         !sourceEntries.includes(definition.fileName) ||
         !sourceEntries.includes(provenanceFileName(definition.fileName))
      ) {
         throw new Error(`missing raw sync outputs for ${definition.id}`);
      }

      const sourceText = await readFile(filePath, 'utf8');
      const payload = parseSourcePayload(definition.format, sourceText);
      definition.validate(payload);

      const provenanceText = await readFile(provenancePath, 'utf8');
      const provenance = JSON.parse(provenanceText) as RawSourceProvenance;

      if (
         provenance.sourceId !== definition.id ||
         provenance.sourceUrl !== definition.primaryUrl
      ) {
         throw new Error(`invalid provenance for ${definition.id}`);
      }

      artifactResults.push({
         sourceId: definition.id,
         fileName: definition.fileName,
         filePath,
         provenancePath,
         provenance,
      });
   }

   const axeFileName = 'axe-rules.json';
   const axeFilePath = join(directories.raw, axeFileName);
   const axeProvenancePath = join(directories.raw, provenanceFileName(axeFileName));
   const axeBody = await readFile(axeFilePath, 'utf8');
   const axePayload = JSON.parse(axeBody) as unknown;
   validateAxeRulesPayload(axePayload);
   const axeProvenanceText = await readFile(axeProvenancePath, 'utf8');
   const axeProvenance = JSON.parse(axeProvenanceText) as RawSourceProvenance;

   if (
      axeProvenance.sourceId !== 'axe-rules' ||
      axeProvenance.sourceUrl !== 'npm:axe-core'
   ) {
      throw new Error('invalid provenance for axe-rules');
   }

   artifactResults.push({
      sourceId: 'axe-rules',
      fileName: axeFileName,
      filePath: axeFilePath,
      provenancePath: axeProvenancePath,
      provenance: axeProvenance,
   });

   return artifactResults;
}

export async function validateGeneratedArtifacts(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<GeneratedArtifactWriteResult[]> {
   const generatedEntries = await readdir(directories.generated);
   const validatedArtifacts: GeneratedArtifactWriteResult[] = [];
   const manifestFileName = 'generated-provenance.json';

   if (!generatedEntries.includes(manifestFileName)) {
      throw new Error(`missing generated artifact ${manifestFileName}`);
   }

   const manifest = JSON.parse(
      await readFile(join(directories.generated, manifestFileName), 'utf8'),
   ) as GeneratedProvenanceManifest;

   if (
      !Array.isArray(manifest.rawSources) ||
      !Array.isArray(manifest.artifacts) ||
      typeof manifest.generatedAt !== 'string'
   ) {
      throw new TypeError('invalid generated provenance manifest');
   }

   for (const version of wcagVersions) {
      const requiredFiles = [
         `criteria.${version}.json`,
         `criteria-by-level.${version}.json`,
         `coverage.${version}.json`,
         `coverage-summary.${version}.json`,
         `strategy.${version}.json`,
         `slug-index.${version}.json`,
         `technique-index.${version}.json`,
         `failure-index.${version}.json`,
         `tag-index.${version}.json`,
      ];

      for (const fileName of requiredFiles) {
         if (!generatedEntries.includes(fileName)) {
            throw new Error(`missing generated artifact ${fileName}`);
         }
      }

      normalizedCriteriaArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `criteria.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      criteriaByLevelArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `criteria-by-level.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      coverageArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `coverage.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      coverageSummaryArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `coverage-summary.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      strategyArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `strategy.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      slugIndexArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `slug-index.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      techniqueIndexArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `technique-index.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      failureIndexArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `failure-index.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );
      tagIndexArtifactSchema.parse(
         JSON.parse(
            await readFile(
               join(directories.generated, `tag-index.${version}.json`),
               'utf8',
            ),
         ) as unknown,
      );

      validatedArtifacts.push(
         ...requiredFiles.map((fileName) => ({
            fileName,
            filePath: join(directories.generated, fileName),
         })),
      );
   }

   for (const artifact of manifest.artifacts) {
      if (!generatedEntries.includes(artifact.fileName)) {
         throw new Error(
            `generated provenance references missing file ${artifact.fileName}`,
         );
      }

      const body = await readFile(join(directories.generated, artifact.fileName), 'utf8');
      if (sha256(body) !== artifact.sha256) {
         throw new Error(
            `generated provenance checksum mismatch for ${artifact.fileName}`,
         );
      }
   }

   validatedArtifacts.push({
      fileName: manifestFileName,
      filePath: join(directories.generated, manifestFileName),
   });

   return validatedArtifacts.toSorted((left, right) =>
      left.fileName.localeCompare(right.fileName),
   );
}
