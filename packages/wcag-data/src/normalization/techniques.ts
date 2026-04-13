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
   TechniquePayload,
} from '../shared/types.js';

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
   groupTitle: string | undefined;
   groupNote: string | undefined;
   lineage: number[];
}

const WCAG_VERSION_TOKENS: Record<string, string> = {
   '2.2': 'WCAG22',
   '2.1': 'WCAG21',
};

function understandingUrl(version: WcagVersion, slug: string): string {
   const versionToken = WCAG_VERSION_TOKENS[version] ?? 'WCAG21';
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

function extractHandleAndText(value: Record<string, unknown>): {
   handle: string | undefined;
   text: string | undefined;
} {
   let handle: string | undefined = undefined;
   if (typeof value.handle === 'string') {
      handle = value.handle.trim() || undefined;
   }
   let text: string | undefined = undefined;
   if (typeof value.text === 'string') {
      text = value.text.trim() || undefined;
   }
   return { handle, text };
}

function formatHandleText(
   handle: string | undefined,
   text: string | undefined,
): string[] | undefined {
   if (handle && text) {
      return [`${handle}: ${text}`];
   }
   if (text) {
      return [text];
   }
   return undefined;
}

function extractStringDetail(value: string): string[] {
   const normalized = value.trim();
   if (normalized) {
      return [normalized];
   }
   return [];
}

function extractDetailText(value: unknown): string[] {
   if (typeof value === 'string') {
      return extractStringDetail(value);
   }
   if (Array.isArray(value)) {
      return value.flatMap((entry) => extractDetailText(entry));
   }
   if (!isRecord(value)) {
      return [];
   }
   const parsed = extractHandleAndText(value);
   return (
      formatHandleText(parsed.handle, parsed.text) ??
      Object.values(value).flatMap((entry) => extractDetailText(entry))
   );
}

function normalizeDetails(details: unknown[] | undefined): string[] {
   if (!details) {
      return [];
   }
   return [...new Set(details.flatMap((detail) => extractDetailText(detail)))];
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
            technique: child,
            kind: input.kind,
            criterionId: input.criterionId,
            groupTitle: input.groupTitle,
            groupNote: input.groupNote,
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

function normalizeTechniqueGroups(
   criterionId: string,
   kind: Extract<TechniqueKind, 'sufficient' | 'advisory'>,
   groups: TechniqueGroupPayload[] | undefined,
): NormalizedTechnique[] {
   if (!groups) {
      return [];
   }
   return groups.flatMap((group, gi) =>
      (group.techniques ?? []).flatMap((tech, ti) =>
         normalizeTechniqueTree({
            technique: tech,
            kind,
            criterionId,
            groupTitle: group.title,
            groupNote: group.note,
            lineage: [gi, ti],
         }),
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
   return techniques.flatMap((tech, index) =>
      normalizeTechniqueTree({
         technique: tech,
         kind: 'failure',
         criterionId,
         groupTitle: undefined,
         groupNote: undefined,
         lineage: [index],
      }),
   );
}

function sortTechniques(techniques: NormalizedTechnique[]): NormalizedTechnique[] {
   return [...techniques].toSorted((left, right) => left.key.localeCompare(right.key));
}

export function normalizeSingleCriterion(input: {
   criterion: CriterionPayload;
   version: WcagVersion;
   quickrefTags: QuickrefTagsPayload;
   principle: { id: string; num: string; handle: string };
   guideline: { id: string; num: string; handle: string };
}): readonly [string, ReturnType<typeof normalizedCriterionSchema.parse>] {
   const { criterion, version, quickrefTags, principle, guideline } = input;
   const techniques = sortTechniques(
      normalizeTechniqueGroups(
         criterion.num,
         'sufficient',
         criterion.techniques?.sufficient,
      ),
   );
   const advisoryTechniques = sortTechniques(
      normalizeTechniqueGroups(criterion.num, 'advisory', criterion.techniques?.advisory),
   );
   const failures = sortTechniques(
      normalizeFailureTechniques(criterion.num, criterion.techniques?.failure),
   );
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
