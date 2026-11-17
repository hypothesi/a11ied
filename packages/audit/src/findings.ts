import {
   addEvent,
   run,
   selectAll,
   selectOne,
   SQL_NULL,
   transact,
   type Audit,
} from './db.js';
import { AuditError } from './errors.js';
import { countRowSchema, findingRowSchema, instanceRowSchema } from './rows.js';
import type { Finding, FindingInstance, FindingSource, Severity } from './schema.js';

const FINDING_COLUMNS =
   'id, criterion, related, title, severity, description, impact, recommendation, source, key, createdAt';
const INSTANCE_COLUMNS =
   'id, findingId, pageId, unitId, location, detail, evidence, status, dismissReason, worker, createdAt';

export const SEVERITY_ORDER: readonly Severity[] = [
   'critical',
   'serious',
   'moderate',
   'minor',
];

/** A finding together with every place it was observed. */
export interface FindingRecord extends Finding {
   instances: FindingInstance[];
   /** Open instances only. A finding with none is dismissed. */
   open: FindingInstance[];
}

export interface NewFinding {
   criterion: string;
   related?: readonly string[] | undefined;
   title: string;
   severity: Severity;
   description: string;
   impact: string;
   recommendation: string;
   source: FindingSource;
   key?: string | undefined;
}

export interface NewInstance {
   findingId: string;
   pageId: string;
   unitId: string | null;
   location: string;
   detail: string;
   evidence: readonly string[];
   worker: string;
}

export interface FindingFilter {
   criterion?: string | undefined;
   pageId?: string | undefined;
   /** Include findings whose every instance was dismissed. */
   includeDismissed?: boolean | undefined;
}

/** Whether a finding is a failure of the given criterion, directly or as a consequence. */
export function failsCriterion(
   finding: Pick<Finding, 'criterion' | 'related'>,
   criterion: string,
): boolean {
   return finding.criterion === criterion || finding.related.includes(criterion);
}

/** Normalizes a title so trivially different wordings of one defect merge. */
export function normalizeTitle(title: string): string {
   return title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, ' ')
      .trim();
}

function withInstances(finding: Finding, instances: FindingInstance[]): FindingRecord {
   return {
      ...finding,
      instances,
      open: instances.filter((instance) => instance.status === 'open'),
   };
}

/**
 * Lists findings on pages still in scope, most severe first. Instances on excluded pages
 * are left out.
 */
export function listFindings(audit: Audit, filter: FindingFilter = {}): FindingRecord[] {
   const findings = selectAll(
      audit,
      findingRowSchema,
      `SELECT ${FINDING_COLUMNS} FROM findings ORDER BY seq`,
   );
   const instances = selectAll(
      audit,
      instanceRowSchema,
      `SELECT ${INSTANCE_COLUMNS.split(', ')
         .map((column) => `i.${column}`)
         .join(
            ', ',
         )} FROM instances i JOIN pages s ON s.id = i.pageId WHERE s.status = 'active' ORDER BY s.seq, i.id`,
   );
   return findings
      .map((finding) =>
         withInstances(
            finding,
            instances.filter(
               (instance) =>
                  instance.findingId === finding.id &&
                  (filter.pageId === undefined || instance.pageId === filter.pageId),
            ),
         ),
      )
      .filter(
         (finding) =>
            (filter.criterion === undefined ||
               failsCriterion(finding, filter.criterion)) &&
            (filter.includeDismissed === true
               ? finding.instances.length > 0
               : finding.open.length > 0),
      )
      .toSorted(
         (left, right) =>
            SEVERITY_ORDER.indexOf(left.severity) -
            SEVERITY_ORDER.indexOf(right.severity),
      );
}

export function getFinding(audit: Audit, findingId: string): FindingRecord {
   const finding = selectOne(
      audit,
      findingRowSchema,
      `SELECT ${FINDING_COLUMNS} FROM findings WHERE id = ? COLLATE NOCASE`,
      findingId,
   );
   if (!finding) {
      throw new AuditError(
         'finding-not-found',
         `No finding "${findingId}". Run a1 audit findings to list them.`,
      );
   }
   const instances = selectAll(
      audit,
      instanceRowSchema,
      `SELECT ${INSTANCE_COLUMNS} FROM instances WHERE findingId = ? ORDER BY id`,
      finding.id,
   );
   return withInstances(finding, instances);
}

/** Finds the finding a new report of the same defect should attach to. */
export function findMatchingFinding(
   audit: Audit,
   candidate: Pick<NewFinding, 'criterion' | 'title' | 'key'>,
): Finding | undefined {
   const sameCriterion = selectAll(
      audit,
      findingRowSchema,
      `SELECT ${FINDING_COLUMNS} FROM findings WHERE criterion = ? ORDER BY seq`,
      candidate.criterion,
   );
   const key = candidate.key ?? '';
   return sameCriterion.find((finding) =>
      key === ''
         ? normalizeTitle(finding.title) === normalizeTitle(candidate.title)
         : finding.key === key,
   );
}

/** Inserts a finding. Call inside a transaction. */
export function insertFinding(audit: Audit, finding: NewFinding): string {
   const row = selectOne(
      audit,
      countRowSchema,
      'SELECT COALESCE(MAX(seq), 0) AS count FROM findings',
   );
   const seq = (row?.count ?? 0) + 1;
   const id = `F${String(seq)}`;
   run(
      audit,
      'INSERT INTO findings (id, seq, criterion, related, title, severity, description, impact, recommendation, source, key, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      seq,
      finding.criterion,
      JSON.stringify(finding.related ?? []),
      finding.title,
      finding.severity,
      finding.description,
      finding.impact,
      finding.recommendation,
      finding.source,
      finding.key ?? '',
      audit.now().toISOString(),
   );
   return id;
}

