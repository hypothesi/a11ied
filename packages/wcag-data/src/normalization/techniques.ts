import {
   normalizedCriterionSchema,
   normalizedTechniqueSchema,
   type NormalizedTechnique,
   type WcagVersion,
} from '@a11ied/contracts';

import { isRecord } from '../shared/utils.js';
import type {
   CriterionPayload,
   QuickrefTagsPayload,
   TechniqueGroupPayload,
   TechniqueKind,
   TechniqueOrGroupPayload,
   TechniquePayload,
} from '../shared/types.js';
import { normalizeDetails, normalizeTags } from './details.js';

interface TechniqueKeyInput {
   criterionId: string;
   kind: TechniqueKind;
   technique: TechniquePayload;
   lineage: number[];
}

interface NormalizeTechniqueInput {
   technique: TechniquePayload;
   kind: TechniqueKind;
   criterionId: string;
   version: WcagVersion;
   groupTitle: string | undefined;
   groupNote: string | undefined;
   lineage: number[];
}

const WCAG_VERSION_TOKENS: Record<string, string> = {
   '2.2': 'WCAG22',
   '2.1': 'WCAG21',
};

function versionToken(version: WcagVersion): string {
   return WCAG_VERSION_TOKENS[version] ?? 'WCAG21';
}

function understandingUrl(version: WcagVersion, slug: string): string {
   return `https://www.w3.org/WAI/${versionToken(version)}/Understanding/${slug}`;
}

/**
 * Builds the W3C technique page URL. The wcag.json `technology` value is the directory
 * name W3C publishes techniques under (general, html, aria, css, failures, ...), so no
 * extra mapping table is needed.
 */
function techniqueUrl(
   version: WcagVersion,
   technique: TechniquePayload,
): string | undefined {
   if (!technique.id || !technique.technology) {
      return undefined;
   }
   return `https://www.w3.org/WAI/${versionToken(version)}/Techniques/${technique.technology}/${technique.id}`;
}

function techniqueKey(input: TechniqueKeyInput): string {
   if (input.technique.id) {
      return input.technique.id;
   }
   const normalizedTitle = (input.technique.title ?? 'synthetic')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/(^-|-$)/g, '');
   const titlePart = normalizedTitle || 'synthetic';
   return `${input.criterionId}:${input.kind}:${titlePart}:${input.lineage.join('.')}`;
}

function normalizeTechniqueTree(input: NormalizeTechniqueInput): NormalizedTechnique[] {
   const key = techniqueKey({
      criterionId: input.criterionId,
      kind: input.kind,
      technique: input.technique,
      lineage: input.lineage,
   });
   const mapChild = (children: TechniquePayload[]): NormalizedTechnique[] =>
      children.flatMap((child, index) =>
         normalizeTechniqueTree({
            ...input,
            technique: child,
            lineage: [...input.lineage, index],
         }),
      );
   const children = [
      ...mapChild(input.technique.using ?? []),
      ...mapChild(input.technique.and ?? []),
   ];
   if (
      !input.technique.id &&
      !input.technique.title &&
      !input.technique.suffix &&
      !input.technique.technology
   ) {
      return children;
   }
   const normalized = normalizedTechniqueSchema.parse({
      key,
      id: input.technique.id,
      title: input.technique.title,
      technology: input.technique.technology,
      kind: input.kind,
      url: techniqueUrl(input.version, input.technique),
      groupTitle: input.groupTitle,
      groupNote: input.groupNote,
      suffix: input.technique.suffix,
      relatedKeys: children
         .map((ch) => ch.key)
         .toSorted((left, right) => left.localeCompare(right)),
      isSynthetic: !input.technique.id,
   });
   return [normalized, ...children];
}

interface CriterionScope {
   criterionId: string;
   version: WcagVersion;
}

function hasSituationTechniques(
   entry: TechniqueOrGroupPayload,
): entry is TechniqueGroupPayload & { techniques: TechniquePayload[] } {
   return isRecord(entry) && Array.isArray(entry.techniques);
}

/**
 * A top-level entry with no `techniques` list is a technique node in disguise, but its
 * declared type still allows an untitled `TechniqueGroupPayload`, which
 * `TechniquePayload` does not. Reading its fields explicitly (rather than casting) keeps
 * that honest: a titleless entry falls back to an empty title instead of being asserted
 * away.
 */
function toTechniquePayload(entry: TechniqueOrGroupPayload): TechniquePayload {
   const fields: Partial<TechniquePayload> = entry;
   return { ...fields, title: fields.title ?? '' };
}

/**
 * A "Situation" entry (`{title, techniques: [...]}`) lists the techniques for one
 * situation, tagged with that situation's title. Any other entry sits directly at the top
 * level: a real technique, or a synthetic OR/AND wrapper (`using`/`and`) with no
 * `techniques` list of its own. Both shapes appear as siblings in the same array, so
 * dropping either kind silently drops real, id-bearing techniques with it.
 */