/** Inserts one occurrence of a finding. Call inside a transaction. */
export function insertInstance(audit: Audit, instance: NewInstance): void {
   run(
      audit,
      'INSERT INTO instances (findingId, pageId, unitId, location, detail, evidence, worker, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      instance.findingId,
      instance.pageId,
      instance.unitId,
      instance.location,
      instance.detail,
      JSON.stringify(instance.evidence),
      instance.worker,
      audit.now().toISOString(),
   );
}

/** Marks a finding's open instances on one page as wrong. Call inside a transaction. */
export function dismissOnPage(
   audit: Audit,
   input: { findingId: string; pageId: string; reason: string },
): void {
   run(
      audit,
      "UPDATE instances SET status = 'dismissed', dismissReason = ? WHERE findingId = ? AND pageId = ? AND status = 'open'",
      input.reason,
      input.findingId,
      input.pageId,
   );
}

/**
 * Records a defect an automated check is sure about. Scanning the same page again
 * replaces the earlier automated occurrence, and never revives one a reviewer dismissed.
 */
export function recordAutomatedFinding(
   audit: Audit,
   input: NewFinding & { pageId: string; location: string; detail: string },
): string {
   return transact(audit, () => {
      const findingId =
         findMatchingFinding(audit, input)?.id ?? insertFinding(audit, input);
      const dismissed = selectOne(
         audit,
         countRowSchema,
         "SELECT COUNT(*) AS count FROM instances WHERE findingId = ? AND pageId = ? AND status = 'dismissed'",
         findingId,
         input.pageId,
      );
      if ((dismissed?.count ?? 0) > 0) {
         return findingId;
      }
      run(
         audit,
         'DELETE FROM instances WHERE findingId = ? AND pageId = ? AND unitId IS NULL',
         findingId,
         input.pageId,
      );
      insertInstance(audit, {
         findingId,
         pageId: input.pageId,
         unitId: SQL_NULL,
         location: input.location,
         detail: input.detail,
         evidence: [],
         worker: input.source,
      });
      return findingId;
   });
}

/** Dismisses a finding everywhere, or on one page, as a false positive. */
export function dismissFinding(
   audit: Audit,
   input: {
      findingId: string;
      reason: string;
      actor: string;
      pageId?: string | undefined;
   },
): FindingRecord {
   return transact(audit, () => {
      const finding = getFinding(audit, input.findingId);
      const pages =
         input.pageId === undefined
            ? [...new Set(finding.open.map((instance) => instance.pageId))]
            : [input.pageId];
      for (const pageId of pages) {
         dismissOnPage(audit, {
            findingId: finding.id,
            pageId,
            reason: input.reason,
         });
      }
      addEvent(audit, {
         actor: input.actor,
         type: 'finding-dismissed',
         message: `Dismissed ${finding.id} (${finding.title}): ${input.reason}`,
      });
      return getFinding(audit, finding.id);
   });
}

/**
 * Folds duplicate findings into one, keeping every occurrence. When they were filed under
 * different criteria, the merged finding fails all of them.
 */
export function mergeFindings(
   audit: Audit,
   input: { into: string; from: readonly string[]; actor: string },
): FindingRecord {
   return transact(audit, () => {
      const target = getFinding(audit, input.into);
      for (const sourceId of input.from) {
         const source = getFinding(audit, sourceId);
         if (source.id === target.id) {
            continue;
         }
         const related = [
            ...new Set([...target.related, source.criterion, ...source.related]),
         ].filter((criterion) => criterion !== target.criterion);
         run(
            audit,
            'UPDATE findings SET related = ? WHERE id = ?',
            JSON.stringify(related),
            target.id,
         );
         target.related = related;
         run(
            audit,
            'UPDATE instances SET findingId = ? WHERE findingId = ?',
            target.id,
            source.id,
         );
         run(audit, 'DELETE FROM findings WHERE id = ?', source.id);
         addEvent(audit, {
            actor: input.actor,
            type: 'finding-merged',
            message: `Merged ${source.id} into ${target.id} (${target.title})`,
         });
      }
      return getFinding(audit, target.id);
   });
}

export type FindingEdit = Partial<
   Pick<NewFinding, 'title' | 'severity' | 'description' | 'impact' | 'recommendation'>
>;

/** Rewrites a finding's shared text or severity during review. */
export function updateFinding(
   audit: Audit,
   input: { findingId: string; actor: string; changes: FindingEdit },
): FindingRecord {
   return transact(audit, () => {
      const finding = getFinding(audit, input.findingId);
      const next = { ...finding, ...input.changes };
      run(
         audit,
         'UPDATE findings SET title = ?, severity = ?, description = ?, impact = ?, recommendation = ? WHERE id = ?',
         next.title,
         next.severity,
         next.description,
         next.impact,
         next.recommendation,
         finding.id,
      );
      addEvent(audit, {
         actor: input.actor,
         type: 'finding-updated',
         message: `Updated ${finding.id}: ${Object.keys(input.changes).join(', ')}`,
      });
      return getFinding(audit, finding.id);
   });
}