function normalizeGroupEntry(input: {
   scope: CriterionScope;
   kind: Extract<TechniqueKind, 'sufficient' | 'advisory'>;
   entry: TechniqueOrGroupPayload;
   groupIndex: number;
}): NormalizedTechnique[] {
   const { scope, kind, entry, groupIndex } = input;
   if (hasSituationTechniques(entry)) {
      return entry.techniques.flatMap((tech, ti) =>
         normalizeTechniqueTree({
            ...scope,
            technique: tech,
            kind,
            groupTitle: entry.title,
            groupNote: entry.note,
            lineage: [groupIndex, ti],
         }),
      );
   }
   return normalizeTechniqueTree({
      ...scope,
      technique: toTechniquePayload(entry),
      kind,
      groupTitle: undefined,
      groupNote: undefined,
      lineage: [groupIndex],
   });
}

function normalizeTechniqueGroups(
   scope: CriterionScope,
   kind: Extract<TechniqueKind, 'sufficient' | 'advisory'>,
   groups: TechniqueOrGroupPayload[] | undefined,
): NormalizedTechnique[] {
   if (!groups) {
      return [];
   }
   return groups.flatMap((entry, groupIndex) =>
      normalizeGroupEntry({ scope, kind, entry, groupIndex }),
   );
}

function normalizeFailureTechniques(
   scope: CriterionScope,
   techniques: TechniquePayload[] | undefined,
): NormalizedTechnique[] {
   if (!techniques) {
      return [];
   }
   return techniques.flatMap((tech, index) =>
      normalizeTechniqueTree({
         ...scope,
         technique: tech,
         kind: 'failure',
         groupTitle: undefined,
         groupNote: undefined,
         lineage: [index],
      }),
   );
}

function sortTechniques(techniques: NormalizedTechnique[]): NormalizedTechnique[] {
   return [...techniques].toSorted((left, right) => left.key.localeCompare(right.key));
}

/**
 * The upstream payload sometimes places a `sufficient`/`advisory` entry directly at the
 * top level instead of inside a `{title, techniques}` group; missing that shape drops
 * every technique under it silently. Comparing raw counts against the normalized result
 * catches a regression here before it ships a criterion with no techniques upstream
 * actually publishes some for.
 */
function assertTechniquesNotDropped(input: {
   criterionId: string;
   raw: CriterionPayload['techniques'];
   normalizedCount: number;
}): void {
   const rawCount =
      (input.raw?.sufficient?.length ?? 0) +
      (input.raw?.advisory?.length ?? 0) +
      (input.raw?.failure?.length ?? 0);
   if (rawCount > 0 && input.normalizedCount === 0) {
      throw new Error(
         `Criterion ${input.criterionId} has ${rawCount} upstream technique group(s) but ` +
            'normalized to none. The sufficient/advisory/failure normalizer is dropping a shape it does not recognize.',
      );
   }
}

export function normalizeSingleCriterion(input: {
   criterion: CriterionPayload;
   version: WcagVersion;
   quickrefTags: QuickrefTagsPayload;
   principle: { id: string; num: string; handle: string };
   guideline: { id: string; num: string; handle: string };
}): readonly [string, ReturnType<typeof normalizedCriterionSchema.parse>] {
   const { criterion, version, quickrefTags, principle, guideline } = input;
   const scope: CriterionScope = { criterionId: criterion.num, version };
   const techniques = sortTechniques(
      normalizeTechniqueGroups(scope, 'sufficient', criterion.techniques?.sufficient),
   );
   const advisoryTechniques = sortTechniques(
      normalizeTechniqueGroups(scope, 'advisory', criterion.techniques?.advisory),
   );
   const failures = sortTechniques(
      normalizeFailureTechniques(scope, criterion.techniques?.failure),
   );
   assertTechniquesNotDropped({
      criterionId: criterion.num,
      raw: criterion.techniques,
      normalizedCount: techniques.length + advisoryTechniques.length + failures.length,
   });
   const normalizedCriterion = normalizedCriterionSchema.parse({
      id: criterion.num,
      slug: criterion.id,
      title: criterion.handle,
      summary: criterion.title,
      level: criterion.level,
      wcagVersion: version,
      normativeText: criterion.content,
      understandingUrl: understandingUrl(version, criterion.id),
      versions: [...criterion.versions].toSorted((left, right) =>
         left.localeCompare(right),
      ),
      altIds: [...(criterion.alt_id ?? [])].toSorted((left, right) =>
         left.localeCompare(right),
      ),
      details: normalizeDetails(criterion.details),
      tags: normalizeTags(quickrefTags[criterion.id]),
      principle: { id: principle.id, number: principle.num, title: principle.handle },
      guideline: { id: guideline.id, number: guideline.num, title: guideline.handle },
      techniques,
      advisoryTechniques,
      failures,
   });
   return [criterion.num, normalizedCriterion] as const;
}
